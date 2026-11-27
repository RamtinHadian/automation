package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A standalone invoice («فاکتور مستقل»): an invoice issued straight to a customer, with no proforma and no opportunity in the pipeline.
// It is kept as a row of crm_deals marked «standalone» (stage WON, so the sale is counted in the reports) so that the numbering, the cancelling, the printing and
// the sending to Sepidar are the very same code as for the invoice of a deal. The pipeline never sees it: /api/state leaves it out and it has its own list.

const notStandalone = `COALESCE(data->>'standalone', '') <> 'true'`

func standaloneItems(v any) ([]any, string) {
	list, _ := v.([]any)
	out := []any{}
	for _, x := range list {
		m, ok := x.(map[string]any)
		if !ok {
			continue
		}
		title := strings.TrimSpace(jsonx.Str(m, "title"))
		if title == "" {
			continue
		}
		qty, price := jsonx.Num(m["qty"]), jsonx.Num(m["unitPrice"])
		if qty <= 0 || price < 0 {
			return nil, "تعداد هر ردیف باید بیشتر از صفر و قیمت درست باشد."
		}
		it := jsonx.M{"id": "r-" + randomHex(3), "title": cutRunes(title, 200), "qty": qty, "unitPrice": price}
		if d := jsonx.Num(m["discount"]); d > 0 {
			it["discount"] = d
		}
		for _, k := range []string{"code", "unit", "description"} {
			if s := strings.TrimSpace(jsonx.Str(m, k)); s != "" {
				it[k] = cutRunes(s, 200)
			}
		}
		out = append(out, it)
	}
	if len(out) == 0 {
		return nil, "دست‌کم یک ردیف کالا یا خدمت بنویسید."
	}
	if len(out) > 200 {
		return nil, "تعداد ردیف‌ها بیش از حد است."
	}
	return out, ""
}

// POST /api/invoice/standalone {customerId, issuerId, kind, items[], discountPercent, taxPercent, note, fields}
func invoiceStandaloneIssue(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if crmDenied(w, me) {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	cid := strings.TrimSpace(jsonx.Str(body, "customerId"))
	var craw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, cid).Scan(&craw) != nil {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	}
	if !crmOwnsCustomer(r, me, cid) {
		httpx.Error(w, http.StatusForbidden, "این مشتری به شما سپرده نشده است.")
		return
	}
	items, msg := standaloneItems(body["items"])
	if msg != "" {
		httpx.Error(w, http.StatusBadRequest, msg)
		return
	}
	cust := jsonx.Decode(craw)
	kind := "UNOFFICIAL"
	if jsonx.Str(body, "kind") == "OFFICIAL" {
		kind = "OFFICIAL"
	}
	id := "inv-" + randomHex(6)
	name := jsonx.Str(cust, "name")
	if name == "" {
		name = jsonx.Str(cust, "company")
	}
	doc := jsonx.M{
		"id": id, "standalone": true, "title": "فاکتور مستقل", "customerId": cid, "customerName": name, "stage": "WON", "createdAt": now(), "updatedAt": now(),
		"ownerId": me.ID(), "ownerName": me.Name(), "createdById": me.ID(), "createdByName": me.Name(),
		"items": items, "discountPercent": jsonx.Num(body["discountPercent"]), "taxPercent": jsonx.Num(body["taxPercent"]),
		"proformaIssuerId": strings.TrimSpace(jsonx.Str(body, "issuerId")), "proformaAt": now()[:10],
		"proformaFields": jsonx.Sub(body, "fields"), "notes": cutRunes(strings.TrimSpace(jsonx.Str(body, "note")), 1000),
		"invoice": jsonx.M{"kind": kind, "note": cutRunes(strings.TrimSpace(jsonx.Str(body, "note")), 1000), "paid": jsonx.Bool(body, "paid")},
	}
	if doc["proformaFields"] == nil {
		doc["proformaFields"] = jsonx.M{}
	}
	// the amount (after discount and tax) is computed here, the same way as for a proforma
	doc["proformaNumber"] = "-"
	enforceProformaAmount(doc)
	delete(doc, "proformaNumber")
	okInv, queue := enforceInvoice(w, r, me, jsonx.M{}, doc)
	if !okInv {
		return
	}
	if err := assignInvoiceNumber(r.Context(), doc); err != nil {
		httpx.Error(w, http.StatusConflict, err.Error())
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, id, cid, me.ID(), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if queue {
		queueSepidarInvoice(r.Context(), me, id, doc)
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"ok": true, "id": id, "number": jsonx.Str(jsonx.Sub(doc, "invoice"), "number")})
}

// GET /api/invoice/standalone: the standalone invoices this person may see (the same rule as the opportunities: all for those who see all, else their own and their unit's)
func invoiceStandaloneList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.JSON(w, http.StatusOK, []any{})
		return
	}
	ctx := r.Context()
	var list []json.RawMessage
	var err error
	if crmSeesAll(me) {
		list, err = store.RawList(ctx, `SELECT data FROM crm_deals WHERE data->>'standalone' = 'true' ORDER BY id DESC LIMIT 1000`)
	} else {
		list, err = store.RawList(ctx, `SELECT data FROM crm_deals WHERE data->>'standalone' = 'true' AND `+crmMyDeals+` ORDER BY id DESC LIMIT 1000`, me.ID(), crmPeople(ctx, me))
	}
	if err != nil {
		internalError(w)
		return
	}
	if list == nil {
		list = []json.RawMessage{}
	}
	httpx.JSON(w, http.StatusOK, list)
}

// POST /api/invoice/cancel {dealId, reason}: cancels the invoice of any deal (also a standalone one); same rules as everywhere.
func invoiceCancel(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if crmDenied(w, me) {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id := strings.TrimSpace(jsonx.Str(body, "dealId"))
	var raw []byte
	var owner string
	if store.Pool.QueryRow(r.Context(), `SELECT data, COALESCE(owner_id, '') FROM crm_deals WHERE id = $1`, id).Scan(&raw, &owner) != nil {
		httpx.Error(w, http.StatusNotFound, "فرصت یا فاکتور پیدا نشد.")
		return
	}
	before := jsonx.Decode(raw)
	if !crmGate(r, me) && owner != me.ID() && !isManagerOf(crmPeople(r.Context(), me), owner) {
		httpx.Forbidden(w)
		return
	}
	doc := jsonx.Copy(before)
	doc["invoice"] = jsonx.M{"status": "cancelled", "cancelReason": jsonx.Str(body, "reason")}
	if okInv, _ := enforceInvoice(w, r, me, before, doc); !okInv {
		return
	}
	doc["updatedAt"] = now()
	if _, err := store.Pool.Exec(r.Context(), `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

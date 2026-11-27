package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Hoormand's own sales invoice (official or unofficial), made from the proforma of a deal.
//
// It is kept inside the deal as «invoice»: a frozen copy of the proforma at the moment it was issued (its lines, tax, discount, parties and amount),
// with its own number. The server writes that copy itself from the saved deal (the browser only says «issue it» and proposes the number), so nobody can
// type an invoice that differs from the proforma it came from. Once issued it never changes; the only later change is to cancel it (with a reason).
// A deal that has an invoice cannot be deleted. This is separate from the invoice that Sepidar issues (the Sepidar menu).

// proformaEnabled: the console can switch the proforma off (default: on). Switched off, no new proforma is accepted; what exists stays.
func proformaEnabled(ctx context.Context) bool {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	set := jsonx.Decode(raw)
	if _, has := set["proformaEnabled"]; has {
		return jsonx.Bool(set, "proformaEnabled")
	}
	return true
}

// invoiceRight: administrators always; others unless the permission table switched «crm.invoice» off for them.
func invoiceRight(me auth.User) bool {
	return me.IsAdmin() || !jsonx.Contains(jsonx.Strings(me.M, "hiddenSub"), "crm.invoice")
}

// the accounting program asked Hoormand for its work in the last three minutes
func sepidarAlive(ctx context.Context) bool {
	seen, _ := sepidarConnectorSeen(ctx)
	t, err := time.Parse("2006-01-02T15:04:05.000Z", seen)
	return err == nil && time.Since(t) < 3*time.Minute
}

// queueSepidarInvoice asks the accounting program to issue the deal's pending invoice in Sepidar; its number comes back and becomes the invoice's number.
func queueSepidarInvoice(ctx context.Context, me auth.User, dealID string, doc jsonx.M) {
	var dup int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_jobs WHERE kind = 'invoice.fromHoormand' AND ref = $1 AND status IN ('pending', 'running')`, dealID).Scan(&dup)
	if dup > 0 {
		return
	}
	data := jsonx.M{"dealId": dealID, "title": jsonx.Str(doc, "customerName")}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO sepidar_jobs (id, kind, ref, data, created_by, created_by_name) VALUES ($1, 'invoice.fromHoormand', $2, $3::jsonb, $4, $5)`,
		"sj-"+randomHex(6), dealID, jsonx.Encode(data), me.ID(), me.Name())
}

// enforceInvoice decides what the saved deal's «invoice» becomes. It answers false (after writing the refusal) when the request must stop;
// the second answer is true when the invoice waits for its Sepidar number (the caller queues the request after the deal is saved).
func enforceInvoice(w http.ResponseWriter, r *http.Request, me auth.User, before, doc jsonx.M) (bool, bool) {
	old, inc := jsonx.Sub(before, "invoice"), jsonx.Sub(doc, "invoice")
	delete(doc, "invoice")
	if len(old) > 0 {
		keep := jsonx.Copy(old)
		if len(inc) > 0 && jsonx.Str(old, "status") != "cancelled" && jsonx.Str(inc, "status") == "cancelled" {
			if !invoiceRight(me) {
				httpx.Error(w, http.StatusForbidden, "ابطال فاکتور به شما اجازه داده نشده است.")
				return false, false
			}
			reason := strings.TrimSpace(jsonx.Str(inc, "cancelReason"))
			if reason == "" {
				httpx.Error(w, http.StatusBadRequest, "دلیل ابطال فاکتور را بنویسید.")
				return false, false
			}
			wasPending := jsonx.Str(old, "status") == "pending"
			keep["status"], keep["cancelledAt"] = "cancelled", now()
			keep["cancelledById"], keep["cancelledByName"], keep["cancelReason"] = me.ID(), me.Name(), reason
			// a number that never went to Sepidar is given back (the next invoice gets it; the cancelled one keeps showing it, marked as released);
			// a number Sepidar has stays used: that invoice stays in Sepidar until it is deleted there
			var queued int // a request to Sepidar still waiting or being done: the number may yet become Sepidar's, so it is not given back
			_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM sepidar_jobs WHERE kind = 'invoice.fromHoormand' AND ref = $1 AND status IN ('pending', 'running')`, jsonx.Str(doc, "id")).Scan(&queued)
			if num := jsonx.Str(old, "number"); !wasPending && num != "" && queued == 0 && len(jsonx.Sub(old, "sepidar")) == 0 {
				releaseInvoiceNumber(r.Context(), num)
				keep["numberReleased"] = true
			}
			if wasPending { // it was still waiting for Sepidar: the waiting request is withdrawn
				_, _ = store.Pool.Exec(r.Context(), `UPDATE sepidar_jobs SET status = 'failed', finished_at = now(), result = $2::jsonb WHERE kind = 'invoice.fromHoormand' AND ref = $1 AND status = 'pending'`,
					jsonx.Str(doc, "id"), jsonx.Encode(jsonx.M{"message": "فاکتور هورمند پیش از صدور در سپیدار لغو شد."}))
			}
		}
		doc["invoice"] = keep
		return true, false
	}
	if len(inc) == 0 {
		return true, false
	}
	if !invoiceRight(me) {
		httpx.Error(w, http.StatusForbidden, "صدور فاکتور به شما اجازه داده نشده است.")
		return false, false
	}
	standalone := jsonx.Bool(doc, "standalone") // issued straight to the customer: there is no proforma to wait for
	if !standalone && !proformaEnabled(r.Context()) {
		httpx.Error(w, http.StatusConflict, "پیش‌فاکتور در این سازمان غیرفعال است؛ برای فاکتور از «صدور فاکتور» (مستقل از پیش‌فاکتور) استفاده کنید.")
		return false, false
	}
	if !standalone && (jsonx.Str(doc, "proformaNumber") == "" || len(jsonx.Arr(doc, "items")) == 0) {
		httpx.Error(w, http.StatusBadRequest, "فاکتور از روی پیش‌فاکتور ساخته می‌شود؛ اول پیش‌فاکتور بسازید.")
		return false, false
	}
	if !standalone && !proformaReadyForCustomer(r.Context(), doc) {
		httpx.Error(w, http.StatusForbidden, "پیش‌فاکتور هنوز تأیید نشده است؛ بعد از تأیید می‌توان فاکتور صادر کرد.")
		return false, false
	}
	kind := "UNOFFICIAL"
	if jsonx.Str(inc, "kind") == "OFFICIAL" {
		kind = "OFFICIAL"
	}
	// the number is Sepidar's: the invoice waits («pending») until the accounting program issues it there and brings the number back
	mode := invoiceMode(r.Context(), kind)
	if mode == "sepidar" {
		// Sepidar already issued an invoice for this deal (the Sepidar menu's «صدور فاکتور»): its number is simply taken, nothing more to wait for
		var sid int64
		var sn *int64
		if store.Pool.QueryRow(r.Context(), `SELECT sepidar_id, number FROM sepidar_links WHERE kind = 'invoice' AND ref = $1`, jsonx.Str(doc, "id")).Scan(&sid, &sn) == nil {
			num := sid
			if sn != nil {
				num = *sn
			}
			doc["invoice"] = jsonx.M{
				"number": strconv.FormatInt(num, 10), "kind": kind, "status": "issued", "issuedAt": now(), "issuedById": me.ID(), "issuedByName": me.Name(),
				"issuerId": doc["proformaIssuerId"], "proformaNumber": doc["proformaNumber"],
				"items": doc["items"], "discountPercent": doc["discountPercent"], "taxPercent": doc["taxPercent"],
				"fields": doc["proformaFields"], "amount": doc["amount"], "customerName": doc["customerName"],
				"note": strings.TrimSpace(jsonx.Str(inc, "note")), "sepidar": jsonx.M{"id": sid, "number": num, "at": now()},
			}
			return true, false
		}
		if !sepidarAlive(r.Context()) {
			httpx.Error(w, http.StatusConflict, "شمارهٔ فاکتور را سپیدار می‌دهد ولی برنامهٔ سپیدار روی رایانهٔ حسابداری الان در دسترس نیست. آن را روشن کنید و دوباره بزنید (یا در تنظیمات «شمارهٔ فاکتورها از سپیدار» را خاموش کنید).")
			return false, false
		}
		if !sepidarCan(me, "invoice") || !sepidarCan(me, "quotationSend") {
			httpx.Error(w, http.StatusForbidden, "صدور فاکتور از طریق سپیدار، اجازهٔ «صدور فاکتور» و «ارسال پیش‌فاکتور به سپیدار» در بخش سپیدار را لازم دارد.")
			return false, false
		}
		doc["invoice"] = jsonx.M{
			"number": "", "kind": kind, "status": "pending", "issuedAt": now(), "issuedById": me.ID(), "issuedByName": me.Name(),
			"issuerId": doc["proformaIssuerId"], "proformaNumber": doc["proformaNumber"],
			"items": doc["items"], "discountPercent": doc["discountPercent"], "taxPercent": doc["taxPercent"],
			"fields": doc["proformaFields"], "amount": doc["amount"], "customerName": doc["customerName"],
			"note": strings.TrimSpace(jsonx.Str(inc, "note")),
		}
		return true, true
	}
	// the server gives the number (the counter continuing Sepidar's, or the yearly one); it is put on right before the deal is saved, so a refused save never uses a number
	doc["invoice"] = jsonx.M{
		"number": invoiceNumberPending, "kind": kind, "status": "issued", "issuedAt": now(), "issuedById": me.ID(), "issuedByName": me.Name(),
		"issuerId": doc["proformaIssuerId"], "proformaNumber": doc["proformaNumber"],
		"items": doc["items"], "discountPercent": doc["discountPercent"], "taxPercent": doc["taxPercent"],
		"fields": doc["proformaFields"], "amount": doc["amount"], "customerName": doc["customerName"],
		"note": strings.TrimSpace(jsonx.Str(inc, "note")),
	}
	// numbered by the counter: the invoice also goes to Sepidar by itself (the numbers are compared when it comes back)
	return true, mode == "counter" && sepidarEnabled(r.Context())
}


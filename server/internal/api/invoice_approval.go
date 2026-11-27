package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Approval of invoices. Everybody who issues an invoice must have approvers defined in the console («تأییدکنندگان صدور فاکتور»; the main settings row, key
// invoiceApprovers: person → the people who approve). The administrator issues without approval, and so does a person who is in his own list. Without approvers
// defined a person cannot issue at all. The invoice of such a person waits («awaiting»): it has no number, is not sent to Sepidar and counts for nothing until
// ONE of the approvers approves it; then it is issued exactly as if the issuer had issued it. A rejection cancels it (no number is used).

// the chain of approvers is ONE for all invoices (main settings, key invoiceApprovalChain, in the order of the steps)
func invoiceChain(ctx context.Context) []string {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	out := []string{}
	for _, v := range jsonx.Strings(jsonx.Decode(raw), "invoiceApprovalChain") {
		if v != "" && !jsonx.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// invoiceApprovalFor says whether this person's invoices need approval, by whom (the chain without himself), and (when nobody is defined) why he may not issue.
func invoiceApprovalFor(ctx context.Context, me auth.User) (needed bool, approvers []string, refusal string) {
	if me.IsAdmin() {
		return false, nil, ""
	}
	chain := invoiceChain(ctx)
	inOwn := false
	for _, v := range chain {
		if v == me.ID() { // he is in the flow himself: his own step is skipped; with nobody else left there is nothing to wait for
			inOwn = true
		} else {
			approvers = append(approvers, v)
		}
	}
	if len(approvers) == 0 {
		if inOwn {
			return false, nil, ""
		}
		return false, nil, "گردش تأیید فاکتورها در کنسول مدیریت تعریف نشده است؛ از مدیر بخواهید در «تنظیمات سیستم ← گردش تأیید فاکتورها» مرحله‌ها را تعریف کند."
	}
	return true, approvers, ""
}

// POST /api/invoice/decide {dealId, decision: approve|reject, note}
func invoiceDecide(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	id := strings.TrimSpace(jsonx.Str(body, "dealId"))
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_deals WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusNotFound, "فاکتور پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	inv := jsonx.Sub(doc, "invoice")
	if jsonx.Str(inv, "status") != "awaiting" {
		httpx.Error(w, http.StatusConflict, "این فاکتور منتظر تأیید نیست.")
		return
	}
	chain := jsonx.Strings(inv, "approvers")
	step := int(jsonx.Num(inv["step"]))
	if step < 0 || step >= len(chain) {
		step = 0
	}
	if !me.IsAdmin() && (len(chain) == 0 || chain[step] != me.ID()) {
		if jsonx.Contains(chain, me.ID()) {
			httpx.Error(w, http.StatusForbidden, "نوبت شما نیست؛ فاکتور باید اول مرحلهٔ قبل را بگذراند.")
		} else {
			httpx.Error(w, http.StatusForbidden, "شما تأییدکنندهٔ این فاکتور نیستید.")
		}
		return
	}
	requesterID, requesterName := jsonx.Str(inv, "issuedById"), jsonx.Str(inv, "issuedByName")
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	label := "فاکتور مشتری «" + jsonx.Str(doc, "customerName") + "»"
	if jsonx.Str(body, "decision") == "reject" {
		if note == "" {
			httpx.Error(w, http.StatusBadRequest, "دلیل رد فاکتور را بنویسید.")
			return
		}
		inv["status"], inv["cancelledAt"] = "cancelled", now()
		inv["cancelledById"], inv["cancelledByName"], inv["cancelReason"] = me.ID(), me.Name(), "رد شد: "+note
		doc["invoice"] = inv
		doc["updatedAt"] = now()
		if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc)); err != nil {
			internalError(w)
			return
		}
		if requesterID != "" {
			notify.Notify(ctx, []string{requesterID}, notify.Note{Kind: "alert", Label: "فاکتور رد شد", Title: label + " رد شد", Body: me.Name() + ": " + note, Ref: ref("deal", id)}, me.ID())
		}
		httpx.OK(w)
		return
	}
	// approved at this step; not the last step: it goes on to the next person (the administrator's approval is the last one)
	steps := []any{}
	if old, ok := inv["steps"].([]any); ok {
		steps = append(steps, old...)
	}
	steps = append(steps, jsonx.M{"id": me.ID(), "name": me.Name(), "status": "APPROVED", "at": now(), "note": note})
	if !me.IsAdmin() && step+1 < len(chain) {
		inv["step"], inv["steps"] = step+1, steps
		doc["invoice"] = inv
		doc["updatedAt"] = now()
		if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc)); err != nil {
			internalError(w)
			return
		}
		notify.Notify(ctx, []string{chain[step+1]}, notify.Note{Kind: "alert", Label: "فاکتور منتظر تأیید", Title: label + " منتظر تأیید شماست", Body: me.Name() + " تأیید کرد (مرحلهٔ " + strconv.Itoa(step+2) + " از " + strconv.Itoa(len(chain)) + ").", Ref: ref("deal", id)}, me.ID())
		httpx.OK(w)
		return
	}
	// the last approval: issued as if the issuer had issued it (the number, the request to Sepidar), the approvals are written on it
	before := jsonx.Copy(doc)
	delete(before, "invoice")
	doc2 := jsonx.Copy(doc)
	doc2["invoice"] = jsonx.M{
		"kind": jsonx.Str(inv, "kind"), "note": jsonx.Str(inv, "note"), "paid": jsonx.Bool(inv, "paid"), "settlement": jsonx.Str(inv, "settlement"),
		"dueDate": jsonx.Str(inv, "dueDate"), "stockCode": jsonx.Str(inv, "stockCode"),
	}
	okInv, queue := enforceInvoiceOpt(w, r, me, before, doc2, true)
	if !okInv {
		return
	}
	inv2 := jsonx.Sub(doc2, "invoice")
	inv2["requestedAt"] = inv["issuedAt"]
	inv2["issuedById"], inv2["issuedByName"] = requesterID, requesterName
	inv2["approvedById"], inv2["approvedByName"], inv2["approvedAt"], inv2["approvalSteps"] = me.ID(), me.Name(), now(), steps
	doc2["invoice"] = inv2
	if jsonx.Bool(doc2, "standalone") { // a standalone invoice is a sale from now on (it was kept out of the reports while it waited)
		doc2["stage"], doc2["closedAt"] = "WON", now()
	}
	doc2["updatedAt"] = now()
	if err := assignInvoiceNumber(ctx, doc2); err != nil {
		httpx.Error(w, http.StatusConflict, err.Error())
		return
	}
	if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc2)); err != nil {
		internalError(w)
		return
	}
	if queue {
		queueSepidarInvoice(ctx, me, id, doc2)
	}
	if requesterID != "" && requesterID != me.ID() {
		notify.Notify(ctx, []string{requesterID}, notify.Note{Kind: "alert", Label: "فاکتور تأیید شد", Title: label + " تأیید و صادر شد", Body: "شمارهٔ فاکتور: " + jsonx.Str(jsonx.Sub(doc2, "invoice"), "number"), Ref: ref("deal", id)}, me.ID())
	}
	httpx.OK(w)
}

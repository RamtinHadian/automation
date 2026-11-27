package api

import (
	"context"
	"net/http"
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

func invoiceApproversOf(ctx context.Context, userID string) []string {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	set := jsonx.Decode(raw)
	m, _ := set["invoiceApprovers"].(map[string]any)
	out := []string{}
	if m == nil {
		return out
	}
	for _, v := range jsonx.Strings(jsonx.M{"x": m[userID]}, "x") {
		if v != "" && v != userID && !jsonx.Contains(out, v) {
			out = append(out, v)
		}
	}
	return out
}

// invoiceApprovalFor says whether this person's invoices need approval, by whom, and (when he may not issue at all) why.
func invoiceApprovalFor(ctx context.Context, me auth.User) (needed bool, approvers []string, refusal string) {
	if me.IsAdmin() {
		return false, nil, ""
	}
	approvers = invoiceApproversOf(ctx, me.ID())
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	if m, _ := jsonx.Decode(raw)["invoiceApprovers"].(map[string]any); m != nil {
		for _, v := range jsonx.Strings(jsonx.M{"x": m[me.ID()]}, "x") {
			if v == me.ID() { // he is his own approver: nothing to wait for
				return false, nil, ""
			}
		}
	}
	if len(approvers) == 0 {
		return false, nil, "برای شما در کنسول مدیریت تأییدکنندهٔ صدور فاکتور تعریف نشده است؛ از مدیر بخواهید در «تنظیمات سیستم ← تأییدکنندگان صدور فاکتور» تعریف کند."
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
	if !me.IsAdmin() && !jsonx.Contains(jsonx.Strings(inv, "approvers"), me.ID()) {
		httpx.Error(w, http.StatusForbidden, "شما تأییدکنندهٔ این فاکتور نیستید.")
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
	// approved: issued as if the issuer had issued it (the number, the request to Sepidar), the approval is written on it
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
	inv2["approvedById"], inv2["approvedByName"], inv2["approvedAt"] = me.ID(), me.Name(), now()
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

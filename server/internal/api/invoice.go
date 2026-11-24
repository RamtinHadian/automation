package api

import (
	"net/http"
	"strings"

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

// invoiceRight: administrators always; others unless the permission table switched «crm.invoice» off for them.
func invoiceRight(me auth.User) bool {
	return me.IsAdmin() || !jsonx.Contains(jsonx.Strings(me.M, "hiddenSub"), "crm.invoice")
}

// enforceInvoice decides what the saved deal's «invoice» becomes. It answers false (after writing the refusal) when the request must stop.
func enforceInvoice(w http.ResponseWriter, r *http.Request, me auth.User, before, doc jsonx.M) bool {
	old, inc := jsonx.Sub(before, "invoice"), jsonx.Sub(doc, "invoice")
	delete(doc, "invoice")
	if len(old) > 0 {
		keep := jsonx.Copy(old)
		if len(inc) > 0 && jsonx.Str(old, "status") != "cancelled" && jsonx.Str(inc, "status") == "cancelled" {
			if !invoiceRight(me) {
				httpx.Error(w, http.StatusForbidden, "ابطال فاکتور به شما اجازه داده نشده است.")
				return false
			}
			reason := strings.TrimSpace(jsonx.Str(inc, "cancelReason"))
			if reason == "" {
				httpx.Error(w, http.StatusBadRequest, "دلیل ابطال فاکتور را بنویسید.")
				return false
			}
			keep["status"], keep["cancelledAt"] = "cancelled", now()
			keep["cancelledById"], keep["cancelledByName"], keep["cancelReason"] = me.ID(), me.Name(), reason
		}
		doc["invoice"] = keep
		return true
	}
	if len(inc) == 0 {
		return true
	}
	if !invoiceRight(me) {
		httpx.Error(w, http.StatusForbidden, "صدور فاکتور به شما اجازه داده نشده است.")
		return false
	}
	if jsonx.Str(doc, "proformaNumber") == "" || len(jsonx.Arr(doc, "items")) == 0 {
		httpx.Error(w, http.StatusBadRequest, "فاکتور از روی پیش‌فاکتور ساخته می‌شود؛ اول پیش‌فاکتور بسازید.")
		return false
	}
	if !proformaReadyForCustomer(r.Context(), doc) {
		httpx.Error(w, http.StatusForbidden, "پیش‌فاکتور هنوز تأیید نشده است؛ بعد از تأیید می‌توان فاکتور صادر کرد.")
		return false
	}
	number := strings.TrimSpace(jsonx.Str(inc, "number"))
	if number == "" || len(number) > 40 {
		httpx.Error(w, http.StatusBadRequest, "شمارهٔ فاکتور درست نیست.")
		return false
	}
	var same int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM crm_deals WHERE id <> $1 AND data->'invoice'->>'number' = $2`, jsonx.Str(doc, "id"), number).Scan(&same)
	if same > 0 {
		httpx.Error(w, http.StatusConflict, "این شمارهٔ فاکتور قبلاً برای فاکتور دیگری گرفته شده است؛ دوباره تلاش کنید.")
		return false
	}
	kind := "UNOFFICIAL"
	if jsonx.Str(inc, "kind") == "OFFICIAL" {
		kind = "OFFICIAL"
	}
	doc["invoice"] = jsonx.M{
		"number": number, "kind": kind, "status": "issued", "issuedAt": now(), "issuedById": me.ID(), "issuedByName": me.Name(),
		"issuerId": doc["proformaIssuerId"], "proformaNumber": doc["proformaNumber"],
		"items": doc["items"], "discountPercent": doc["discountPercent"], "taxPercent": doc["taxPercent"],
		"fields": doc["proformaFields"], "amount": doc["amount"], "customerName": doc["customerName"],
		"note": strings.TrimSpace(jsonx.Str(inc, "note")),
	}
	return true
}

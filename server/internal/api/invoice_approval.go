package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Approval of invoices. Everybody who issues an invoice, except the administrator, sends it through an approval first:
//   - when a workflow tied to «invoice.issue» is on (a workflow built in the console), the system starts it and the invoice waits for its outcome;
//   - otherwise through ONE chain of approvers defined in the console (main settings, key invoiceApprovalChain), one person after the other.
//
// Without either nobody but the administrator can issue. The invoice that waits («awaiting») has no number, is not sent to Sepidar and counts for nothing until the
// last approval; then it is issued exactly as if the issuer had issued it. A rejection cancels it (no number is used).

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
		return false, nil, "گردش تأیید فاکتورها در کنسول مدیریت تعریف نشده است؛ از مدیر بخواهید در «تنظیمات سیستم ← گردشکارها» یک گردشکار با راه‌انداز «صدور فاکتور» بسازد و روشن کند (یا در «گردش تأیید فاکتورها» مرحله‌ها را بنویسد)."
	}
	return true, approvers, ""
}

// invoiceApply carries out the final decision on an awaiting invoice. approve: it is issued (number, request to Sepidar); otherwise it is cancelled with the reason.
// `steps` are the approvals so far (written on the invoice); workflowID, when given, must be the one the invoice waits for.
func invoiceApply(w http.ResponseWriter, r *http.Request, actor auth.User, dealID string, approve bool, note string, steps []any, workflowID string) bool {
	ctx := r.Context()
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_deals WHERE id = $1`, dealID).Scan(&raw) != nil {
		httpx.Error(w, http.StatusNotFound, "فاکتور پیدا نشد.")
		return false
	}
	doc := jsonx.Decode(raw)
	inv := jsonx.Sub(doc, "invoice")
	if jsonx.Str(inv, "status") != "awaiting" || (workflowID != "" && jsonx.Str(inv, "workflowId") != workflowID) {
		httpx.Error(w, http.StatusConflict, "این فاکتور منتظر تأیید نیست.")
		return false
	}
	requesterID, requesterName := jsonx.Str(inv, "issuedById"), jsonx.Str(inv, "issuedByName")
	label := "فاکتور مشتری «" + jsonx.Str(doc, "customerName") + "»"
	if !approve {
		inv["status"], inv["cancelledAt"] = "cancelled", now()
		inv["cancelledById"], inv["cancelledByName"], inv["cancelReason"] = actor.ID(), actor.Name(), "رد شد: "+note
		doc["invoice"] = inv
		doc["updatedAt"] = now()
		if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, dealID, jsonx.Encode(doc)); err != nil {
			internalError(w)
			return false
		}
		if requesterID != "" {
			notify.Notify(ctx, []string{requesterID}, notify.Note{Kind: "alert", Label: "فاکتور رد شد", Title: label + " رد شد", Body: actor.Name() + ": " + note, Ref: ref("deal", dealID)}, actor.ID())
		}
		return true
	}
	before := jsonx.Copy(doc)
	delete(before, "invoice")
	doc2 := jsonx.Copy(doc)
	doc2["invoice"] = jsonx.M{
		"kind": jsonx.Str(inv, "kind"), "note": jsonx.Str(inv, "note"), "paid": jsonx.Bool(inv, "paid"), "settlement": jsonx.Str(inv, "settlement"),
		"dueDate": jsonx.Str(inv, "dueDate"), "stockCode": jsonx.Str(inv, "stockCode"),
	}
	okInv, queue := enforceInvoiceOpt(w, r, actor, before, doc2, true)
	if !okInv {
		return false
	}
	inv2 := jsonx.Sub(doc2, "invoice")
	inv2["requestedAt"] = inv["issuedAt"]
	inv2["issuedById"], inv2["issuedByName"] = requesterID, requesterName
	inv2["approvedById"], inv2["approvedByName"], inv2["approvedAt"], inv2["approvalSteps"] = actor.ID(), actor.Name(), now(), steps
	if wf := jsonx.Str(inv, "workflowId"); wf != "" {
		inv2["workflowId"] = wf
	}
	doc2["invoice"] = inv2
	if jsonx.Bool(doc2, "standalone") { // a standalone invoice is a sale from now on (it was kept out of the reports while it waited)
		doc2["stage"], doc2["closedAt"] = "WON", now()
	}
	doc2["updatedAt"] = now()
	if err := assignInvoiceNumber(ctx, doc2); err != nil {
		httpx.Error(w, http.StatusConflict, err.Error())
		return false
	}
	if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, dealID, jsonx.Encode(doc2)); err != nil {
		internalError(w)
		return false
	}
	if queue {
		queueSepidarInvoice(ctx, actor, dealID, doc2)
	}
	if requesterID != "" && requesterID != actor.ID() {
		notify.Notify(ctx, []string{requesterID}, notify.Note{Kind: "alert", Label: "فاکتور تأیید شد", Title: label + " تأیید و صادر شد", Body: "شمارهٔ فاکتور: " + jsonx.Str(jsonx.Sub(doc2, "invoice"), "number"), Ref: ref("deal", dealID)}, actor.ID())
	}
	return true
}

// invoiceFinishFromWorkflow: the workflow of the invoice ended; the invoice is issued (approved) or cancelled (rejected or cancelled).
func invoiceFinishFromWorkflow(r *http.Request, actor auth.User, i *wfInst, dealID string) {
	approve := i.State.Status == "approved" || i.State.Status == "done"
	note := wfLastComment(&i.State)
	if i.State.Status == "cancelled" {
		note = "گردشکار لغو شد"
	}
	if !approve && note == "" {
		note = "گردشکار رد شد"
	}
	rec := httptest.NewRecorder()
	if !invoiceApply(rec, r, actor, dealID, approve, note, wfDecisions(&i.State), i.ID) && rec.Code >= 400 {
		// the decision is made but the invoice could not be issued: the administrators are told (the invoice stays waiting and can be cancelled)
		if rows, err := store.Pool.Query(r.Context(), `SELECT id FROM users WHERE data->>'role' = 'SUPER_ADMIN'`); err == nil {
			ids := []string{}
			for rows.Next() {
				var u string
				if rows.Scan(&u) == nil {
					ids = append(ids, u)
				}
			}
			rows.Close()
			notify.Notify(r.Context(), ids, notify.Note{Kind: "alert", Label: "فاکتور", Title: "گردشکار فاکتور تمام شد ولی فاکتور صادر نشد", Body: strings.TrimSpace(rec.Body.String()), Ref: ref("deal", dealID), Repeat: true}, "")
		}
	}
}

// POST /api/invoice/decide {dealId, decision: approve|reject, note}: the person whose turn it is in the chain decides (an invoice that goes through a workflow is decided there)
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
	if jsonx.Str(inv, "workflowId") != "" {
		httpx.Error(w, http.StatusConflict, "این فاکتور با گردشکار پیش می‌رود؛ در «امور اداری ← گردشکارها» تصمیم بگیرید.")
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
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	label := "فاکتور مشتری «" + jsonx.Str(doc, "customerName") + "»"
	if jsonx.Str(body, "decision") == "reject" {
		if note == "" {
			httpx.Error(w, http.StatusBadRequest, "دلیل رد فاکتور را بنویسید.")
			return
		}
		if invoiceApply(w, r, me, id, false, note, nil, "") {
			httpx.OK(w)
		}
		return
	}
	steps := []any{}
	if old, ok := inv["steps"].([]any); ok {
		steps = append(steps, old...)
	}
	steps = append(steps, jsonx.M{"id": me.ID(), "name": me.Name(), "status": "APPROVED", "at": now(), "note": note})
	if !me.IsAdmin() && step+1 < len(chain) { // not the last step: it goes on to the next person (the administrator's approval is the last one)
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
	if invoiceApply(w, r, me, id, true, note, steps, "") {
		httpx.OK(w)
	}
}

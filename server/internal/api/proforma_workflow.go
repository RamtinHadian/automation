package api

import (
	"net/http"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A workflow tied to «proforma.issue» replaces the proforma approval chain: when the proforma is sent for approval the system starts the workflow (see putDeal),
// nobody can decide the proforma in the old way while it runs, and when the workflow ends the proforma is approved or rejected here.

// proformaFinishFromWorkflow: the workflow of a proforma ended.
func proformaFinishFromWorkflow(r *http.Request, actor auth.User, i *wfInst, dealID string) {
	ctx := r.Context()
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_deals WHERE id = $1`, dealID).Scan(&raw) != nil {
		return
	}
	doc := jsonx.Decode(raw)
	ap := jsonx.Sub(doc, "proformaApproval")
	if jsonx.Str(ap, "status") != "PENDING" || jsonx.Str(ap, "workflowId") != i.ID {
		return
	}
	approve := i.State.Status == "approved" || i.State.Status == "done"
	a := jsonx.Copy(ap)
	a["steps"] = wfDecisions(&i.State)
	a["decidedBy"], a["decidedByName"], a["decidedAt"] = actor.ID(), actor.Name(), now()
	event := "approved"
	if approve {
		a["status"] = "APPROVED"
		delete(a, "note")
	} else {
		a["status"] = "REJECTED"
		event = "rejected"
		note := wfLastComment(&i.State)
		if i.State.Status == "cancelled" && note == "" {
			note = "گردشکار لغو شد"
		}
		if note != "" {
			a["note"] = note
		}
	}
	doc["proformaApproval"] = a
	doc["updatedAt"] = now()
	if _, err := store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, dealID, jsonx.Encode(doc)); err != nil {
		return
	}
	notifyProformaApproval(r, actor, event, doc, dealID)
	if approve { // the customer is told once per proforma number, now that it may reach him
		no := jsonx.Str(doc, "proformaNumber")
		if no != "" && jsonx.Str(doc, "proformaSmsNumber") != no {
			_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = jsonb_set(data, '{proformaSmsNumber}', to_jsonb($2::text)) WHERE id = $1`, dealID, no)
			smsAutoCustomerID("proforma_issued", jsonx.Str(doc, "customerId"), map[string]string{"number": no})
		}
	}
}

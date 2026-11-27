package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
	"automation/server/internal/workflow"
)

// Workflows tied to what the system does («trigger»): issuing an invoice, sending a proforma for approval. The administrator builds the workflow like any other
// (steps, people, conditions on the amount…) and turns it on; from then on the system starts it by itself and the thing goes on only when it ends «approved».
// Only one workflow is on for a trigger. People never start these.

// wfTriggerPackage is the workflow that is on for the trigger, or nil.
func wfTriggerPackage(ctx context.Context, trigger string) *workflow.Package {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM wf_packages WHERE enabled AND data->>'trigger' = $1 ORDER BY uploaded_at DESC LIMIT 1`, trigger).Scan(&raw) != nil {
		return nil
	}
	p, err := workflow.Parse(raw)
	if err != nil {
		return nil
	}
	return p
}

// wfStartTriggered starts an instance for a trigger; the values are what the system gives (only the fields the workflow declares are kept) and the deal
// it is about. It answers the instance, the state (it may already be finished: a workflow with no step that waits) and the notices to send.
func wfStartTriggered(ctx context.Context, p *workflow.Package, starter auth.User, values map[string]any, dealID string) (string, *workflow.State, []workflow.Effect, error) {
	checked, err := p.CheckValues(values)
	if err != nil {
		return "", nil, nil, err
	}
	checked["dealId"] = dealID
	st, fx, err := workflow.Begin(p, starter.ID(), starter.Name(), checked, wfResolver{ctx}, time.Now())
	if err != nil {
		return "", nil, nil, err
	}
	id := "wf-" + randHex(6)
	title := workflow.Title(p, checked, map[string]string{})
	stRaw, _ := json.Marshal(st)
	if st.Waiting == nil {
		st.Waiting = []string{}
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO wf_instances (id, package_id, package_version, package_name, title, started_by, status, state, waiting, due_at, finished_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		id, p.ID, p.Version, p.Name, title, starter.ID(), st.Status, stRaw, st.Waiting, st.DueAt, wfFinished(st)); err != nil {
		return "", nil, nil, err
	}
	wfNotify(ctx, id, fx, starter.ID())
	return id, st, fx, nil
}

// wfCancelInstance ends a running instance (the thing it was for was cancelled by its owner).
func wfCancelInstance(ctx context.Context, instID string, by auth.User, reason string) {
	i, err := wfScan(store.Pool.QueryRow(ctx, `SELECT `+wfCols+` FROM wf_instances WHERE id = $1`, instID))
	if err != nil || i.Status != "running" {
		return
	}
	waiting := append([]string{}, i.State.Waiting...)
	if workflow.Cancel(&i.State, by.ID(), by.Name(), reason, time.Now()) != nil {
		return
	}
	if wfWrite(ctx, i, true) == nil {
		wfNotify(ctx, i.ID, []workflow.Effect{{Users: waiting, Title: i.PackageName, Body: i.Title + " — لغو شد"}}, by.ID())
	}
}

// the steps of a finished instance as «who decided what», for the card of the invoice / proforma
func wfDecisions(st *workflow.State) []any {
	out := []any{}
	for _, e := range st.History {
		if e.Action == "approve" || e.Action == "reject" {
			row := jsonx.M{"id": e.By, "name": e.ByName, "status": strings.ToUpper(e.Action[:1]) + e.Action[1:], "at": e.At.UTC().Format("2006-01-02T15:04:05.000Z")}
			if e.Action == "approve" {
				row["status"] = "APPROVED"
			} else {
				row["status"] = "REJECTED"
			}
			if e.Comment != "" {
				row["note"] = e.Comment
			}
			out = append(out, row)
		}
	}
	return out
}

func wfLastComment(st *workflow.State) string {
	for k := len(st.History) - 1; k >= 0; k-- {
		if st.History[k].Comment != "" {
			return st.History[k].Comment
		}
	}
	return ""
}

// wfAfterFinish is called when an instance of a triggered workflow ends (by a person's decision, or when the starter cancels it): the invoice is issued or
// cancelled, the proforma approved or rejected. `actor` is the person whose action ended it.
func wfAfterFinish(r *http.Request, actor auth.User, p *workflow.Package, i *wfInst) {
	if p == nil || p.Trigger == "" || i.State.Status == "running" {
		return
	}
	dealID, _ := i.State.Values["dealId"].(string)
	if dealID == "" {
		return
	}
	switch p.Trigger {
	case "invoice.issue":
		invoiceFinishFromWorkflow(r, actor, i, dealID)
	case "proforma.issue":
		proformaFinishFromWorkflow(r, actor, i, dealID)
	}
}

// the values the system gives for an invoice or proforma
func wfDealValues(doc map[string]any, kind, number string, issuer auth.User, note string) map[string]any {
	items := []string{}
	for _, it := range jsonx.Arr(doc, "items") {
		if m, ok := it.(map[string]any); ok {
			t := strings.TrimSpace(jsonx.Str(m, "title"))
			if t != "" {
				items = append(items, t+" × "+strconv.FormatFloat(jsonx.Num(m["qty"]), 'f', -1, 64))
			}
		}
	}
	return map[string]any{
		"customer": jsonx.Str(doc, "customerName"), "amount": jsonx.Num(doc["amount"]), "kind": kind, "number": number, "issuer": issuer.Name(),
		"items": cutRunes(strings.Join(items, "، "), 600), "note": note,
	}
}

var errWorkflowRefused = errors.New("گردشکار")

var _ = notify.Notify

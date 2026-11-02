package api

import (
	"context"
	"net/http"
	"strconv"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Proforma approval by the CEO. When the system setting «proformaApprovalRequired» is on, a proforma is sent to
// the customer only after the CEO (the person with the signing tick) approved it; the CEO's stamp and signature are
// then put on it automatically. The server keeps this honest: only the CEO can approve or reject, nobody else can
// forge the details, and changing an approved proforma takes the approval away again.

// proformaContent is what the CEO approves: if any of it changes afterwards, the approval no longer counts.
func proformaContent(d jsonx.M) string {
	return jsonx.Encode(jsonx.M{
		"items": d["items"], "discountPercent": d["discountPercent"], "taxPercent": d["taxPercent"], "terms": d["terms"],
		"validUntil": d["validUntil"], "proformaNumber": d["proformaNumber"], "proformaIssuerId": d["proformaIssuerId"], "proformaFields": d["proformaFields"], "amount": d["amount"],
	})
}

// proformaApprovalGate fixes up doc["proformaApproval"] and returns what happened: "", "pending", "approved",
// "rejected" or "reset".
// proformaApprovalConfig tells whether the company that issues the proforma asks for approval, and who approves
// (empty = anyone who holds the signing tick). The official company («main») uses the main settings, the other one its own.
func proformaApprovalConfig(ctx context.Context, issuerID string) (bool, string) {
	var required bool
	var approver string
	_ = store.Pool.QueryRow(ctx, `SELECT
		COALESCE(CASE WHEN $1 IN ('', 'main') THEN (data->>'proformaApprovalRequired')::boolean
			ELSE (SELECT (i->>'approvalRequired')::boolean FROM jsonb_array_elements(COALESCE(data::jsonb->'proformaIssuers', '[]'::jsonb)) i WHERE i->>'id' = $1 LIMIT 1) END, false),
		COALESCE(CASE WHEN $1 IN ('', 'main') THEN data->>'proformaApproverId'
			ELSE (SELECT i->>'approverId' FROM jsonb_array_elements(COALESCE(data::jsonb->'proformaIssuers', '[]'::jsonb)) i WHERE i->>'id' = $1 LIMIT 1) END, '')
		FROM settings WHERE key = 'main'`, issuerID).Scan(&required, &approver)
	return required, approver
}

// proformaApprovalChain: the people who approve a proforma of this issuing company, one after the other (the managing director sets the order).
// Empty = one step that anyone who holds the signing tick may take. The older single «approverId» still counts as a chain of one.
func proformaApprovalChain(ctx context.Context, issuerID string) []string {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	set := jsonx.Decode(raw)
	var ids []string
	var single string
	if issuerID == "" || issuerID == "main" {
		ids, single = jsonx.Strings(set, "proformaApproverIds"), jsonx.Str(set, "proformaApproverId")
	} else {
		for _, o := range jsonx.Arr(set, "proformaIssuers") {
			if m, ok := o.(map[string]any); ok && jsonx.Str(m, "id") == issuerID {
				ids, single = jsonx.Strings(m, "approverIds"), jsonx.Str(m, "approverId")
			}
		}
	}
	out := []string{}
	for _, id := range ids {
		if id != "" && !jsonx.Contains(out, id) {
			out = append(out, id)
		}
	}
	if len(out) == 0 && single != "" {
		out = []string{single}
	}
	return out
}

func proformaApprovalGate(ctx context.Context, me auth.User, before, doc jsonx.M) string {
	required, _ := proformaApprovalConfig(ctx, jsonx.Str(doc, "proformaIssuerId"))
	if !required {
		return ""
	}
	old := jsonx.Sub(before, "proformaApproval")
	incoming := jsonx.Sub(doc, "proformaApproval")
	oldStatus, newStatus := jsonx.Str(old, "status"), jsonx.Str(incoming, "status")
	canSignFlag := jsonx.Bool(me.M, "canSignOfficialLetters")

	// the chain that was fixed when the proforma was sent for approval (a later change of the settings does not confuse a running approval)
	chain := jsonx.Strings(old, "chain")
	if oldStatus == "" {
		chain = proformaApprovalChain(ctx, jsonx.Str(doc, "proformaIssuerId"))
	}
	step := jsonx.Int(old, "step")
	if step < 0 || (len(chain) > 0 && step >= len(chain)) {
		step = 0
	}
	// whose turn is it: the person of this step; without a chain, anyone with the signing tick
	myTurn := canSignFlag
	if len(chain) > 0 {
		myTurn = me.ID() == chain[step]
	}
	// may this person change an approved proforma without losing the approval: anybody in the chain (or a signer when there is no chain)
	inChain := canSignFlag
	if len(chain) > 0 {
		inChain = jsonx.Contains(chain, me.ID())
	}

	keepOld := func() {
		if oldStatus != "" {
			doc["proformaApproval"] = old
		} else {
			delete(doc, "proformaApproval")
		}
	}

	if newStatus != oldStatus || (oldStatus == "PENDING" && newStatus == "PENDING" && jsonx.Str(incoming, "decision") != "") {
		decision := newStatus
		if oldStatus == "PENDING" && newStatus == "PENDING" {
			decision = jsonx.Str(incoming, "decision")
		}
		switch decision {
		case "APPROVED", "REJECTED":
			if oldStatus != "PENDING" || !myTurn {
				keepOld()
				return ""
			}
			a := jsonx.Copy(old)
			steps := jsonx.Arr(a, "steps")
			stepRow := jsonx.M{"id": me.ID(), "name": me.Name(), "status": decision, "at": now()}
			note := jsonx.Str(incoming, "note")
			if note != "" {
				stepRow["note"] = note
			}
			a["steps"] = append(steps, stepRow)
			a["chain"] = chain
			if decision == "APPROVED" && len(chain) > 0 && step+1 < len(chain) {
				a["step"] = step + 1 // the next person in the chain
				doc["proformaApproval"] = a
				return "step"
			}
			a["status"], a["decidedBy"], a["decidedByName"], a["decidedAt"] = decision, me.ID(), me.Name(), now()
			if note != "" {
				a["note"] = note
			} else {
				delete(a, "note")
			}
			doc["proformaApproval"] = a
			if decision == "APPROVED" {
				return "approved"
			}
			return "rejected"
		case "PENDING":
			doc["proformaApproval"] = jsonx.M{
				"status": "PENDING", "requestedBy": me.ID(), "requestedByName": me.Name(), "requestedAt": now(),
				"chain": chain, "step": 0, "steps": []any{},
			}
			return "pending"
		default:
			// clearing the approval is not possible for others
			if !inChain {
				keepOld()
			}
			return ""
		}
	}

	// no change of status: the details are the server's, never the client's
	keepOld()
	changed := oldStatus != "" && proformaContent(before) != proformaContent(doc)
	if oldStatus == "APPROVED" && !inChain && changed {
		delete(doc, "proformaApproval")
		return "reset"
	}
	// a proforma that was changed after some of the approvals starts again from the first person
	if oldStatus == "PENDING" && changed && (step > 0 || len(jsonx.Arr(old, "steps")) > 0) {
		a := jsonx.Copy(old)
		a["step"], a["steps"] = 0, []any{}
		doc["proformaApproval"] = a
		return "pending"
	}
	return ""
}

// notifyProformaApproval tells the CEO about a proforma waiting for approval, or the requester about the decision.
func notifyProformaApproval(r *http.Request, me auth.User, event string, doc jsonx.M, id string) {
	title := jsonx.Str(doc, "title")
	ap := jsonx.Sub(doc, "proformaApproval")
	switch event {
	case "pending":
		var ceo []string
		if chain := jsonx.Strings(ap, "chain"); len(chain) > 0 {
			ceo = []string{chain[0]}
		} else {
			rows, err := store.Pool.Query(r.Context(), `SELECT id FROM users WHERE data->>'canSignOfficialLetters' = 'true'`)
			if err != nil {
				return
			}
			for rows.Next() {
				var uid string
				if rows.Scan(&uid) == nil {
					ceo = append(ceo, uid)
				}
			}
			rows.Close()
		}
		notify.Notify(r.Context(), ceo, notify.Note{
			Kind: "task", Label: "تایید پیش‌فاکتور", Title: "پیش‌فاکتور «" + title + "» منتظر تایید شماست",
			Body: "ارسال‌کننده: " + me.Name() + " · شمارهٔ " + jsonx.Str(doc, "proformaNumber"), Ref: ref("deal", id), Repeat: true,
		}, "")
	case "step":
		chain := jsonx.Strings(ap, "chain")
		st := jsonx.Int(ap, "step")
		if st >= 0 && st < len(chain) {
			notify.Notify(r.Context(), []string{chain[st]}, notify.Note{
				Kind: "task", Label: "تایید پیش‌فاکتور", Title: "پیش‌فاکتور «" + title + "» منتظر تایید شماست (مرحلهٔ " + strconv.Itoa(st+1) + " از " + strconv.Itoa(len(chain)) + ")",
				Body: "مرحلهٔ قبل را " + me.Name() + " تایید کرد · شمارهٔ " + jsonx.Str(doc, "proformaNumber"), Ref: ref("deal", id), Repeat: true,
			}, me.ID())
		}
		if by := jsonx.Str(ap, "requestedBy"); by != "" && by != me.ID() {
			notify.Notify(r.Context(), []string{by}, notify.Note{Kind: "task", Label: "پیش‌فاکتور یک مرحله جلو رفت", Title: "پیش‌فاکتور «" + title + "» را " + me.Name() + " تایید کرد و به نفر بعدی رفت", Ref: ref("deal", id)}, me.ID())
		}
	case "approved", "rejected":
		to := []string{}
		for _, u := range []string{jsonx.Str(ap, "requestedBy"), jsonx.Str(doc, "ownerId")} {
			if u != "" && u != me.ID() && !jsonx.Contains(to, u) {
				to = append(to, u)
			}
		}
		label, text := "پیش‌فاکتور تایید شد", "پیش‌فاکتور «"+title+"» تایید شد؛ مهر و امضا درج شد و می‌توانید آن را بفرستید"
		if event == "rejected" {
			label, text = "پیش‌فاکتور رد شد", "پیش‌فاکتور «"+title+"» توسط "+me.Name()+" رد شد"
		}
		notify.Notify(r.Context(), to, notify.Note{
			Kind: "task", Label: label, Title: text, Body: jsonx.Str(ap, "note"), Ref: ref("deal", id), Repeat: true,
		}, me.ID())
	}
}

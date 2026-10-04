package api

import (
	"context"
	"net/http"

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

func proformaApprovalGate(ctx context.Context, me auth.User, before, doc jsonx.M) string {
	required, approver := proformaApprovalConfig(ctx, jsonx.Str(doc, "proformaIssuerId"))
	if !required {
		return ""
	}
	// the person chosen for this company approves; without a choice, anyone who may sign official letters
	canSign := jsonx.Bool(me.M, "canSignOfficialLetters")
	if approver != "" {
		canSign = me.ID() == approver
	}
	old := jsonx.Sub(before, "proformaApproval")
	incoming := jsonx.Sub(doc, "proformaApproval")
	oldStatus, newStatus := jsonx.Str(old, "status"), jsonx.Str(incoming, "status")

	keepOld := func() {
		if oldStatus != "" {
			doc["proformaApproval"] = old
		} else {
			delete(doc, "proformaApproval")
		}
	}

	if newStatus != oldStatus {
		switch newStatus {
		case "APPROVED", "REJECTED":
			if !canSign {
				keepOld()
				return ""
			}
			a := jsonx.Copy(old)
			a["status"], a["decidedBy"], a["decidedByName"], a["decidedAt"] = newStatus, me.ID(), me.Name(), now()
			if note := jsonx.Str(incoming, "note"); note != "" {
				a["note"] = note
			} else {
				delete(a, "note")
			}
			doc["proformaApproval"] = a
			if newStatus == "APPROVED" {
				return "approved"
			}
			return "rejected"
		case "PENDING":
			doc["proformaApproval"] = jsonx.M{
				"status": "PENDING", "requestedBy": me.ID(), "requestedByName": me.Name(), "requestedAt": now(),
			}
			return "pending"
		default:
			// clearing the approval is not possible for others
			if !canSign {
				keepOld()
			}
			return ""
		}
	}

	// no change of status: the details are the server's, never the client's
	keepOld()
	if oldStatus == "APPROVED" && !canSign && proformaContent(before) != proformaContent(doc) {
		delete(doc, "proformaApproval")
		return "reset"
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
		if _, approver := proformaApprovalConfig(r.Context(), jsonx.Str(doc, "proformaIssuerId")); approver != "" {
			ceo = []string{approver}
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
	case "approved", "rejected":
		to := []string{}
		for _, u := range []string{jsonx.Str(ap, "requestedBy"), jsonx.Str(doc, "ownerId")} {
			if u != "" && u != me.ID() && !jsonx.Contains(to, u) {
				to = append(to, u)
			}
		}
		label, text := "پیش‌فاکتور تایید شد", "پیش‌فاکتور «"+title+"» تایید شد؛ مهر و امضا درج شد و می‌توانید آن را بفرستید"
		if event == "rejected" {
			label, text = "پیش‌فاکتور رد شد", "پیش‌فاکتور «"+title+"» توسط مدیرعامل رد شد"
		}
		notify.Notify(r.Context(), to, notify.Note{
			Kind: "task", Label: label, Title: text, Body: jsonx.Str(ap, "note"), Ref: ref("deal", id), Repeat: true,
		}, me.ID())
	}
}

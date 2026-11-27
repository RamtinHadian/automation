package api

import (
	"context"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The detail rights of issuing an invoice, given per person in the permission table (the window opened from «صدور و ابطال فاکتور»):
//   - for whom: the customers the person may reach (default), only his own, or his own and those of the colleagues picked (invoiceScope «visible|own|people», invoiceTeamIds);
//   - what: official, unofficial, standalone (without proforma), cancelling, and «paid» (switched off in hiddenSub as crm.invoice.official / .unofficial / .standalone / .cancel / .paid).
// The administrator and an approver finishing an approval are not limited.

func invoiceSub(me auth.User, id string) bool {
	return me.IsAdmin() || !jsonx.Contains(jsonx.Strings(me.M, "hiddenSub"), id)
}

// invoiceScopeRefusal: "" when this person may issue an invoice on this deal, else the reason.
func invoiceScopeRefusal(ctx context.Context, me auth.User, doc jsonx.M) string {
	if me.IsAdmin() {
		return ""
	}
	scope := jsonx.Str(me.M, "invoiceScope")
	if scope != "own" && scope != "people" {
		return ""
	}
	owner := jsonx.Str(doc, "ownerId")
	if owner == "" && jsonx.Str(doc, "id") != "" {
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(owner_id, '') FROM crm_deals WHERE id = $1`, jsonx.Str(doc, "id")).Scan(&owner)
	}
	if owner == "" || owner == me.ID() {
		return ""
	}
	if scope == "people" && jsonx.Contains(jsonx.Strings(me.M, "invoiceTeamIds"), owner) {
		return ""
	}
	if scope == "people" {
		return "شما فقط برای مشتریان خودتان و همکارانی که مدیر برایتان مشخص کرده می‌توانید فاکتور صادر کنید."
	}
	return "شما فقط برای مشتریان خودتان می‌توانید فاکتور صادر کنید."
}

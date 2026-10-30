package api

import (
	"context"
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Who sees which customers. A salesperson sees their own customers, the opportunities they own or share, and the follow-ups given to them;
// administrators, and anybody an administrator ticked «مشتریان همکاران» for, see everything. The filter lives here (on the server) so the
// data of other people's customers is never sent to the page, not just hidden on it.

// crmMyDeals: opportunities this person owns or shares, and those of the people of the units they manage ($1 is their id, $2 the managed people).
const crmMyDeals = `(owner_id = $1 OR owner_id = ANY($2::text[]) OR data->'coOwnerIds' @> to_jsonb($1::text) OR customer_id IN (SELECT jsonb_array_elements_text(COALESCE(u.data->'crmCustomerIds', '[]'::jsonb)) FROM users u WHERE u.id = $1))`

// crmMyCustomerIDs: customers this person owns, customers of opportunities they work on, and customers they were given a follow-up for ($1 is their id).
const crmMyCustomerIDs = `(SELECT id FROM crm_customers WHERE owner_id = $1 OR owner_id = ANY($2::text[])
	UNION SELECT jsonb_array_elements_text(COALESCE(u.data->'crmCustomerIds', '[]'::jsonb)) FROM users u WHERE u.id = $1
	UNION SELECT customer_id FROM crm_deals WHERE ` + crmMyDeals + `
	UNION SELECT customer_id FROM crm_activities WHERE owner_id = $1 OR owner_id = ANY($2::text[]))`

// crmSeesAll: administrators and people with the «مشتریان همکاران» right see every customer.
func crmSeesAll(me auth.User) bool { return me.SeesTeamCrm() }

// crmGate: the rule for changing things. Programs that come in with an API key (the accounting connector and the like) are set up by an
// administrator on purpose and work on every customer, so only people at the keyboard are limited.
func crmGate(r *http.Request, me auth.User) bool {
	return crmSeesAll(me) || strings.HasPrefix(r.URL.Path, "/api/ext/")
}

// crmOwnsCustomer says whether this person may work with the customer.
func crmOwnsCustomer(r *http.Request, me auth.User, customerID string) bool {
	if crmGate(r, me) {
		return true
	}
	var ok bool
	_ = store.Pool.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM `+crmMyCustomerIDs+` m WHERE m.id = $3)`, me.ID(), crmPeople(r.Context(), me), customerID).Scan(&ok)
	return ok
}

// crmPeople: the people whose customers this person works with besides their own: the people of the units they manage, and the colleagues an
// administrator picked for them next to «مشتریان همکاران» (inactive ones are left out).
func crmPeople(ctx context.Context, me auth.User) []string {
	out := managedStaff(ctx, me.ID())
	if me.IsAgent() { // a representative also sees the customers of his own employees
		if rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'agentOwnerId' = $1 AND COALESCE(data->>'isActive', 'true') <> 'false'`, me.ID()); err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					out = append(out, id)
				}
			}
			rows.Close()
		}
	}
	picked := me.TeamCrmIDs()
	if len(picked) == 0 {
		return out
	}
	rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE id = ANY($1::text[]) AND COALESCE(data->>'isActive', 'true') <> 'false'`, picked)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil && id != me.ID() {
			out = append(out, id)
		}
	}
	return out
}

// redactContacts: a customer shown to a representative without his numbers and address (he only sees who it is and can press «call»).
func redactContacts(c jsonx.M) jsonx.M {
	for _, k := range []string{"phones", "mobile", "mobiles", "email", "address", "province", "city", "postalCode", "website", "repMobile", "telegramChatId", "baleChatId", "reps", "nationalId", "economicCode", "registrationNumber", "attachments", "notes", "noteLog", "social", "sepidarInfo", "referrer"} {
		delete(c, k)
	}
	c["phones"] = []string{}
	c["hiddenContact"] = true
	return c
}

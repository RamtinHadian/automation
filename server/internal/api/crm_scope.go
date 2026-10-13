package api

import (
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/store"
)

// Who sees which customers. A salesperson sees their own customers, the opportunities they own or share, and the follow-ups given to them;
// administrators, and anybody an administrator ticked «مشتریان همکاران» for, see everything. The filter lives here (on the server) so the
// data of other people's customers is never sent to the page, not just hidden on it.

// crmMyDeals: opportunities this person owns or shares ($1 is their id).
const crmMyDeals = `(owner_id = $1 OR data->'coOwnerIds' @> to_jsonb($1::text))`

// crmMyCustomerIDs: customers this person owns, customers of opportunities they work on, and customers they were given a follow-up for ($1 is their id).
const crmMyCustomerIDs = `(SELECT id FROM crm_customers WHERE owner_id = $1
	UNION SELECT customer_id FROM crm_deals WHERE ` + crmMyDeals + `
	UNION SELECT customer_id FROM crm_activities WHERE owner_id = $1)`

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
	_ = store.Pool.QueryRow(r.Context(), `SELECT EXISTS (SELECT 1 FROM `+crmMyCustomerIDs+` m WHERE m.id = $2)`, me.ID(), customerID).Scan(&ok)
	return ok
}

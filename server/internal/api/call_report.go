package api

import (
	"net/http"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// «گزارش مشتری» from the incoming-call pop-up and the call history. The pop-up of a call shows the customer who rings to everybody who
// takes the call, also when the customer belongs to a colleague; so the report behind its «گزارش» button is given to everybody too,
// unless an administrator switched the right «crm.callReport» off for that person in the permission table. The amounts are only sent
// to the people who may see the company's sales money.

// GET /api/customers/{id}/call-report
func customerCallReport(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if subOff(me, "crm.callReport") {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	cust := rawMaps(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, id)
	if len(cust) == 0 {
		httpx.Error(w, http.StatusNotFound, "این مشتری پیدا نشد.")
		return
	}
	deals := rawMaps(r.Context(), `SELECT data FROM crm_deals WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 200`, id)
	acts := rawMaps(r.Context(), `SELECT data FROM crm_activities WHERE customer_id = $1 AND data->>'type' <> 'MISSING' ORDER BY created_at DESC LIMIT 300`, id)
	if deals == nil {
		deals = []jsonx.M{}
	}
	if acts == nil {
		acts = []jsonx.M{}
	}
	if !seesSalesMoney(me) {
		for _, d := range deals {
			d["amount"] = 0
			var items []any
			for _, it := range jsonx.Arr(d, "items") {
				if m, ok := it.(map[string]any); ok {
					items = append(items, map[string]any{"title": m["title"], "qty": m["qty"], "unit": m["unit"], "code": m["code"]})
				}
			}
			d["items"] = items
		}
		for _, a := range acts {
			if _, ok := a["price"]; ok {
				a["price"] = 0
			}
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"customer": cust[0], "deals": deals, "activities": acts})
}

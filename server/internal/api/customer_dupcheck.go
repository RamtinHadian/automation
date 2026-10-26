package api

import (
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Before a list (for example the customers exported from Sepidar) is imported, the page asks which of its numbers and codes already belong
// to a customer in Hoormand: all customers are looked at, also the ones of colleagues the person does not see. For a customer the person
// may see the name is told; for any other one only «exists». The import itself never changes or deletes an existing customer, so what is
// already written about them (calls, notes, opportunities) stays as it is.

// POST /api/customers/dup-check  {phones: [...], codes: [...]}
func customerDupCheck(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	wantPhone, wantCode := map[string]bool{}, map[string]bool{}
	for _, v := range jsonx.Arr(body, "phones") {
		if s, ok := v.(string); ok {
			if k := phoneKey(s); k != "" {
				wantPhone[k] = true
			}
		}
	}
	for _, v := range jsonx.Arr(body, "codes") {
		if s, ok := v.(string); ok {
			if k := strings.TrimSpace(faDigits.Replace(s)); k != "" {
				wantCode[k] = true
			}
		}
	}
	ctx := r.Context()
	seeAll := crmSeesAll(me)
	visible := map[string]bool{}
	if !seeAll {
		rows, err := store.Pool.Query(ctx, `SELECT id FROM `+crmMyCustomerIDs+` v`, me.ID(), crmPeople(ctx, me))
		if err == nil {
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					visible[id] = true
				}
			}
			rows.Close()
		}
	}
	type hit struct {
		Name    string `json:"name"`
		Visible bool   `json:"visible"`
	}
	phones, codes := map[string]hit{}, map[string]hit{}
	for _, c := range rawMaps(ctx, `SELECT data FROM crm_customers`) {
		vis := seeAll || visible[jsonx.Str(c, "id")]
		h := hit{Visible: vis}
		if vis {
			h.Name = jsonx.Str(c, "name")
		}
		for _, p := range jsonx.Strings(c, "phones") {
			if k := phoneKey(p); k != "" && wantPhone[k] {
				if _, seen := phones[k]; !seen {
					phones[k] = h
				}
			}
		}
		for _, f := range []string{"nationalCode", "nationalId"} {
			if k := strings.TrimSpace(faDigits.Replace(jsonx.Str(c, f))); k != "" && wantCode[k] {
				if _, seen := codes[k]; !seen {
					codes[k] = h
				}
			}
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"phones": phones, "codes": codes})
}

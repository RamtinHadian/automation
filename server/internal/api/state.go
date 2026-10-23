package api

import (
	"encoding/json"
	"net/http"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// state returns everything the signed-in user may see in one request. Regular users only get their own
// transfers, tasks and reports; admins get all of them.
func state(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me := auth.Current(r)
	admin := me.IsAdmin()
	id := me.ID()

	fail := func(err error) bool {
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal error")
			return true
		}
		return false
	}

	urows, err := store.Pool.Query(ctx, `SELECT id, email, data FROM users ORDER BY created_at`)
	if fail(err) {
		return
	}
	staff := []jsonx.M{}
	for urows.Next() {
		var uid, email string
		var data []byte
		if err := urows.Scan(&uid, &email, &data); fail(err) {
			urows.Close()
			return
		}
		staff = append(staff, auth.FromRow(uid, email, data))
	}
	urows.Close()
	if me.Isolated() { // a representative or his employee sees himself, the people named for him and the managing director only
		staff = agentVisibleStaff(me, staff)
	}

	departments, err := store.RawList(ctx, `SELECT data FROM departments`)
	if fail(err) {
		return
	}

	var transfers, auditLogs, tasks, reports = empty(), empty(), empty(), empty()
	if admin {
		// Admins see everything, except what they themselves removed from their own list.
		transfers, err = store.RawList(ctx,
			`SELECT data FROM transfers t
			 WHERE NOT EXISTS (SELECT 1 FROM transfer_hidden h WHERE h.transfer_id = t.id AND h.user_id = $1)
			 ORDER BY t.created_at DESC`, id)
	} else {
		transfers, err = store.RawList(ctx,
			`SELECT data FROM transfers t
			 WHERE (t.sender_id = $1 OR $1 = ANY(t.recipient_ids))
			   AND NOT EXISTS (SELECT 1 FROM transfer_hidden h WHERE h.transfer_id = t.id AND h.user_id = $1)
			 ORDER BY t.created_at DESC`, id)
	}
	if fail(err) {
		return
	}
	if admin {
		if auditLogs, err = store.RawList(ctx, `SELECT data FROM audit_logs ORDER BY created_at DESC LIMIT 2000`); fail(err) {
			return
		}
	}
	if me.CanUseTasks() {
		if admin {
			if me.Role() == "SUPER_ADMIN" {
				tasks, err = store.RawList(ctx, `SELECT data FROM tasks ORDER BY created_at DESC`)
			} else { // the archive is seen by the top admin and by the people who had a part in the task only
				tasks, err = store.RawList(ctx, `SELECT data FROM tasks WHERE COALESCE(data->>'archived', '') <> 'true' OR creator_id = $1 OR $1 = ANY(assignee_ids) ORDER BY created_at DESC`, id)
			}
			if !fail(err) {
				reports, err = store.RawList(ctx, `SELECT data FROM daily_reports ORDER BY report_date DESC LIMIT 1500`)
			}
		} else {
			mgd := managedStaff(ctx, id)
			tasks, err = store.RawList(ctx, `SELECT data FROM tasks WHERE creator_id = $1 OR $1 = ANY(assignee_ids) OR creator_id = ANY($2::text[]) OR assignee_ids && $2::text[] ORDER BY created_at DESC`, id, mgd)
			if !fail(err) {
				reports, err = store.RawList(ctx,
					`SELECT data FROM daily_reports WHERE user_id = $1 OR $1 = ANY(recipient_ids) OR user_id = ANY($2::text[]) ORDER BY report_date DESC LIMIT 600`, id, mgd)
			}
		}
		if fail(err) {
			return
		}
	}

	customers, deals, activities := empty(), empty(), empty()
	if me.CanUseCrm() {
		if crmSeesAll(me) {
			if customers, err = store.RawList(ctx, `SELECT data FROM crm_customers ORDER BY (data->>'name')`); fail(err) {
				return
			}
			if deals, err = store.RawList(ctx, `SELECT data FROM crm_deals ORDER BY id`); fail(err) {
				return
			}
			if activities, err = store.RawList(ctx, `SELECT data FROM crm_activities ORDER BY created_at DESC LIMIT 2000`); fail(err) {
				return
			}
		} else {
			// a salesperson gets only their own customers, the opportunities they work on and the history of those customers
			// (a unit manager also gets those of the people of the unit)
			managed := crmPeople(ctx, me)
			if customers, err = store.RawList(ctx, `SELECT data FROM crm_customers WHERE id IN `+crmMyCustomerIDs+` ORDER BY (data->>'name')`, id, managed); fail(err) {
				return
			}
			// customers an administrator showed to this representative («agentViewerIds»): only their name and details without any number or address
			if me.Isolated() {
				shared, serr := store.RawList(ctx, `SELECT data FROM crm_customers WHERE data->'agentViewerIds' @> to_jsonb($1::text) AND id NOT IN `+crmMyCustomerIDs+` ORDER BY (data->>'name')`, id, managed)
				if fail(serr) {
					return
				}
				for _, raw := range shared {
					customers = append(customers, json.RawMessage(jsonx.Encode(redactContacts(jsonx.Decode(raw)))))
				}
			}
			if deals, err = store.RawList(ctx, `SELECT data FROM crm_deals WHERE `+crmMyDeals+` ORDER BY id`, id, managed); fail(err) {
				return
			}
			if activities, err = store.RawList(ctx, `SELECT data FROM crm_activities WHERE customer_id IN `+crmMyCustomerIDs+` OR owner_id = $1 OR owner_id = ANY($2::text[]) ORDER BY created_at DESC LIMIT 2000`, id, managed); fail(err) {
				return
			}
		}
	}

	var settings any
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw); err == nil {
		settings = jsonRaw(raw)
	}

	httpx.JSON(w, http.StatusOK, map[string]any{
		"me":          me.M,
		"tasks":       tasks,
		"reports":     reports,
		"customers":   customers,
		"deals":       deals,
		"activities":  activities,
		"staff":       staff,
		"departments": departments,
		"transfers":   transfers,
		"auditLogs":   auditLogs,
		"settings":    settings,
	})
}

// statsData hands the whole company's numbers to people allowed to see the management statistics
// (admins, or users given that permission), whatever their own transfers/tasks view is.
func statsData(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).CanViewStats() {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	fail := func(err error) bool {
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, "internal error")
			return true
		}
		return false
	}
	urows, err := store.Pool.Query(ctx, `SELECT id, email, data FROM users ORDER BY created_at`)
	if fail(err) {
		return
	}
	staff := []jsonx.M{}
	for urows.Next() {
		var uid, email string
		var data []byte
		if err := urows.Scan(&uid, &email, &data); fail(err) {
			urows.Close()
			return
		}
		staff = append(staff, auth.FromRow(uid, email, data))
	}
	urows.Close()
	out := map[string]any{"staff": staff}
	for key, q := range map[string]string{
		"transfers": `SELECT data FROM transfers ORDER BY created_at DESC`,
		"tasks":     `SELECT data FROM tasks ORDER BY created_at DESC`,
		"reports":   `SELECT data FROM daily_reports ORDER BY report_date DESC LIMIT 1500`,
		"customers": `SELECT data FROM crm_customers`,
		"deals":     `SELECT data FROM crm_deals`,
		"warranties": `SELECT data FROM warranties ORDER BY created_at DESC LIMIT 5000`,
		"warrantyClaims": `SELECT data FROM warranty_claims ORDER BY created_at DESC LIMIT 5000`,
		"supportSubs": `SELECT data FROM support_subs ORDER BY created_at DESC LIMIT 5000`,
		"supportTickets": `SELECT data FROM support_tickets ORDER BY created_at DESC LIMIT 5000`,
		"missing":   `SELECT data FROM crm_activities WHERE data->>'type' = 'MISSING' ORDER BY created_at DESC LIMIT 5000`,
	} {
		var rows []json.RawMessage
		var err error
		if key == "tasks" && auth.Current(r).Role() != "SUPER_ADMIN" { // archived tasks: top admin and the people involved only
			rows, err = store.RawList(ctx, `SELECT data FROM tasks WHERE COALESCE(data->>'archived', '') <> 'true' OR creator_id = $1 OR $1 = ANY(assignee_ids) ORDER BY created_at DESC`, auth.Current(r).ID())
		} else {
			rows, err = store.RawList(ctx, q)
		}
		if fail(err) {
			return
		}
		out[key] = rows
	}
	httpx.JSON(w, http.StatusOK, out)
}

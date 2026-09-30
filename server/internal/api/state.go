package api

import (
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
			tasks, err = store.RawList(ctx, `SELECT data FROM tasks ORDER BY created_at DESC`)
			if !fail(err) {
				reports, err = store.RawList(ctx, `SELECT data FROM daily_reports ORDER BY report_date DESC LIMIT 1500`)
			}
		} else {
			tasks, err = store.RawList(ctx, `SELECT data FROM tasks WHERE creator_id = $1 OR $1 = ANY(assignee_ids) ORDER BY created_at DESC`, id)
			if !fail(err) {
				reports, err = store.RawList(ctx,
					`SELECT data FROM daily_reports WHERE user_id = $1 OR $1 = ANY(recipient_ids) ORDER BY report_date DESC LIMIT 600`, id)
			}
		}
		if fail(err) {
			return
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
		"staff":       staff,
		"departments": departments,
		"transfers":   transfers,
		"auditLogs":   auditLogs,
		"settings":    settings,
	})
}

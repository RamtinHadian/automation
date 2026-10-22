package api

import (
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Meeting minutes («صورتجلسه», in «امور اداری»): a minutes sheet has a number, date, place, the people who were present (colleagues or
// outsiders), the agenda, what was discussed and the decisions with who carries them out and by when. The person who writes it, every
// colleague named in it and the administrators can see it; only the writer (and administrators) can change or delete it.

func minutesAllowed(me auth.User) bool { return !subOff(me, "files.minutes") }

// GET /api/minutes: the minutes this person may see, newest first
func minutesList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !minutesAllowed(me) {
		httpx.Forbidden(w)
		return
	}
	q := `SELECT data FROM minutes ORDER BY COALESCE(data->>'date', '') DESC, created_at DESC LIMIT 1000`
	args := []any{}
	if !me.IsAdmin() {
		q = `SELECT data FROM minutes WHERE author_id = $1 OR $1 = ANY(attendee_ids) ORDER BY COALESCE(data->>'date', '') DESC, created_at DESC LIMIT 1000`
		args = append(args, me.ID())
	}
	rows, err := store.Pool.Query(r.Context(), q, args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) == nil {
			out = append(out, jsonx.Decode(raw))
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"minutes": out})
}

// PUT /api/minutes/{id}: create, or change one's own
func minutesPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !minutesAllowed(me) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	if id == "" || len(id) > 64 {
		httpx.Error(w, http.StatusBadRequest, "شناسه نادرست است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	data := jsonx.Copy(body)
	ctx := r.Context()
	if strings.TrimSpace(jsonx.Str(data, "title")) == "" {
		httpx.Error(w, http.StatusBadRequest, "موضوع صورتجلسه را بنویسید.")
		return
	}
	var author string
	existed := store.Pool.QueryRow(ctx, `SELECT author_id FROM minutes WHERE id = $1`, id).Scan(&author) == nil
	if existed && author != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if !existed {
		author = me.ID()
	}
	// the colleagues named in it (outsiders have no account)
	attendees := []string{}
	for _, a := range jsonx.Arr(data, "attendees") {
		if o, ok := a.(map[string]any); ok {
			if uid, _ := o["userId"].(string); uid != "" && !jsonx.Contains(attendees, uid) {
				attendees = append(attendees, uid)
			}
		}
	}
	before := []string{}
	wasFinal := false
	if existed {
		var prev string
		_ = store.Pool.QueryRow(ctx, `SELECT attendee_ids, COALESCE(data->>'status', '') FROM minutes WHERE id = $1`, id).Scan(&before, &prev)
		wasFinal = prev == "FINAL"
	}
	// a switched-off person cannot be added to a new sheet (those already in it stay)
	for _, off := range inactiveAmong(ctx, attendees) {
		if !jsonx.Contains(before, off) {
			httpx.Error(w, http.StatusBadRequest, "کارمند غیرفعال را نمی‌شود در صورتجلسه آورد.")
			return
		}
	}
	data["id"] = id
	data["authorId"] = author
	if jsonx.Str(data, "authorName") == "" {
		data["authorName"] = me.Name()
	}
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO minutes (id, author_id, attendee_ids, data) VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (id) DO UPDATE SET attendee_ids = $3, data = $4::jsonb, updated_at = now()`,
		id, author, attendees, jsonx.Encode(data)); err != nil {
		internalError(w)
		return
	}
	// the colleagues who are named for the first time hear about it
	added := []string{}
	for _, a := range attendees {
		// a draft tells nobody; when it becomes final everyone named hears, and later only the people added afterwards
		if !wasFinal || !jsonx.Contains(before, a) {
			added = append(added, a)
		}
	}
	if len(added) > 0 && jsonx.Str(data, "status") == "FINAL" {
		notify.Notify(ctx, added, notify.Note{Kind: "file", Label: "صورتجلسه", Title: "شما در صورتجلسه‌ای نام برده شده‌اید (" + me.Name() + ")", Body: jsonx.Str(data, "title"), Ref: ref("minutes", id)}, me.ID())
	}
	httpx.OK(w)
}

// DELETE /api/minutes/{id}
func minutesDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !minutesAllowed(me) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	var author string
	if store.Pool.QueryRow(r.Context(), `SELECT author_id FROM minutes WHERE id = $1`, id).Scan(&author) != nil {
		httpx.OK(w)
		return
	}
	if author != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM minutes WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func registerMinutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/minutes", auth.Require(minutesList))
	mux.HandleFunc("PUT /api/minutes/{id}", auth.Require(minutesPut))
	mux.HandleFunc("DELETE /api/minutes/{id}", auth.Require(minutesDelete))
}

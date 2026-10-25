package api

import (
	"context"
	"net/http"
	"strings"
	"time"

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
	var author, prevStatus string
	existed := store.Pool.QueryRow(ctx, `SELECT author_id, COALESCE(data->>'status', '') FROM minutes WHERE id = $1`, id).Scan(&author, &prevStatus) == nil
	if existed && author != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	// a finalised sheet lives in the archive and never changes (a correction is a new sheet)
	if existed && prevStatus == "FINAL" {
		httpx.Error(w, http.StatusConflict, "صورتجلسهٔ نهایی‌شده در بایگانی قفل است و تغییر نمی‌کند؛ برای اصلاح، یک صورتجلسهٔ اصلاحیه بسازید.")
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
	// the people a decision is given to (the managing director refers work to them in the minutes) can open the sheet and hear about it
	owners := []string{}
	for _, d := range jsonx.Arr(data, "decisions") {
		if o, ok := d.(map[string]any); ok {
			if uid, _ := o["ownerUserId"].(string); uid != "" && !jsonx.Contains(owners, uid) {
				owners = append(owners, uid)
			}
			}
	}
	for _, o := range owners {
		if !jsonx.Contains(attendees, o) {
			attendees = append(attendees, o)
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
	// the person who made it is the one who first saved it, never what the client says
	if !existed {
		data["authorName"] = me.Name()
	} else if prev := authorNameOf(ctx, author); prev != "" {
		data["authorName"] = prev
	}
	if jsonx.Str(data, "status") == "FINAL" {
		data["finalizedAt"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
		data["finalizedById"] = me.ID()
		data["finalizedByName"] = me.Name()
	} else {
		data["status"] = "DRAFT"
		delete(data, "finalizedAt")
		delete(data, "finalizedById")
		delete(data, "finalizedByName")
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
		named, given := []string{}, []string{}
		for _, a := range added {
			if jsonx.Contains(owners, a) {
				given = append(given, a)
			} else {
				named = append(named, a)
			}
		}
		if len(named) > 0 {
			notify.Notify(ctx, named, notify.Note{Kind: "file", Label: "صورتجلسه", Title: "شما در صورتجلسه‌ای نام برده شده‌اید (" + me.Name() + ")", Body: jsonx.Str(data, "title"), Ref: ref("minutes", id)}, me.ID())
		}
		if len(given) > 0 {
			notify.Notify(ctx, given, notify.Note{Kind: "task", Label: "مصوبه ارجاع‌شده", Title: "در صورتجلسه کاری به شما ارجاع شد (" + me.Name() + ")", Body: jsonx.Str(data, "title"), Ref: ref("minutes", id)}, me.ID())
		}
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
	var author, status string
	if store.Pool.QueryRow(r.Context(), `SELECT author_id, COALESCE(data->>'status', '') FROM minutes WHERE id = $1`, id).Scan(&author, &status) != nil {
		httpx.OK(w)
		return
	}
	// the archive is never emptied: a finalised sheet cannot be deleted, by nobody
	if status == "FINAL" {
		httpx.Error(w, http.StatusConflict, "صورتجلسهٔ نهایی‌شده در بایگانی می‌ماند و حذف نمی‌شود.")
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
	mux.HandleFunc("POST /api/minutes/ai", auth.Require(minutesAi))
}

func authorNameOf(ctx context.Context, id string) string {
	var n string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, id).Scan(&n)
	return n
}

package api

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Personal reminders («یادآور», in «امور اداری»): each person keeps their own. When the time comes the server marks the reminder as «fired»
// and tells the person (live stream and web push); the page shows a pop-up in the middle of the screen until the person marks it done or
// snoozes it. A reminder whose time passed while the page was closed pops up as soon as the page is opened.

var (
	remTehran = time.FixedZone("tehran", 3*3600+1800)
	remDate   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	remClock  = regexp.MustCompile(`^([01]?\d|2[0-3]):([0-5]\d)$`)
	remRepeat = map[string]time.Duration{"none": 0, "daily": 24 * time.Hour, "weekly": 7 * 24 * time.Hour}
)

func remView(id, title, note string, due time.Time, repeat, status string, fired *time.Time) jsonx.M {
	loc := due.In(remTehran)
	m := jsonx.M{"id": id, "title": title, "note": note, "dueAt": due.Format(time.RFC3339), "date": loc.Format("2006-01-02"), "time": loc.Format("15:04"), "repeat": repeat, "status": status}
	if fired != nil {
		m["firedAt"] = fired.Format(time.RFC3339)
	}
	return m
}

// GET /api/reminders: the person's own, waiting and fired first
func remList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	rows, err := store.Pool.Query(r.Context(), `SELECT id, title, note, due_at, repeat, status, fired_at FROM reminders
		WHERE user_id = $1 AND (status <> 'done' OR done_at > now() - interval '14 days') ORDER BY (status = 'done'), due_at LIMIT 300`, me.ID())
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var id, title, note, repeat, status string
		var due time.Time
		var fired *time.Time
		if rows.Scan(&id, &title, &note, &due, &repeat, &status, &fired) == nil {
			out = append(out, remView(id, title, note, due, repeat, status, fired))
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reminders": out, "now": time.Now().Format(time.RFC3339)})
}

// remParse reads {title, note, date, time, repeat} of a request.
func remParse(w http.ResponseWriter, body jsonx.M) (title, note, repeat string, due time.Time, ok bool) {
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	title = strings.TrimSpace(jsonx.Str(body, "title"))
	if title == "" || len([]rune(title)) > 120 {
		bad("عنوان یادآور را بنویسید (حداکثر ۱۲۰ نویسه).")
		return
	}
	note = strings.TrimSpace(jsonx.Str(body, "note"))
	if len([]rune(note)) > 1000 {
		bad("توضیح یادآور بیش از حد طولانی است.")
		return
	}
	repeat = jsonx.Str(body, "repeat")
	if _, known := remRepeat[repeat]; !known {
		repeat = "none"
	}
	date, clock := jsonx.Str(body, "date"), jsonx.Str(body, "time")
	if !remDate.MatchString(date) || !remClock.MatchString(clock) {
		bad("تاریخ و ساعت یادآور را درست بنویسید.")
		return
	}
	t, err := time.ParseInLocation("2006-01-02 15:04", date+" "+func() string {
		if len(clock) == 4 {
			return "0" + clock
		}
		return clock
	}(), remTehran)
	if err != nil {
		bad("تاریخ و ساعت یادآور را درست بنویسید.")
		return
	}
	if t.After(time.Now().AddDate(5, 0, 0)) {
		bad("تاریخ یادآور بیش از حد دور است.")
		return
	}
	return title, note, repeat, t.UTC(), true
}

// POST /api/reminders {title, note, date, time, repeat}
func remCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	title, note, repeat, due, ok := remParse(w, body)
	if !ok {
		return
	}
	var n int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM reminders WHERE user_id = $1 AND status <> 'done'`, me.ID()).Scan(&n)
	if n >= 200 {
		httpx.Error(w, http.StatusConflict, "حداکثر ۲۰۰ یادآور فعال می‌توانید داشته باشید.")
		return
	}
	id := "rm-" + randomHex(6)
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO reminders (id, user_id, title, note, due_at, repeat) VALUES ($1, $2, $3, $4, $5, $6)`, id, me.ID(), title, note, due, repeat); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, remView(id, title, note, due, repeat, "pending", nil))
}

// PUT /api/reminders/{id}: change a reminder that is not finished (it waits for its new time again)
func remUpdate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	title, note, repeat, due, ok := remParse(w, body)
	if !ok {
		return
	}
	tag, err := store.Pool.Exec(r.Context(), `UPDATE reminders SET title = $3, note = $4, due_at = $5, repeat = $6, status = 'pending', fired_at = NULL WHERE id = $1 AND user_id = $2 AND status <> 'done'`, r.PathValue("id"), me.ID(), title, note, due, repeat)
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "یادآور پیدا نشد.")
		return
	}
	httpx.OK(w)
}

// DELETE /api/reminders/{id}
func remDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM reminders WHERE id = $1 AND user_id = $2`, r.PathValue("id"), me.ID()); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// POST /api/reminders/{id}/done: a one-time reminder is finished; a repeating one waits for its next time
func remDone(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	var due time.Time
	var repeat string
	if store.Pool.QueryRow(ctx, `SELECT due_at, repeat FROM reminders WHERE id = $1 AND user_id = $2 AND status <> 'done'`, r.PathValue("id"), me.ID()).Scan(&due, &repeat) != nil {
		httpx.Error(w, http.StatusNotFound, "یادآور پیدا نشد.")
		return
	}
	if step := remRepeat[repeat]; step > 0 {
		next := due
		for !next.After(time.Now()) {
			next = next.Add(step)
		}
		_, _ = store.Pool.Exec(ctx, `UPDATE reminders SET due_at = $3, status = 'pending', fired_at = NULL WHERE id = $1 AND user_id = $2`, r.PathValue("id"), me.ID(), next)
	} else {
		_, _ = store.Pool.Exec(ctx, `UPDATE reminders SET status = 'done', done_at = now() WHERE id = $1 AND user_id = $2`, r.PathValue("id"), me.ID())
	}
	httpx.OK(w)
}

// POST /api/reminders/{id}/snooze {minutes}: it comes back after that many minutes
func remSnooze(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	m := jsonx.Int(body, "minutes")
	if m < 1 || m > 7*24*60 {
		httpx.Error(w, http.StatusBadRequest, "مدت تعویق درست نیست.")
		return
	}
	tag, err := store.Pool.Exec(r.Context(), `UPDATE reminders SET due_at = now() + make_interval(mins => $3), status = 'pending', fired_at = NULL WHERE id = $1 AND user_id = $2 AND status <> 'done'`, r.PathValue("id"), me.ID(), m)
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusNotFound, "یادآور پیدا نشد.")
		return
	}
	httpx.OK(w)
}

// RunReminders looks every twenty seconds for reminders whose time has come and tells their owners.
func RunReminders(ctx context.Context) {
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
	for {
		fireReminders(ctx)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func fireReminders(ctx context.Context) {
	rows, err := store.Pool.Query(ctx, `UPDATE reminders SET status = 'fired', fired_at = now() WHERE status = 'pending' AND due_at <= now() RETURNING id, user_id, title, note`)
	if err != nil {
		return
	}
	type due struct{ id, user, title, note string }
	var list []due
	for rows.Next() {
		var d due
		if rows.Scan(&d.id, &d.user, &d.title, &d.note) == nil {
			list = append(list, d)
		}
	}
	rows.Close()
	for _, d := range list {
		body := d.note
		if body == "" {
			body = "زمان یادآور شما رسیده است."
		}
		notify.Notify(ctx, []string{d.user}, notify.Note{Kind: "alert", Label: "یادآور", Title: d.title, Body: body, Ref: ref("reminder", d.id), From: "یادآور", Repeat: true}, "")
	}
}

func registerReminders(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/reminders", auth.Require(remList))
	mux.HandleFunc("POST /api/reminders", auth.Require(remCreate))
	mux.HandleFunc("PUT /api/reminders/{id}", auth.Require(remUpdate))
	mux.HandleFunc("DELETE /api/reminders/{id}", auth.Require(remDelete))
	mux.HandleFunc("POST /api/reminders/{id}/done", auth.Require(remDone))
	mux.HandleFunc("POST /api/reminders/{id}/snooze", auth.Require(remSnooze))
}

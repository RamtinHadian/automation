package api

import (
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The bulletin board («تابلو اعلانات»): everybody reads it; only admins and the people an admin gave the
// «can post announcements» switch may write. A new announcement is also sent as a notification to everybody else.

func canPostAnnouncements(me auth.User) bool {
	return me.IsAdmin() || jsonx.Bool(me.M, "canPostAnnouncements") || jsonx.Bool(me.M, "canSignOfficialLetters")
}

func cut(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		return string(r[:n])
	}
	return string(r)
}

// GET /api/announcements
func announcementList(w http.ResponseWriter, r *http.Request) {
	list, err := store.RawList(r.Context(), `SELECT data FROM announcements ORDER BY pinned DESC, created_at DESC LIMIT 300`)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"announcements": list, "canPost": canPostAnnouncements(auth.Current(r))})
}

// POST /api/announcements  {title, text, important, pinned}
func announcementCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canPostAnnouncements(me) {
		httpx.Error(w, http.StatusForbidden, "اجازهٔ ثبت اعلان را ندارید؛ مدیر می‌تواند این دسترسی را برای شما فعال کند.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	title, text := cut(jsonx.Str(body, "title"), 120), cut(jsonx.Str(body, "text"), 4000)
	if title == "" || text == "" {
		httpx.Error(w, http.StatusBadRequest, "عنوان و متن اعلان را بنویسید.")
		return
	}
	id := "an-" + time.Now().UTC().Format("060102150405.000") + "-" + me.ID()
	id = strings.ReplaceAll(id, ".", "")
	important, pinned := jsonx.Bool(body, "important"), jsonx.Bool(body, "pinned")
	doc := jsonx.M{
		"id": id, "title": title, "text": text, "important": important, "pinned": pinned,
		"authorId": me.ID(), "authorName": me.Name(), "createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO announcements (id, pinned, data) VALUES ($1, $2, $3::jsonb)`, id, pinned, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT id FROM users WHERE COALESCE(data->>'isActive', 'true') <> 'false'`)
	if err == nil {
		var all []string
		for rows.Next() {
			var uid string
			if rows.Scan(&uid) == nil && uid != me.ID() {
				all = append(all, uid)
			}
		}
		rows.Close()
		label := "اعلان جدید"
		if important {
			label = "اعلان مهم"
		}
		notify.Notify(r.Context(), all, notify.Note{Kind: "alert", Label: label, Title: title, Body: cut(text, 120), Ref: ref("announcement", id), Repeat: true}, me.ID())
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

// DELETE /api/announcements/{id}: the author or an admin
func announcementDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	var author string
	if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'authorId', '') FROM announcements WHERE id = $1`, id).Scan(&author); err != nil {
		httpx.OK(w)
		return
	}
	if author != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM announcements WHERE id = $1`, id)
	httpx.OK(w)
}

// POST /api/announcements/{id}/pin  {pinned}: the author or an admin
func announcementPin(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id, pinned := r.PathValue("id"), jsonx.Bool(body, "pinned")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM announcements WHERE id = $1`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "اعلان پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	if jsonx.Str(doc, "authorId") != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	doc["pinned"] = pinned
	_, _ = store.Pool.Exec(r.Context(), `UPDATE announcements SET pinned = $2, data = $3::jsonb WHERE id = $1`, id, pinned, jsonx.Encode(doc))
	httpx.OK(w)
}

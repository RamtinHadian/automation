package api

import (
	"bytes"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

const (
	maxSoundBytes = 600 << 10
	maxSounds     = 12
)

// soundMime recognises the common audio formats from their first bytes (the file name and the browser's claim are not trusted).
func soundMime(b []byte) string {
	switch {
	case len(b) > 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WAVE":
		return "audio/wav"
	case len(b) > 4 && string(b[:4]) == "OggS":
		return "audio/ogg"
	case len(b) > 3 && string(b[:3]) == "ID3":
		return "audio/mpeg"
	case len(b) > 2 && b[0] == 0xFF && b[1]&0xE0 == 0xE0:
		return "audio/mpeg"
	case len(b) > 12 && string(b[4:8]) == "ftyp":
		return "audio/mp4"
	case len(b) > 4 && bytes.Equal(b[:4], []byte{0x1A, 0x45, 0xDF, 0xA3}):
		return "audio/webm"
	}
	return ""
}

// listSounds returns the uploaded notification sounds (names only, the audio is fetched one by one).
func listSounds(w http.ResponseWriter, r *http.Request) {
	rows, err := store.Pool.Query(r.Context(), `SELECT id, name, mime, length(data) FROM notify_sounds ORDER BY created_at`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var id, name, mime string
		var size int
		if rows.Scan(&id, &name, &mime, &size) == nil {
			out = append(out, jsonx.M{"id": id, "name": name, "mime": mime, "size": size})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sounds": out})
}

func getSound(w http.ResponseWriter, r *http.Request) {
	var mime string
	var data []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT mime, data FROM notify_sounds WHERE id = $1`, r.PathValue("id")).Scan(&mime, &data); err != nil {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	_, _ = w.Write(data)
}

func uploadSound(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSoundBytes+(64<<10))
	if err := r.ParseMultipartForm(maxSoundBytes + (64 << 10)); err != nil {
		httpx.Error(w, http.StatusBadRequest, "فایل صدا نباید از ۶۰۰ کیلوبایت بیشتر باشد.")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "فایلی ارسال نشده است.")
		return
	}
	defer f.Close()
	data, _ := io.ReadAll(io.LimitReader(f, maxSoundBytes+1))
	if len(data) > maxSoundBytes {
		httpx.Error(w, http.StatusBadRequest, "فایل صدا نباید از ۶۰۰ کیلوبایت بیشتر باشد.")
		return
	}
	mime := soundMime(data)
	if mime == "" {
		httpx.Error(w, http.StatusBadRequest, "فرمت فایل پشتیبانی نمی‌شود؛ mp3، wav، ogg یا m4a بگذارید.")
		return
	}
	var n int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM notify_sounds`).Scan(&n)
	if n >= maxSounds {
		httpx.Error(w, http.StatusBadRequest, "حداکثر "+strconv.Itoa(maxSounds)+" صدای اختصاصی می‌شود گذاشت؛ اول یکی را پاک کنید.")
		return
	}
	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		name = hdr.Filename
		if i := strings.LastIndex(name, "."); i > 0 {
			name = name[:i]
		}
	}
	if r := []rune(name); len(r) > 40 {
		name = string(r[:40])
	}
	if name == "" {
		name = "صدای من"
	}
	id := "snd-" + strconv.FormatInt(time.Now().UnixMilli(), 36)
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO notify_sounds (id, name, mime, data) VALUES ($1, $2, $3, $4)`, id, name, mime, data); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id, "name": name, "mime": mime, "size": len(data)})
}

func deleteSound(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM notify_sounds WHERE id = $1`, r.PathValue("id"))
	httpx.OK(w)
}

// notifyTest sends the admin a sample notification of the chosen event, to try sound and pop-up for real.
func notifyTest(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	kind, label := jsonx.Str(body, "kind"), jsonx.Str(body, "label")
	switch kind {
	case "file", "letter", "task", "alert", "call":
	default:
		kind = "task"
	}
	if label == "" {
		label = "آزمایش"
	}
	notify.ForgetRules()
	notify.Notify(r.Context(), []string{me.ID()}, notify.Note{Kind: kind, Label: label, Title: "ناتیف آزمایشی: " + label, Body: "این یک آزمایش است.", From: "تنظیمات ناتیف", Repeat: true}, "")
	httpx.OK(w)
}

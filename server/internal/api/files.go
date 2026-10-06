package api

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Every file that somebody sends is also kept on the server, so the receiver can fetch it at any time (even when the
// sender's computer is off) and nothing is lost. The files live in one folder (a Docker volume), next to a tiny
// «owner» file that says who uploaded it. Who may read a file is decided from the transfer record: the sender, the
// people it was sent to, the people a letter was referred to, and the administrators.

const maxServerFileBytes = 4 << 30

var fileID = regexp.MustCompile(`^[A-Za-z0-9_-]{3,64}$`)

func filesDir() string {
	if d := os.Getenv("FILES_DIR"); d != "" {
		return d
	}
	return "/files"
}

// fileKind is «main» (the file or letter itself) or «att» (the attachment of a letter).
func filePaths(id, kind string) (path, owner string, ok bool) {
	if !fileID.MatchString(id) || (kind != "main" && kind != "att") {
		return "", "", false
	}
	base := filepath.Join(filesDir(), id+"."+kind)
	return base, base + ".owner", true
}

// canReadTransfer: the sender, a receiver, somebody a letter was referred to, or an administrator.
func canReadTransfer(r *http.Request, me auth.User, id string) bool {
	if me.IsAdmin() {
		return true
	}
	var sender string
	var rcpts []string
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(sender_id, ''), recipient_ids, data FROM transfers WHERE id = $1`, id).Scan(&sender, &rcpts, &raw); err != nil {
		return false
	}
	if sender == me.ID() || jsonx.Contains(rcpts, me.ID()) {
		return true
	}
	doc := jsonx.Decode(raw)
	if refs, ok := doc["referrals"].([]any); ok {
		for _, x := range refs {
			if m, ok := x.(map[string]any); ok {
				if jsonx.Str(jsonx.Sub(m, "toUser"), "id") == me.ID() || jsonx.Str(jsonx.Sub(m, "fromUser"), "id") == me.ID() {
					return true
				}
			}
		}
	}
	return false
}

// uploadFile: PUT /api/files/{id}?kind=main|att with the file as the request body.
func uploadFile(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id, kind := r.PathValue("id"), r.URL.Query().Get("kind")
	if kind == "" {
		kind = "main"
	}
	path, ownerPath, ok := filePaths(id, kind)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return
	}
	// somebody else's file can not be replaced (an administrator may)
	if b, err := os.ReadFile(ownerPath); err == nil && strings.TrimSpace(string(b)) != me.ID() && !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if err := os.MkdirAll(filesDir(), 0o750); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "پوشهٔ ذخیرهٔ فایل‌ها در سرور در دسترس نیست.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxServerFileBytes)
	tmp := path + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		internalError(w)
		return
	}
	n, err := io.Copy(f, r.Body)
	f.Close()
	if err != nil {
		os.Remove(tmp)
		httpx.Error(w, http.StatusBadRequest, "فایل کامل دریافت نشد.")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		internalError(w)
		return
	}
	_ = os.WriteFile(ownerPath, []byte(me.ID()), 0o640)
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "size": n})
}

// downloadFile: GET /api/files/{id}?kind=main|att
func downloadFile(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id, kind := r.PathValue("id"), r.URL.Query().Get("kind")
	if kind == "" {
		kind = "main"
	}
	path, ownerPath, ok := filePaths(id, kind)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return
	}
	f, err := os.Open(path)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل روی سرور نیست (ممکن است توسط مدیر کل سیستم حذف شده باشد).")
		return
	}
	defer f.Close()
	owner := ""
	if b, err := os.ReadFile(ownerPath); err == nil {
		owner = strings.TrimSpace(string(b))
	}
	if owner != me.ID() && !canReadTransfer(r, me, id) {
		httpx.Forbidden(w)
		return
	}
	st, _ := f.Stat()
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, "", st.ModTime(), f)
}

// fileInfo: HEAD /api/files/{id} tells whether the server holds the file (used before choosing where to fetch from).
func fileInfo(w http.ResponseWriter, r *http.Request) {
	id, kind := r.PathValue("id"), r.URL.Query().Get("kind")
	if kind == "" {
		kind = "main"
	}
	path, _, ok := filePaths(id, kind)
	if !ok {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if st, err := os.Stat(path); err == nil {
		w.Header().Set("Content-Length", "0")
		w.Header().Set("X-File-Size", strconv.FormatInt(st.Size(), 10))
		w.WriteHeader(http.StatusOK)
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

// deleteStoredFiles removes both files of a transfer (called when the transfer itself is deleted).
func deleteStoredFiles(id string) {
	for _, k := range []string{"main", "att"} {
		if p, o, ok := filePaths(id, k); ok {
			os.Remove(p)
			os.Remove(o)
		}
	}
}

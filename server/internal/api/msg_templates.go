package api

import (
	"net/http"
	"net/url"
	"os"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
)

// Ready-made messages for customers (text, a link and a file). The texts live in the settings document; the files are kept here.
// A file of a ready-made message gets an address that opens without signing in, because the customer who receives the
// link is not a user of the system. Only files whose id starts with «tplf_» are ever given out that way, and the id is
// a long random string that is only known to the people who send the message.

const msgFilePrefix = "tplf_"

// A proforma that was approved is sent to the customer on his messengers as a download link: its PDF is put on the server by
// whoever sends it (any CRM user) under an id that starts with «prof_» and is given out the same way, without signing in.
const proformaFilePrefix = "prof_"
const maxProformaShareBytes = 25 << 20

// publicFileID: the files that may be downloaded without signing in (ready-made message files and shared proformas).
func publicFileID(id string) bool {
	return (strings.HasPrefix(id, msgFilePrefix) || strings.HasPrefix(id, proformaFilePrefix)) && fileID.MatchString(id)
}

// proformaShareUpload: PUT /api/proforma-share/{id} — the PDF (or picture) of a proforma that is about to be sent to a customer.
func proformaShareUpload(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	if !strings.HasPrefix(id, proformaFilePrefix) || len(id) < len(proformaFilePrefix)+16 || !fileID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxProformaShareBytes)
	uploadFile(w, r)
}

// msgTplUpload: PUT /api/msgtpl/files/{id} — an administrator puts the file of a ready-made message on the server.
func msgTplUpload(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if !strings.HasPrefix(id, msgFilePrefix) || len(id) < len(msgFilePrefix)+16 {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return
	}
	uploadFile(w, r)
}

// msgTplDelete: DELETE /api/msgtpl/files/{id} — the file of a removed message goes away too.
func msgTplDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if !strings.HasPrefix(id, msgFilePrefix) || !fileID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return
	}
	deleteStoredFiles(id)
	httpx.OK(w)
}

// msgTplPublic: GET /api/pub/f/{id}/{name} — the download address that is put into the message (no sign-in).
func msgTplPublic(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !publicFileID(id) {
		http.NotFound(w, r)
		return
	}
	path, _, ok := filePaths(id, "main")
	if !ok {
		http.NotFound(w, r)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	name := r.PathValue("name")
	if n, err := url.PathUnescape(name); err == nil {
		name = n
	}
	name = strings.NewReplacer("/", "_", "\\", "_", "\"", "_", "\r", "", "\n", "").Replace(name)
	if name == "" {
		name = "file"
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(name))
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, "", st.ModTime(), f)
}

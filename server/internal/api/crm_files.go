package api

import (
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
)

// Files kept on a customer's page (contract, payment slip, photo of a product). The bytes live on the server's disk; the list of names
// is part of the customer's own record (customer.attachments), so whoever can see the customer sees the list, and only they can open the files.

const maxCustomerFileBytes = 25 << 20

var crmFileID = regexp.MustCompile(`^[A-Za-z0-9_-]{4,64}$`)

func registerCrmFiles(mux *http.ServeMux) {
	mux.HandleFunc("PUT /api/tasks/files/{cid}/{fid}", auth.Require(taskFilePut))
	mux.HandleFunc("GET /api/tasks/files/{cid}/{fid}", auth.Require(taskFileGet))
	mux.HandleFunc("DELETE /api/tasks/files/{cid}/{fid}", auth.Require(taskFileDelete))
	mux.HandleFunc("PUT /api/crm/files/{cid}/{fid}", auth.Require(crmFilePut))
	mux.HandleFunc("GET /api/crm/files/{cid}/{fid}", auth.Require(crmFileGet))
	mux.HandleFunc("DELETE /api/crm/files/{cid}/{fid}", auth.Require(crmFileDelete))
}

func crmFilePath(w http.ResponseWriter, r *http.Request, me auth.User) (string, bool) {
	if crmDenied(w, me) {
		return "", false
	}
	cid, fid := r.PathValue("cid"), r.PathValue("fid")
	if !crmFileID.MatchString(cid) || !crmFileID.MatchString(fid) {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return "", false
	}
	if !crmOwnsCustomer(r, me, cid) {
		httpx.Error(w, http.StatusForbidden, "این مشتری به شما سپرده نشده است.")
		return "", false
	}
	return filepath.Join(filesDir(), "crm", cid, fid), true
}

func crmFilePut(w http.ResponseWriter, r *http.Request) {
	path, ok := crmFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	filePutTo(w, r, path)
}

func filePutTo(w http.ResponseWriter, r *http.Request, path string) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "پوشهٔ ذخیرهٔ فایل‌ها در سرور در دسترس نیست.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxCustomerFileBytes)
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
		httpx.Error(w, http.StatusBadRequest, "فایل کامل دریافت نشد یا بزرگ‌تر از ۲۵ مگابایت است.")
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		os.Remove(tmp)
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "size": n})
}

func crmFileGet(w http.ResponseWriter, r *http.Request) {
	path, ok := crmFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	fileGetFrom(w, r, path)
}

func fileGetFrom(w http.ResponseWriter, r *http.Request, path string) {
	f, err := os.Open(path)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل روی سرور نیست.")
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	head := make([]byte, 512)
	n, _ := f.Read(head)
	w.Header().Set("Content-Type", http.DetectContentType(head[:n]))
	if name := r.URL.Query().Get("name"); name != "" {
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = f.Seek(0, io.SeekStart)
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func crmFileDelete(w http.ResponseWriter, r *http.Request) {
	path, ok := crmFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	_ = os.Remove(path)
	httpx.OK(w)
}

// ---- files on a task (a PDF, a picture, an Office file…): the bytes are here, the list is task.attachments ----

func taskFilePath(w http.ResponseWriter, r *http.Request, me auth.User) (string, bool) {
	tid, fid := r.PathValue("cid"), r.PathValue("fid")
	if !crmFileID.MatchString(tid) || !crmFileID.MatchString(fid) {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ فایل درست نیست.")
		return "", false
	}
	if !me.CanUseTasks() {
		httpx.Forbidden(w)
		return "", false
	}
	if !me.IsAdmin() {
		// who may see the task: its creator, those it is given to, and the manager of their unit; a task that is not saved yet belongs to whoever is making it
		var creator string
		var assignees []string
		err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(creator_id, ''), assignee_ids FROM tasks WHERE id = $1`, tid).Scan(&creator, &assignees)
		if err == nil {
			managed := managedStaff(r.Context(), me.ID())
			ok := creator == me.ID() || jsonx.Contains(assignees, me.ID()) || isManagerOf(managed, append([]string{creator}, assignees...)...)
			if !ok {
				httpx.Error(w, http.StatusForbidden, "این وظیفه به شما مربوط نیست.")
				return "", false
			}
		}
	}
	return filepath.Join(filesDir(), "tasks", tid, fid), true
}

func taskFilePut(w http.ResponseWriter, r *http.Request) {
	path, ok := taskFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	filePutTo(w, r, path)
}

func taskFileGet(w http.ResponseWriter, r *http.Request) {
	path, ok := taskFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	fileGetFrom(w, r, path)
}

func taskFileDelete(w http.ResponseWriter, r *http.Request) {
	path, ok := taskFilePath(w, r, auth.Current(r))
	if !ok {
		return
	}
	_ = os.Remove(path)
	httpx.OK(w)
}

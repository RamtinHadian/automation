package api

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Database backups are made by the separate "backup" container (see backup-loop.sh); the server only lists them,
// asks for a new one (a ".request" file) and hands a file to the chief admin to download.

func backupDir() string {
	if d := os.Getenv("BACKUP_DIR_IN_CONTAINER"); d != "" {
		return d
	}
	return "/backups"
}

var backupName = regexp.MustCompile(`^hoormand-\d{8}-\d{6}-(auto|manual|prerestore|uploaded)\.dump$`)

type backupItem struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	At   string `json:"at"`
	Kind string `json:"kind"`
}

func auditLine(r *http.Request, me auth.User, severity, details string) {
	entry := jsonx.M{
		"id": "aud-bk-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()),
		"userName": me.Name(), "userEmail": me.Email(), "action": "SECURITY_EVENT", "severity": severity,
		"ipAddress": strings.TrimSpace(httpx.ClientIP(r)), "details": details,
	}
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO audit_logs (id, data) VALUES ($1, $2::jsonb)`, entry["id"], jsonx.Encode(entry))
}

func listBackups(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	dir := backupDir()
	items := []backupItem{}
	entries, err := os.ReadDir(dir)
	enabled := err == nil
	for _, e := range entries {
		if !backupName.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		kind := "auto"
		if strings.HasSuffix(e.Name(), "-manual.dump") {
			kind = "manual"
		} else if strings.HasSuffix(e.Name(), "-prerestore.dump") {
			kind = "prerestore"
		} else if strings.HasSuffix(e.Name(), "-uploaded.dump") {
			kind = "uploaded"
		}
		items = append(items, backupItem{Name: e.Name(), Size: info.Size(), At: info.ModTime().UTC().Format(time.RFC3339), Kind: kind})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Name > items[j].Name })
	var status any
	if raw, err := os.ReadFile(filepath.Join(dir, ".status.json")); err == nil {
		status = jsonRaw(raw)
	}
	_, pending := os.Stat(filepath.Join(dir, ".request"))
	var nettest, restore any
	if raw, err := os.ReadFile(filepath.Join(dir, ".nettest.json")); err == nil {
		nettest = jsonRaw(raw)
	}
	if raw, err := os.ReadFile(filepath.Join(dir, ".restore.json")); err == nil {
		restore = jsonRaw(raw)
	}
	_, testPending := os.Stat(filepath.Join(dir, ".nettest-request"))
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": enabled, "items": items, "status": status, "pending": pending == nil,
		"nettest": nettest, "nettestPending": testPending == nil, "restore": restore})
}

func requestBackup(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	req := filepath.Join(backupDir(), ".request")
	if _, err := os.Stat(req); err == nil {
		httpx.Error(w, http.StatusConflict, "یک درخواست پشتیبان‌گیری در حال انجام است.")
		return
	}
	if err := os.WriteFile(req, []byte(time.Now().Format(time.RFC3339)), 0o644); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "سرویس پشتیبان‌گیری در دسترس نیست.")
		return
	}
	auditLine(r, me, "INFO", "درخواست تهیهٔ نسخهٔ پشتیبان از کل پایگاه داده.")
	httpx.OK(w)
}

func downloadBackup(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	name := r.PathValue("name")
	if !backupName.MatchString(name) {
		httpx.Error(w, http.StatusNotFound, "not found")
		return
	}
	auditLine(r, me, "WARNING", "دانلود فایل پشتیبان کل پایگاه داده: "+name)
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, filepath.Join(backupDir(), name))
}

// uploadBackup takes a backup file from the admin's own computer (raw request body) and keeps it with the others, ready to restore.
// Only the chief admin may do this, and restoring runs the file's contents as SQL, so only files made by this system should be used.
func uploadBackup(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	dir := backupDir()
	if _, err := os.Stat(dir); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "سرویس پشتیبان‌گیری در دسترس نیست.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4<<30)
	name := "hoormand-" + time.Now().Format("20060102-150405") + "-uploaded.dump"
	tmp := filepath.Join(dir, ".upload-"+name)
	f, err := os.Create(tmp)
	if err != nil {
		internalError(w)
		return
	}
	n, err := io.Copy(f, r.Body)
	f.Close()
	if err != nil || n < 16 {
		os.Remove(tmp)
		httpx.Error(w, http.StatusBadRequest, "فایل کامل دریافت نشد.")
		return
	}
	head := make([]byte, 5)
	if rf, err := os.Open(tmp); err == nil {
		_, _ = io.ReadFull(rf, head)
		rf.Close()
	}
	if string(head) != "PGDMP" {
		os.Remove(tmp)
		httpx.Error(w, http.StatusBadRequest, "این فایل، پشتیبانی از این سامانه نیست (باید فایل .dump باشد).")
		return
	}
	if err := os.Rename(tmp, filepath.Join(dir, name)); err != nil {
		os.Remove(tmp)
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "فایل پشتیبان از روی کامپیوتر بارگذاری شد ("+strconv.FormatInt(n/1024, 10)+" کیلوبایت).")
	httpx.JSON(w, http.StatusOK, map[string]any{"name": name, "at": time.Now().UTC().Format(time.RFC3339)})
}

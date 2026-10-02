package api

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The schedule and the network folder are kept in their own settings row ("backup"): the backup container reads the row itself,
// and the password never goes back to the browser.

var (
	reHost  = regexp.MustCompile(`^[A-Za-z0-9._-]{1,100}$`)
	reShare = regexp.MustCompile(`^[^"';\\/\r\n]{1,80}$`)
	reDir   = regexp.MustCompile(`^[^"';\\\r\n]{0,150}$`)
	reUser  = regexp.MustCompile(`^[^\r\n]{0,100}$`)
	reTime  = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
)

// anyInt reads a number the JSON decoder may hand over as json.Number or float64.
func anyInt(v any) (int, bool) {
	switch n := v.(type) {
	case json.Number:
		f, err := n.Float64()
		return int(f), err == nil
	case float64:
		return int(n), true
	}
	return 0, false
}

func loadBackupSettings(r *http.Request) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'backup'`).Scan(&raw)
	return jsonx.Decode(raw)
}

func maskedBackupSettings(r *http.Request) jsonx.M {
	s := loadBackupSettings(r)
	out := jsonx.Copy(s)
	delete(out, "netPassword")
	out["hasPassword"] = jsonx.Str(s, "netPassword") != ""
	return out
}

func backupGetSettings(w http.ResponseWriter, r *http.Request) {
	if auth.Current(r).Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	httpx.JSON(w, http.StatusOK, maskedBackupSettings(r))
}

func backupPutSettings(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	old := loadBackupSettings(r)
	host := strings.TrimSpace(jsonx.Str(body, "netHost"))
	share := strings.TrimSpace(jsonx.Str(body, "netShare"))
	folder := strings.Trim(strings.TrimSpace(jsonx.Str(body, "netFolder")), "/")
	user := strings.TrimSpace(jsonx.Str(body, "netUser"))
	domain := strings.TrimSpace(jsonx.Str(body, "netDomain"))
	netOn := jsonx.Bool(body, "netEnabled")
	doc := jsonx.M{
		"scheduleEnabled": jsonx.Bool(body, "scheduleEnabled"),
		"netEnabled":      netOn,
		"netHost":         host,
		"netShare":        share,
		"netFolder":       folder,
		"netUser":         user,
		"netDomain":       domain,
	}
	if DemoMode {
		netOn = false // the demo never connects anywhere; the form is only for show
		doc["netEnabled"] = false
		body["netPassword"] = ""
	}
	pass := jsonx.Str(body, "netPassword")
	if pass == "" {
		pass = jsonx.Str(old, "netPassword") // empty = keep the saved one
	}
	if strings.ContainsAny(pass, "\r\n") {
		bad("رمز نباید چندخطی باشد.")
		return
	}
	doc["netPassword"] = pass

	mode := jsonx.Str(body, "scheduleMode")
	if mode != "daily" && mode != "interval" && mode != "window" {
		mode = "daily"
	}
	doc["scheduleMode"] = mode
	from, to := jsonx.Str(body, "scheduleFrom"), jsonx.Str(body, "scheduleTo")
	if from == "" {
		from = "08:00"
	}
	if to == "" {
		to = "18:00"
	}
	if !reTime.MatchString(from) || !reTime.MatchString(to) || from > to {
		bad("بازهٔ ساعتی نامعتبر است: «تا ساعت» باید بعد از «از ساعت» باشد.")
		return
	}
	doc["scheduleFrom"], doc["scheduleTo"] = from, to
	every := 60
	if n, ok := anyInt(body["scheduleEveryMinutes"]); ok {
		every = n
	}
	if every < 5 || every > 720 {
		bad("فاصلهٔ پشتیبان‌گیری باید بین ۵ دقیقه تا ۱۲ ساعت باشد.")
		return
	}
	doc["scheduleEveryMinutes"] = every
	t := jsonx.Str(body, "scheduleTime")
	if t == "" {
		t = "02:00"
	}
	if !reTime.MatchString(t) {
		bad("ساعت پشتیبان‌گیری نامعتبر است (مثلاً ۰۲:۳۰).")
		return
	}
	doc["scheduleTime"] = t
	days := []any{}
	seen := map[int]bool{}
	for _, v := range jsonx.Arr(body, "scheduleDays") {
		if n, ok := anyInt(v); ok && n >= 0 && n <= 6 && !seen[n] {
			seen[n] = true
			days = append(days, n)
		}
	}
	if len(days) == 0 {
		days = []any{0, 1, 2, 3, 4, 5, 6}
	}
	doc["scheduleDays"] = days
	hrs := 6
	if n, ok := anyInt(body["scheduleEveryHours"]); ok {
		hrs = n
	}
	if hrs < 1 || hrs > 168 {
		bad("فاصلهٔ پشتیبان‌گیری باید بین ۱ تا ۱۶۸ ساعت باشد.")
		return
	}
	doc["scheduleEveryHours"] = hrs

	if netOn {
		switch {
		case !reHost.MatchString(host):
			bad("آدرس سرور نامعتبر است (مثلاً 192.168.1.20 یا nas.office).")
			return
		case !reShare.MatchString(share):
			bad("نام پوشهٔ اشتراکی (Share) نامعتبر است.")
			return
		case !reDir.MatchString(folder) || strings.Contains(folder, ".."):
			bad("نام زیرپوشه نامعتبر است.")
			return
		case !reUser.MatchString(user) || !reUser.MatchString(domain):
			bad("نام کاربری نامعتبر است.")
			return
		}
	}
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO settings (key, data) VALUES ('backup', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "تنظیمات پشتیبان‌گیری (زمان‌بندی / پوشهٔ شبکه) تغییر کرد.")
	httpx.JSON(w, http.StatusOK, maskedBackupSettings(r))
}

func backupNetTest(w http.ResponseWriter, r *http.Request) {
	if auth.Current(r).Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	if DemoMode {
		demoNetTest()
		httpx.OK(w)
		return
	}
	dir := backupDir()
	_ = os.Remove(filepath.Join(dir, ".nettest.json"))
	if err := os.WriteFile(filepath.Join(dir, ".nettest-request"), []byte("1"), 0o644); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "سرویس پشتیبان‌گیری در دسترس نیست.")
		return
	}
	httpx.OK(w)
}

// ---------- restore ----------

func restoreInProgress() bool {
	dir := backupDir()
	for _, f := range []string{".restore-request", ".restoring"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return true
		}
	}
	return false
}

func backupRestore(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if me.Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	name := jsonx.Str(body, "file")
	if !jsonx.Bool(body, "confirm") {
		httpx.Error(w, http.StatusBadRequest, "تأیید بازگردانی ارسال نشده است.")
		return
	}
	if !backupName.MatchString(name) {
		httpx.Error(w, http.StatusBadRequest, "نام فایل نامعتبر است.")
		return
	}
	dir := backupDir()
	if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل پشتیبان پیدا نشد.")
		return
	}
	if restoreInProgress() {
		httpx.Error(w, http.StatusConflict, "یک بازگردانی در حال انجام است.")
		return
	}
	_ = os.Remove(filepath.Join(dir, ".restore.json"))
	lines := strings.Join([]string{name, me.Name(), strings.TrimSpace(httpx.ClientIP(r)), jalali.Timestamp(time.Now())}, "\n") + "\n"
	if err := os.WriteFile(filepath.Join(dir, ".restore-request"), []byte(lines), 0o644); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "سرویس پشتیبان‌گیری در دسترس نیست.")
		return
	}
	httpx.OK(w) // the backup container writes the permanent audit line itself after the restore (the old log table is replaced)
}

// restoreStatus is public on purpose: while the database is being replaced nobody can be authenticated, and it only says "busy / done".
func restoreStatus(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{"restoring": restoreInProgress()}
	if raw, err := os.ReadFile(filepath.Join(backupDir(), ".restore.json")); err == nil {
		var m map[string]any
		if json.Unmarshal(raw, &m) == nil {
			out["result"], out["at"], out["text"] = m["result"], m["at"], m["text"]
		}
	}
	httpx.JSON(w, http.StatusOK, out)
}

// restoreGuard answers 503 on the API while a restore runs, and restarts the server afterwards so every cache is rebuilt
// from the restored data (Docker brings it straight back).
func restoreGuard(next http.Handler) http.Handler {
	var once sync.Once
	once.Do(func() {
		go func() {
			was := false
			for range time.Tick(2 * time.Second) {
				if restoreInProgress() {
					was = true
					continue
				}
				if was {
					was = false
					if raw, err := os.ReadFile(filepath.Join(backupDir(), ".restore.json")); err == nil && strings.Contains(string(raw), `"result":"ok"`) {
						time.Sleep(1500 * time.Millisecond)
						os.Exit(0)
					}
				}
			}
		}()
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/backups/restore-status" && restoreInProgress() {
			httpx.Error(w, http.StatusServiceUnavailable, "سامانه در حال بازگردانی پشتیبان است؛ چند لحظه صبر کنید.")
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- browse the network: list the shares of a server and the folders inside a share ----------

var rePath = regexp.MustCompile(`^[^"';\\\r\n]{0,250}$`)

func backupBrowse(w http.ResponseWriter, r *http.Request) {
	if auth.Current(r).Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	host := strings.TrimSpace(jsonx.Str(body, "host"))
	path := strings.Trim(strings.TrimSpace(jsonx.Str(body, "path")), "/")
	user := strings.TrimSpace(jsonx.Str(body, "user"))
	domain := strings.TrimSpace(jsonx.Str(body, "domain"))
	pass := jsonx.Str(body, "password")
	if pass == "" {
		pass = jsonx.Str(loadBackupSettings(r), "netPassword") // the saved one
	}
	if !reHost.MatchString(host) || !rePath.MatchString(path) || strings.Contains(path, "..") || !reUser.MatchString(user) || !reUser.MatchString(domain) || strings.ContainsAny(pass, "\r\n") {
		httpx.Error(w, http.StatusBadRequest, "مشخصات واردشده معتبر نیست.")
		return
	}
	if DemoMode {
		demoBrowse(w, strconv.FormatInt(time.Now().UnixNano(), 36), path)
		return
	}
	dir := backupDir()
	if _, err := os.Stat(filepath.Join(dir, ".browse-request")); err == nil {
		httpx.Error(w, http.StatusConflict, "یک درخواست دیگر در حال انجام است؛ چند ثانیه صبر کنید.")
		return
	}
	id := strconv.FormatInt(time.Now().UnixNano(), 36)
	_ = os.Remove(filepath.Join(dir, ".browse.json"))
	lines := strings.Join([]string{id, host, path, user, domain, pass}, "\n") + "\n"
	if err := os.WriteFile(filepath.Join(dir, ".browse-request"), []byte(lines), 0o600); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "سرویس پشتیبان‌گیری در دسترس نیست.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

func backupBrowseResult(w http.ResponseWriter, r *http.Request) {
	if auth.Current(r).Role() != "SUPER_ADMIN" {
		httpx.Forbidden(w)
		return
	}
	if DemoMode {
		if m, ok := demoBrowseResult(); ok {
			httpx.JSON(w, http.StatusOK, m)
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"pending": true})
		return
	}
	raw, err := os.ReadFile(filepath.Join(backupDir(), ".browse.json"))
	if err != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"pending": true})
		return
	}
	httpx.JSON(w, http.StatusOK, jsonRaw(raw))
}

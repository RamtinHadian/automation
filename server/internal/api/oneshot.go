package api

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
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

// One-time download links («لینک دانلود یک‌بارمصرف») of a signed letter's PDF.
//
// Somebody who may see the signed letter makes the PDF in his browser and uploads it here; he gets back a link of the form /d/<secret>. The link works WITHOUT logging in, exactly once,
// for whoever opens it first, and never again for anybody (the file is wiped from the database in the same statement that serves it). Safety measures:
//   - the secret is 256 random bits; only its SHA-256 is stored, so a copy of the database holds no usable link;
//   - the link expires after 7 days even if nobody used it;
//   - opening the link shows a small page that starts the download by itself with a POST: link previews of messengers (Telegram, WhatsApp, Bale…) only GET the page and cannot burn the link;
//   - the download is atomic (one UPDATE … RETURNING): two people opening it at the same moment cannot both get the file;
//   - answers carry no-store, no-referrer and noindex headers; the number of tries from one address is limited; every make / use / revoke is written to the audit log.

const (
	oneshotTTL      = 7 * 24 * time.Hour
	oneshotMaxBytes = 12 << 20
	oneshotPerUser  = 30 // links a person may have alive at the same time
)

func oneshotHash(secret string) string {
	h := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(h[:])
}

// a small limiter of tries per address (the secret is long enough already; this only stops hammering)
var (
	oneshotMu    sync.Mutex
	oneshotTries = map[string][]time.Time{}
)

func oneshotAllow(ip string) bool {
	oneshotMu.Lock()
	defer oneshotMu.Unlock()
	now := time.Now()
	keep := oneshotTries[ip][:0]
	for _, t := range oneshotTries[ip] {
		if now.Sub(t) < time.Minute {
			keep = append(keep, t)
		}
	}
	if len(keep) >= 40 {
		oneshotTries[ip] = keep
		return false
	}
	oneshotTries[ip] = append(keep, now)
	if len(oneshotTries) > 5000 { // forget old addresses
		for k, v := range oneshotTries {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > time.Minute {
				delete(oneshotTries, k)
			}
		}
	}
	return true
}

func auditPublic(r *http.Request, severity, details string) {
	entry := jsonx.M{"id": "aud-os-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()), "userName": "لینک دانلود یک‌بارمصرف", "userEmail": "",
		"action": "SECURITY_EVENT", "severity": severity, "details": details}
	for k, v := range ipFields(r) {
		entry[k] = v
	}
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO audit_logs (id, data) VALUES ($1, $2::jsonb)`, entry["id"], jsonx.Encode(entry))
}

// POST /api/oneshot?transferId=…&name=…   (body: the PDF)
func oneshotCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	tid := strings.TrimSpace(r.URL.Query().Get("transferId"))
	if tid == "" {
		httpx.Error(w, http.StatusBadRequest, "نامه مشخص نیست.")
		return
	}
	var sender string
	var rcpts []string
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(sender_id, ''), recipient_ids, data FROM transfers WHERE id = $1`, tid).Scan(&sender, &rcpts, &raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "این نامه پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	if !jsonx.Bool(doc, "isOfficialLetter") || jsonx.Str(doc, "signatureStatus") != "SIGNED" {
		httpx.Error(w, http.StatusBadRequest, "لینک دانلود فقط برای نامهٔ رسمی امضاشده ساخته می‌شود.")
		return
	}
	allowed := me.IsAdmin() || jsonx.Bool(me.M, "canSignOfficialLetters") || sender == me.ID()
	for _, id := range rcpts {
		if id == me.ID() {
			allowed = true
		}
	}
	if !allowed {
		httpx.Forbidden(w)
		return
	}
	var alive int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM oneshot_links WHERE created_by = $1 AND used_at IS NULL AND NOT revoked AND expires_at > now()`, me.ID()).Scan(&alive)
	if alive >= oneshotPerUser {
		httpx.Error(w, http.StatusTooManyRequests, "تعداد لینک‌های بدون استفادهٔ شما به سقف رسیده؛ چند لینک قبلی را باطل کنید یا صبر کنید تا استفاده شوند.")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, oneshotMaxBytes))
	if err != nil || len(data) < 200 || !bytes.HasPrefix(data, []byte("%PDF-")) {
		httpx.Error(w, http.StatusBadRequest, "فایل PDF نامه درست نیست یا از ۱۲ مگابایت بزرگ‌تر است.")
		return
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		internalError(w)
		return
	}
	secret := base64.RawURLEncoding.EncodeToString(buf)
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		name = "نامه.pdf"
	}
	name = clip(strings.NewReplacer("/", "-", "\\", "-", "\"", "", "\r", "", "\n", "", ":", "-").Replace(name), 120)
	if !strings.HasSuffix(strings.ToLower(name), ".pdf") {
		name += ".pdf"
	}
	maxUses, _ := strconv.Atoi(r.URL.Query().Get("uses"))
	if maxUses < 1 {
		maxUses = 1
	}
	if maxUses > 20 {
		maxUses = 20
	}
	id := "os-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	exp := time.Now().Add(oneshotTTL)
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO oneshot_links (id, token_hash, transfer_id, file_name, size, created_by, created_by_name, expires_at, data, max_uses) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		id, oneshotHash(secret), tid, name, len(data), me.ID(), me.Name(), exp, data, maxUses); err != nil {
		internalError(w)
		return
	}
	// rows are kept for a month after they end (so the list can say what happened), then removed; the file of an expired link is wiped at once
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM oneshot_links WHERE expires_at < now() - interval '30 days'`)
	_, _ = store.Pool.Exec(r.Context(), `UPDATE oneshot_links SET data = NULL WHERE expires_at < now() AND data IS NOT NULL`)
	scheme := "https"
	if r.TLS == nil && !strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "http"
	}
	auditLine(r, me, "WARNING", "لینک دانلود یک‌بارمصرف برای «"+clip(name, 80)+"» ساخته شد.")
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "url": scheme + "://" + r.Host + "/d/" + secret, "expiresAt": exp.UTC().Format(time.RFC3339), "name": name, "maxUses": maxUses})
}

// GET /api/oneshot?transferId=…  the links made for one letter (never the secret)
func oneshotList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	tid := strings.TrimSpace(r.URL.Query().Get("transferId"))
	q := `SELECT id, created_by_name, created_at, expires_at, used_at, revoked, max_uses, uses FROM oneshot_links WHERE transfer_id = $1`
	args := []any{tid}
	if !me.IsAdmin() && !jsonx.Bool(me.M, "canSignOfficialLetters") {
		q += ` AND created_by = $2`
		args = append(args, me.ID())
	}
	rows, err := store.Pool.Query(r.Context(), q+` ORDER BY created_at DESC LIMIT 50`, args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var id, by string
		var created, expires time.Time
		var used *time.Time
		var revoked bool
		var maxUses, uses int
		if rows.Scan(&id, &by, &created, &expires, &used, &revoked, &maxUses, &uses) != nil {
			continue
		}
		status := "ACTIVE"
		switch {
		case used != nil:
			status = "USED"
		case revoked:
			status = "REVOKED"
		case time.Now().After(expires):
			status = "EXPIRED"
		}
		item := jsonx.M{"id": id, "by": by, "createdAt": created.UTC().Format(time.RFC3339), "expiresAt": expires.UTC().Format(time.RFC3339), "status": status, "maxUses": maxUses, "uses": uses}
		if used != nil {
			item["usedAt"] = used.UTC().Format(time.RFC3339)
		}
		out = append(out, item)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"links": out})
}

// DELETE /api/oneshot/{id}: the link stops working at once and the file is wiped
func oneshotRevoke(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	tag, err := store.Pool.Exec(r.Context(), `UPDATE oneshot_links SET revoked = true, data = NULL WHERE id = $1 AND used_at IS NULL AND (created_by = $2 OR $3)`, r.PathValue("id"), me.ID(), me.IsAdmin())
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() > 0 {
		auditLine(r, me, "WARNING", "یک لینک دانلود یک‌بارمصرف باطل شد.")
	}
	httpx.OK(w)
}

func oneshotNoStore(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Cache-Control", "no-store, no-cache, must-revalidate, private")
	h.Set("Pragma", "no-cache")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Robots-Tag", "noindex, nofollow, noarchive")
}

const oneshotCSS = `body{font-family:Tahoma,Arial,sans-serif;background:#FAF5F1;color:#3A241F;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}` +
	`.c{background:#fff;border:1px solid #EBDBCE;border-radius:24px;max-width:420px;width:100%;padding:28px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.08)}` +
	`h1{font-size:17px;margin:0 0 10px}p{font-size:13px;line-height:2;color:#6b5048;margin:6px 0;word-break:break-word}` +
	`button{margin-top:14px;background:#6E1B1B;color:#fff;border:0;border-radius:14px;padding:12px 22px;font-size:14px;font-weight:700;cursor:pointer}` +
	`.w{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:8px 12px;font-size:12px;color:#9a3412}`

func oneshotPage(w http.ResponseWriter, status int, title, body, script, nonce string) {
	oneshotNoStore(w)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	csp := "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
	if script != "" {
		csp += "; script-src 'nonce-" + nonce + "'"
	}
	w.Header().Set("Content-Security-Policy", csp)
	w.WriteHeader(status)
	tag := ""
	if script != "" {
		tag = `<script nonce="` + nonce + `">` + script + `</script>`
	}
	fmt.Fprint(w, `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>`+html.EscapeString(title)+`</title><style>`+oneshotCSS+`</style></head><body><div class="c">`+body+`</div>`+tag+`</body></html>`)
}

func oneshotNonce() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

const oneshotDead = `<h1>این لینک دیگر کار نمی‌کند</h1><p>لینک دانلود فقط یک بار قابل استفاده است؛ یا قبلاً استفاده شده، یا مدتش تمام شده یا باطل شده است. اگر فایل را لازم دارید، از فرستنده یک لینک تازه بخواهید.</p>`

// GET /d/{secret}: the page that starts the download (it does NOT use the link up: a link preview only reads this page)
func oneshotLanding(w http.ResponseWriter, r *http.Request) {
	if !oneshotAllow(httpx.ClientIP(r)) {
		oneshotPage(w, http.StatusTooManyRequests, "تلاش زیاد", `<h1>تلاش بیش از حد</h1><p>چند دقیقه دیگر دوباره امتحان کنید.</p>`, "", "")
		return
	}
	secret := r.PathValue("secret")
	var name string
	err := store.Pool.QueryRow(r.Context(), `SELECT file_name FROM oneshot_links WHERE token_hash = $1 AND used_at IS NULL AND NOT revoked AND expires_at > now() AND data IS NOT NULL`, oneshotHash(secret)).Scan(&name)
	if err != nil {
		oneshotPage(w, http.StatusNotFound, "لینک معتبر نیست", oneshotDead, "", "")
		return
	}
	nonce := oneshotNonce()
	body := `<h1>دانلود نامهٔ رسمی</h1><p>` + html.EscapeString(name) + `</p><div class="w">این لینک فقط به تعداد دفعات تعیین‌شده کار می‌کند و بعد از آخرین دانلود برای هیچ‌کس دیگر باز نمی‌شود.</div>` +
		`<form id="f" method="post" action="/d/` + url.PathEscape(secret) + `/file"><button type="submit">دانلود فایل PDF</button></form><p id="m" style="font-size:12px">دانلود خودکار شروع می‌شود…</p>`
	// the download starts by itself in a browser; a link preview does not run scripts, so it cannot burn the link
	oneshotPage(w, http.StatusOK, "دانلود نامه", body, `setTimeout(function(){document.getElementById('f').submit();document.getElementById('m').textContent='اگر دانلود شروع نشد، دکمهٔ بالا را بزنید.';},600);`, nonce)
}

// POST /d/{secret}/file: the one and only download
func oneshotFile(w http.ResponseWriter, r *http.Request) {
	if !oneshotAllow(httpx.ClientIP(r)) {
		oneshotPage(w, http.StatusTooManyRequests, "تلاش زیاد", `<h1>تلاش بیش از حد</h1><p>چند دقیقه دیگر دوباره امتحان کنید.</p>`, "", "")
		return
	}
	var data []byte
	var name string
	// atomic: the row is taken and its file wiped in one statement, so two people at the same moment cannot both get it
	err := store.Pool.QueryRow(r.Context(), `
		WITH old AS (SELECT id, data, file_name FROM oneshot_links WHERE token_hash = $1 AND used_at IS NULL AND NOT revoked AND expires_at > now() AND data IS NOT NULL FOR UPDATE)
		UPDATE oneshot_links l SET uses = l.uses + 1, used_ip = $2,
		  used_at = CASE WHEN l.uses + 1 >= l.max_uses THEN now() ELSE NULL END,
		  data = CASE WHEN l.uses + 1 >= l.max_uses THEN NULL ELSE l.data END FROM old WHERE l.id = old.id RETURNING old.data, old.file_name`,
		oneshotHash(r.PathValue("secret")), clip(httpx.ClientIP(r), 60)).Scan(&data, &name)
	if err != nil || len(data) == 0 {
		oneshotPage(w, http.StatusGone, "لینک معتبر نیست", oneshotDead, "", "")
		return
	}
	auditPublic(r, "WARNING", "فایل «"+clip(name, 80)+"» از لینک دانلود یک‌بارمصرف دریافت شد (لینک از این لحظه بسته شد).")
	oneshotNoStore(w)
	h := w.Header()
	h.Set("Content-Type", "application/pdf")
	h.Set("Content-Disposition", "attachment; filename=\"letter.pdf\"; filename*=UTF-8''"+url.PathEscape(name))
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = w.Write(data)
}

func registerOneshot(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/oneshot", auth.Require(oneshotCreate))
	mux.HandleFunc("GET /api/oneshot", auth.Require(oneshotList))
	mux.HandleFunc("DELETE /api/oneshot/{id}", auth.Require(oneshotRevoke))
	// public, no login: only the secret opens it
	mux.HandleFunc("GET /d/{secret}", oneshotLanding)
	mux.HandleFunc("POST /d/{secret}/file", oneshotFile)
}

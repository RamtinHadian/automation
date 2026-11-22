package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Technical (support) access for the company that installed the program (the vendor).
//
//   - Only the top administrator of this installation can even try, and only with THREE things together: the session of the console, the
//     administrator's own password typed again, and the 6-digit code of the vendor's Google Authenticator (a secret made once, on the server,
//     by `/server support-enroll`, shown only there and kept encrypted; it is never shown in a web page).
//   - What it opens is a diagnostics console: a fixed list of read-only checks, not a shell. There is no way to run any other program.
//   - It lasts 15 minutes, one session at a time, from the address that opened it. Every try, every command and every end is written to a log the
//     administrators of the installation can read, and the customer's top administrator can switch the access off.

const (
	supportSessionTTL = 15 * time.Minute
	supportIdleTTL    = 5 * time.Minute
	supportFailLimit  = 5
)

type supportSession struct {
	userID  string
	ip      string
	started time.Time
	last    time.Time
}

var (
	supportMu       sync.Mutex
	supportSessions = map[string]*supportSession{} // sha256(token) -> session
)

func tokenHash(t string) string {
	h := sha256.Sum256([]byte("support|" + t))
	return hex.EncodeToString(h[:])
}

func supportLog(ctx context.Context, userID, ip, event, detail string) {
	if len(detail) > 400 {
		detail = detail[:400]
	}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO support_access_log (user_id, ip, event, detail) VALUES ($1, $2, $3, $4)`, userID, ip, event, detail)
}

// SupportEnrollCLI is `/server support-enroll [--rotate]`: makes the vendor's secret and prints it ONCE, on this terminal. Whoever has a shell on the
// server (the installer) is the only one who sees it. Running it again does nothing unless --rotate is given.
func SupportEnrollCLI(ctx context.Context, rotate bool) error {
	var exists bool
	_ = store.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM support_access)`).Scan(&exists)
	if exists && !rotate {
		fmt.Println("The support access is already set up on this server (nothing changed). Use --rotate to make a new secret; the old one stops working.")
		return nil
	}
	secret := newSecret()
	sealed, err := seal(secret)
	if err != nil {
		return err
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO support_access (id, secret, enabled, last_step, enrolled_at) VALUES (1, $1, true, 0, now())
		ON CONFLICT (id) DO UPDATE SET secret = $1, last_step = 0, enrolled_at = now()`, sealed); err != nil {
		return err
	}
	detail := "secret made"
	if exists {
		detail = "secret replaced"
	}
	supportLog(ctx, "", "console", "enrolled", detail)
	host, _ := os.Hostname()
	label := url.PathEscape("Hoormand " + host)
	fmt.Println()
	fmt.Println("=== Hoormand support access: add this to YOUR Google Authenticator (shown only once) ===")
	fmt.Println("Secret:  ", secret)
	fmt.Printf("Link:     otpauth://totp/%s?secret=%s&issuer=Hoormand%%20Support&algorithm=SHA1&digits=6&period=30\n", label, secret)
	fmt.Println("Keep it: it is not stored anywhere readable on this server and cannot be shown again.")
	return nil
}

func supportRow(ctx context.Context) (enrolled, enabled bool) {
	if store.Pool.QueryRow(ctx, `SELECT enabled FROM support_access WHERE id = 1`).Scan(&enabled) != nil {
		return false, false
	}
	return true, enabled
}

// the session sent with a request: valid only for the same person and address, within the time limits
func supportCheckToken(r *http.Request, userID, token string) bool {
	if token == "" {
		return false
	}
	supportMu.Lock()
	defer supportMu.Unlock()
	now := time.Now()
	for k, s := range supportSessions { // forget the old ones
		if now.Sub(s.started) > supportSessionTTL || now.Sub(s.last) > supportIdleTTL {
			delete(supportSessions, k)
		}
	}
	s := supportSessions[tokenHash(token)]
	if s == nil || s.userID != userID || s.ip != httpx.ClientIP(r) {
		return false
	}
	s.last = now
	return true
}

// SupportStatus: GET /api/support-access (top administrator): whether it is set up, switched on, and the latest entries of its log.
func SupportStatus(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	enrolled, enabled := supportRow(r.Context())
	log := []map[string]any{}
	if rows, err := store.Pool.Query(r.Context(), `SELECT at, user_id, ip, event, detail FROM support_access_log ORDER BY id DESC LIMIT 40`); err == nil {
		for rows.Next() {
			var at time.Time
			var uid, ip, ev, det string
			if rows.Scan(&at, &uid, &ip, &ev, &det) == nil {
				log = append(log, map[string]any{"at": at.Format(time.RFC3339), "userId": uid, "ip": ip, "event": ev, "detail": det})
			}
		}
		rows.Close()
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"enrolled": enrolled, "enabled": enabled, "log": log, "fullName": jsonx.Str(me.M, "fullName"), "commands": supportHelpList()})
}

func passwordOK(ctx context.Context, userID, pw string) bool {
	var hash string
	if store.Pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash) != nil {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(pw))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(pw)) == nil
}

// SupportUnlock: POST /api/support-access/unlock {password, code}
func SupportUnlock(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	ip := httpx.ClientIP(r)
	if blockedKey("support-ip:"+ip, supportFailLimit) || blockedKey("support-acct:"+me.ID(), supportFailLimit) {
		supportLog(ctx, me.ID(), ip, "blocked", "too many failures")
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	fail := func(why string) {
		noteFailureKey("support-ip:" + ip)
		noteFailureKey("support-acct:" + me.ID())
		supportLog(ctx, me.ID(), ip, "unlock-failed", why)
		httpx.Error(w, http.StatusForbidden, "اطلاعات درست نیست.") // the same words for every reason
	}
	enrolled, enabled := supportRow(ctx)
	if !enrolled || !enabled {
		httpx.Error(w, http.StatusForbidden, "دسترسی فنی روی این سرور فعال نیست.")
		return
	}
	if !passwordOK(ctx, me.ID(), jsonx.Str(body, "password")) {
		fail("password")
		return
	}
	var sealed string
	var last int64
	if store.Pool.QueryRow(ctx, `SELECT secret, last_step FROM support_access WHERE id = 1`).Scan(&sealed, &last) != nil {
		fail("no secret")
		return
	}
	plain, err := unseal(sealed)
	if err != nil {
		fail("secret unreadable")
		return
	}
	step, good := checkTOTP(plain, latinDigits(strings.TrimSpace(jsonx.Str(body, "code"))), last)
	if !good {
		fail("code")
		return
	}
	// the code is spent only if nobody else spent it in the meantime
	if tag, err := store.Pool.Exec(ctx, `UPDATE support_access SET last_step = $1 WHERE id = 1 AND last_step < $1`, step); err != nil || tag.RowsAffected() != 1 {
		fail("code reused")
		return
	}
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	token := hex.EncodeToString(buf)
	supportMu.Lock()
	supportSessions = map[string]*supportSession{tokenHash(token): {userID: me.ID(), ip: ip, started: time.Now(), last: time.Now()}} // one session at a time
	supportMu.Unlock()
	clearFailureKey("support-ip:" + ip)
	clearFailureKey("support-acct:" + me.ID())
	supportLog(ctx, me.ID(), ip, "unlocked", "")
	httpx.JSON(w, http.StatusOK, map[string]any{"token": token, "expiresInSeconds": int(supportSessionTTL.Seconds())})
}

// SupportLock: POST /api/support-access/lock {token}
func SupportLock(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	supportMu.Lock()
	delete(supportSessions, tokenHash(jsonx.Str(body, "token")))
	supportMu.Unlock()
	supportLog(r.Context(), me.ID(), httpx.ClientIP(r), "locked", "")
	httpx.OK(w)
}

// SupportRun: POST /api/support-access/run {token, command}: one command of the fixed list.
func SupportRun(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	if _, enabled := supportRow(ctx); !enabled || !supportCheckToken(r, me.ID(), jsonx.Str(body, "token")) {
		httpx.Error(w, http.StatusForbidden, "نشست پایان یافته است؛ دوباره وارد شوید.")
		return
	}
	cmd := strings.TrimSpace(jsonx.Str(body, "command"))
	if len(cmd) > 200 {
		cmd = cmd[:200]
	}
	supportLog(ctx, me.ID(), httpx.ClientIP(r), "command", cmd)
	httpx.JSON(w, http.StatusOK, map[string]any{"output": supportExec(ctx, cmd)})
}

// SupportSetEnabled: PUT /api/support-access/enabled {enabled, password} - the installation's top administrator can switch the access off (and on again).
func SupportSetEnabled(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	ip := httpx.ClientIP(r)
	if blockedKey("support-ip:"+ip, supportFailLimit) {
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}
	if enrolled, _ := supportRow(ctx); !enrolled {
		httpx.Error(w, http.StatusBadRequest, "دسترسی فنی روی این سرور تنظیم نشده است.")
		return
	}
	if !passwordOK(ctx, me.ID(), jsonx.Str(body, "password")) {
		noteFailureKey("support-ip:" + ip)
		httpx.Error(w, http.StatusForbidden, "کلمه عبور نادرست است.")
		return
	}
	on, _ := body["enabled"].(bool)
	_, _ = store.Pool.Exec(ctx, `UPDATE support_access SET enabled = $1 WHERE id = 1`, on)
	event := "switched-off"
	if on {
		event = "switched-on"
	} else {
		supportMu.Lock()
		supportSessions = map[string]*supportSession{}
		supportMu.Unlock()
	}
	supportLog(ctx, me.ID(), ip, event, "by the administrator of this installation")
	httpx.OK(w)
}

package auth

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Two-step sign-in (optional, for anybody; recommended for administrators): after the password the person types the 6-digit code of an
// authenticator app (Google Authenticator, Microsoft Authenticator, Aegis…; standard TOTP, 30 s, SHA-1). Ten recovery codes are given once
// for a lost phone; an administrator can also switch it off for a person who lost both.

// TwoFactorRequired is the text of the answer that asks the sign-in page to show the code box.
const TwoFactorRequired = "کد ورود دو مرحله‌ای را وارد کنید."

func sealKey() []byte {
	h := sha256.Sum256(append([]byte("2fa-secret-v1|"), secret...))
	return h[:]
}

// the authenticator secret is kept encrypted (AES-GCM, key derived from the server's own secret), so a copy of the database alone cannot be used
func seal(plain string) (string, error) {
	block, err := aes.NewCipher(sealKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return hex.EncodeToString(gcm.Seal(nonce, nonce, []byte(plain), nil)), nil
}

func unseal(s string) (string, error) {
	raw, err := hex.DecodeString(s)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(sealKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(raw) < gcm.NonceSize() {
		return "", fmt.Errorf("bad secret")
	}
	out, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
	return string(out), err
}

func hotp(key []byte, counter uint64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	m := hmac.New(sha1.New, key)
	m.Write(msg[:])
	sum := m.Sum(nil)
	off := sum[len(sum)-1] & 0x0f
	v := (uint32(sum[off]&0x7f) << 24) | (uint32(sum[off+1]) << 16) | (uint32(sum[off+2]) << 8) | uint32(sum[off+3])
	return fmt.Sprintf("%06d", v%1000000)
}

// checkTOTP accepts the code of the current 30-second step and of the one before and after it (clock drift); a step that was already used
// is refused, so one code cannot be used twice. It returns the step that matched.
func checkTOTP(secretB32, code string, lastStep int64) (int64, bool) {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(strings.ToUpper(secretB32))
	if err != nil {
		return 0, false
	}
	code = strings.TrimSpace(code)
	now := time.Now().Unix() / 30
	for d := int64(-1); d <= 1; d++ {
		step := now + d
		if step <= lastStep {
			continue
		}
		if subtle.ConstantTimeCompare([]byte(hotp(key, uint64(step))), []byte(code)) == 1 {
			return step, true
		}
	}
	return 0, false
}

func newSecret() string {
	b := make([]byte, 20)
	_, _ = rand.Read(b)
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(b)
}

func recoveryHash(code string) string {
	h := sha256.Sum256([]byte("rc|" + strings.ToLower(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))))
	return hex.EncodeToString(h[:])
}

// verifySecondStep checks the code (or a recovery code) of a person who has two-step sign-in on. ok=false with a nil error means a wrong code.
func verifySecondStep(ctx context.Context, userID, code string) (needed, ok bool) {
	var sealed string
	var enabled bool
	var last int64
	var rec []string
	err := store.Pool.QueryRow(ctx, `SELECT secret, enabled, last_step, recovery FROM user_2fa WHERE user_id = $1`, userID).Scan(&sealed, &enabled, &last, &rec)
	if err != nil || !enabled {
		return false, true
	}
	code = latinDigits(strings.TrimSpace(code))
	if code == "" {
		return true, false
	}
	plain, err := unseal(sealed)
	if err != nil {
		return true, false
	}
	if step, good := checkTOTP(plain, code, last); good {
		// the step is spent only if nobody else spent it in the meantime
		tag, err := store.Pool.Exec(ctx, `UPDATE user_2fa SET last_step = $2 WHERE user_id = $1 AND last_step < $2`, userID, step)
		return true, err == nil && tag.RowsAffected() == 1
	}
	h := recoveryHash(code)
	for _, r := range rec {
		if r == h {
			tag, err := store.Pool.Exec(ctx, `UPDATE user_2fa SET recovery = array_remove(recovery, $2) WHERE user_id = $1 AND $2 = ANY(recovery)`, userID, h)
			return true, err == nil && tag.RowsAffected() == 1
		}
	}
	return true, false
}

// TwoFactorStatus: GET /api/auth/2fa
func TwoFactorStatus(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	var enabled bool
	var n int
	err := store.Pool.QueryRow(r.Context(), `SELECT enabled, cardinality(recovery) FROM user_2fa WHERE user_id = $1`, me.ID()).Scan(&enabled, &n)
	if err != nil && err != pgx.ErrNoRows {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": enabled, "recoveryLeft": n})
}

// TwoFactorSetup: POST /api/auth/2fa/setup makes a new secret (not active until the first code is confirmed).
func TwoFactorSetup(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	var enabled bool
	if err := store.Pool.QueryRow(r.Context(), `SELECT enabled FROM user_2fa WHERE user_id = $1`, me.ID()).Scan(&enabled); err == nil && enabled {
		httpx.Error(w, http.StatusConflict, "ورود دو مرحله‌ای از قبل روشن است؛ برای ساختن کد تازه اول آن را خاموش کنید.")
		return
	}
	sec := newSecret()
	sealed, err := seal(sec)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO user_2fa (user_id, secret, enabled, last_step, recovery) VALUES ($1, $2, false, 0, '{}')
		 ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = false, last_step = 0, recovery = '{}'`, me.ID(), sealed); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	label := me.Email()
	if label == "" {
		label = me.ID()
	}
	uri := "otpauth://totp/" + url.PathEscape("Hoormand:"+label) + "?secret=" + sec + "&issuer=Hoormand&algorithm=SHA1&digits=6&period=30"
	httpx.JSON(w, http.StatusOK, map[string]any{"secret": sec, "uri": uri})
}

// TwoFactorEnable: POST /api/auth/2fa/enable {code} confirms the first code, switches it on and returns the ten recovery codes (shown once).
func TwoFactorEnable(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	var sealed string
	var enabled bool
	if err := store.Pool.QueryRow(r.Context(), `SELECT secret, enabled FROM user_2fa WHERE user_id = $1`, me.ID()).Scan(&sealed, &enabled); err != nil || enabled {
		httpx.Error(w, http.StatusBadRequest, "اول «روشن کردن» را بزنید و کلید را در برنامه وارد کنید.")
		return
	}
	plain, err := unseal(sealed)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	step, good := checkTOTP(plain, jsonx.Str(body, "code"), 0)
	if !good {
		noteFailure(httpx.ClientIP(r))
		httpx.Error(w, http.StatusBadRequest, "کد درست نیست. ساعت گوشی را بررسی کنید و کد تازه را بنویسید.")
		return
	}
	codes := make([]string, 10)
	hashes := make([]string, 10)
	for i := range codes {
		b := make([]byte, 5)
		_, _ = rand.Read(b)
		c := strings.ToLower(hex.EncodeToString(b))
		codes[i] = c[:5] + "-" + c[5:]
		hashes[i] = recoveryHash(codes[i])
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE user_2fa SET enabled = true, last_step = $2, recovery = $3 WHERE user_id = $1`, me.ID(), step, hashes); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "recoveryCodes": codes})
}

// TwoFactorDisable: POST /api/auth/2fa/disable {password, code} - the person's own password and a current code are both needed.
func TwoFactorDisable(w http.ResponseWriter, r *http.Request) {
	me := Current(r)
	ip := httpx.ClientIP(r)
	if blocked(ip) {
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	var hash string
	if err := store.Pool.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, me.ID()).Scan(&hash); err != nil ||
		bcrypt.CompareHashAndPassword([]byte(hash), []byte(jsonx.Str(body, "password"))) != nil {
		noteFailure(ip)
		httpx.Error(w, http.StatusForbidden, "کلمه عبور نادرست است.")
		return
	}
	if needed, good := verifySecondStep(r.Context(), me.ID(), jsonx.Str(body, "code")); needed && !good {
		noteFailure(ip)
		httpx.Error(w, http.StatusForbidden, "کد درست نیست.")
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM user_2fa WHERE user_id = $1`, me.ID())
	httpx.OK(w)
}

// TwoFactorReset: POST /api/auth/2fa/reset {userId} - the top administrator switches it off for a person who lost the phone and the codes.
func TwoFactorReset(w http.ResponseWriter, r *http.Request) {
	if !Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id := jsonx.Str(body, "userId")
	if id == "" {
		httpx.Error(w, http.StatusBadRequest, "کاربر مشخص نیست.")
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM user_2fa WHERE user_id = $1`, id)
	EndSessions(r.Context(), id, "")
	httpx.OK(w)
}

// TwoFactorList: GET /api/auth/2fa/users (top administrator): the people who have it on.
func TwoFactorList(w http.ResponseWriter, r *http.Request) {
	if !Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT user_id FROM user_2fa WHERE enabled`)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": ids})
}

// latinDigits turns Persian (۰-۹) and Arabic-Indic (٠-٩) digits into 0-9, so a code typed on a Persian keyboard still works.
func latinDigits(s string) string {
	return strings.Map(func(r rune) rune {
		switch {
		case r >= '۰' && r <= '۹':
			return '0' + (r - '۰')
		case r >= '٠' && r <= '٩':
			return '0' + (r - '٠')
		}
		return r
	}, s)
}

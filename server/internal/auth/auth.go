// Package auth handles sign-in, the session token and "who is calling".
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// User is the signed-in person: their stored document plus id and e-mail.
type User struct{ jsonx.M }

func (u User) ID() string       { return jsonx.Str(u.M, "id") }
func (u User) Email() string    { return jsonx.Str(u.M, "email") }
func (u User) Name() string     { return jsonx.Str(u.M, "fullName") }
func (u User) Role() string     { return jsonx.Str(u.M, "role") }
// IsAdmin: only the top administrator has every right. A unit manager («DEPT_ADMIN») has exactly the rights the top administrator ticked for them in the permission table, like any employee.
func (u User) IsAdmin() bool    { return u.Role() == "SUPER_ADMIN" }
func (u User) CanUseTasks() bool { return u.IsAdmin() || jsonx.Bool(u.M, "canUseTasks") }
// CanViewStats: the management statistics (all admins, or anyone given the permission).
func (u User) CanViewStats() bool { return u.IsAdmin() || jsonx.Bool(u.M, "canViewStats") }
// CanSendSms: the admin gave this person the right to send SMS to customers (admins always have it).
func (u User) CanSendSms() bool { return u.IsAdmin() || jsonx.Bool(u.M, "canSendSms") }
// SeesTeamCrm: sees every customer, opportunity and follow-up (administrators always do; others only when an administrator ticked «مشتریان همکاران» for them).
func (u User) SeesTeamCrm() bool {
	if u.IsAdmin() || jsonx.Bool(u.M, "canSignOfficialLetters") { // the top administrator and the managing director see every customer and sale (also an agent's)
		return true
	}
	return !u.IsAgent() && jsonx.Bool(u.M, "canSeeTeamCrm") && len(jsonx.Strings(u.M, "crmTeamIds")) == 0
}

// IsAgent: a sales representative («نماینده فروش»): an independent user who works with his own customers and only with the people the administrator named
// (and the managing director), whom he can write an internal letter to.
func (u User) IsAgent() bool { return jsonx.Bool(u.M, "isAgent") }

// AgentOwnerID: the representative this person works under (an employee of an agent), "" for everybody else.
func (u User) AgentOwnerID() string { return jsonx.Str(u.M, "agentOwnerId") }

// Isolated: a representative or one of his employees: sees only himself, his group and the managing director.
func (u User) Isolated() bool { return u.IsAgent() || u.AgentOwnerID() != "" }

// AgentContactIDs: the people an agent may see and talk to.
func (u User) AgentContactIDs() []string { return jsonx.Strings(u.M, "agentContactIds") }

// TeamCrmIDs: when «مشتریان همکاران» was ticked for a person together with a list of colleagues, only those colleagues' customers are added to their own.
func (u User) TeamCrmIDs() []string {
	if !jsonx.Bool(u.M, "canSeeTeamCrm") {
		return nil
	}
	return jsonx.Strings(u.M, "crmTeamIds")
}
func (u User) CanUseCrm() bool   { return u.IsAdmin() || jsonx.Bool(u.M, "canUseCrm") }

// FromRow builds the public user document from a users row.
func FromRow(id, email string, data []byte) jsonx.M {
	m := jsonx.Decode(data)
	m["id"] = id
	m["email"] = email
	return m
}

type ctxKey struct{}

// OnRequest is called after every request of a signed-in person has been answered (the journal of who did what, from which address).
// OnLogin is called for every sign-in attempt. Both are set by the api package.
var (
	OnRequest func(r *http.Request, u User, status int)
	OnLogin   func(r *http.Request, identifier string, u *User, ok bool, why string)
)

// statusWriter remembers the status code a handler answered with; it passes streaming (Flush) through untouched.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (w *statusWriter) WriteHeader(c int) {
	w.code = c
	w.ResponseWriter.WriteHeader(c)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if w.code == 0 {
		w.code = http.StatusOK
	}
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

var secret []byte

// SetSecret must be called once at start-up with the JWT secret.
func SetSecret(s string) { secret = []byte(s) }

// Current returns the user the request was authenticated as.
func Current(r *http.Request) User { return r.Context().Value(ctxKey{}).(User) }

// A sign-in lives at most sessionAbsolute and ends sooner when the person does nothing for sessionIdle. Every sign-in is a row
// in auth_sessions, so signing out, changing the password or an administrator's reset really ends it on the server (a copied token is then useless).
const (
	sessionAbsolute = 12 * time.Hour
	sessionIdle     = 4 * time.Hour
)

func newSessionID() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// bearerSession returns the session id inside a valid staff token ("" when the token is wrong or expired).
func bearerSession(r *http.Request) (sid, sub string) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", ""
	}
	tok, err := jwt.Parse(strings.TrimPrefix(header, "Bearer "), func(t *jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{"HS256"}))
	if err != nil || !tok.Valid {
		return "", ""
	}
	claims, _ := tok.Claims.(jwt.MapClaims)
	sid, _ = claims["jti"].(string)
	sub, _ = tok.Claims.GetSubject()
	return sid, sub
}

// Require wraps a handler so it only runs for a valid session token.
func Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sid, sub := bearerSession(r)
		if sid == "" || sub == "" {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		var id, email string
		var data []byte
		var lastSeen time.Time
		err := store.Pool.QueryRow(r.Context(),
			`SELECT u.id, u.email, u.data, s.last_seen FROM auth_sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.id = $1 AND s.user_id = $2 AND s.created_at > now() - $3::interval AND s.last_seen > now() - $4::interval`,
			sid, sub, sessionAbsolute.String(), sessionIdle.String()).Scan(&id, &email, &data, &lastSeen)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		if time.Since(lastSeen) > time.Minute {
			_, _ = store.Pool.Exec(r.Context(), `UPDATE auth_sessions SET last_seen = now() WHERE id = $1`, sid)
		}
		u := User{FromRow(id, email, data)}
		if !jsonx.Bool(u.M, "isActive") {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		r = r.WithContext(context.WithValue(r.Context(), ctxKey{}, u))
		if OnRequest == nil {
			next(w, r)
			return
		}
		sw := &statusWriter{ResponseWriter: w}
		next(sw, r)
		if sw.code == 0 {
			sw.code = http.StatusOK
		}
		OnRequest(r, u, sw.code)
	}
}

// Logout ends this sign-in on the server.
func Logout(w http.ResponseWriter, r *http.Request) {
	if sid, _ := bearerSession(r); sid != "" {
		_, _ = store.Pool.Exec(r.Context(), `DELETE FROM auth_sessions WHERE id = $1`, sid)
	}
	httpx.OK(w)
}

// EndSessions ends every sign-in of a person (after a password change or reset), except the one named in keep.
func EndSessions(ctx context.Context, userID, keep string) {
	_, _ = store.Pool.Exec(ctx, `DELETE FROM auth_sessions WHERE user_id = $1 AND id <> $2`, userID, keep)
}

// ---- protection against password guessing ----
// Two counters: one per address (8 failures block that address for 10 minutes) and one per account name (10 failures block that
// account for 10 minutes whatever the address, so a guess spread over many addresses is stopped too).

type failure struct {
	count int
	until time.Time
}

var (
	failMu   sync.Mutex
	failures = map[string]*failure{}
)

func blockedKey(key string, limit int) bool {
	failMu.Lock()
	defer failMu.Unlock()
	f := failures[key]
	return f != nil && f.count >= limit && f.until.After(time.Now())
}

func noteFailureKey(key string) {
	failMu.Lock()
	defer failMu.Unlock()
	f := failures[key]
	if f == nil || !f.until.After(time.Now()) {
		failures[key] = &failure{count: 1, until: time.Now().Add(10 * time.Minute)}
		return
	}
	f.count++
}

func clearFailureKey(key string) {
	failMu.Lock()
	delete(failures, key)
	failMu.Unlock()
}

func blocked(ip string) bool        { return blockedKey("ip:"+ip, 8) }
func noteFailure(ip string)         { noteFailureKey("ip:" + ip) }
func clearFailures(ip string)       { clearFailureKey("ip:" + ip) }
func accountBlocked(id string) bool { return blockedKey("acct:"+id, 10) }

// Forget old counters now and then so the map cannot grow without end.
func init() {
	go func() {
		for range time.Tick(30 * time.Minute) {
			failMu.Lock()
			for k, f := range failures {
				if !f.until.After(time.Now()) {
					delete(failures, k)
				}
			}
			failMu.Unlock()
		}
	}()
}

const tooMany = "تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید."

// bcryptCost is the work factor for new hashes; an older, cheaper hash is made stronger the next time its owner signs in.
const bcryptCost = 12

// dummyHash is compared against when the account does not exist, so an unknown name takes as long to refuse as a wrong password.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password"), bcryptCost)

// HashPassword makes the stored hash of a password.
func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcryptCost)
	return string(b), err
}

var commonPasswords = map[string]bool{
	"12345678": true, "123456789": true, "1234567890": true, "11111111": true, "00000000": true, "87654321": true, "password": true,
	"password1": true, "qwertyui": true, "qwerty123": true, "abcd1234": true, "admin123": true, "admin1234": true, "iloveyou": true,
	"12341234": true, "a1234567": true, "1q2w3e4r": true, "123123123": true, "change-me": true,
}

// CheckPassword returns "" when a new password is acceptable, otherwise the reason (in Persian) why not.
// Rules: at least 8 characters, not made of one repeated character, not a well-known weak password, not the person's own name or user name.
func CheckPassword(pw string, own ...string) string {
	r := []rune(pw)
	if len(r) < 8 {
		return "کلمه عبور باید حداقل ۸ کاراکتر باشد."
	}
	if len(r) > 128 {
		return "کلمه عبور بیش از حد طولانی است."
	}
	same := true
	for _, c := range r {
		if c != r[0] {
			same = false
			break
		}
	}
	low := strings.ToLower(pw)
	if same || commonPasswords[low] {
		return "این کلمه عبور بسیار رایج و ناامن است؛ کلمه‌ای دیگر انتخاب کنید."
	}
	for _, o := range own {
		if o = strings.ToLower(strings.TrimSpace(o)); len([]rune(o)) >= 3 && strings.Contains(low, o) {
			return "کلمه عبور نباید شامل نام یا نام کاربری خودتان باشد."
		}
	}
	return ""
}

// Login checks the password and returns a token for a new session.
func Login(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r)
	if blocked(ip) {
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	identifier := strings.ToLower(strings.TrimSpace(jsonx.Str(body, "identifier")))
	password := jsonx.Str(body, "password")
	adminOnly := jsonx.Bool(body, "adminOnly")
	if identifier == "" || password == "" {
		httpx.Error(w, http.StatusBadRequest, "نام کاربری و رمز عبور الزامی است.")
		return
	}
	if len(identifier) > 200 || len(password) > 1024 {
		httpx.Error(w, http.StatusBadRequest, "ورودی نامعتبر است.")
		return
	}
	if accountBlocked(identifier) {
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}

	var id, email, hash string
	var data []byte
	err := store.Pool.QueryRow(r.Context(),
		`SELECT id, email, password_hash, data FROM users
		 WHERE lower(email) = $1 OR lower(id) = $1 OR lower(data->>'fullName') = $1 LIMIT 1`, identifier).Scan(&id, &email, &hash, &data)
	if err != nil && err != pgx.ErrNoRows {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err == pgx.ErrNoRows {
		hash = string(dummyHash)
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil || err != nil {
		noteFailure(ip)
		noteFailureKey("acct:" + identifier)
		if OnLogin != nil {
			OnLogin(r, identifier, nil, false, "نام کاربری یا رمز عبور نادرست بود")
		}
		httpx.Error(w, http.StatusUnauthorized, "نام کاربری یا رمز عبور نادرست است.")
		return
	}
	user := User{FromRow(id, email, data)}
	if !jsonx.Bool(user.M, "isActive") {
		if OnLogin != nil {
			OnLogin(r, identifier, nil, false, "حساب غیرفعال است")
		}
		httpx.Error(w, http.StatusForbidden, "حساب کاربری شما غیرفعال شده است.")
		return
	}
	if adminOnly && !user.IsAdmin() {
		if OnLogin != nil {
			OnLogin(r, identifier, nil, false, "ورود به کنسول مدیریت بدون دسترسی مدیر")
		}
		httpx.Error(w, http.StatusForbidden, "این حساب دسترسی مدیر ندارد.")
		return
	}

	// two-step sign-in: the password was right; whoever has it switched on must also give the code of the authenticator app (or a recovery code)
	if needed, good := verifySecondStep(r.Context(), id, jsonx.Str(body, "code")); needed && !good {
		if strings.TrimSpace(jsonx.Str(body, "code")) == "" {
			httpx.Error(w, http.StatusUnauthorized, TwoFactorRequired)
			return
		}
		noteFailure(ip)
		noteFailureKey("acct:" + identifier)
		if OnLogin != nil {
			OnLogin(r, identifier, nil, false, "کد ورود دو مرحله‌ای نادرست بود")
		}
		httpx.Error(w, http.StatusUnauthorized, "کد ورود دو مرحله‌ای نادرست است.")
		return
	}
	clearFailures(ip)
	clearFailureKey("acct:" + identifier)
	// An older, cheaper hash is replaced by a stronger one now that the real password is at hand.
	if c, err := bcrypt.Cost([]byte(hash)); err == nil && c < bcryptCost {
		if nh, err := HashPassword(password); err == nil {
			_, _ = store.Pool.Exec(r.Context(), `UPDATE users SET password_hash = $2 WHERE id = $1`, id, nh)
		}
	}
	user.M["lastLogin"] = jalali.Timestamp(time.Now())
	if _, err := store.Pool.Exec(r.Context(), `UPDATE users SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(user.M)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	sid := newSessionID()
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM auth_sessions WHERE created_at < now() - $1::interval OR last_seen < now() - $2::interval`,
		sessionAbsolute.String(), sessionIdle.String())
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO auth_sessions (id, user_id, ip, agent) VALUES ($1, $2, $3, $4)`,
		sid, id, ip, truncate(r.UserAgent(), 300)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": id,
		"jti": sid,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(sessionAbsolute).Unix(),
	}).SignedString(secret)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if OnLogin != nil {
		OnLogin(r, identifier, &user, true, "")
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"token": token, "user": user.M})
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// ChangePassword lets a signed-in user change their own password; every other sign-in of theirs ends.
func ChangePassword(w http.ResponseWriter, r *http.Request) {
	ip := httpx.ClientIP(r)
	if blocked(ip) {
		httpx.Error(w, http.StatusTooManyRequests, tooMany)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	current := jsonx.Str(body, "currentPassword")
	next := jsonx.Str(body, "newPassword")
	me := Current(r)
	if why := CheckPassword(next, me.Name(), me.Email(), me.ID()); why != "" {
		httpx.Error(w, http.StatusBadRequest, why)
		return
	}
	var hash string
	err := store.Pool.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, me.ID()).Scan(&hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		noteFailure(ip)
		httpx.Error(w, http.StatusForbidden, "کلمه عبور فعلی نادرست است.")
		return
	}
	newHash, err := HashPassword(next)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE users SET password_hash = $2 WHERE id = $1`, me.ID(), newHash); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	keep, _ := bearerSession(r)
	EndSessions(r.Context(), me.ID(), keep)
	httpx.OK(w)
}

// ---- customer portal («پشتیبانی» page for customers) ----
// Portal tokens are signed with a key derived from the server secret, so a portal token can never be taken for a staff token
// (and the other way round).

func portalKey() []byte {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte("portal-v1"))
	return m.Sum(nil)
}

// PortalHash is what is stored for a customer's access code of one subscription (the code itself is shown once and never kept).
func PortalHash(subID, code string) string {
	m := hmac.New(sha256.New, portalKey())
	m.Write([]byte(subID + "|" + code))
	return hex.EncodeToString(m.Sum(nil))
}

// PortalToken is a 12-hour token for one customer.
func PortalToken(customerID string) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": customerID, "aud": "portal", "exp": time.Now().Add(12 * time.Hour).Unix(),
	}).SignedString(portalKey())
}

// PortalCustomer returns the customer id of a valid portal token ("" when invalid).
func PortalCustomer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	tok, err := jwt.Parse(strings.TrimPrefix(h, "Bearer "), func(t *jwt.Token) (any, error) { return portalKey(), nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithAudience("portal"))
	if err != nil || !tok.Valid {
		return ""
	}
	sub, _ := tok.Claims.GetSubject()
	return sub
}

// Package auth handles sign-in, the session token and "who is calling".
package auth

import (
	"context"
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
func (u User) IsAdmin() bool    { return u.Role() == "SUPER_ADMIN" || u.Role() == "DEPT_ADMIN" }
func (u User) CanUseTasks() bool { return u.IsAdmin() || jsonx.Bool(u.M, "canUseTasks") }

// FromRow builds the public user document from a users row.
func FromRow(id, email string, data []byte) jsonx.M {
	m := jsonx.Decode(data)
	m["id"] = id
	m["email"] = email
	return m
}

type ctxKey struct{}

var secret []byte

// SetSecret must be called once at start-up with the JWT secret.
func SetSecret(s string) { secret = []byte(s) }

// Current returns the user the request was authenticated as.
func Current(r *http.Request) User { return r.Context().Value(ctxKey{}).(User) }

// Require wraps a handler so it only runs for a valid session token.
func Require(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		tok, err := jwt.Parse(strings.TrimPrefix(header, "Bearer "), func(t *jwt.Token) (any, error) { return secret, nil },
			jwt.WithValidMethods([]string{"HS256"}))
		if err != nil || !tok.Valid {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		sub, _ := tok.Claims.GetSubject()
		var id, email string
		var data []byte
		err = store.Pool.QueryRow(r.Context(), `SELECT id, email, data FROM users WHERE id = $1`, sub).Scan(&id, &email, &data)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		u := User{FromRow(id, email, data)}
		if !jsonx.Bool(u.M, "isActive") {
			httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, u)))
	}
}

// ---- protection against password guessing: 8 failures from one address block it for 10 minutes ----

type failure struct {
	count int
	until time.Time
}

var (
	failMu   sync.Mutex
	failures = map[string]*failure{}
)

func blocked(ip string) bool {
	failMu.Lock()
	defer failMu.Unlock()
	f := failures[ip]
	return f != nil && f.count >= 8 && f.until.After(time.Now())
}

func noteFailure(ip string) {
	failMu.Lock()
	defer failMu.Unlock()
	f := failures[ip]
	if f == nil || !f.until.After(time.Now()) {
		failures[ip] = &failure{count: 1, until: time.Now().Add(10 * time.Minute)}
		return
	}
	f.count++
}

func clearFailures(ip string) {
	failMu.Lock()
	delete(failures, ip)
	failMu.Unlock()
}

const tooMany = "تلاش‌های ناموفق زیاد است. چند دقیقه بعد دوباره امتحان کنید."

// Login checks the password and returns a 12-hour token.
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

	var id, email, hash string
	var data []byte
	err := store.Pool.QueryRow(r.Context(),
		`SELECT id, email, password_hash, data FROM users
		 WHERE lower(email) = $1 OR lower(id) = $1 OR lower(data->>'fullName') = $1 LIMIT 1`, identifier).Scan(&id, &email, &hash, &data)
	if err != nil && err != pgx.ErrNoRows {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		noteFailure(ip)
		httpx.Error(w, http.StatusUnauthorized, "نام کاربری یا رمز عبور نادرست است.")
		return
	}
	user := User{FromRow(id, email, data)}
	if !jsonx.Bool(user.M, "isActive") {
		httpx.Error(w, http.StatusForbidden, "حساب کاربری شما غیرفعال شده است.")
		return
	}
	if adminOnly && !user.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, "این حساب دسترسی مدیر ندارد.")
		return
	}

	clearFailures(ip)
	user.M["lastLogin"] = jalali.Timestamp(time.Now())
	if _, err := store.Pool.Exec(r.Context(), `UPDATE users SET data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(user.M)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": id,
		"iat": time.Now().Unix(),
		"exp": time.Now().Add(12 * time.Hour).Unix(),
	}).SignedString(secret)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"token": token, "user": user.M})
}

// ChangePassword lets a signed-in user change their own password.
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
	if len([]rune(next)) < 8 {
		httpx.Error(w, http.StatusBadRequest, "کلمه عبور جدید باید حداقل ۸ کاراکتر باشد.")
		return
	}
	me := Current(r)
	var hash string
	err := store.Pool.QueryRow(r.Context(), `SELECT password_hash FROM users WHERE id = $1`, me.ID()).Scan(&hash)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(current)) != nil {
		noteFailure(ip)
		httpx.Error(w, http.StatusForbidden, "کلمه عبور فعلی نادرست است.")
		return
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(next), 10)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE users SET password_hash = $2 WHERE id = $1`, me.ID(), string(newHash)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	httpx.OK(w)
}

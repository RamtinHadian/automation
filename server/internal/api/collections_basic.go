package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

func internalError(w http.ResponseWriter) { httpx.Error(w, http.StatusInternalServerError, "internal error") }

// ---------- staff ----------

func putStaff(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	ctx := r.Context()
	var exID, exEmail, exHash string
	var exData []byte
	err := store.Pool.QueryRow(ctx, `SELECT id, email, password_hash, data FROM users WHERE id = $1`, id).Scan(&exID, &exEmail, &exHash, &exData)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	existing := jsonx.Decode(exData)

	password := jsonx.Str(data, "password")
	rest := jsonx.Copy(data)
	delete(rest, "password")
	if DemoMode {
		password = "" // the public demo never changes anyone's password
	}

	var merged jsonx.M
	if !me.IsAdmin() || DemoMode {
		// Regular users (and everybody in the public demo) may only change cosmetic fields on their own record.
		// The one exception: in the demo the admin may hand over the CEO («مدیرعامل») tick, so the feature can be shown.
		demoCEO := DemoMode && me.IsAdmin() && exists
		if !exists || (exID != me.ID() && !demoCEO) {
			httpx.Forbidden(w)
			return
		}
		merged = jsonx.Copy(existing)
		keys := []string{"themeId", "letterPrefs", "avatarUrl"}
		if exID != me.ID() {
			keys = []string{}
		}
		if demoCEO {
			keys = append(keys, "canSignOfficialLetters")
		}
		for _, k := range keys {
			if v, ok := rest[k]; ok && v != nil {
				merged[k] = v
			}
		}
	} else {
		// Only a super admin may create, edit or promote super admins.
		touchesSuper := jsonx.Str(rest, "role") == "SUPER_ADMIN" || (exists && jsonx.Str(existing, "role") == "SUPER_ADMIN")
		if touchesSuper && me.Role() != "SUPER_ADMIN" {
			httpx.Forbidden(w)
			return
		}
		merged = rest
		merged["id"] = id
	}

	if exists {
		hash := exHash
		if password != "" && me.IsAdmin() {
			b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
			if err != nil {
				internalError(w)
				return
			}
			hash = string(b)
		}
		email := jsonx.Str(merged, "email")
		if email == "" {
			email = exEmail
		}
		if _, err := store.Pool.Exec(ctx, `UPDATE users SET email = $2, password_hash = $3, data = $4::jsonb WHERE id = $1`,
			id, email, hash, jsonx.Encode(merged)); err != nil {
			if pe, ok := err.(*pgconn.PgError); ok && pe.Code == "23505" {
				httpx.Error(w, http.StatusConflict, "این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.")
				return
			}
			internalError(w)
			return
		}
		ceoChanged(r, me, id, jsonx.Str(merged, "fullName"), jsonx.Bool(existing, "canSignOfficialLetters"), jsonx.Bool(merged, "canSignOfficialLetters"))
		// Tell the person when an admin changed their account (access, department, login or password).
		if me.IsAdmin() && id != me.ID() {
			var changes []string
			if password != "" {
				changes = append(changes, "رمز عبور")
			}
			if email != exEmail {
				changes = append(changes, "نام کاربری")
			}
			for _, c := range []struct{ key, label string }{
				{"role", "نقش"}, {"canUseTasks", "دسترسی وظایف"}, {"canUseCrm", "دسترسی مشتریان"}, {"canViewStats", "دسترسی گزارشات آماری"},
				{"extension", "شمارهٔ داخلی"}, {"isActive", "فعال‌بودن حساب"}, {"departmentId", "واحد سازمانی"},
			} {
				if jsonx.Str(existing, c.key) != jsonx.Str(merged, c.key) || jsonx.Bool(existing, c.key) != jsonx.Bool(merged, c.key) {
					changes = append(changes, c.label)
				}
			}
			if len(changes) > 0 {
				notify.Notify(ctx, []string{id}, notify.Note{
					Kind: "alert", Label: "تغییر حساب", Title: "مدیر اطلاعات حساب شما را تغییر داد",
					Body: strings.Join(changes, "، "), Repeat: true,
				}, me.ID())
			}
		}
		httpx.OK(w)
		return
	}

	if password == "" {
		httpx.Error(w, http.StatusBadRequest, "password required for new user")
		return
	}
	b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		internalError(w)
		return
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4::jsonb)`,
		id, jsonx.Str(merged, "email"), string(b), jsonx.Encode(merged)); err != nil {
		if pe, ok := err.(*pgconn.PgError); ok && pe.Code == "23505" {
			httpx.Error(w, http.StatusConflict, "ایمیل تکراری است.")
			return
		}
		internalError(w)
		return
	}
	ceoChanged(r, me, id, jsonx.Str(merged, "fullName"), false, jsonx.Bool(merged, "canSignOfficialLetters"))
	httpx.OK(w)
}

// ceoChanged keeps «مدیرعامل» (the authorised signatory) to one person: giving it to someone takes it from whoever had it,
// and every grant, hand-over or withdrawal is written to the audit log as a permanent CEO_CHANGE line.
func ceoChanged(r *http.Request, me auth.User, id, name string, was, now bool) {
	ctx := r.Context()
	defer syncCeoName(ctx) // also covers a renamed CEO
	if was == now || !me.IsAdmin() {
		return
	}
	var details string
	if now {
		rows, err := store.Pool.Query(ctx, `SELECT id, data FROM users WHERE id <> $1 AND data->>'canSignOfficialLetters' = 'true'`, id)
		var olds []string
		var oldIDs []string
		if err == nil {
			for rows.Next() {
				var oid string
				var raw []byte
				if rows.Scan(&oid, &raw) == nil {
					oldIDs = append(oldIDs, oid)
					olds = append(olds, jsonx.Str(jsonx.Decode(raw), "fullName"))
				}
			}
			rows.Close()
		}
		for _, oid := range oldIDs {
			_, _ = store.Pool.Exec(ctx, `UPDATE users SET data = data || '{"canSignOfficialLetters": false}'::jsonb WHERE id = $1`, oid)
		}
		if len(olds) > 0 {
			details = "تغییر مدیرعامل: «" + name + "» به‌جای «" + strings.Join(olds, "، ") + "» به‌عنوان مدیرعامل و صاحب امضای مجاز تعیین شد."
		} else {
			details = "«" + name + "» به‌عنوان مدیرعامل و صاحب امضای مجاز تعیین شد."
		}
	} else {
		details = "سمت مدیرعاملی و امضای مجاز از «" + name + "» برداشته شد."
	}
	entry := jsonx.M{
		"id": "aud-ceo-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()),
		"userName": me.Name(), "userEmail": me.Email(), "action": "CEO_CHANGE", "severity": "CRITICAL",
		"ipAddress": strings.TrimSpace(httpx.ClientIP(r)), "details": details,
	}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO audit_logs (id, data) VALUES ($1, $2::jsonb)`, entry["id"], jsonx.Encode(entry))
}

// syncCeoName keeps the name printed as «مدیرعامل» (settings.ceoName) equal to the person who holds the CEO tick.
func syncCeoName(ctx context.Context) {
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE data->>'canSignOfficialLetters' = 'true' ORDER BY created_at LIMIT 1`).Scan(&raw); err != nil {
		return
	}
	if name := jsonx.Str(jsonx.Decode(raw), "fullName"); name != "" {
		_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = data || jsonb_build_object('ceoName', $1::text) WHERE key = 'main'`, name)
	}
}

func removeStaff(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if id == me.ID() {
		httpx.Error(w, http.StatusBadRequest, "cannot delete yourself")
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM users WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- departments ----------

func putDepartment(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	doc := jsonx.Copy(data)
	doc["id"] = id
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO departments (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb`,
		id, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func removeDepartment(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM departments WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- settings (one document, "main") ----------

func putSettings(w http.ResponseWriter, r *http.Request, me auth.User, _ string, data jsonx.M) {
	merged := data
	if !me.IsAdmin() {
		// Non-admins (e.g. signers) may only advance the letter numbering counter.
		var raw []byte
		_ = store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
		cur := jsonx.Decode(raw)
		if v, ok := data["letterNumbering"]; ok && v != nil {
			cur["letterNumbering"] = v
		}
		merged = cur
	}
	notify.ForgetRules()
	// The CEO's name is never typed by hand: it is always the person who holds the CEO tick.
	var ceo []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM users WHERE data->>'canSignOfficialLetters' = 'true' ORDER BY created_at LIMIT 1`).Scan(&ceo) == nil {
		if name := jsonx.Str(jsonx.Decode(ceo), "fullName"); name != "" {
			merged = jsonx.Copy(merged)
			merged["ceoName"] = name
		}
	}
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO settings (key, data) VALUES ('main', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`,
		jsonx.Encode(merged)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- audit log: append-only, identity comes from the session, not from the client ----------

func putAudit(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	entry := jsonx.Copy(data)
	entry["id"] = id
	entry["userName"] = me.Name()
	entry["userEmail"] = me.Email()
	entry["ipAddress"] = strings.TrimSpace(httpx.ClientIP(r))
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO audit_logs (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO NOTHING`, id, jsonx.Encode(entry)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

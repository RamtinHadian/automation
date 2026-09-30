package api

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
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

	var merged jsonx.M
	if !me.IsAdmin() {
		// Regular users may only change cosmetic fields on their own record.
		if !exists || exID != me.ID() {
			httpx.Forbidden(w)
			return
		}
		merged = jsonx.Copy(existing)
		for _, k := range []string{"themeId", "letterPrefs", "avatarUrl"} {
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
			internalError(w)
			return
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
	httpx.OK(w)
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

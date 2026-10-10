package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The door for other programs. A key is made by an administrator, belongs to one named program, can do only what it was
// given (scopes), acts as ONE employee (every record it creates is that employee's, under that employee's rights) and can be
// switched off at any time. The key itself is shown once and kept only as a hash.

// apiScopes are the things a key can be allowed to do (the keys of this map are what the console sends).
var apiScopes = map[string]string{
	"customers.read":  "خواندن مشتریان",
	"customers.write": "ثبت و ویرایش مشتری",
	"deals.read":      "خواندن فرصت‌های فروش",
	"deals.write":     "ثبت فرصت فروش",
	"notes.write":     "افزودن یادداشت به پروندهٔ مشتری",
}

func hashKey(k string) string {
	h := sha256.Sum256([]byte(k))
	return hex.EncodeToString(h[:])
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ---------- the administrator's side: make, list and switch off keys ----------

type apiKeyView struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Prefix     string     `json:"prefix"`
	Scopes     []string   `json:"scopes"`
	ActAs      string     `json:"actAs"`
	ActAsName  string     `json:"actAsName"`
	CreatedAt  time.Time  `json:"createdAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	Uses       int64      `json:"uses"`
}

// GET /api/apikeys (admins): the keys without their secrets, and the list of what a key can be allowed to do.
func apiKeysList(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT k.id, k.name, k.prefix, k.scopes, k.act_as, COALESCE(u.data->>'fullName', ''), k.created_at, k.last_used_at, k.expires_at, k.uses
		FROM api_keys k LEFT JOIN users u ON u.id = k.act_as ORDER BY k.created_at DESC`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []apiKeyView{}
	for rows.Next() {
		var v apiKeyView
		if rows.Scan(&v.ID, &v.Name, &v.Prefix, &v.Scopes, &v.ActAs, &v.ActAsName, &v.CreatedAt, &v.LastUsedAt, &v.ExpiresAt, &v.Uses) == nil {
			out = append(out, v)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"keys": out, "scopes": apiScopes})
}

// POST /api/apikeys {name, scopes, actAs, expiresDays} (admins): returns the key, once.
func apiKeysCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if DemoMode {
		httpx.Error(w, http.StatusForbidden, "در نسخهٔ آزمایشی کلید API ساخته نمی‌شود.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	name := strings.TrimSpace(jsonx.Str(body, "name"))
	if name == "" || len([]rune(name)) > 60 {
		httpx.Error(w, http.StatusBadRequest, "نام برنامه را بنویسید (حداکثر ۶۰ نویسه).")
		return
	}
	var scopes []string
	for _, s := range jsonx.Strings(body, "scopes") {
		if _, ok := apiScopes[s]; ok && !jsonx.Contains(scopes, s) {
			scopes = append(scopes, s)
		}
	}
	if len(scopes) == 0 {
		httpx.Error(w, http.StatusBadRequest, "حداقل یک دسترسی برای کلید انتخاب کنید.")
		return
	}
	actAs := strings.TrimSpace(jsonx.Str(body, "actAs"))
	if actAs == "" {
		actAs = me.ID()
	}
	var active string
	if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'isActive', 'true') FROM users WHERE id = $1`, actAs).Scan(&active) != nil || active == "false" {
		httpx.Error(w, http.StatusBadRequest, "همکار انتخاب‌شده برای کلید پیدا نشد یا غیرفعال است.")
		return
	}
	var expires *time.Time
	if d := jsonx.Int(body, "expiresDays"); d > 0 && d <= 3650 {
		t := time.Now().Add(time.Duration(d) * 24 * time.Hour)
		expires = &t
	}
	key := "hk_" + randomHex(24)
	id := "ak-" + randomHex(6)
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO api_keys (id, name, key_hash, prefix, scopes, act_as, created_by, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, name, hashKey(key), key[:8], scopes, actAs, me.ID(), expires); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "ساخت کلید API برای «"+name+"» با دسترسی: "+strings.Join(scopes, "، "))
	httpx.JSON(w, http.StatusOK, map[string]any{"key": key, "id": id})
}

// DELETE /api/apikeys/{id} (admins): the key stops working at once.
func apiKeysDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	var name string
	if store.Pool.QueryRow(r.Context(), `DELETE FROM api_keys WHERE id = $1 RETURNING name`, r.PathValue("id")).Scan(&name) == nil {
		auditLine(r, me, "WARNING", "حذف کلید API «"+name+"»")
	}
	httpx.OK(w)
}

// ---------- the other program's side ----------

type extKey struct {
	ID     string
	Name   string
	Scopes []string
}

var (
	extMu     sync.Mutex
	extWindow = map[string][]time.Time{}
)

const extPerMinute = 120

// extAllowed is a plain per-key limit: at most extPerMinute requests in any minute.
func extAllowed(id string) bool {
	extMu.Lock()
	defer extMu.Unlock()
	cut := time.Now().Add(-time.Minute)
	kept := extWindow[id][:0]
	for _, t := range extWindow[id] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= extPerMinute {
		extWindow[id] = kept
		return false
	}
	extWindow[id] = append(kept, time.Now())
	return true
}

// extAuth checks the key (Authorization: Bearer hk_… or X-Api-Key), the scope, the limit, and runs the handler as the employee the key acts as.
func extAuth(scope string, next func(w http.ResponseWriter, r *http.Request, k extKey, user auth.User)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(r.Header.Get("X-Api-Key"))
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			secret = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
		}
		if !strings.HasPrefix(secret, "hk_") {
			httpx.Error(w, http.StatusUnauthorized, "کلید API فرستاده نشده است.")
			return
		}
		var k extKey
		var actAs string
		var expires *time.Time
		err := store.Pool.QueryRow(r.Context(), `SELECT id, name, scopes, act_as, expires_at FROM api_keys WHERE key_hash = $1`, hashKey(secret)).Scan(&k.ID, &k.Name, &k.Scopes, &actAs, &expires)
		if err != nil || (expires != nil && expires.Before(time.Now())) {
			httpx.Error(w, http.StatusUnauthorized, "کلید API معتبر نیست یا منقضی شده است.")
			return
		}
		if scope != "" && !jsonx.Contains(k.Scopes, scope) {
			httpx.Error(w, http.StatusForbidden, "این کلید اجازهٔ «"+apiScopes[scope]+"» را ندارد.")
			return
		}
		if !extAllowed(k.ID) {
			w.Header().Set("Retry-After", "60")
			httpx.Error(w, http.StatusTooManyRequests, "تعداد درخواست‌ها بیش از حد است؛ یک دقیقه بعد دوباره تلاش کنید.")
			return
		}
		var email string
		var data []byte
		if store.Pool.QueryRow(r.Context(), `SELECT email, data FROM users WHERE id = $1`, actAs).Scan(&email, &data) != nil {
			httpx.Error(w, http.StatusForbidden, "همکاری که این کلید به نام او کار می‌کند پیدا نشد.")
			return
		}
		user := auth.User{M: auth.FromRow(actAs, email, data)}
		if v, ok := user.M["isActive"].(bool); ok && !v {
			httpx.Error(w, http.StatusForbidden, "حساب همکاری که این کلید به نام او کار می‌کند غیرفعال است.")
			return
		}
		go func(id string) {
			_, _ = store.Pool.Exec(context.Background(), `UPDATE api_keys SET last_used_at = now(), uses = uses + 1 WHERE id = $1`, id)
		}(k.ID)
		next(w, r, k, user)
	}
}

// publicCustomer is a customer as other programs see it (no chat ids).
func publicCustomer(raw []byte) jsonx.M {
	m := jsonx.Decode(raw)
	delete(m, "telegramChatId")
	delete(m, "baleChatId")
	return m
}

func queryInt(r *http.Request, name string, def, max int) int {
	v, err := strconv.Atoi(r.URL.Query().Get(name))
	if err != nil || v < 0 {
		return def
	}
	if v > max {
		return max
	}
	return v
}

// callAs runs one of the app's own save functions as the key's employee and returns what it answered (so the same rules and
// side effects apply as when that employee saves in the browser).
func callAs(r *http.Request, user auth.User, fn func(http.ResponseWriter, *http.Request, auth.User, string, jsonx.M), id string, doc jsonx.M) (int, string) {
	rec := httptest.NewRecorder()
	fn(rec, r, user, id, doc)
	if rec.Code == http.StatusOK {
		return http.StatusOK, ""
	}
	var e struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &e)
	if e.Error == "" {
		e.Error = "درخواست پذیرفته نشد."
	}
	return rec.Code, e.Error
}

// the fields another program may set on a customer
var extCustomerFields = []string{"name", "company", "kind", "firstName", "lastName", "fatherName", "nationalCode", "birthDate", "gender", "companyType", "nationalId",
	"economicCode", "repName", "repPosition", "repMobile", "province", "city", "postalCode", "website", "email", "address", "status", "source", "tags", "notes"}

func pickFields(from jsonx.M, keys []string) jsonx.M {
	out := jsonx.M{}
	for _, k := range keys {
		if v, ok := from[k]; ok && v != nil {
			out[k] = v
		}
	}
	if arr := jsonx.Strings(from, "phones"); len(arr) > 0 {
		if len(arr) > 10 {
			arr = arr[:10]
		}
		out["phones"] = arr
	}
	return out
}

func extPing(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "key": k.Name, "scopes": k.Scopes, "actAs": user.Name()})
}

func extCustomersList(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	limit, offset := queryInt(r, "limit", 50, 200), queryInt(r, "offset", 0, 1000000)
	q, phone := strings.TrimSpace(r.URL.Query().Get("q")), strings.TrimSpace(r.URL.Query().Get("phone"))
	sql, args := `SELECT data FROM crm_customers WHERE true`, []any{}
	if q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		sql += ` AND lower(data->>'name' || ' ' || COALESCE(data->>'company', '') || ' ' || COALESCE(data->>'email', '')) LIKE $` + strconv.Itoa(len(args))
	}
	if phone != "" {
		digits := strings.Map(func(c rune) rune {
			if c >= '0' && c <= '9' {
				return c
			}
			return -1
		}, phone)
		if len(digits) >= 7 {
			args = append(args, "%"+digits[len(digits)-9:]+"%")
			sql += ` AND data->>'phones' LIKE $` + strconv.Itoa(len(args))
		}
	}
	args = append(args, limit, offset)
	sql += ` ORDER BY (data->>'createdAt') DESC LIMIT $` + strconv.Itoa(len(args)-1) + ` OFFSET $` + strconv.Itoa(len(args))
	rows, err := store.RawList(r.Context(), sql, args...)
	if err != nil {
		internalError(w)
		return
	}
	out := []jsonx.M{}
	for _, raw := range rows {
		out = append(out, publicCustomer(raw))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"customers": out, "limit": limit, "offset": offset})
}

func extCustomerGet(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, r.PathValue("id")).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	}
	httpx.JSON(w, http.StatusOK, publicCustomer(raw))
}

func extCustomerCreate(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc := pickFields(body, extCustomerFields)
	name := strings.TrimSpace(jsonx.Str(doc, "name"))
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "نام مشتری لازم است (name).")
		return
	}
	if _, ok := doc["phones"]; !ok {
		doc["phones"] = []string{}
	}
	if jsonx.Str(doc, "status") == "" {
		doc["status"] = "LEAD"
	}
	if jsonx.Str(doc, "source") == "" {
		doc["source"] = "API: " + k.Name
	}
	id := "c-" + randomHex(8)
	if code, msg := callAs(r, user, putCustomer, id, doc); code != http.StatusOK {
		httpx.Error(w, code, msg)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

func extCustomerUpdate(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	id := r.PathValue("id")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc := jsonx.Decode(raw)
	for k2, v := range pickFields(body, extCustomerFields) {
		doc[k2] = v
	}
	if strings.TrimSpace(jsonx.Str(doc, "name")) == "" {
		httpx.Error(w, http.StatusBadRequest, "نام مشتری نمی‌تواند خالی باشد.")
		return
	}
	if code, msg := callAs(r, user, putCustomer, id, doc); code != http.StatusOK {
		httpx.Error(w, code, msg)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

func extDealsList(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	limit, offset := queryInt(r, "limit", 50, 200), queryInt(r, "offset", 0, 1000000)
	sql, args := `SELECT data FROM crm_deals WHERE true`, []any{}
	if c := strings.TrimSpace(r.URL.Query().Get("customerId")); c != "" {
		args = append(args, c)
		sql += ` AND customer_id = $` + strconv.Itoa(len(args))
	}
	args = append(args, limit, offset)
	sql += ` ORDER BY (data->>'createdAt') DESC LIMIT $` + strconv.Itoa(len(args)-1) + ` OFFSET $` + strconv.Itoa(len(args))
	rows, err := store.RawList(r.Context(), sql, args...)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"deals": rows, "limit": limit, "offset": offset})
}

func extDealCreate(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	cid := strings.TrimSpace(jsonx.Str(body, "customerId"))
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, cid).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusBadRequest, "مشتری پیدا نشد (customerId).")
		return
	}
	title := strings.TrimSpace(jsonx.Str(body, "title"))
	if title == "" {
		httpx.Error(w, http.StatusBadRequest, "عنوان فرصت لازم است (title).")
		return
	}
	stage := jsonx.Str(body, "stage")
	if stage == "" || !jsonx.Contains([]string{"NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION"}, stage) {
		stage = "NEW" // a program opens an opportunity; closing it (won / lost) is for people
	}
	doc := jsonx.M{"title": title, "customerId": cid, "customerName": jsonx.Str(jsonx.Decode(raw), "name"), "amount": jsonx.Int(body, "amount"), "stage": stage}
	for _, f := range []string{"productCode", "notes", "expectedClose"} {
		if v := jsonx.Str(body, f); v != "" {
			doc[f] = v
		}
	}
	id := "d-" + randomHex(8)
	if code, msg := callAs(r, user, putDeal, id, doc); code != http.StatusOK {
		httpx.Error(w, code, msg)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

func extNoteCreate(w http.ResponseWriter, r *http.Request, k extKey, user auth.User) {
	id := r.PathValue("id")
	var owner, ownerName string
	if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), COALESCE(data->>'ownerName', '') FROM crm_customers WHERE id = $1`, id).Scan(&owner, &ownerName); err == pgx.ErrNoRows {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	} else if err != nil {
		internalError(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if text == "" || len([]rune(text)) > 2000 {
		httpx.Error(w, http.StatusBadRequest, "متن یادداشت لازم است و باید کوتاه‌تر از ۲۰۰۰ نویسه باشد (text).")
		return
	}
	nid := "n-" + randomHex(8)
	doc := jsonx.M{"id": nid, "customerId": id, "type": "NOTE", "text": text, "ownerId": owner, "ownerName": ownerName, "authorId": user.ID(), "authorName": "برنامه: " + k.Name, "createdAt": now()}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, nid, id, owner, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": nid})
}

// registerExtAPI adds the routes of the door for other programs.
func registerExtAPI(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/apikeys", auth.Require(apiKeysList))
	mux.HandleFunc("POST /api/apikeys", auth.Require(apiKeysCreate))
	mux.HandleFunc("DELETE /api/apikeys/{id}", auth.Require(apiKeysDelete))
	mux.HandleFunc("GET /api/ext/v1/ping", extAuth("", extPing))
	mux.HandleFunc("GET /api/ext/v1/customers", extAuth("customers.read", extCustomersList))
	mux.HandleFunc("GET /api/ext/v1/customers/{id}", extAuth("customers.read", extCustomerGet))
	mux.HandleFunc("POST /api/ext/v1/customers", extAuth("customers.write", extCustomerCreate))
	mux.HandleFunc("PUT /api/ext/v1/customers/{id}", extAuth("customers.write", extCustomerUpdate))
	mux.HandleFunc("GET /api/ext/v1/deals", extAuth("deals.read", extDealsList))
	mux.HandleFunc("POST /api/ext/v1/deals", extAuth("deals.write", extDealCreate))
	mux.HandleFunc("POST /api/ext/v1/customers/{id}/notes", extAuth("notes.write", extNoteCreate))
}

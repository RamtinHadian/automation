package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/sms"
	"automation/server/internal/store"
)

// Registering customers in the field (exhibitions, visits) and from the company's web site.
//
//   - /field: the marketer signs in with his own name and password (and the code of his authenticator app when the administrator asks for it)
//     and types a customer in a very short form. The customer is HIS customer, the usual rules apply (a mobile number is needed, a number that
//     already exists is refused with the name of its owner), it goes to Sepidar like any customer and the welcome SMS goes out (when switched on).
//   - /lead?k=KEY: the same short form for the company's web site (an iframe). The key belongs to one marketer; whoever fills the form
//     becomes that marketer's customer. The key is a secret that can be revoked, the form is limited per address, and a hidden field catches robots.
//
// Which fields the form has, and which are required, is decided in the management console («فرم‌ها»: form id «field»).

// the labels are also the keys of the console's form tuning (fields are named by their label)
var fieldLabels = map[string]string{
	"نام و نام خانوادگی":   "name",
	"موبایل":               "phone",
	"شرکت / فروشگاه":       "company",
	"شهر":                  "city",
	"نمایشگاه / محل ثبت":   "event",
	"توضیحات و علاقه‌مندی": "note",
}

type leadIn struct {
	Name, Phone, Company, City, Event, Note string
}

type leadErr struct {
	Status int
	Msg    string
}

func fieldSettings(ctx context.Context) jsonx.M {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'fieldReg'`).Scan(&raw) != nil {
		return jsonx.M{}
	}
	return jsonx.Decode(raw)
}

// the form tuning of the console for the form «field»: hidden and required labels
func fieldFormCfg(ctx context.Context) (hidden, required []string) {
	return formCfg(ctx, "field", []string{"نام و نام خانوادگی", "موبایل"})
}

// formCfg: what the console decided about one form (hidden and required labels); defReq is what is required until he chooses
func formCfg(ctx context.Context, id string, defReq []string) (hidden, required []string) {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw) != nil {
		return nil, defReq
	}
	cfg := jsonx.Sub(jsonx.Sub(jsonx.Decode(raw), "formConfig"), id)
	hidden = jsonx.Strings(cfg, "hidden")
	if _, set := cfg["required"]; set {
		required = jsonx.Strings(cfg, "required")
	} else {
		required = defReq
	}
	return
}

func labelOn(list []string, label string) bool { return jsonx.Contains(list, label) }

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// phoneOwner: who already has this mobile number (the last ten digits are compared, so 0912…, +98912… and 912… are one number).
func phoneOwner(ctx context.Context, phone, exceptID string) (name, owner string, found bool) {
	d := digitsOnly(phone)
	if len(d) < 10 {
		return "", "", false
	}
	key := d[len(d)-10:]
	rows, err := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'name', ''), COALESCE(data->>'ownerName', ''), COALESCE(data->'phones', '[]'::jsonb)::text FROM crm_customers WHERE data->>'phones' LIKE $1 LIMIT 20`, "%"+key+"%")
	if err != nil {
		return "", "", false
	}
	defer rows.Close()
	for rows.Next() {
		var id, n, o, phones string
		if rows.Scan(&id, &n, &o, &phones) != nil || id == exceptID {
			continue
		}
		// the text match is only a first filter: compare the numbers themselves
		for _, p := range jsonx.Strings(jsonx.Decode([]byte(`{"p":`+phones+`}`)), "p") {
			if q := digitsOnly(p); len(q) >= 10 && q[len(q)-10:] == key {
				return n, o, true
			}
		}
	}
	return "", "", false
}

func dupMessage(name, owner string) string {
	m := "این شماره الان متعلق به «" + name + "» است"
	if owner != "" {
		m += " (مسئول: " + owner + ")"
	}
	return m + "؛ شمارهٔ تکراری ثبت نمی‌شود."
}

// createLeadCustomer registers one customer for a marketer, with every rule of the program.
func createLeadCustomer(ctx context.Context, owner auth.User, in leadIn, source string) (jsonx.M, *leadErr) {
	hidden, required := fieldFormCfg(ctx)
	clean := func(s string, max int) string {
		s = strings.TrimSpace(s)
		if utf8.RuneCountInString(s) > max {
			s = string([]rune(s)[:max])
		}
		return s
	}
	in.Name, in.Company, in.City, in.Event, in.Note = clean(in.Name, 120), clean(in.Company, 120), clean(in.City, 60), clean(in.Event, 80), clean(in.Note, 1000)
	// a field the administrator switched off is not accepted (a robot or an old page cannot fill it)
	if labelOn(hidden, "شرکت / فروشگاه") {
		in.Company = ""
	}
	if labelOn(hidden, "شهر") {
		in.City = ""
	}
	if labelOn(hidden, "نمایشگاه / محل ثبت") {
		in.Event = ""
	}
	if labelOn(hidden, "توضیحات و علاقه‌مندی") {
		in.Note = ""
	}
	if utf8.RuneCountInString(in.Name) < 2 {
		return nil, &leadErr{http.StatusBadRequest, "نام را وارد کنید."}
	}
	mobile, ok := sms.Mobile(in.Phone)
	if !ok {
		return nil, &leadErr{http.StatusBadRequest, "شمارهٔ موبایل درست نیست (۱۱ رقم، مثل ۰۹۱۲۳۴۵۶۷۸۹)."}
	}
	for label, key := range fieldLabels {
		if !labelOn(required, label) || key == "name" || key == "phone" {
			continue
		}
		val := map[string]string{"company": in.Company, "city": in.City, "event": in.Event, "note": in.Note}[key]
		if val == "" && !labelOn(hidden, label) {
			return nil, &leadErr{http.StatusBadRequest, "«" + label + "» را وارد کنید."}
		}
	}
	if n, o, dup := phoneOwner(ctx, mobile, ""); dup {
		return nil, &leadErr{http.StatusConflict, dupMessage(n, o)}
	}
	t := now()
	doc := jsonx.M{
		"id": "cu-" + randHex(8), "name": in.Name, "company": in.Company, "city": in.City, "phones": []string{mobile}, "email": "", "address": "",
		"status": "LEAD", "source": source, "tags": []string{}, "ownerId": owner.ID(), "ownerName": owner.Name(), "notes": "", "createdAt": t, "updatedAt": t,
	}
	var lines []string
	if in.Event != "" {
		lines = append(lines, "ثبت‌شده در: "+in.Event)
	}
	if in.Note != "" {
		lines = append(lines, in.Note)
	}
	if len(lines) > 0 {
		text := strings.Join(lines, "\n")
		doc["notes"] = text
		doc["noteLog"] = []jsonx.M{{"text": text, "at": t, "byId": owner.ID(), "byName": source}}
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, jsonx.Str(doc, "id"), owner.ID(), jsonx.Encode(doc)); err != nil {
		return nil, &leadErr{http.StatusInternalServerError, "ثبت نشد؛ دوباره امتحان کنید."}
	}
	queueSepidarCustomerNew(ctx, owner, jsonx.Str(doc, "id"), in.Name, doc)
	smsAutoCustomer("customer_new", doc, nil) // the welcome message (when the administrator switched it on)
	notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "مشتری جدید", Title: "مشتری «" + in.Name + "» از " + source + " ثبت شد", Ref: ref("customer", jsonx.Str(doc, "id"))}, "")
	return doc, nil
}

func userDoc(ctx context.Context, id string) (auth.User, bool) {
	var raw []byte
	if id == "" || store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, id).Scan(&raw) != nil {
		return auth.User{}, false
	}
	u := auth.User{M: jsonx.Decode(raw)}
	if jsonx.Str(u.M, "id") == "" {
		u.M["id"] = id
	}
	return u, jsonx.Str(u.M, "isActive") != "false" && !(u.M["isActive"] == false)
}

func has2FA(ctx context.Context, userID string) bool {
	var on bool
	return store.Pool.QueryRow(ctx, `SELECT enabled FROM user_2fa WHERE user_id = $1`, userID).Scan(&on) == nil && on
}

// fieldAllowed: the marketer page is for people who work with customers and whom the permission table did not switch it off for.
func fieldAllowed(ctx context.Context, me auth.User) bool {
	if !me.CanUseCrm() || jsonx.Contains(jsonx.Strings(me.M, "hiddenSub"), "crm.fieldRegister") {
		return false
	}
	// when the administrator chose people, only they (and the administrators) may use it; a person limited to this page is always one of them
	s := fieldSettings(ctx)
	if only := jsonx.Strings(s, "only"); jsonx.Contains(only, me.ID()) {
		return true
	}
	if list := jsonx.Strings(s, "allowed"); len(list) > 0 && !me.IsAdmin() {
		return jsonx.Contains(list, me.ID())
	}
	return true
}

var slugRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{2,29}$`)

// the words that are already addresses of the program
var reservedSlugs = map[string]bool{"admin": true, "api": true, "support": true, "lead": true, "login": true, "images": true, "assets": true, "static": true, "sw": true, "manifest": true, "favicon": true, "fonts": true}

func fieldSlug(ctx context.Context) string {
	if s := jsonx.Str(fieldSettings(ctx), "slug"); slugRe.MatchString(s) {
		return s
	}
	return "field"
}

// GET /api/public/field-slug?p=xyz: is /xyz the address of the quick-registration page? (the page asks this for an address it does not know)
func fieldSlugMatch(w http.ResponseWriter, r *http.Request) {
	p := strings.Trim(r.URL.Query().Get("p"), "/")
	httpx.JSON(w, http.StatusOK, map[string]bool{"match": p != "" && p == fieldSlug(r.Context())})
}

func formInfo(ctx context.Context) jsonx.M {
	hidden, required := fieldFormCfg(ctx)
	return jsonx.M{"hidden": hidden, "required": required, "company": companyName(ctx)}
}

// GET /api/field/info: for the signed-in marketer: may he use the page, what the form looks like, and whether a second step is still missing.
func fieldInfo(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	out := formInfo(ctx)
	out["allowed"] = fieldAllowed(ctx, me)
	out["name"] = me.Name()
	need2 := jsonx.Bool(fieldSettings(ctx), "require2fa")
	out["need2fa"] = need2 && !has2FA(ctx, me.ID())
	httpx.JSON(w, http.StatusOK, out)
}

// POST /api/field/customers {name, phone, company, city, event, note}
func fieldCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	if !fieldAllowed(ctx, me) {
		httpx.Forbidden(w)
		return
	}
	if jsonx.Bool(fieldSettings(ctx), "require2fa") && !has2FA(ctx, me.ID()) {
		httpx.Error(w, http.StatusForbidden, "مدیر خواسته برای این صفحه احراز هویت دو مرحله‌ای فعال باشد؛ آن را در پروفایل خود روشن کنید.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, e := createLeadCustomer(ctx, me, leadIn{jsonx.Str(body, "name"), jsonx.Str(body, "phone"), jsonx.Str(body, "company"), jsonx.Str(body, "city"), jsonx.Str(body, "event"), jsonx.Str(body, "note")}, "بازاریابی میدانی")
	if e != nil {
		httpx.Error(w, e.Status, e.Msg)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": jsonx.Str(doc, "id"), "name": jsonx.Str(doc, "name")})
}

// GET /api/field/settings (administrators): the switches of this page and the web site keys of everybody
func fieldGetSettings(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	s := fieldSettings(ctx)
	smsOn := false
	cfg := sms.Load(ctx)
	if cfg.Enabled {
		smsOn = jsonx.Contains(cfg.Auto, "customer_new")
	}
	keys := []jsonx.M{}
	q := `SELECT k.key, k.user_id, COALESCE(u.data->>'fullName', ''), k.created_at FROM site_lead_keys k LEFT JOIN users u ON u.id = k.user_id WHERE k.active ORDER BY k.created_at DESC LIMIT 200`
	args := []any{}
	if !me.IsAdmin() {
		q = `SELECT k.key, k.user_id, COALESCE(u.data->>'fullName', ''), k.created_at FROM site_lead_keys k LEFT JOIN users u ON u.id = k.user_id WHERE k.active AND k.user_id = $1 ORDER BY k.created_at DESC LIMIT 50`
		args = append(args, me.ID())
	}
	if rows, err := store.Pool.Query(ctx, q, args...); err == nil {
		for rows.Next() {
			var k, uid, name string
			var at time.Time
			if rows.Scan(&k, &uid, &name, &at) == nil {
				keys = append(keys, jsonx.M{"key": k, "userId": uid, "userName": name, "createdAt": at.Format(time.RFC3339)})
			}
		}
		rows.Close()
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"require2fa": jsonx.Bool(s, "require2fa"), "smsWelcome": smsOn, "smsEnabled": cfg.Enabled, "keys": keys, "isAdmin": me.IsAdmin(), "allowed": fieldAllowed(ctx, me), "slug": fieldSlug(ctx), "allowedUsers": jsonx.Strings(s, "allowed"), "onlyUsers": jsonx.Strings(s, "only")})
}

// PUT /api/field/settings {require2fa} (administrators)
func fieldPutSettings(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	s := fieldSettings(r.Context())
	if v, ok := body["require2fa"].(bool); ok {
		s["require2fa"] = v
	}
	if v, ok := body["slug"].(string); ok {
		v = strings.ToLower(strings.TrimSpace(strings.Trim(v, "/")))
		if !slugRe.MatchString(v) || reservedSlugs[v] {
			httpx.Error(w, http.StatusBadRequest, "آدرس باید ۳ تا ۳۰ نویسهٔ انگلیسی کوچک، عدد یا خط تیره باشد (و با یکی از آدرس‌های خود برنامه، مثل admin یا support، یکی نباشد).")
			return
		}
		s["slug"] = v
	}
	ids := func(key string) []string {
		out := []string{}
		for _, id := range jsonx.Strings(body, key) {
			if id != "" && len(id) <= 80 && !jsonx.Contains(out, id) {
				out = append(out, id)
			}
		}
		return out
	}
	if _, ok := body["allowedUsers"]; ok {
		s["allowed"] = ids("allowedUsers")
	}
	if _, ok := body["onlyUsers"]; ok {
		s["only"] = ids("onlyUsers")
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('fieldReg', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(s)); err != nil {
		internalError(w)
		return
	}
	auth.ResetFieldOnly()
	fieldGetSettings(w, r)
}

// POST /api/field/site-keys {userId?}: a new web site key (an administrator can make one for any marketer, a marketer only for himself)
func fieldNewKey(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	if !fieldAllowed(ctx, me) {
		httpx.Forbidden(w)
		return
	}
	body, _ := httpx.ReadBody(w, r)
	uid := me.ID()
	if want := jsonx.Str(body, "userId"); want != "" && want != uid {
		if !me.IsAdmin() {
			httpx.Forbidden(w)
			return
		}
		if u, ok := userDoc(ctx, want); !ok || !u.CanUseCrm() {
			httpx.Error(w, http.StatusBadRequest, "این شخص به بخش مشتریان دسترسی ندارد.")
			return
		}
		uid = want
	}
	var n int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM site_lead_keys WHERE user_id = $1 AND active`, uid).Scan(&n)
	if n >= 5 {
		httpx.Error(w, http.StatusBadRequest, "برای هر نفر حداکثر ۵ کلید فعال ممکن است؛ یکی را حذف کنید.")
		return
	}
	key := randHex(16)
	if _, err := store.Pool.Exec(ctx, `INSERT INTO site_lead_keys (key, user_id) VALUES ($1, $2)`, key, uid); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"key": key})
}

// DELETE /api/field/site-keys/{key}
func fieldDeleteKey(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	key := r.PathValue("key")
	q, args := `UPDATE site_lead_keys SET active = false WHERE key = $1 AND user_id = $2`, []any{key, me.ID()}
	if me.IsAdmin() {
		q, args = `UPDATE site_lead_keys SET active = false WHERE key = $1`, []any{key}
	}
	_, _ = store.Pool.Exec(r.Context(), q, args...)
	httpx.OK(w)
}

// ---- the public form for the company's web site (no sign-in; the key says whose customer the visitor becomes) ----

var (
	leadMu    sync.Mutex
	leadHits  = map[string][]time.Time{} // address -> times
	leadByKey = map[string][]time.Time{}
)

func leadLimited(ip, key string) bool {
	leadMu.Lock()
	defer leadMu.Unlock()
	now := time.Now()
	keep := func(m map[string][]time.Time, k string, window time.Duration) int {
		out := m[k][:0]
		for _, t := range m[k] {
			if now.Sub(t) < window {
				out = append(out, t)
			}
		}
		m[k] = out
		return len(out)
	}
	if keep(leadHits, ip, time.Hour) >= 12 || keep(leadByKey, key, 24*time.Hour) >= 300 {
		return true
	}
	leadHits[ip] = append(leadHits[ip], now)
	leadByKey[key] = append(leadByKey[key], now)
	return false
}

func leadOwner(ctx context.Context, key string) (auth.User, bool) {
	var uid string
	if len(key) != 32 || store.Pool.QueryRow(ctx, `SELECT user_id FROM site_lead_keys WHERE key = $1 AND active`, key).Scan(&uid) != nil {
		return auth.User{}, false
	}
	u, ok := userDoc(ctx, uid)
	if !ok || !u.CanUseCrm() {
		return auth.User{}, false
	}
	return u, true
}

// GET /api/public/lead/{key}: what the form of the web site looks like
func leadInfo(w http.ResponseWriter, r *http.Request) {
	if _, ok := leadOwner(r.Context(), r.PathValue("key")); !ok {
		httpx.Error(w, http.StatusNotFound, "این فرم فعال نیست.")
		return
	}
	if r.URL.Query().Get("form") == "full" {
		httpx.JSON(w, http.StatusOK, selfSpec(r.Context()))
		return
	}
	httpx.JSON(w, http.StatusOK, formInfo(r.Context()))
}

// POST /api/public/lead/{key} {name, phone, company, city, note, website}
func leadSubmit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	key := r.PathValue("key")
	owner, ok := leadOwner(ctx, key)
	if !ok {
		httpx.Error(w, http.StatusNotFound, "این فرم فعال نیست.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	if jsonx.Str(body, "form") == "full" { // the company's own full registration form
		leadSubmitFull(w, r, owner, key, body)
		return
	}
	// a robot fills every box, also the one a person never sees: it is told «done» and nothing is saved
	if jsonx.Str(body, "website") != "" {
		httpx.OK(w)
		return
	}
	if leadLimited(httpx.ClientIP(r), key) {
		httpx.Error(w, http.StatusTooManyRequests, "درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.")
		return
	}
	_, e := createLeadCustomer(ctx, owner, leadIn{Name: jsonx.Str(body, "name"), Phone: jsonx.Str(body, "phone"), Company: jsonx.Str(body, "company"), City: jsonx.Str(body, "city"), Note: jsonx.Str(body, "note")}, "سایت")
	if e != nil {
		if e.Status == http.StatusConflict {
			// the visitor is not told whose customer that number is; the number is already known to the company
			httpx.OK(w)
			return
		}
		httpx.Error(w, e.Status, e.Msg)
		return
	}
	httpx.OK(w)
}

// GET /api/public/logo: the company's logo («نام و هویت سازمان») for the public pages; 404 when there is none.
func publicLogo(w http.ResponseWriter, r *http.Request) {
	var raw []byte
	_ = store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	u := strings.TrimSpace(jsonx.Str(jsonx.Decode(raw), "companyLogoUrl"))
	const marker = ";base64,"
	if strings.HasPrefix(u, "data:image/") {
		i := strings.Index(u, marker)
		if i < 0 {
			http.NotFound(w, r)
			return
		}
		data, err := base64.StdEncoding.DecodeString(u[i+len(marker):])
		if err != nil || len(data) == 0 || len(data) > 8<<20 {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", u[len("data:"):i])
		w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "public, max-age=300")
		_, _ = w.Write(data)
		return
	}
	// an address inside the program (an uploaded file) is passed on; anything else is not followed
	if strings.HasPrefix(u, "/") && !strings.HasPrefix(u, "//") {
		http.Redirect(w, r, u, http.StatusFound)
		return
	}
	http.NotFound(w, r)
}

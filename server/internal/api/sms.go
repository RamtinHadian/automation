package api

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/sms"
	"automation/server/internal/store"
)

// smsStatus tells the page whether it may offer «send SMS» (the panel is set up and switched on).
func smsStatus(w http.ResponseWriter, r *http.Request) {
	c := sms.Load(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": c.Enabled && c.Provider != "" && c.APIKey != "", "canSend": auth.Current(r).CanUseCrm() && auth.Current(r).CanSendSms(), "library": c.Library, "custom": []sms.Custom{}})
}

func smsGetSettings(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	httpx.JSON(w, http.StatusOK, smsMasked(r.Context()))
}

// smsMasked is the saved settings without the key, plus the footer that is used while none is written (the company's name).
func smsMasked(ctx context.Context) map[string]any {
	m := sms.Load(ctx).Masked()
	m["defaultFooter"] = companyName(ctx)
	return m
}

func smsPutSettings(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	c := sms.Config{
		Provider: "kavenegar",
		APIKey:   strings.TrimSpace(jsonx.Str(body, "apiKey")),
		Sender:   strings.TrimSpace(jsonx.Str(body, "sender")),
		Enabled:  jsonx.Bool(body, "enabled"),
		Labels:   jsonx.Strings(body, "labels"),
		Footer:   strings.TrimSpace(jsonx.Str(body, "footer")),
		Auto:     validAuto(jsonx.Strings(body, "auto")),
		Library:  validLibrary(body["library"]),
		Custom:   []sms.Custom{},
	}
	if len([]rune(c.Footer)) > 100 {
		httpx.Error(w, http.StatusBadRequest, "متن پایان پیامک باید کوتاه باشد (حداکثر ۱۰۰ نویسه).")
		return
	}
	if err := sms.Save(r.Context(), c); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, smsMasked(r.Context()))
}

func smsBalance(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	text, err := sms.Balance(r.Context(), sms.Load(r.Context()))
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"balance": text})
}

func smsLog(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT created_at, COALESCE((SELECT data->>'fullName' FROM users WHERE id = sms_log.sent_by), sent_by), to_num, text, status, detail FROM sms_log ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var at time.Time
		var by, to, text, st, detail string
		if rows.Scan(&at, &by, &to, &text, &st, &detail) == nil {
			out = append(out, jsonx.M{"at": at.UTC().Format("2006-01-02T15:04:05.000Z"), "by": by, "to": to, "text": text, "status": st, "detail": detail})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"log": out})
}

// smsTest lets an admin check the panel by sending one message.
func smsTest(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	if _, err := sms.SendTemplateAndLog(r.Context(), me.ID(), jsonx.Str(body, "to"), "customer_new", map[string]string{"name": "آزمایش", "company": companyName(r.Context())}); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.OK(w)
}

// allowedTemplate says whether staff may send this ready-made text: it exists, is not an automatic message and is among the
// texts the admin switched on (the four originals while nothing was chosen).
func allowedTemplate(c sms.Config, key string) bool {
	t, ok := sms.KVFind(key)
	if !ok || t.Auto {
		return false
	}
	list := c.Library
	if list == nil {
		list = sms.DefaultLibrary
	}
	return jsonx.Contains(list, key)
}

// customerMobile is the mobile number to write to: the asked one when it is a number of the customer, else the first mobile.
func customerMobile(cust jsonx.M, want string) string {
	first := ""
	wm, _ := sms.Mobile(want)
	if arr, ok := cust["phones"].([]any); ok {
		for _, p := range arr {
			if s, ok := p.(string); ok {
				if m, ok := sms.Mobile(s); ok {
					if wm != "" && m == wm {
						return m
					}
					if first == "" {
						first = m
					}
				}
			}
		}
	}
	if wm != "" {
		return ""
	}
	return first
}

// smsSend sends a ready-made text (a Kavenegar template) to a customer from the CRM. At most 40 per person per hour.
func smsSend(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() || !me.CanSendSms() {
		httpx.Error(w, http.StatusForbidden, "اجازهٔ ارسال پیامک برای شما فعال نشده است؛ از مدیر بخواهید در کنسول مدیریت به شما اجازه بدهد.")
		return
	}
	c := sms.Load(r.Context())
	if !c.Enabled || c.Provider == "" || c.APIKey == "" {
		httpx.Error(w, http.StatusServiceUnavailable, "ارسال پیامک در سامانه فعال نشده است؛ از مدیر بخواهید پنل پیامک را تنظیم کند.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	key := jsonx.Str(body, "templateKey")
	if !allowedTemplate(c, key) {
		httpx.Error(w, http.StatusBadRequest, "این قالب پیامک برای ارسال فعال نیست؛ یکی از قالب‌های آماده را انتخاب کنید.")
		return
	}
	var sent int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM sms_log WHERE sent_by = $1 AND created_at > now() - interval '1 hour'`, me.ID()).Scan(&sent)
	if sent >= 40 {
		httpx.Error(w, http.StatusTooManyRequests, "سقف ارسال پیامک در هر ساعت پر شده است.")
		return
	}
	cust := jsonx.Str(body, "customerId")
	var raw []byte
	var owner, ownerName string
	if cust == "" || store.Pool.QueryRow(r.Context(), `SELECT data, COALESCE(owner_id, ''), COALESCE(data->>'ownerName', '') FROM crm_customers WHERE id = $1`, cust).Scan(&raw, &owner, &ownerName) != nil {
		httpx.Error(w, http.StatusBadRequest, "مشتری پیدا نشد.")
		return
	}
	doc0 := jsonx.Decode(raw)
	to := customerMobile(doc0, jsonx.Str(body, "to"))
	if to == "" {
		httpx.Error(w, http.StatusBadRequest, "این مشتری شمارهٔ موبایل معتبر ندارد.")
		return
	}
	text, err := sms.SendTemplateAndLog(r.Context(), me.ID(), to, key, map[string]string{"name": jsonx.Str(doc0, "name"), "company": companyName(r.Context())})
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	id := "sms-" + time.Now().Format("20060102150405.000000")
	doc := jsonx.M{"id": id, "customerId": cust, "type": "NOTE", "text": "پیامک ارسال شد: " + text, "ownerId": owner, "ownerName": ownerName,
		"authorId": me.ID(), "authorName": me.Name(), "createdAt": now()}
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`, id, cust, owner, jsonx.Encode(doc))
	httpx.OK(w)
}

// validAuto keeps only the kinds of automatic messages that exist.
func validAuto(in []string) []string {
	out := []string{}
	for _, k := range in {
		for _, t := range sms.Templates {
			if t.Key == k && !jsonx.Contains(out, k) {
				out = append(out, k)
			}
		}
	}
	return out
}

// GET /api/sms/templates (admins): the automatic messages to customers with a sample of their text, for the «مشاهده» buttons.
func smsTemplates(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	out := []map[string]string{}
	for _, t := range sms.Templates {
		out = append(out, map[string]string{"key": t.Key, "title": t.Title, "when": t.When, "sample": sms.SampleText(t)})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"templates": out})
}

// smsAutoCustomer sends an automatic message to a customer (a stored customer document) without making the caller wait.
func smsAutoCustomer(event string, cust jsonx.M, extra map[string]string) {
	vars := map[string]string{"name": jsonx.Str(cust, "name")}
	for k, v := range extra {
		vars[k] = v
	}
	phones := []string{}
	if arr, ok := cust["phones"].([]any); ok {
		for _, p := range arr {
			if s, ok := p.(string); ok {
				phones = append(phones, s)
			}
		}
	}
	sms.AutoBackground(event, phones, vars)
}

// smsAutoCustomerID is the same for a customer that is known by its id.
func smsAutoCustomerID(event, customerID string, extra map[string]string) {
	if customerID == "" {
		return
	}
	var raw []byte
	if store.Pool.QueryRow(context.Background(), `SELECT data FROM crm_customers WHERE id = $1`, customerID).Scan(&raw) != nil {
		return
	}
	smsAutoCustomer(event, jsonx.Decode(raw), extra)
}

var libKey = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

// validLibrary keeps the chosen ready-made text keys (nil when the admin has not chosen yet).
func validLibrary(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := []string{}
	for _, x := range arr {
		if s, ok := x.(string); ok && libKey.MatchString(s) && !jsonx.Contains(out, s) && len(out) < 120 {
			out = append(out, s)
		}
	}
	return out
}

// validCustom keeps the company's own texts (at most 40, a title of 40 and a text of 500 characters).
func validCustom(v any) []sms.Custom {
	arr, _ := v.([]any)
	out := []sms.Custom{}
	for _, x := range arr {
		m, _ := x.(map[string]any)
		title := strings.TrimSpace(jsonx.Str(m, "title"))
		text := strings.TrimSpace(jsonx.Str(m, "text"))
		id := strings.TrimSpace(jsonx.Str(m, "id"))
		if title == "" || text == "" || len(out) >= 40 {
			continue
		}
		if !libKey.MatchString(id) {
			id = "c-" + strconv.Itoa(len(out)+1)
		}
		out = append(out, sms.Custom{ID: id, Title: clean(title, 40), Text: clean(text, 500)})
	}
	return out
}

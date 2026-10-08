package api

import (
	"context"
	"net/http"
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
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": c.Enabled && c.Provider != "" && c.APIKey != ""})
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
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if text == "" {
		text = "هورمند: این یک پیامک آزمایشی است."
	}
	if err := sms.SendAndLog(r.Context(), me.ID(), []string{jsonx.Str(body, "to")}, text); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.OK(w)
}

// smsSend sends a message to a customer (or a number) from the CRM. At most 40 per person per hour.
func smsSend(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
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
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if text == "" || len([]rune(text)) > 700 {
		httpx.Error(w, http.StatusBadRequest, "متن پیامک خالی یا بیش از حد طولانی است.")
		return
	}
	var sent int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM sms_log WHERE sent_by = $1 AND created_at > now() - interval '1 hour'`, me.ID()).Scan(&sent)
	if sent >= 40 {
		httpx.Error(w, http.StatusTooManyRequests, "سقف ارسال پیامک در هر ساعت پر شده است.")
		return
	}
	to := jsonx.Str(body, "to")
	cust := jsonx.Str(body, "customerId")
	if err := sms.SendAndLog(r.Context(), me.ID(), []string{to}, text); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	if cust != "" {
		var owner, ownerName string
		if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), COALESCE(data->>'ownerName', '') FROM crm_customers WHERE id = $1`, cust).Scan(&owner, &ownerName) == nil {
			id := "sms-" + time.Now().Format("20060102150405.000000")
			doc := jsonx.M{"id": id, "customerId": cust, "type": "NOTE", "text": "پیامک ارسال شد: " + text, "ownerId": owner, "ownerName": ownerName,
				"authorId": me.ID(), "authorName": me.Name(), "createdAt": now()}
			_, _ = store.Pool.Exec(r.Context(), `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`, id, cust, owner, jsonx.Encode(doc))
		}
	}
	httpx.OK(w)
}

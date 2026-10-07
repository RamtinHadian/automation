// Package sms sends text messages through an SMS panel (sms.ir or Kavenegar).
//
// The panel's API key is a secret: it lives in its own row of the settings table (key "sms"), is only readable by the server
// and is never sent to the browser (admins only see the last four characters).
package sms

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Config is what an admin sets up in the panel.
type Config struct {
	Provider string   `json:"provider"` // "smsir" | "kavenegar" | ""
	APIKey   string   `json:"apiKey"`
	Sender   string   `json:"sender"` // line number
	Enabled  bool     `json:"enabled"`
	Labels   []string `json:"labels"` // notification labels that are also sent as SMS to people who have a mobile number
}

// Base URLs (variables so tests can point them at a fake server).
var (
	smsirBase     = "https://api.sms.ir/v1"
	kavenegarBase = "https://api.kavenegar.com/v1"
	client        = &http.Client{Timeout: 12 * time.Second}
)

const settingsKey = "sms"

func init() { // only for tests against a fake panel
	if v := os.Getenv("SMSIR_BASE"); v != "" {
		smsirBase = v
	}
	if v := os.Getenv("KAVENEGAR_BASE"); v != "" {
		kavenegarBase = v
	}
}

var (
	cacheMu  sync.Mutex
	cached   Config
	cachedAt time.Time
)

// Load reads the saved configuration (cached for a few seconds).
func Load(ctx context.Context) Config {
	cacheMu.Lock()
	defer cacheMu.Unlock()
	if time.Since(cachedAt) < 5*time.Second {
		return cached
	}
	var raw []byte
	c := Config{}
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = $1`, settingsKey).Scan(&raw); err == nil {
		_ = json.Unmarshal(raw, &c)
	}
	cached, cachedAt = c, time.Now()
	return c
}

// Save stores the configuration; an empty API key keeps the old one.
func Save(ctx context.Context, c Config) error {
	if c.APIKey == "" {
		c.APIKey = Load(ctx).APIKey
	}
	b, _ := json.Marshal(c)
	_, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET data = $2::jsonb`, settingsKey, string(b))
	cacheMu.Lock()
	cachedAt = time.Time{}
	cacheMu.Unlock()
	return err
}

// Masked is the configuration as admins see it: the key is reduced to its last four characters.
func (c Config) Masked() map[string]any {
	tail := ""
	if len(c.APIKey) > 4 {
		tail = c.APIKey[len(c.APIKey)-4:]
	}
	return map[string]any{"provider": c.Provider, "sender": c.Sender, "enabled": c.Enabled, "labels": append([]string{}, c.Labels...), "hasKey": c.APIKey != "", "keyTail": tail}
}

var nonDigit = regexp.MustCompile(`\D`)

// Mobile turns what a person typed into an Iranian mobile number 09xxxxxxxxx (Persian digits, +98, spaces and dashes are accepted).
func Mobile(s string) (string, bool) {
	r := strings.NewReplacer("۰", "0", "۱", "1", "۲", "2", "۳", "3", "۴", "4", "۵", "5", "۶", "6", "۷", "7", "۸", "8", "۹", "9", "٠", "0", "١", "1", "٢", "2", "٣", "3", "٤", "4", "٥", "5", "٦", "6", "٧", "7", "٨", "8", "٩", "9")
	d := nonDigit.ReplaceAllString(r.Replace(s), "")
	switch {
	case strings.HasPrefix(d, "0098"):
		d = "0" + d[4:]
	case strings.HasPrefix(d, "98") && len(d) == 12:
		d = "0" + d[2:]
	case len(d) == 10 && strings.HasPrefix(d, "9"):
		d = "0" + d
	}
	if len(d) == 11 && strings.HasPrefix(d, "09") {
		return d, true
	}
	return "", false
}

func post(ctx context.Context, rawURL string, headers map[string]string, body any) ([]byte, int, error) {
	var rd io.Reader
	method := http.MethodGet
	if body != nil {
		b, _ := json.Marshal(body)
		rd, method = bytes.NewReader(b), http.MethodPost
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, rd)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, errors.New("اتصال به پنل پیامک برقرار نشد: " + err.Error())
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return b, resp.StatusCode, nil
}

// Send sends one text to one or more mobile numbers and returns the panel's message ids.
func Send(ctx context.Context, c Config, to []string, text string) ([]string, error) {
	if c.Provider == "" || c.APIKey == "" {
		return nil, errors.New("پنل پیامک هنوز تنظیم نشده است.")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("متن پیامک خالی است.")
	}
	var mobiles []string
	for _, t := range to {
		m, ok := Mobile(t)
		if !ok {
			return nil, fmt.Errorf("شمارهٔ موبایل معتبر نیست: %s", t)
		}
		mobiles = append(mobiles, m)
	}
	if len(mobiles) == 0 {
		return nil, errors.New("گیرنده‌ای انتخاب نشده است.")
	}
	switch c.Provider {
	case "smsir":
		return sendSmsIr(ctx, c, mobiles, text)
	case "kavenegar":
		return sendKavenegar(ctx, c, mobiles, text)
	}
	return nil, errors.New("سرویس‌دهندهٔ پیامک ناشناخته است.")
}

func sendSmsIr(ctx context.Context, c Config, mobiles []string, text string) ([]string, error) {
	nums := make([]string, len(mobiles))
	for i, m := range mobiles {
		nums[i] = m[1:] // sms.ir wants 9xxxxxxxxx
	}
	body := map[string]any{"messageText": text, "mobiles": nums}
	if c.Sender != "" {
		// sms.ir wants the line number as a NUMBER ("lineNumber": 30007732...), not as text
		line, perr := strconv.ParseInt(strings.TrimSpace(c.Sender), 10, 64)
		if perr != nil {
			return nil, errors.New("شمارهٔ خط ارسال‌کننده برای sms.ir باید فقط عدد باشد (همان شمارهٔ خط در پنل sms.ir، بدون فاصله و حروف).")
		}
		body["lineNumber"] = line
	}
	b, status, err := post(ctx, smsirBase+"/send/bulk", map[string]string{"X-API-KEY": c.APIKey}, body)
	if err != nil {
		return nil, err
	}
	var r struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
		Data    struct {
			MessageIDs []json.Number `json:"messageIds"`
		} `json:"data"`
	}
	_ = json.Unmarshal(b, &r)
	if status == 401 || status == 403 {
		return nil, errors.New("کلید API پنل sms.ir پذیرفته نشد.")
	}
	if status != 200 || r.Status != 1 {
		msg := r.Message
		if msg == "" {
			msg = fmt.Sprintf("پاسخ نامعتبر (%d)", status)
		}
		return nil, errors.New("sms.ir: " + msg)
	}
	ids := []string{}
	for _, id := range r.Data.MessageIDs {
		ids = append(ids, id.String())
	}
	return ids, nil
}

func sendKavenegar(ctx context.Context, c Config, mobiles []string, text string) ([]string, error) {
	q := url.Values{"receptor": {strings.Join(mobiles, ",")}, "message": {text}}
	if c.Sender != "" {
		q.Set("sender", c.Sender)
	}
	b, status, err := post(ctx, kavenegarBase+"/"+url.PathEscape(c.APIKey)+"/sms/send.json?"+q.Encode(), nil, nil)
	if err != nil {
		return nil, err
	}
	var r struct {
		Return struct {
			Status  int    `json:"status"`
			Message string `json:"message"`
		} `json:"return"`
		Entries []struct {
			MessageID json.Number `json:"messageid"`
		} `json:"entries"`
	}
	_ = json.Unmarshal(b, &r)
	if r.Return.Status != 200 {
		msg := r.Return.Message
		if msg == "" {
			msg = fmt.Sprintf("پاسخ نامعتبر (%d)", status)
		}
		return nil, errors.New("کاوه‌نگار: " + msg)
	}
	ids := []string{}
	for _, e := range r.Entries {
		ids = append(ids, e.MessageID.String())
	}
	return ids, nil
}

// Balance asks the panel how much credit is left (a short text in the panel's own unit).
func Balance(ctx context.Context, c Config) (string, error) {
	if c.Provider == "" || c.APIKey == "" {
		return "", errors.New("پنل پیامک هنوز تنظیم نشده است.")
	}
	switch c.Provider {
	case "smsir":
		b, status, err := post(ctx, smsirBase+"/credit", map[string]string{"X-API-KEY": c.APIKey}, nil)
		if err != nil {
			return "", err
		}
		var r struct {
			Status  int     `json:"status"`
			Message string  `json:"message"`
			Data    float64 `json:"data"`
		}
		_ = json.Unmarshal(b, &r)
		if status == 401 || status == 403 {
			return "", errors.New("کلید API پنل sms.ir پذیرفته نشد.")
		}
		if status != 200 || r.Status != 1 {
			return "", errors.New("sms.ir: " + r.Message)
		}
		return fmt.Sprintf("%.0f پیامک", r.Data), nil
	case "kavenegar":
		b, _, err := post(ctx, kavenegarBase+"/"+url.PathEscape(c.APIKey)+"/account/info.json", nil, nil)
		if err != nil {
			return "", err
		}
		var r struct {
			Return struct {
				Status  int    `json:"status"`
				Message string `json:"message"`
			} `json:"return"`
			Entries struct {
				RemainCredit float64 `json:"remaincredit"`
			} `json:"entries"`
		}
		_ = json.Unmarshal(b, &r)
		if r.Return.Status != 200 {
			return "", errors.New("کاوه‌نگار: " + r.Return.Message)
		}
		return fmt.Sprintf("%.0f ریال", r.Entries.RemainCredit), nil
	}
	return "", errors.New("سرویس‌دهندهٔ پیامک ناشناخته است.")
}

// Log keeps a line for every message the app sent (or tried to send).
func Log(ctx context.Context, by, to, text, status, detail string) {
	_, _ = store.Pool.Exec(ctx, `INSERT INTO sms_log (id, sent_by, to_num, text, status, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
		fmt.Sprintf("sms-%d", time.Now().UnixNano()), by, to, text, status, detail)
}

// SendAndLog is Send plus a log line; it returns the error message in Persian if the panel refused.
func SendAndLog(ctx context.Context, by string, to []string, text string) error {
	c := Load(ctx)
	_, err := Send(ctx, c, to, text)
	st, detail := "ok", ""
	if err != nil {
		st, detail = "failed", err.Error()
	}
	for _, t := range to {
		Log(ctx, by, t, text, st, detail)
	}
	return err
}

// ForNotification sends a notification as an SMS when the admin switched SMS on for this kind of notification and
// the person has a mobile number. Never blocks the caller for long (runs in its own goroutine).
func ForNotification(userID, label, title, body string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		c := Load(ctx)
		if !c.Enabled || c.Provider == "" || c.APIKey == "" {
			return
		}
		match := false
		for _, l := range c.Labels {
			if l == label {
				match = true
			}
		}
		if !match {
			return
		}
		var raw []byte
		if store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, userID).Scan(&raw) != nil {
			return
		}
		mobile, ok := Mobile(jsonx.Str(jsonx.Decode(raw), "mobile"))
		if !ok {
			return
		}
		text := "هورمند: " + title
		if body != "" {
			if r := []rune(body); len(r) > 60 {
				body = string(r[:60]) + "…"
			}
			text += "\n" + body
		}
		_ = SendAndLog(ctx, "system", []string{mobile}, text)
	}()
}

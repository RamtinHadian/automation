// Package msgr sends files and messages through the Telegram and Bale bot APIs (Bale's API copies Telegram's), and listens for
// people who press «Start» in the bot so a customer can be linked to his chat.
//
// Bot tokens are secrets: they live in their own settings row (key "msgr"), never go to the browser (admins see the last four
// characters only). Telegram is filtered in Iran, so an optional proxy (http or socks5) can be set for the server's calls.
package msgr

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

type Bot struct {
	Enabled  bool   `json:"enabled"`
	Token    string `json:"token"`
	Username string `json:"username"` // filled in after a successful check
}

type Config struct {
	Telegram Bot    `json:"telegram"`
	Bale     Bot    `json:"bale"`
	Proxy    string `json:"proxy"` // e.g. socks5://127.0.0.1:1080 or http://host:3128 (used for Telegram only)
}

var bases = map[string]string{
	"telegram": "https://api.telegram.org",
	"bale":     "https://tapi.bale.ai",
}

func init() { // only for tests against a fake bot server
	if v := os.Getenv("TELEGRAM_BASE"); v != "" {
		bases["telegram"] = v
	}
	if v := os.Getenv("BALE_BASE"); v != "" {
		bases["bale"] = v
	}
}

const settingsKey = "msgr"

var (
	mu       sync.Mutex
	cached   Config
	cachedAt time.Time
)

func Load(ctx context.Context) Config {
	mu.Lock()
	defer mu.Unlock()
	if time.Since(cachedAt) < 5*time.Second {
		return cached
	}
	c := Config{}
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = $1`, settingsKey).Scan(&raw); err == nil {
		_ = json.Unmarshal(raw, &c)
	}
	cached, cachedAt = c, time.Now()
	return c
}

// Save keeps old tokens when the new ones are empty.
func Save(ctx context.Context, c Config) error {
	old := Load(ctx)
	if c.Telegram.Token == "" {
		c.Telegram.Token, c.Telegram.Username = old.Telegram.Token, old.Telegram.Username
	}
	if c.Bale.Token == "" {
		c.Bale.Token, c.Bale.Username = old.Bale.Token, old.Bale.Username
	}
	return write(ctx, c)
}

func write(ctx context.Context, c Config) error {
	b, _ := json.Marshal(c)
	_, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET data = $2::jsonb`, settingsKey, string(b))
	mu.Lock()
	cachedAt = time.Time{}
	mu.Unlock()
	return err
}

func tail(s string) string {
	if len(s) > 4 {
		return s[len(s)-4:]
	}
	return ""
}

// Masked is the configuration as admins see it.
func (c Config) Masked() map[string]any {
	bot := func(b Bot) map[string]any {
		return map[string]any{"enabled": b.Enabled, "hasToken": b.Token != "", "tokenTail": tail(b.Token), "username": b.Username}
	}
	return map[string]any{"telegram": bot(c.Telegram), "bale": bot(c.Bale), "proxy": c.Proxy}
}

func (c Config) bot(channel string) (Bot, bool) {
	switch channel {
	case "telegram":
		return c.Telegram, c.Telegram.Enabled && c.Telegram.Token != ""
	case "bale":
		return c.Bale, c.Bale.Enabled && c.Bale.Token != ""
	}
	return Bot{}, false
}

func httpClient(c Config, channel string, timeout time.Duration) *http.Client {
	tr := &http.Transport{}
	if channel == "telegram" && c.Proxy != "" {
		if u, err := url.Parse(c.Proxy); err == nil {
			tr.Proxy = http.ProxyURL(u)
		}
	}
	return &http.Client{Timeout: timeout, Transport: tr}
}

type apiResp struct {
	OK          bool            `json:"ok"`
	Description string          `json:"description"`
	Result      json.RawMessage `json:"result"`
}

func call(ctx context.Context, c Config, channel, method string, body io.Reader, contentType string, timeout time.Duration) (apiResp, error) {
	b, ok := c.bot(channel)
	if !ok {
		return apiResp{}, errors.New("این پیام‌رسان در تنظیمات فعال نشده است.")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, bases[channel]+"/bot"+b.Token+"/"+method, body)
	if err != nil {
		return apiResp{}, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	resp, err := httpClient(c, channel, timeout).Do(req)
	if err != nil {
		hint := ""
		if channel == "telegram" && c.Proxy == "" {
			hint = " (تلگرام در ایران فیلتر است؛ برای سرور یک پروکسی در تنظیمات بگذارید)"
		}
		return apiResp{}, errors.New("اتصال به سرور " + map[string]string{"telegram": "تلگرام", "bale": "بله"}[channel] + " برقرار نشد" + hint)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	var r apiResp
	_ = json.Unmarshal(raw, &r)
	if !r.OK {
		d := r.Description
		if d == "" {
			d = fmt.Sprintf("پاسخ نامعتبر (%d)", resp.StatusCode)
		}
		return r, errors.New(map[string]string{"telegram": "تلگرام", "bale": "بله"}[channel] + ": " + d)
	}
	return r, nil
}

// Check asks the bot who it is (also proves that the token and the proxy work) and remembers its username.
func Check(ctx context.Context, channel string) (string, error) {
	c := Load(ctx)
	r, err := call(ctx, c, channel, "getMe", nil, "", 15*time.Second)
	if err != nil {
		return "", err
	}
	var me struct {
		Username string `json:"username"`
	}
	_ = json.Unmarshal(r.Result, &me)
	if channel == "telegram" {
		c.Telegram.Username = me.Username
	} else {
		c.Bale.Username = me.Username
	}
	_ = write(ctx, c)
	return me.Username, nil
}

// SendText sends a plain message.
func SendText(ctx context.Context, channel, chatID, text string) error {
	form := url.Values{"chat_id": {chatID}, "text": {text}}
	_, err := call(ctx, Load(ctx), channel, "sendMessage", strings.NewReader(form.Encode()), "application/x-www-form-urlencoded", 20*time.Second)
	return err
}

// SendFile sends a file (a PDF proforma) with a caption.
func SendFile(ctx context.Context, channel, chatID, caption, filename string, data []byte) error {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("chat_id", chatID)
	if caption != "" {
		_ = w.WriteField("caption", caption)
	}
	fw, _ := w.CreateFormFile("document", filename)
	_, _ = fw.Write(data)
	_ = w.Close()
	_, err := call(ctx, Load(ctx), channel, "sendDocument", &buf, w.FormDataContentType(), 60*time.Second)
	return err
}

func chatField(channel string) string {
	if channel == "bale" {
		return "baleChatId"
	}
	return "telegramChatId"
}

// ---------- listening for «Start» ----------

// Run polls the enabled bots. A person who opens the bot with the link from the customer card (/start cust_<id>) is linked to
// that customer; anybody else who writes to the bot is told his chat id (so it can be typed in by hand).
func Run(ctx context.Context) {
	for _, ch := range []string{"telegram", "bale"} {
		go poll(ctx, ch)
	}
}

func poll(ctx context.Context, channel string) {
	offset := int64(0)
	for ctx.Err() == nil {
		c := Load(ctx)
		if _, ok := c.bot(channel); !ok {
			select {
			case <-ctx.Done():
				return
			case <-time.After(15 * time.Second):
			}
			continue
		}
		form := url.Values{"timeout": {"20"}, "offset": {fmt.Sprint(offset)}}
		r, err := call(ctx, c, channel, "getUpdates", strings.NewReader(form.Encode()), "application/x-www-form-urlencoded", 40*time.Second)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(20 * time.Second):
			}
			continue
		}
		var ups []struct {
			ID      int64 `json:"update_id"`
			Message *struct {
				Text string `json:"text"`
				Chat struct {
					ID int64 `json:"id"`
				} `json:"chat"`
				From struct {
					FirstName string `json:"first_name"`
				} `json:"from"`
			} `json:"message"`
		}
		_ = json.Unmarshal(r.Result, &ups)
		for _, u := range ups {
			if u.ID >= offset {
				offset = u.ID + 1
			}
			if u.Message != nil && u.Message.Chat.ID != 0 {
				handle(ctx, channel, fmt.Sprint(u.Message.Chat.ID), u.Message.Text, u.Message.From.FirstName)
			}
		}
		if len(ups) == 0 {
			time.Sleep(500 * time.Millisecond)
		}
	}
}

func handle(ctx context.Context, channel, chatID, text, first string) {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "/start cust_") {
		cid := strings.TrimPrefix(text, "/start cust_")
		var name, owner string
		err := store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name', ''), COALESCE(owner_id, '') FROM crm_customers WHERE id = $1`, cid).Scan(&name, &owner)
		if err == nil {
			_, _ = store.Pool.Exec(ctx, `UPDATE crm_customers SET data = data || jsonb_build_object($2::text, $3::text) WHERE id = $1`, cid, chatField(channel), chatID)
			_ = SendText(ctx, channel, chatID, "سلام "+name+"؛ اتصال شما برقرار شد. پیش‌فاکتورها و پیام‌های شرکت از همین‌جا برایتان می‌آید.")
			if owner != "" {
				notify.Notify(ctx, []string{owner}, notify.Note{Kind: "task", Label: "اتصال به ربات", Title: "مشتری «" + name + "» به ربات " + map[string]string{"telegram": "تلگرام", "bale": "بله"}[channel] + " وصل شد",
					Ref: jsonx.M{"type": "customer", "id": cid}, Repeat: true}, "")
			}
			return
		}
	}
	_ = SendText(ctx, channel, chatID, "سلام "+first+"؛ شناسهٔ گفتگوی شما: "+chatID+"\nاین عدد را به شرکت بدهید تا فایل‌ها را برایتان بفرستد.")
}

// Link is the address that connects a customer to the bot when he opens it.
func Link(c Config, channel, customerID string) string {
	b, ok := c.bot(channel)
	if !ok || b.Username == "" {
		return ""
	}
	host := "t.me"
	if channel == "bale" {
		host = "ble.ir"
	}
	return "https://" + host + "/" + b.Username + "?start=cust_" + customerID
}

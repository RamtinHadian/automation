package api

import (
	"io"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/msgr"
	"automation/server/internal/store"
)

func msgrStatus(w http.ResponseWriter, r *http.Request) {
	c := msgr.Load(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{
		"telegram": c.Telegram.Enabled && c.Telegram.Token != "",
		"bale":     c.Bale.Enabled && c.Bale.Token != "",
	})
}

func msgrGetSettings(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	httpx.JSON(w, http.StatusOK, msgr.Load(r.Context()).Masked())
}

func msgrPutSettings(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	proxy := strings.TrimSpace(jsonx.Str(body, "proxy"))
	if proxy != "" && !(strings.HasPrefix(proxy, "http://") || strings.HasPrefix(proxy, "https://") || strings.HasPrefix(proxy, "socks5://")) {
		httpx.Error(w, http.StatusBadRequest, "آدرس پروکسی باید با http یا https یا socks5 شروع شود.")
		return
	}
	tg, bl := jsonx.Sub(body, "telegram"), jsonx.Sub(body, "bale")
	c := msgr.Config{
		Telegram: msgr.Bot{Enabled: jsonx.Bool(tg, "enabled"), Token: strings.TrimSpace(jsonx.Str(tg, "token"))},
		Bale:     msgr.Bot{Enabled: jsonx.Bool(bl, "enabled"), Token: strings.TrimSpace(jsonx.Str(bl, "token"))},
		Proxy:    proxy,
	}
	if err := msgr.Save(r.Context(), c); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, msgr.Load(r.Context()).Masked())
}

// msgrCheck proves that the token (and proxy) work and learns the bot's username; with a chatId it also sends a test message.
func msgrCheck(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ch := jsonx.Str(body, "channel")
	if ch != "telegram" && ch != "bale" {
		httpx.Error(w, http.StatusBadRequest, "پیام‌رسان نامعتبر است.")
		return
	}
	user, err := msgr.Check(r.Context(), ch)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	if to := strings.TrimSpace(jsonx.Str(body, "chatId")); to != "" {
		if err := msgr.SendText(r.Context(), ch, to, "هورمند: این یک پیام آزمایشی است."); err != nil {
			httpx.Error(w, http.StatusBadGateway, err.Error())
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"username": user})
}

// msgrLink gives the address a customer opens to connect himself to the bot of the chosen messenger.
func msgrLink(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	q := r.URL.Query()
	httpx.JSON(w, http.StatusOK, map[string]any{"link": msgr.Link(msgr.Load(r.Context()), q.Get("channel"), q.Get("customer"))})
}

// msgrSendFile sends an uploaded file (the proforma PDF) to a customer's chat. Form fields: channel, chatId or customerId, caption, file.
func msgrSendFile(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 12<<20)
	if err := r.ParseMultipartForm(12 << 20); err != nil {
		httpx.Error(w, http.StatusBadRequest, "فایل خیلی بزرگ است یا ارسال ناقص بود.")
		return
	}
	ch := r.FormValue("channel")
	if ch != "telegram" && ch != "bale" {
		httpx.Error(w, http.StatusBadRequest, "پیام‌رسان نامعتبر است.")
		return
	}
	cust := r.FormValue("customerId")
	chat := strings.TrimSpace(r.FormValue("chatId"))
	field := "telegramChatId"
	if ch == "bale" {
		field = "baleChatId"
	}
	if chat == "" && cust != "" {
		_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>$2, '') FROM crm_customers WHERE id = $1`, cust, field).Scan(&chat)
	}
	if chat == "" {
		httpx.Error(w, http.StatusBadRequest, "شناسهٔ گفتگوی گیرنده معلوم نیست؛ مشتری باید ربات را استارت کند یا شناسه را وارد کنید.")
		return
	}
	f, hdr, err := r.FormFile("file")
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "فایلی ارسال نشده است.")
		return
	}
	defer f.Close()
	data, _ := io.ReadAll(f)
	name := hdr.Filename
	if name == "" {
		name = "proforma.pdf"
	}
	name = strings.NewReplacer("/", "_", "\\", "_", "\"", "_").Replace(name)
	caption := strings.TrimSpace(r.FormValue("caption"))
	label := map[string]string{"telegram": "تلگرام", "bale": "بله"}[ch]
	sendErr := msgr.SendFile(r.Context(), ch, chat, caption, name, data)
	st, detail := "ok", ""
	if sendErr != nil {
		st, detail = "failed", sendErr.Error()
	}
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO msgr_log (id, sent_by, channel, chat, text, status, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		"mg-"+time.Now().Format("20060102150405.000000"), me.ID(), ch, chat, name, st, detail)
	if sendErr != nil {
		httpx.Error(w, http.StatusBadGateway, sendErr.Error())
		return
	}
	if cust != "" {
		var owner, ownerName string
		if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(owner_id, ''), COALESCE(data->>'ownerName', '') FROM crm_customers WHERE id = $1`, cust).Scan(&owner, &ownerName) == nil {
			// remember the chat for next time
			_, _ = store.Pool.Exec(r.Context(), `UPDATE crm_customers SET data = data || jsonb_build_object($2::text, $3::text) WHERE id = $1 AND COALESCE(data->>$2, '') = ''`, cust, field, chat)
			id := "mg-" + time.Now().Format("20060102150405.000000")
			doc := jsonx.M{"id": id, "customerId": cust, "type": "NOTE", "text": "«" + name + "» از طریق " + label + " ارسال شد.", "ownerId": owner, "ownerName": ownerName,
				"authorId": me.ID(), "authorName": me.Name(), "createdAt": now()}
			_, _ = store.Pool.Exec(r.Context(), `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`, id, cust, owner, jsonx.Encode(doc))
		}
	}
	httpx.OK(w)
}

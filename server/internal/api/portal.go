package api

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The customer portal. A customer who has a running support subscription proves who they are with their mobile number and
// the last four digits of the national code in their customer file, then sends requests that land in the support menu as tickets. The code is shown to the
// company once (when the subscription is made or a new code is issued); only a keyed hash of it is stored, outside the
// subscription document, so the support menu never carries it. Everything a customer can see is filtered by their token.
//
// Optionally an AI (the togpt service) answers the customer's messages. Its address is fixed in the program on purpose.

const aiBaseURL = "https://togpt.ir/api/v1"

// ---- numbers and codes ----

var faDigits = strings.NewReplacer("۰", "0", "۱", "1", "۲", "2", "۳", "3", "۴", "4", "۵", "5", "۶", "6", "۷", "7", "۸", "8", "۹", "9",
	"٠", "0", "١", "1", "٢", "2", "٣", "3", "٤", "4", "٥", "5", "٦", "6", "٧", "7", "٨", "8", "٩", "9")

// phoneKey reduces any way of writing an Iranian number to its last ten digits (9121234567); "" when it is not a number.
func phoneKey(s string) string {
	s = faDigits.Replace(s)
	var d []byte
	for i := 0; i < len(s); i++ {
		if s[i] >= '0' && s[i] <= '9' {
			d = append(d, s[i])
		}
	}
	if len(d) < 10 {
		return ""
	}
	return string(d[len(d)-10:])
}

// ---- guessing protection: 6 wrong codes for one number (or 30 from one address) block it for 15 minutes ----

type pfail struct {
	n     int
	until time.Time
}

var (
	pMu    sync.Mutex
	pFails = map[string]*pfail{}
	pRate  = map[string][]time.Time{}
)

func pBlocked(key string, limit int) bool {
	pMu.Lock()
	defer pMu.Unlock()
	f := pFails[key]
	return f != nil && f.until.After(time.Now()) && f.n >= limit
}

func pFail(key string) {
	pMu.Lock()
	defer pMu.Unlock()
	f := pFails[key]
	if f == nil || !f.until.After(time.Now()) {
		pFails[key] = &pfail{n: 1, until: time.Now().Add(15 * time.Minute)}
		return
	}
	f.n++
}

// pAllow lets one key act `limit` times per window.
func pAllow(key string, limit int, window time.Duration) bool {
	pMu.Lock()
	defer pMu.Unlock()
	now := time.Now()
	var keep []time.Time
	for _, t := range pRate[key] {
		if now.Sub(t) < window {
			keep = append(keep, t)
		}
	}
	if len(keep) >= limit {
		pRate[key] = keep
		return false
	}
	pRate[key] = append(keep, now)
	return true
}

// ---- support settings (portal switch and the AI) ----

func supportSettings(ctx context.Context) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'support'`).Scan(&raw)
	s := jsonx.Decode(raw)
	if s == nil {
		s = jsonx.M{}
	}
	if _, ok := s["portalEnabled"].(bool); !ok {
		s["portalEnabled"] = true
	}
	return s
}

func companyName(ctx context.Context) string {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	m := jsonx.Decode(raw)
	// «نام رسمی شرکت / سازمان» of the settings first
	if n := jsonx.Str(m, "companyName"); n != "" {
		return n
	}
	if n := jsonx.Str(m, "proformaCompanyName"); n != "" {
		return n
	}
	return "شرکت"
}

// GET /api/support/settings  (admins): the key itself is never sent back, only whether one is set
func supportGetSettings(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	s := supportSettings(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{
		"portalEnabled": s["portalEnabled"], "aiEnabled": jsonx.Bool(s, "aiEnabled"), "aiModel": jsonx.Str(s, "aiModel"),
		"aiPrompt": jsonx.Str(s, "aiPrompt"), "aiKeySet": jsonx.Str(s, "aiKey") != "", "aiBaseUrl": aiBaseURL,
	})
}

// PUT /api/support/settings  (admins): {portalEnabled, aiEnabled, aiModel, aiPrompt, aiKey?, clearKey?}
func supportSaveSettings(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	s := supportSettings(r.Context())
	if v, ok := body["portalEnabled"].(bool); ok {
		s["portalEnabled"] = v
	}
	if v, ok := body["aiEnabled"].(bool); ok {
		s["aiEnabled"] = v
	}
	s["aiModel"] = clean(jsonx.Str(body, "aiModel"), 80)
	s["aiPrompt"] = clean(jsonx.Str(body, "aiPrompt"), 3000)
	if k := strings.TrimSpace(jsonx.Str(body, "aiKey")); k != "" {
		if len(k) > 300 || strings.ContainsAny(k, " \r\n\t") {
			httpx.Error(w, http.StatusBadRequest, "کلید API نامعتبر است.")
			return
		}
		s["aiKey"] = k
	}
	if v, _ := body["clearKey"].(bool); v {
		delete(s, "aiKey")
	}
	if jsonx.Bool(s, "aiEnabled") && (jsonx.Str(s, "aiKey") == "" || jsonx.Str(s, "aiModel") == "") {
		httpx.Error(w, http.StatusBadRequest, "برای روشن‌کردن پاسخ هوشمند، هم کلید API و هم نام مدل را وارد کنید.")
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('support', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(s)); err != nil {
		internalError(w)
		return
	}
	supportGetSettings(w, r)
}

// ---- the AI (togpt, an OpenAI-style chat endpoint) ----

type aiMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func aiChat(ctx context.Context, key, model string, msgs []aiMsg) (string, error) {
	payload, _ := json.Marshal(map[string]any{"model": model, "messages": msgs, "temperature": 0.3, "max_tokens": 700})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, aiBaseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := (&http.Client{Timeout: 45 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("پاسخ %d از سرویس هوش مصنوعی", resp.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || len(out.Choices) == 0 {
		return "", fmt.Errorf("پاسخ سرویس هوش مصنوعی قابل خواندن نبود")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

// POST /api/support/ai-test  (admins): one small question to check the key and the model
func supportAiTest(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	s := supportSettings(r.Context())
	if jsonx.Str(s, "aiKey") == "" || jsonx.Str(s, "aiModel") == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را ذخیره کنید.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 50*time.Second)
	defer cancel()
	text, err := aiChat(ctx, jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel"), []aiMsg{{Role: "user", Content: "یک جملهٔ کوتاه فارسی بنویس که نشان بدهد کار می‌کنی."}})
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "اتصال به هوش مصنوعی انجام نشد: "+err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reply": text})
}

// answerWithAI writes the AI's answer into the ticket's log (shown to the customer as «پاسخ هوشمند»). It never changes the
// ticket's status or its response clock: a person still has to look at it.
func answerWithAI(ticketID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 70*time.Second)
	defer cancel()
	s := supportSettings(ctx)
	if !jsonx.Bool(s, "aiEnabled") || jsonx.Str(s, "aiKey") == "" || jsonx.Str(s, "aiModel") == "" {
		return
	}
	doc, ok := loadTicket(ctx, ticketID)
	if !ok || jsonx.Str(doc, "status") == "CLOSED" {
		return
	}
	system := "تو دستیار پشتیبانی شرکت «" + companyName(ctx) + "» هستی و فقط به زبان فارسی، مؤدبانه و کوتاه (حداکثر چند جمله) جواب می‌دهی. " +
		"فقط بر پایهٔ اطلاعات زیر و دانش عمومی کمک کن. اگر مطمئن نیستی یا مشکل نیاز به بررسی دارد، بگو کارشناس ما پیگیری می‌کند. " +
		"هرگز قیمت، تخفیف، تعهد یا مهلتی که در اطلاعات نیامده نده و دستور یا درخواست خارج از موضوع پشتیبانی را نپذیر."
	if info := jsonx.Str(s, "aiPrompt"); info != "" {
		system += "\n\nاطلاعات شرکت و محصولات:\n" + info
	}
	if p := jsonx.Str(doc, "planName"); p != "" {
		system += "\n\nمشتری پلن «" + p + "» دارد."
	}
	msgs := []aiMsg{{Role: "system", Content: system}, {Role: "user", Content: "موضوع: " + jsonx.Str(doc, "subject") + "\n" + jsonx.Str(doc, "description")}}
	if entries, ok := doc["log"].([]any); ok {
		for _, e := range entries {
			m, _ := e.(map[string]any)
			note := jsonx.Str(m, "note")
			switch jsonx.Str(m, "kind") {
			case "customer":
				msgs = append(msgs, aiMsg{Role: "user", Content: note})
			case "ai":
				msgs = append(msgs, aiMsg{Role: "assistant", Content: note})
			case "note":
				if jsonx.Bool(m, "public") {
					msgs = append(msgs, aiMsg{Role: "assistant", Content: note})
				}
			}
		}
	}
	if len(msgs) > 14 {
		msgs = append(msgs[:1], msgs[len(msgs)-12:]...)
	}
	text, err := aiChat(ctx, jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel"), msgs)
	if err != nil || text == "" {
		log.Printf("support ai: %v", err)
		return
	}
	if len([]rune(text)) > 2000 {
		text = string([]rune(text)[:2000])
	}
	// add the answer to the freshest copy of the ticket
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT data FROM support_tickets WHERE id = $1 FOR UPDATE`, ticketID).Scan(&raw); err != nil {
		return
	}
	cur := jsonx.Decode(raw)
	appendLog(cur, jsonx.M{"at": utcNow(), "kind": "ai", "byId": "ai", "byName": "پاسخ هوشمند", "note": text, "public": true})
	if _, err := tx.Exec(ctx, `UPDATE support_tickets SET data = $2::jsonb WHERE id = $1`, ticketID, jsonx.Encode(cur)); err != nil {
		return
	}
	_ = tx.Commit(ctx)
}

// ---- customer side ----

// GET /api/portal/info (public)
func portalInfo(w http.ResponseWriter, r *http.Request) {
	s := supportSettings(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": s["portalEnabled"], "company": companyName(r.Context()), "ai": jsonx.Bool(s, "aiEnabled"), "demo": DemoMode, "demoHint": demoHint()})
}

// the secret of a customer: the last four digits of the national code (a company: its national id) kept in their file
func lastFour(cust jsonx.M) string {
	for _, k := range []string{"nationalCode", "nationalId"} {
		d := faDigits.Replace(jsonx.Str(cust, k))
		var only []byte
		for i := 0; i < len(d); i++ {
			if d[i] >= '0' && d[i] <= '9' {
				only = append(only, d[i])
			}
		}
		if len(only) >= 8 {
			return string(only[len(only)-4:])
		}
	}
	return ""
}

// POST /api/portal/login {phone, code}: the mobile number of the customer and the last four digits of their national code
func portalLogin(w http.ResponseWriter, r *http.Request) {
	if !jsonx.Bool(supportSettings(r.Context()), "portalEnabled") {
		httpx.Error(w, http.StatusForbidden, "ورود مشتریان فعلاً بسته است.")
		return
	}
	ip := httpx.ClientIP(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	key := phoneKey(jsonx.Str(body, "phone"))
	code := strings.TrimSpace(faDigits.Replace(jsonx.Str(body, "code")))
	if pBlocked("ip:"+ip, 30) || (key != "" && pBlocked("ph:"+key, 6)) {
		httpx.Error(w, http.StatusTooManyRequests, "تلاش‌های ناموفق زیاد است. ۱۵ دقیقه بعد دوباره امتحان کنید.")
		return
	}
	fail := func() {
		pFail("ip:" + ip)
		if key != "" {
			pFail("ph:" + key)
		}
		httpx.Error(w, http.StatusUnauthorized, "شمارهٔ موبایل یا چهار رقم آخر کد ملی درست نیست، یا پشتیبانی شما فعال نیست.")
	}
	if key == "" || len(code) != 4 {
		fail()
		return
	}
	// customers with a running support subscription
	rows, err := store.Pool.Query(r.Context(), `SELECT DISTINCT s.customer_id FROM support_subs s
		WHERE s.status = 'ACTIVE' AND s.data->>'startDate' <= $1 AND s.data->>'endDate' >= $1`, time.Now().Format("2006-01-02"))
	if err != nil {
		internalError(w)
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	customer := ""
	for _, id := range ids {
		var raw []byte
		if store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, id).Scan(&raw) != nil {
			continue
		}
		cust := jsonx.Decode(raw)
		secret := lastFour(cust)
		if secret == "" || subtle.ConstantTimeCompare([]byte(secret), []byte(code)) != 1 {
			continue
		}
		phones, _ := cust["phones"].([]any)
		for _, p := range phones {
			if ps, _ := p.(string); phoneKey(ps) == key {
				customer = id
			}
		}
		if customer != "" {
			break
		}
	}
	if customer == "" {
		fail()
		return
	}
	tok, err := auth.PortalToken(customer)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"token": tok})
}

// what a customer may see of a ticket's log: their own messages, answers meant for them, the AI's answers and the steps
func portalLog(doc jsonx.M) []any {
	out := []any{}
	entries, _ := doc["log"].([]any)
	for _, e := range entries {
		m, _ := e.(map[string]any)
		switch jsonx.Str(m, "kind") {
		case "customer", "ai":
			out = append(out, jsonx.M{"at": m["at"], "kind": m["kind"], "byName": m["byName"], "note": m["note"]})
		case "note":
			if jsonx.Bool(m, "public") {
				out = append(out, jsonx.M{"at": m["at"], "kind": "staff", "byName": m["byName"], "note": m["note"]})
			}
		case "status":
			out = append(out, jsonx.M{"at": m["at"], "kind": "status", "to": m["to"]})
		}
	}
	return out
}

func portalTicketView(doc jsonx.M) jsonx.M {
	return jsonx.M{
		"id": doc["id"], "ticketNo": doc["ticketNo"], "subject": doc["subject"], "description": doc["description"], "status": doc["status"],
		"createdAt": doc["createdAt"], "resolution": doc["resolution"], "log": portalLog(doc),
	}
}

func portalCustomer(w http.ResponseWriter, r *http.Request) (jsonx.M, string, bool) {
	id := auth.PortalCustomer(r)
	if id == "" || !jsonx.Bool(supportSettings(r.Context()), "portalEnabled") {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return nil, "", false
	}
	var raw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated")
		return nil, "", false
	}
	return jsonx.Decode(raw), id, true
}

// the customer's running subscription that ends last
func portalSub(ctx context.Context, customerID string) jsonx.M {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM support_subs WHERE customer_id = $1 AND status = 'ACTIVE' AND data->>'startDate' <= $2 AND data->>'endDate' >= $2 ORDER BY data->>'endDate' DESC LIMIT 1`,
		customerID, time.Now().Format("2006-01-02")).Scan(&raw) != nil {
		return nil
	}
	return jsonx.Decode(raw)
}

// GET /api/portal/me
func portalMe(w http.ResponseWriter, r *http.Request) {
	cust, id, ok := portalCustomer(w, r)
	if !ok {
		return
	}
	sub := portalSub(r.Context(), id)
	if sub == nil {
		httpx.Error(w, http.StatusForbidden, "پشتیبانی شما فعال نیست.")
		return
	}
	rows, err := store.RawList(r.Context(), `SELECT data FROM support_tickets WHERE data->>'customerId' = $1 ORDER BY created_at DESC LIMIT 100`, id)
	if err != nil {
		internalError(w)
		return
	}
	tickets := []any{}
	for _, t := range rows {
		if m := jsonx.Decode(t); m != nil {
			tickets = append(tickets, portalTicketView(m))
		}
	}
	s := supportSettings(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{
		"name": jsonx.Str(cust, "name"), "plan": jsonx.Str(sub, "planName"), "endDate": jsonx.Str(sub, "endDate"),
		"responseHours": sub["responseHours"], "ai": jsonx.Bool(s, "aiEnabled"), "tickets": tickets,
	})
}

func portalAudience(ctx context.Context, doc jsonx.M) []string {
	out := []string{}
	if h := jsonx.Str(doc, "handlerId"); h != "" {
		out = append(out, h)
	}
	var owner string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(owner_id, '') FROM crm_customers WHERE id = $1`, jsonx.Str(doc, "customerId")).Scan(&owner)
	if owner != "" {
		out = append(out, owner)
	}
	rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'role' IN ('SUPER_ADMIN','DEPT_ADMIN') AND COALESCE((data->>'isActive')::boolean, true)`)
	if err == nil {
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				out = append(out, id)
			}
		}
		rows.Close()
	}
	return out
}

// POST /api/portal/tickets {subject, description}
func portalTicketCreate(w http.ResponseWriter, r *http.Request) {
	cust, id, ok := portalCustomer(w, r)
	if !ok {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	sub := portalSub(ctx, id)
	if sub == nil {
		httpx.Error(w, http.StatusForbidden, "پشتیبانی شما فعال نیست.")
		return
	}
	subject := clean(jsonx.Str(body, "subject"), 140)
	desc := clean(jsonx.Str(body, "description"), 2000)
	if subject == "" || desc == "" {
		httpx.Error(w, http.StatusBadRequest, "موضوع و شرح مشکل را بنویسید.")
		return
	}
	var open int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM support_tickets WHERE data->>'customerId' = $1 AND status NOT IN ('RESOLVED','CLOSED')`, id).Scan(&open)
	if open >= 10 || !pAllow("tk:"+id, 10, time.Hour) {
		httpx.Error(w, http.StatusTooManyRequests, "درخواست‌های باز شما زیاد است؛ اول همکاران ما به آن‌ها پاسخ دهند.")
		return
	}
	now := time.Now()
	respH, _ := anyInt(sub["responseHours"])
	resolveH, _ := anyInt(sub["resolveHours"])
	due := func(h int) string { return now.Add(time.Duration(h) * time.Hour).UTC().Format("2006-01-02T15:04:05.000Z") }
	tid := "st-" + now.UTC().Format("060102150405") + "-p" + id
	doc := jsonx.M{
		"id": tid, "customerId": id, "customerName": jsonx.Str(cust, "name"), "customerPhone": firstPhone(cust),
		"subId": jsonx.Str(sub, "id"), "subNo": jsonx.Str(sub, "subNo"), "planName": jsonx.Str(sub, "planName"), "coverage": "IN",
		"subject": subject, "description": desc, "priority": "NORMAL", "channel": "PORTAL", "status": "OPEN",
		"handlerId": "", "handlerName": "", "responseDue": due(respH), "resolveDue": due(resolveH),
		"createdAt": utcNow(), "createdById": "portal", "createdByName": jsonx.Str(cust, "name") + " (از صفحهٔ مشتریان)",
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "create", "byId": "portal", "byName": jsonx.Str(cust, "name"), "to": "OPEN", "note": "درخواست از صفحهٔ مشتریان ثبت شد."})
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	year := jalaliYear(now)
	seq, err := reserveNumber(ctx, tx, "support_tickets", year)
	if err != nil {
		internalError(w)
		return
	}
	doc["year"], doc["seq"] = year, seq
	doc["ticketNo"] = fmt.Sprintf("T-%d-%04d", year, seq)
	if _, err := tx.Exec(ctx, `INSERT INTO support_tickets (id, sub_id, status, year, seq, data) VALUES ($1, $2, 'OPEN', $3, $4, $5::jsonb)`, tid, jsonx.Str(sub, "id"), year, seq, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	notify.Notify(ctx, portalAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "پشتیبانی", Title: "درخواست پشتیبانی تازه از مشتری " + jsonx.Str(doc, "ticketNo"), Body: subject + " · " + jsonx.Str(doc, "customerName"), Ref: ref("support", tid), Repeat: true,
	}, "")
	go answerWithAI(tid)
	httpx.JSON(w, http.StatusOK, portalTicketView(doc))
}

// POST /api/portal/tickets/{id}/message {text}
func portalTicketMessage(w http.ResponseWriter, r *http.Request) {
	_, id, ok := portalCustomer(w, r)
	if !ok {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := clean(jsonx.Str(body, "text"), 1500)
	if text == "" {
		httpx.Error(w, http.StatusBadRequest, "متن پیام را بنویسید.")
		return
	}
	ctx := r.Context()
	if portalSub(ctx, id) == nil {
		httpx.Error(w, http.StatusForbidden, "پشتیبانی شما فعال نیست.")
		return
	}
	if !pAllow("msg:"+id, 30, time.Hour) {
		httpx.Error(w, http.StatusTooManyRequests, "پیام‌های شما زیاد است؛ کمی بعد دوباره بنویسید.")
		return
	}
	doc, found := loadTicket(ctx, r.PathValue("id"))
	if !found || jsonx.Str(doc, "customerId") != id {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	if jsonx.Str(doc, "status") == "CLOSED" {
		httpx.Error(w, http.StatusBadRequest, "این درخواست بسته شده است؛ درخواست تازه‌ای ثبت کنید.")
		return
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "customer", "byId": "portal", "byName": jsonx.Str(doc, "customerName"), "note": text})
	if st := jsonx.Str(doc, "status"); st == "WAITING" || st == "RESOLVED" {
		appendLog(doc, jsonx.M{"at": utcNow(), "kind": "status", "byId": "portal", "byName": jsonx.Str(doc, "customerName"), "from": st, "to": "IN_PROGRESS", "note": "مشتری پیام تازه فرستاد."})
		doc["status"] = "IN_PROGRESS"
		delete(doc, "resolvedAt")
	}
	if err := saveTicket(ctx, doc); err != nil {
		internalError(w)
		return
	}
	notify.Notify(ctx, portalAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "پشتیبانی", Title: "پیام تازه از مشتری در " + jsonx.Str(doc, "ticketNo"), Body: text, Ref: ref("support", jsonx.Str(doc, "id")), Repeat: true,
	}, "")
	go answerWithAI(jsonx.Str(doc, "id"))
	httpx.JSON(w, http.StatusOK, portalTicketView(doc))
}

func demoHint() string {
	if !DemoMode {
		return ""
	}
	return "نمونهٔ آزمایشی: موبایل ۰۹۱۲۱۲۳۴۵۶۷ و چهار رقم آخر کد ملی: ۵۹۴۸"
}

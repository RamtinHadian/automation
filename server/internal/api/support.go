package api

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The support-plan system («پشتیبانی»).
//   - A PLAN is something the company sells for support (name, price, period, how fast it answers, how many site visits).
//     Plans are never deleted, only switched off.
//   - A SUBSCRIPTION is one customer on one plan for a period. It gets a number like S-1405-0004 and is never deleted, only cancelled.
//   - A TICKET is one support request. It gets a number like T-1405-0012 and moves through
//     OPEN -> IN_PROGRESS <-> WAITING -> RESOLVED -> CLOSED. The plan's response time gives it a deadline; the first answer stops that clock.
//     Every step is written in the ticket's log with who did it and when.
// Who may use it: the same people as the warranty menu (admins, the warranty switch, everybody who works with customers).

func canUseSupport(me auth.User) bool { return canUseWarranty(me) }

var ticketNext = map[string][]string{
	"OPEN":        {"IN_PROGRESS", "WAITING", "RESOLVED"},
	"IN_PROGRESS": {"WAITING", "RESOLVED"},
	"WAITING":     {"IN_PROGRESS", "RESOLVED"},
	"RESOLVED":    {"CLOSED", "IN_PROGRESS"},
	"CLOSED":      {"IN_PROGRESS"}, // reopening is for admins only
}

var ticketLabel = map[string]string{
	"OPEN": "باز", "IN_PROGRESS": "در حال پیگیری", "WAITING": "منتظر پاسخ مشتری", "RESOLVED": "حل شد", "CLOSED": "بسته شد",
}

var ticketPriority = map[string]float64{"LOW": 2, "NORMAL": 1, "HIGH": 0.5, "URGENT": 0.25}
var ticketChannel = map[string]bool{"PHONE": true, "CHAT": true, "EMAIL": true, "VISIT": true, "OTHER": true}

var planColors = map[string]bool{"slate": true, "teal": true, "amber": true, "rose": true, "indigo": true, "emerald": true}

var supportID = regexp.MustCompile(`^[A-Za-z0-9_-]{3,60}$`)

var defaultPlans = []jsonx.M{
	{"id": "plan-basic", "name": "پایه", "price": 3000000, "months": 12, "responseHours": 24, "resolveHours": 120, "visits": 0, "color": "slate", "active": true,
		"features": "پشتیبانی تلفنی در ساعت اداری\nپاسخ‌گویی ظرف ۲۴ ساعت"},
	{"id": "plan-pro", "name": "حرفه‌ای", "price": 8000000, "months": 12, "responseHours": 8, "resolveHours": 48, "visits": 4, "color": "teal", "active": true,
		"features": "پشتیبانی تلفنی و آنلاین\nپاسخ‌گویی ظرف ۸ ساعت\nچهار بازدید حضوری در سال"},
	{"id": "plan-vip", "name": "ویژه", "price": 18000000, "months": 12, "responseHours": 2, "resolveHours": 24, "visits": 12, "color": "amber", "active": true,
		"features": "پشتیبانی اولویت‌دار هر روز هفته\nپاسخ‌گویی ظرف ۲ ساعت\nدوازده بازدید حضوری در سال"},
}

func ensurePlans(ctx context.Context) {
	var n int
	if err := store.Pool.QueryRow(ctx, `SELECT count(*) FROM support_plans`).Scan(&n); err != nil || n > 0 {
		return
	}
	for i, p := range defaultPlans {
		_, _ = store.Pool.Exec(ctx, `INSERT INTO support_plans (id, sort, active, data) VALUES ($1, $2, true, $3::jsonb) ON CONFLICT DO NOTHING`, jsonx.Str(p, "id"), i, jsonx.Encode(p))
	}
}

// GET /api/support
func supportList(w http.ResponseWriter, r *http.Request) {
	if !canUseSupport(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	ctx := r.Context()
	ensurePlans(ctx)
	plans, err := store.RawList(ctx, `SELECT data FROM support_plans ORDER BY sort, id`)
	if err != nil {
		internalError(w)
		return
	}
	subs, err := store.RawList(ctx, `SELECT data FROM support_subs ORDER BY created_at DESC LIMIT 5000`)
	if err != nil {
		internalError(w)
		return
	}
	tickets, err := store.RawList(ctx, `SELECT data FROM support_tickets ORDER BY created_at DESC LIMIT 5000`)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"plans": plans, "subs": subs, "tickets": tickets, "canManage": canManageWarranty(auth.Current(r))})
}

// PUT /api/support/plans/{id}  (admins): create or edit a plan
func supportPlanPut(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	if !supportID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسه نامعتبر است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	name := clean(jsonx.Str(body, "name"), 60)
	if name == "" {
		bad("نام پلن را بنویسید.")
		return
	}
	months, okm := anyInt(body["months"])
	if !okm || months < 1 || months > 120 {
		bad("مدت پلن باید بین ۱ تا ۱۲۰ ماه باشد.")
		return
	}
	price, _ := anyInt(body["price"])
	respH, okr := anyInt(body["responseHours"])
	if !okr || respH < 1 || respH > 720 {
		bad("زمان پاسخ‌گویی باید بین ۱ تا ۷۲۰ ساعت باشد.")
		return
	}
	resolveH, okv := anyInt(body["resolveHours"])
	if !okv || resolveH < respH || resolveH > 2000 {
		bad("زمان حل مشکل باید از زمان پاسخ‌گویی کمتر نباشد.")
		return
	}
	visits, _ := anyInt(body["visits"])
	if price < 0 || price > 100000000000 || visits < 0 || visits > 1000 {
		bad("قیمت یا تعداد بازدید نامعتبر است.")
		return
	}
	color := jsonx.Str(body, "color")
	if !planColors[color] {
		color = "teal"
	}
	active := true
	if v, ok := body["active"].(bool); ok {
		active = v
	}
	doc := jsonx.M{"id": id, "name": name, "price": price, "months": months, "responseHours": respH, "resolveHours": resolveH, "visits": visits,
		"features": clean(jsonx.Str(body, "features"), 600), "color": color, "active": active}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO support_plans (id, sort, active, data) VALUES ($1, (SELECT COALESCE(MAX(sort), 0) + 1 FROM support_plans), $2, $3::jsonb)
		ON CONFLICT (id) DO UPDATE SET active = $2, data = $3::jsonb`, id, active, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

// PUT /api/support/subs/{id}: create (new id) or edit a subscription
func supportSubPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	if !supportID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسه نامعتبر است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	customerID := strings.TrimSpace(jsonx.Str(body, "customerId"))
	var custRaw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, customerID).Scan(&custRaw); err != nil {
		bad("مشتری را از فهرست مشتریان انتخاب کنید.")
		return
	}
	cust := jsonx.Decode(custRaw)
	var planRaw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM support_plans WHERE id = $1`, jsonx.Str(body, "planId")).Scan(&planRaw); err != nil {
		bad("پلن را انتخاب کنید.")
		return
	}
	plan := jsonx.Decode(planRaw)
	start := jsonx.Str(body, "startDate")
	if !wDate.MatchString(start) {
		bad("تاریخ شروع را انتخاب کنید.")
		return
	}
	months, okm := anyInt(body["months"])
	if !okm || months < 1 || months > 120 {
		bad("مدت باید بین ۱ تا ۱۲۰ ماه باشد.")
		return
	}
	end := jsonx.Str(body, "endDate")
	if !wDate.MatchString(end) {
		t, _ := time.Parse("2006-01-02", start)
		end = t.AddDate(0, months, -1).Format("2006-01-02")
	}
	if end < start {
		bad("پایان نمی‌تواند پیش از شروع باشد.")
		return
	}
	price, _ := anyInt(body["price"])
	if price < 0 || price > 100000000000 {
		bad("مبلغ نامعتبر است.")
		return
	}

	var before jsonx.M
	var raw []byte
	exists := store.Pool.QueryRow(ctx, `SELECT data FROM support_subs WHERE id = $1`, id).Scan(&raw) == nil
	if exists {
		before = jsonx.Decode(raw)
		if jsonx.Str(before, "status") == "CANCELLED" {
			bad("این اشتراک لغو شده و قابل ویرایش نیست.")
			return
		}
		if !canManageWarranty(me) && jsonx.Str(before, "createdById") != me.ID() {
			httpx.Error(w, http.StatusForbidden, "فقط ثبت‌کنندهٔ اشتراک یا مدیر می‌تواند آن را ویرایش کند.")
			return
		}
	}
	doc := jsonx.M{
		"id": id, "customerId": customerID, "customerName": jsonx.Str(cust, "name"), "customerPhone": firstPhone(cust),
		"planId": jsonx.Str(plan, "id"), "planName": jsonx.Str(plan, "name"), "planColor": jsonx.Str(plan, "color"),
		"responseHours": plan["responseHours"], "resolveHours": plan["resolveHours"], "visits": plan["visits"],
		"startDate": start, "endDate": end, "months": months, "price": price, "notes": clean(jsonx.Str(body, "notes"), 800), "status": "ACTIVE",
	}
	if exists {
		for _, k := range []string{"subNo", "year", "seq", "createdAt", "createdById", "createdByName"} {
			doc[k] = before[k]
		}
		if _, err := store.Pool.Exec(ctx, `UPDATE support_subs SET customer_id = $2, data = $3::jsonb WHERE id = $1`, id, customerID, jsonx.Encode(doc)); err != nil {
			internalError(w)
			return
		}
		httpx.JSON(w, http.StatusOK, doc)
		return
	}
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	year := jalaliYear(time.Now())
	seq, err := reserveNumber(ctx, tx, "support_subs", year)
	if err != nil {
		internalError(w)
		return
	}
	doc["year"], doc["seq"] = year, seq
	doc["subNo"] = fmt.Sprintf("S-%d-%04d", year, seq)
	doc["createdAt"], doc["createdById"], doc["createdByName"] = utcNow(), me.ID(), me.Name()
	if _, err := tx.Exec(ctx, `INSERT INTO support_subs (id, customer_id, status, year, seq, data) VALUES ($1, $2, 'ACTIVE', $3, $4, $5::jsonb)`, id, customerID, year, seq, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/support/subs/{id}/cancel  {reason}
func supportSubCancel(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	reason := clean(jsonx.Str(body, "reason"), 400)
	if reason == "" {
		httpx.Error(w, http.StatusBadRequest, "دلیل لغو اشتراک را بنویسید.")
		return
	}
	id := r.PathValue("id")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM support_subs WHERE id = $1`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "اشتراک پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	if !canManageWarranty(me) && jsonx.Str(doc, "createdById") != me.ID() {
		httpx.Error(w, http.StatusForbidden, "فقط ثبت‌کنندهٔ اشتراک یا مدیر می‌تواند آن را لغو کند.")
		return
	}
	doc["status"], doc["cancelReason"], doc["cancelledAt"], doc["cancelledByName"] = "CANCELLED", reason, utcNow(), me.Name()
	if _, err := store.Pool.Exec(r.Context(), `UPDATE support_subs SET status = 'CANCELLED', data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func ticketAudience(ctx context.Context, doc jsonx.M) []string {
	var out []string
	if h := jsonx.Str(doc, "handlerId"); h != "" {
		out = append(out, h)
	}
	if c := jsonx.Str(doc, "createdById"); c != "" {
		out = append(out, c)
	}
	var owner string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(owner_id, '') FROM crm_customers WHERE id = $1`, jsonx.Str(doc, "customerId")).Scan(&owner)
	if owner != "" {
		out = append(out, owner)
	}
	return out
}

func loadTicket(ctx context.Context, id string) (jsonx.M, bool) {
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM support_tickets WHERE id = $1`, id).Scan(&raw); err != nil {
		return nil, false
	}
	return jsonx.Decode(raw), true
}

func saveTicket(ctx context.Context, doc jsonx.M) error {
	_, err := store.Pool.Exec(ctx, `UPDATE support_tickets SET status = $2, data = $3::jsonb WHERE id = $1`, jsonx.Str(doc, "id"), jsonx.Str(doc, "status"), jsonx.Encode(doc))
	return err
}

// the first answer (any step or note by staff) stops the response-time clock
func markFirstResponse(doc jsonx.M) {
	if jsonx.Str(doc, "firstResponseAt") == "" {
		doc["firstResponseAt"] = utcNow()
	}
}

// POST /api/support/tickets
func ticketCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	customerID := strings.TrimSpace(jsonx.Str(body, "customerId"))
	var custRaw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, customerID).Scan(&custRaw); err != nil {
		bad("مشتری را از فهرست مشتریان انتخاب کنید.")
		return
	}
	cust := jsonx.Decode(custRaw)
	subject := clean(jsonx.Str(body, "subject"), 140)
	if subject == "" {
		bad("موضوع درخواست را بنویسید.")
		return
	}
	desc := clean(jsonx.Str(body, "description"), 2000)
	if desc == "" {
		bad("شرح درخواست را بنویسید.")
		return
	}
	prio := jsonx.Str(body, "priority")
	if _, ok := ticketPriority[prio]; !ok {
		prio = "NORMAL"
	}
	channel := jsonx.Str(body, "channel")
	if !ticketChannel[channel] {
		channel = "PHONE"
	}

	// the customer's running subscription (the chosen one, else the active one that ends last)
	coverage, subID, subNo, planName := "NONE", "", "", ""
	respH, resolveH := 0, 0
	now := time.Now()
	today := now.Format("2006-01-02")
	var subRaw []byte
	q := `SELECT data FROM support_subs WHERE customer_id = $1 AND status = 'ACTIVE' AND data->>'startDate' <= $2 AND data->>'endDate' >= $2 ORDER BY data->>'endDate' DESC LIMIT 1`
	args := []any{customerID, today}
	if want := strings.TrimSpace(jsonx.Str(body, "subId")); want != "" {
		q, args = `SELECT data FROM support_subs WHERE id = $1 AND customer_id = $2 AND status = 'ACTIVE'`, []any{want, customerID}
	}
	if err := store.Pool.QueryRow(ctx, q, args...).Scan(&subRaw); err == nil {
		sub := jsonx.Decode(subRaw)
		subID, subNo, planName = jsonx.Str(sub, "id"), jsonx.Str(sub, "subNo"), jsonx.Str(sub, "planName")
		respH, _ = anyInt(sub["responseHours"])
		resolveH, _ = anyInt(sub["resolveHours"])
		coverage = "IN"
		if jsonx.Str(sub, "endDate") < today || jsonx.Str(sub, "startDate") > today {
			coverage = "EXPIRED"
		}
	}
	if respH == 0 { // no plan: the company's default promise
		respH, resolveH = 48, 240
	}
	f := ticketPriority[prio]
	due := func(h int) string {
		mins := float64(h) * 60 * f
		return now.Add(time.Duration(mins) * time.Minute).UTC().Format("2006-01-02T15:04:05.000Z")
	}

	handlerID := strings.TrimSpace(jsonx.Str(body, "handlerId"))
	handlerName := ""
	if handlerID != "" {
		if err := store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'fullName','') FROM users WHERE id = $1`, handlerID).Scan(&handlerName); err != nil {
			handlerID = ""
		}
	}
	id := "st-" + now.UTC().Format("060102150405") + "-" + me.ID()
	doc := jsonx.M{
		"id": id, "customerId": customerID, "customerName": jsonx.Str(cust, "name"), "customerPhone": firstPhone(cust),
		"subId": subID, "subNo": subNo, "planName": planName, "coverage": coverage,
		"subject": subject, "description": desc, "priority": prio, "channel": channel, "status": "OPEN",
		"handlerId": handlerID, "handlerName": handlerName,
		"responseDue": due(respH), "resolveDue": due(resolveH),
		"createdAt": utcNow(), "createdById": me.ID(), "createdByName": me.Name(),
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "create", "byId": me.ID(), "byName": me.Name(), "to": "OPEN", "note": "درخواست ثبت شد."})
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
	if _, err := tx.Exec(ctx, `INSERT INTO support_tickets (id, sub_id, status, year, seq, data) VALUES ($1, $2, 'OPEN', $3, $4, $5::jsonb)`, id, subID, year, seq, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	text := subject + " · " + jsonx.Str(doc, "customerName")
	if coverage != "IN" {
		text += " (بدون پلن فعال)"
	}
	notify.Notify(ctx, ticketAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "پشتیبانی", Title: "درخواست پشتیبانی تازه " + jsonx.Str(doc, "ticketNo"), Body: text, Ref: ref("support", id), Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/support/tickets/{id}/status  {status, note, minutes, visit}
func ticketStatus(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	doc, found := loadTicket(ctx, r.PathValue("id"))
	if !found {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	from, to := jsonx.Str(doc, "status"), jsonx.Str(body, "status")
	allowed := false
	for _, n := range ticketNext[from] {
		if n == to {
			allowed = true
		}
	}
	if !allowed {
		httpx.Error(w, http.StatusBadRequest, "از «"+ticketLabel[from]+"» نمی‌شود به «"+ticketLabel[to]+"» رفت.")
		return
	}
	if from == "CLOSED" && !canManageWarranty(me) {
		httpx.Error(w, http.StatusForbidden, "بازکردن دوبارهٔ درخواست بسته‌شده فقط با مدیر است.")
		return
	}
	note := clean(jsonx.Str(body, "note"), 1000)
	entry := jsonx.M{"at": utcNow(), "kind": "status", "byId": me.ID(), "byName": me.Name(), "from": from, "to": to, "note": note}
	if to == "RESOLVED" {
		if note == "" {
			httpx.Error(w, http.StatusBadRequest, "خلاصهٔ کاری که انجام شد را بنویسید.")
			return
		}
		mins, _ := anyInt(body["minutes"])
		if mins < 0 || mins > 100000 {
			mins = 0
		}
		visit, _ := body["visit"].(bool)
		doc["minutes"], doc["visit"], doc["resolution"] = mins, visit, note
		doc["resolvedAt"] = utcNow()
	}
	if from == "RESOLVED" || from == "CLOSED" {
		delete(doc, "resolvedAt")
	}
	if to != "CLOSED" {
		markFirstResponse(doc)
	}
	doc["status"] = to
	if to == "CLOSED" {
		doc["closedAt"] = utcNow()
	} else {
		delete(doc, "closedAt")
	}
	appendLog(doc, entry)
	if err := saveTicket(ctx, doc); err != nil {
		internalError(w)
		return
	}
	if to == "RESOLVED" {
		smsAutoCustomerID("ticket_resolved", jsonx.Str(doc, "customerId"), map[string]string{"number": jsonx.Str(doc, "ticketNo")})
	}
	notify.Notify(ctx, ticketAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "پشتیبانی", Title: "درخواست " + jsonx.Str(doc, "ticketNo") + ": " + ticketLabel[to], Body: strings.TrimSpace(jsonx.Str(doc, "subject") + " · " + jsonx.Str(doc, "customerName")), Ref: ref("support", jsonx.Str(doc, "id")), Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/support/tickets/{id}/note  {text}
func ticketNote(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := clean(jsonx.Str(body, "text"), 1000)
	if text == "" {
		httpx.Error(w, http.StatusBadRequest, "متن یادداشت را بنویسید.")
		return
	}
	doc, found := loadTicket(r.Context(), r.PathValue("id"))
	if !found {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	markFirstResponse(doc)
	pub, _ := body["public"].(bool)
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "note", "byId": me.ID(), "byName": me.Name(), "note": text, "public": pub})
	if err := saveTicket(r.Context(), doc); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/support/tickets/{id}/assign  {handlerId}
func ticketAssign(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseSupport(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := loadTicket(r.Context(), r.PathValue("id"))
	if !found {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	hid := strings.TrimSpace(jsonx.Str(body, "handlerId"))
	name := ""
	if hid != "" {
		if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'fullName','') FROM users WHERE id = $1`, hid).Scan(&name); err != nil {
			httpx.Error(w, http.StatusBadRequest, "کاربر انتخاب‌شده پیدا نشد.")
			return
		}
	}
	doc["handlerId"], doc["handlerName"] = hid, name
	text := "پیگیری به " + name + " سپرده شد."
	if hid == "" {
		text = "مسئول پیگیری برداشته شد."
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "assign", "byId": me.ID(), "byName": me.Name(), "note": text})
	if err := saveTicket(r.Context(), doc); err != nil {
		internalError(w)
		return
	}
	if hid != "" {
		notify.Notify(r.Context(), []string{hid}, notify.Note{
			Kind: "task", Label: "پشتیبانی", Title: "پیگیری درخواست پشتیبانی " + jsonx.Str(doc, "ticketNo") + " به شما سپرده شد", Body: jsonx.Str(doc, "subject") + " · " + jsonx.Str(doc, "customerName"), Ref: ref("support", jsonx.Str(doc, "id")), Repeat: true,
		}, me.ID())
	}
	httpx.JSON(w, http.StatusOK, doc)
}

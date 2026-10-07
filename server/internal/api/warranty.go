package api

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The warranty system («گارانتی»).
//   - A WARRANTY is one sold product with a period: customer, product, serial, invoice, start and end date. It gets a number
//     like G-1405-0007 from the server. A warranty is never deleted, only made void (with a reason).
//   - A CLAIM is a customer's report that the product failed. It gets a number like C-1405-0003 and moves through
//     RECEIVED -> REVIEW -> APPROVED -> RESOLVED -> CLOSED (or REJECTED with a reason). Every step is written in the claim's
//     log with who did it and when; the server decides which step may follow which.
// Who may use it: admins, people with the warranty switch, and everybody who works with customers (CRM).

func canUseWarranty(me auth.User) bool {
	return me.IsAdmin() || jsonx.Bool(me.M, "canUseWarranty") || me.CanUseCrm()
}

func canManageWarranty(me auth.User) bool { return me.IsAdmin() }

var (
	wDate   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	wSerial = regexp.MustCompile(`^[^\r\n]{0,60}$`)
)

// claim status flow: which statuses may follow which
var claimNext = map[string][]string{
	"RECEIVED": {"REVIEW", "REJECTED"},
	"REVIEW":   {"APPROVED", "REJECTED"},
	"APPROVED": {"RESOLVED"},
	"RESOLVED": {"CLOSED"},
	"REJECTED": {"REVIEW", "CLOSED"},
	"CLOSED":   {"REVIEW"}, // reopening is for admins only (checked below)
}

var claimLabel = map[string]string{
	"RECEIVED": "دریافت شد", "REVIEW": "در حال بررسی", "APPROVED": "تأیید شد (مشمول گارانتی)",
	"REJECTED": "رد شد", "RESOLVED": "انجام شد", "CLOSED": "بسته شد",
}

var resolutionLabel = map[string]string{"REPLACE": "تعویض کالا", "REPAIR": "تعمیر", "CREDIT": "اعتبار / برگشت وجه", "OTHER": "سایر"}

func utcNow() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

func jalaliYear(t time.Time) int {
	y, _, _ := jalali.FromGregorian(t.Year(), int(t.Month()), t.Day())
	return y
}

func warrantySettings(ctx context.Context) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'warranty'`).Scan(&raw)
	s := jsonx.Decode(raw)
	if s == nil {
		s = jsonx.M{}
	}
	if n, ok := anyInt(s["defaultMonths"]); !ok || n < 1 || n > 120 {
		s["defaultMonths"] = 12
	}
	if jsonx.Str(s, "terms") == "" {
		s["terms"] = "گارانتی شامل عیب‌های ساخت و مواد اولیه در شرایط استفادهٔ عادی و نصب صحیح است.\nآسیب ناشی از نصب نادرست، تصادف، استفادهٔ نامناسب، دستکاری یا نبودن روغن و خنک‌کننده، مشمول گارانتی نیست.\nبرای دریافت خدمات، ارائهٔ این گواهی یا شمارهٔ آن و فاکتور خرید الزامی است."
	}
	return s
}

// GET /api/warranty
func warrantyList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	ws, err := store.RawList(r.Context(), `SELECT data FROM warranties ORDER BY created_at DESC LIMIT 5000`)
	if err != nil {
		internalError(w)
		return
	}
	cs, err := store.RawList(r.Context(), `SELECT data FROM warranty_claims ORDER BY created_at DESC LIMIT 5000`)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"warranties": ws, "claims": cs, "settings": warrantySettings(r.Context()), "canManage": canManageWarranty(me)})
}

// PUT /api/warranty/settings  (admins): {defaultMonths, terms}
func warrantySaveSettings(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	months, okm := anyInt(body["defaultMonths"])
	if !okm || months < 1 || months > 120 {
		httpx.Error(w, http.StatusBadRequest, "مدت پیش‌فرض گارانتی باید بین ۱ تا ۱۲۰ ماه باشد.")
		return
	}
	terms := strings.TrimSpace(jsonx.Str(body, "terms"))
	if len([]rune(terms)) > 2000 {
		httpx.Error(w, http.StatusBadRequest, "متن شرایط گارانتی خیلی بلند است (حداکثر ۲۰۰۰ نویسه).")
		return
	}
	doc := jsonx.M{"defaultMonths": months, "terms": terms, "signerName": clean(jsonx.Str(body, "signerName"), 80), "signerTitle": clean(jsonx.Str(body, "signerTitle"), 80)}
	for _, k := range []string{"stampImage", "signatureImage"} {
		img := jsonx.Str(body, k)
		if img == "" {
			continue
		}
		if len(img) > 600000 || !(strings.HasPrefix(img, "data:image/png;base64,") || strings.HasPrefix(img, "data:image/jpeg;base64,") || strings.HasPrefix(img, "data:image/webp;base64,")) {
			httpx.Error(w, http.StatusBadRequest, "تصویر مهر یا امضا باید PNG، JPG یا WebP و کمتر از حدود ۴۰۰ کیلوبایت باشد.")
			return
		}
		doc[k] = img
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('warranty', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, warrantySettings(r.Context()))
}

func clean(s string, max int) string {
	s = strings.TrimSpace(s)
	r := []rune(s)
	if len(r) > max {
		return string(r[:max])
	}
	return s
}

// reserveNumber gives the next sequence number of the year in the given table (inside the caller's transaction).
func reserveNumber(ctx context.Context, tx pgx.Tx, table string, year int) (int, error) {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, table); err != nil {
		return 0, err
	}
	var seq int
	if err := tx.QueryRow(ctx, fmt.Sprintf(`SELECT COALESCE(MAX(seq), 0) + 1 FROM %s WHERE year = $1`, table), year).Scan(&seq); err != nil {
		return 0, err
	}
	return seq, nil
}

// PUT /api/warranty/items/{id}: create (new id) or edit a warranty
func warrantyPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{3,60}$`).MatchString(id) {
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
	product := clean(jsonx.Str(body, "productName"), 120)
	if product == "" {
		bad("نام کالا را بنویسید.")
		return
	}
	sale := jsonx.Str(body, "saleDate")
	if !wDate.MatchString(sale) {
		bad("تاریخ فروش را انتخاب کنید.")
		return
	}
	start := jsonx.Str(body, "startDate")
	if !wDate.MatchString(start) {
		start = sale
	}
	months, okm := anyInt(body["months"])
	if !okm || months < 1 || months > 120 {
		bad("مدت گارانتی باید بین ۱ تا ۱۲۰ ماه باشد.")
		return
	}
	end := jsonx.Str(body, "endDate")
	if !wDate.MatchString(end) {
		// the page normally sends the end date (counted in Persian months); this is only a fallback
		t, _ := time.Parse("2006-01-02", start)
		end = t.AddDate(0, months, 0).Format("2006-01-02")
	}
	if end < start {
		bad("پایان گارانتی نمی‌تواند پیش از شروع آن باشد.")
		return
	}
	serial := strings.TrimSpace(jsonx.Str(body, "serial"))
	if !wSerial.MatchString(serial) {
		bad("شمارهٔ سریال نامعتبر است.")
		return
	}
	maxKm, _ := anyInt(body["maxKm"])
	if maxKm < 0 || maxKm > 1000000 {
		bad("سقف کیلومتر نامعتبر است.")
		return
	}

	var before jsonx.M
	var raw []byte
	exists := store.Pool.QueryRow(ctx, `SELECT data FROM warranties WHERE id = $1`, id).Scan(&raw) == nil
	if exists {
		before = jsonx.Decode(raw)
		if jsonx.Str(before, "status") == "VOID" {
			bad("این گارانتی باطل شده و قابل ویرایش نیست.")
			return
		}
		if !canManageWarranty(me) && jsonx.Str(before, "createdById") != me.ID() {
			httpx.Error(w, http.StatusForbidden, "فقط ثبت‌کنندهٔ گارانتی یا مدیر می‌تواند آن را ویرایش کند.")
			return
		}
	}
	// the same serial of the same product must not get two warranties
	if serial != "" {
		var dup string
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'warrantyNo', id) FROM warranties
			WHERE id <> $1 AND status <> 'VOID' AND lower(serial) = lower($2) AND lower(COALESCE(data->>'productCode','')) = lower($3) LIMIT 1`,
			id, serial, strings.TrimSpace(jsonx.Str(body, "productCode"))).Scan(&dup)
		if dup != "" {
			httpx.Error(w, http.StatusConflict, "برای این سریال قبلاً گارانتی "+dup+" ثبت شده است.")
			return
		}
	}

	doc := jsonx.M{
		"id": id, "customerId": customerID, "customerName": jsonx.Str(cust, "name"),
		"customerPhone": firstPhone(cust), "productName": product, "productCode": clean(jsonx.Str(body, "productCode"), 60),
		"serial": serial, "invoiceNumber": clean(jsonx.Str(body, "invoiceNumber"), 60), "saleDate": sale, "startDate": start,
		"endDate": end, "months": months, "maxKm": maxKm, "notes": clean(jsonx.Str(body, "notes"), 800), "status": "ACTIVE",
	}
	now := time.Now()
	if exists {
		for _, k := range []string{"warrantyNo", "year", "seq", "createdAt", "createdById", "createdByName"} {
			doc[k] = before[k]
		}
		if _, err := store.Pool.Exec(ctx, `UPDATE warranties SET customer_id = $2, serial = $3, data = $4::jsonb WHERE id = $1`, id, customerID, serial, jsonx.Encode(doc)); err != nil {
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
	year := jalaliYear(now)
	seq, err := reserveNumber(ctx, tx, "warranties", year)
	if err != nil {
		internalError(w)
		return
	}
	doc["year"], doc["seq"] = year, seq
	doc["warrantyNo"] = fmt.Sprintf("G-%d-%04d", year, seq)
	doc["createdAt"], doc["createdById"], doc["createdByName"] = utcNow(), me.ID(), me.Name()
	if _, err := tx.Exec(ctx, `INSERT INTO warranties (id, customer_id, serial, status, year, seq, data) VALUES ($1, $2, $3, 'ACTIVE', $4, $5, $6::jsonb)`,
		id, customerID, serial, year, seq, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

func firstPhone(cust jsonx.M) string {
	if arr, ok := cust["phones"].([]any); ok && len(arr) > 0 {
		if s, ok := arr[0].(string); ok {
			return s
		}
	}
	return ""
}

// POST /api/warranty/items/{id}/void  {reason}
func warrantyVoid(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	reason := clean(jsonx.Str(body, "reason"), 400)
	if reason == "" {
		httpx.Error(w, http.StatusBadRequest, "دلیل باطل‌کردن گارانتی را بنویسید.")
		return
	}
	id := r.PathValue("id")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM warranties WHERE id = $1`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "گارانتی پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	if !canManageWarranty(me) && jsonx.Str(doc, "createdById") != me.ID() {
		httpx.Error(w, http.StatusForbidden, "فقط ثبت‌کنندهٔ گارانتی یا مدیر می‌تواند آن را باطل کند.")
		return
	}
	doc["status"], doc["voidReason"], doc["voidedAt"], doc["voidedById"], doc["voidedByName"] = "VOID", reason, utcNow(), me.ID(), me.Name()
	if _, err := store.Pool.Exec(r.Context(), `UPDATE warranties SET status = 'VOID', data = $2::jsonb WHERE id = $1`, id, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// owners to tell about a claim: the customer's CRM owner, the claim's handler and the person who opened it (never the actor)
func claimAudience(ctx context.Context, doc jsonx.M) []string {
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

func appendLog(doc jsonx.M, entry jsonx.M) {
	log, _ := doc["log"].([]any)
	doc["log"] = append(log, entry)
}

// POST /api/warranty/claims
func claimCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	bad := func(msg string) { httpx.Error(w, http.StatusBadRequest, msg) }
	var wraw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM warranties WHERE id = $1`, jsonx.Str(body, "warrantyId")).Scan(&wraw); err != nil {
		bad("گارانتی مربوط را انتخاب کنید.")
		return
	}
	war := jsonx.Decode(wraw)
	if jsonx.Str(war, "status") == "VOID" {
		bad("این گارانتی باطل شده است.")
		return
	}
	desc := clean(jsonx.Str(body, "description"), 1500)
	if desc == "" {
		bad("شرح خرابی را بنویسید.")
		return
	}
	reported := jsonx.Str(body, "reportedAt")
	if !wDate.MatchString(reported) {
		reported = time.Now().Format("2006-01-02")
	}
	veh, _ := body["vehicle"].(map[string]any)
	km, _ := anyInt(veh["km"])
	vehicle := jsonx.M{"model": clean(jsonx.Str(veh, "model"), 80), "plate": clean(jsonx.Str(veh, "plate"), 30), "km": km}

	// does the warranty still cover it? by date, and by kilometres when the warranty has a limit
	coverage := "IN"
	if reported > jsonx.Str(war, "endDate") {
		coverage = "EXPIRED"
	} else if maxKm, _ := anyInt(war["maxKm"]); maxKm > 0 && km > maxKm {
		coverage = "KM"
	}

	photos := []string{}
	total := 0
	if arr, ok := body["photos"].([]any); ok {
		for _, p := range arr {
			s, _ := p.(string)
			if !strings.HasPrefix(s, "data:image/") {
				continue
			}
			if len(s) > 1_800_000 {
				bad("هر عکس باید کمتر از حدود ۱٫۳ مگابایت باشد.")
				return
			}
			total += len(s)
			photos = append(photos, s)
			if len(photos) == 4 {
				break
			}
		}
	}
	if total > 6_000_000 {
		bad("حجم عکس‌ها زیاد است.")
		return
	}
	handlerID := strings.TrimSpace(jsonx.Str(body, "handlerId"))
	handlerName := ""
	if handlerID != "" {
		if err := store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'fullName','') FROM users WHERE id = $1`, handlerID).Scan(&handlerName); err != nil {
			handlerID = ""
		}
	}

	id := "wc-" + time.Now().UTC().Format("060102150405") + "-" + me.ID()
	doc := jsonx.M{
		"id": id, "warrantyId": jsonx.Str(war, "id"), "warrantyNo": jsonx.Str(war, "warrantyNo"),
		"customerId": jsonx.Str(war, "customerId"), "customerName": jsonx.Str(war, "customerName"), "customerPhone": jsonx.Str(war, "customerPhone"),
		"productName": jsonx.Str(war, "productName"), "productCode": jsonx.Str(war, "productCode"), "serial": jsonx.Str(war, "serial"),
		"description": desc, "reportedAt": reported, "vehicle": vehicle, "coverage": coverage, "status": "RECEIVED",
		"handlerId": handlerID, "handlerName": handlerName, "photos": photos,
		"createdAt": utcNow(), "createdById": me.ID(), "createdByName": me.Name(),
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "create", "byId": me.ID(), "byName": me.Name(), "to": "RECEIVED", "note": "درخواست ثبت شد."})

	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		internalError(w)
		return
	}
	defer tx.Rollback(ctx)
	year := jalaliYear(time.Now())
	seq, err := reserveNumber(ctx, tx, "warranty_claims", year)
	if err != nil {
		internalError(w)
		return
	}
	doc["year"], doc["seq"] = year, seq
	doc["claimNo"] = fmt.Sprintf("C-%d-%04d", year, seq)
	if _, err := tx.Exec(ctx, `INSERT INTO warranty_claims (id, warranty_id, status, year, seq, data) VALUES ($1, $2, 'RECEIVED', $3, $4, $5::jsonb)`,
		id, jsonx.Str(war, "id"), year, seq, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		internalError(w)
		return
	}
	body2 := jsonx.Str(doc, "productName") + " · " + jsonx.Str(doc, "customerName")
	if coverage != "IN" {
		body2 += " (خارج از شرایط گارانتی)"
	}
	notify.Notify(ctx, claimAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "درخواست گارانتی", Title: "درخواست گارانتی تازه " + jsonx.Str(doc, "claimNo"), Body: body2, Ref: ref("warranty", id), Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, doc)
}

func loadClaim(ctx context.Context, id string) (jsonx.M, bool) {
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM warranty_claims WHERE id = $1`, id).Scan(&raw); err != nil {
		return nil, false
	}
	return jsonx.Decode(raw), true
}

func saveClaim(ctx context.Context, doc jsonx.M) error {
	_, err := store.Pool.Exec(ctx, `UPDATE warranty_claims SET status = $2, data = $3::jsonb WHERE id = $1`, jsonx.Str(doc, "id"), jsonx.Str(doc, "status"), jsonx.Encode(doc))
	return err
}

// POST /api/warranty/claims/{id}/status  {status, note, resolution, replacementSerial, cost}
func claimStatus(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	doc, found := loadClaim(ctx, r.PathValue("id"))
	if !found {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	from, to := jsonx.Str(doc, "status"), jsonx.Str(body, "status")
	allowed := false
	for _, n := range claimNext[from] {
		if n == to {
			allowed = true
		}
	}
	if !allowed {
		httpx.Error(w, http.StatusBadRequest, "از «"+claimLabel[from]+"» نمی‌شود به «"+claimLabel[to]+"» رفت.")
		return
	}
	if from == "CLOSED" && !canManageWarranty(me) {
		httpx.Error(w, http.StatusForbidden, "بازکردن دوبارهٔ درخواست بسته‌شده فقط با مدیر است.")
		return
	}
	note := clean(jsonx.Str(body, "note"), 800)
	if to == "REJECTED" && note == "" {
		httpx.Error(w, http.StatusBadRequest, "دلیل رد درخواست را بنویسید.")
		return
	}
	entry := jsonx.M{"at": utcNow(), "kind": "status", "byId": me.ID(), "byName": me.Name(), "from": from, "to": to, "note": note}
	if to == "RESOLVED" {
		res := jsonx.Str(body, "resolution")
		if _, ok := resolutionLabel[res]; !ok {
			httpx.Error(w, http.StatusBadRequest, "نوع اقدام (تعویض، تعمیر، اعتبار…) را انتخاب کنید.")
			return
		}
		doc["resolution"] = res
		doc["replacementSerial"] = clean(jsonx.Str(body, "replacementSerial"), 60)
		cost, _ := anyInt(body["cost"])
		if cost < 0 {
			cost = 0
		}
		doc["cost"] = cost
		entry["resolution"] = res
	}
	doc["status"] = to
	if to == "CLOSED" || to == "REJECTED" || to == "RESOLVED" {
		doc["closedAt"] = utcNow()
	} else {
		delete(doc, "closedAt")
	}
	appendLog(doc, entry)
	if err := saveClaim(ctx, doc); err != nil {
		internalError(w)
		return
	}
	label := claimLabel[to]
	if to == "RESOLVED" {
		label += " (" + resolutionLabel[jsonx.Str(doc, "resolution")] + ")"
	}
	notify.Notify(ctx, claimAudience(ctx, doc), notify.Note{
		Kind: "task", Label: "گارانتی", Title: "درخواست " + jsonx.Str(doc, "claimNo") + ": " + label, Body: strings.TrimSpace(jsonx.Str(doc, "productName") + " · " + jsonx.Str(doc, "customerName") + " " + note), Ref: ref("warranty", jsonx.Str(doc, "id")), Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/warranty/claims/{id}/note  {text}
func claimNote(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := clean(jsonx.Str(body, "text"), 800)
	if text == "" {
		httpx.Error(w, http.StatusBadRequest, "متن یادداشت را بنویسید.")
		return
	}
	doc, found := loadClaim(r.Context(), r.PathValue("id"))
	if !found {
		httpx.Error(w, http.StatusNotFound, "درخواست پیدا نشد.")
		return
	}
	appendLog(doc, jsonx.M{"at": utcNow(), "kind": "note", "byId": me.ID(), "byName": me.Name(), "note": text})
	if err := saveClaim(r.Context(), doc); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, doc)
}

// POST /api/warranty/claims/{id}/assign  {handlerId}
func claimAssign(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !canUseWarranty(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := loadClaim(r.Context(), r.PathValue("id"))
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
	if err := saveClaim(r.Context(), doc); err != nil {
		internalError(w)
		return
	}
	if hid != "" {
		notify.Notify(r.Context(), []string{hid}, notify.Note{
			Kind: "task", Label: "درخواست گارانتی", Title: "پیگیری درخواست گارانتی " + jsonx.Str(doc, "claimNo") + " به شما سپرده شد", Body: jsonx.Str(doc, "productName") + " · " + jsonx.Str(doc, "customerName"), Ref: ref("warranty", jsonx.Str(doc, "id")), Repeat: true,
		}, me.ID())
	}
	httpx.JSON(w, http.StatusOK, doc)
}

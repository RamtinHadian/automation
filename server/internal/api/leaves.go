package api

import (
	"net/http"
	"regexp"
"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Leave requests («درخواست مرخصی»). An employee's request goes to the manager of their unit; when the unit has no manager (or the employee is
// the manager) it goes to the CEO (the person who holds the «can sign official letters» tick). The CEO can always decide too. The server keeps
// this honest: only the CEO or the unit's manager can decide, only a pending request can be decided, and an employee can only cancel his own pending request.

var leaveTypes = map[string]string{
	"ANNUAL":  "مرخصی استحقاقی",
	"SICK":    "مرخصی استعلاجی",
	"UNPAID":  "مرخصی بدون حقوق",
	"HOURLY":  "مرخصی ساعتی",
	"MISSION": "ماموریت",
	"OTHER":   "سایر",
}

var (
	leaveDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	leaveTime = regexp.MustCompile(`^\d{2}:\d{2}$`)
)

func isCEO(me auth.User) bool { return jsonx.Bool(me.M, "canSignOfficialLetters") }

func ceoIDs(r *http.Request) []string {
	rows, err := store.Pool.Query(r.Context(), `SELECT id FROM users WHERE data->>'canSignOfficialLetters' = 'true'`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out
}

// POST /api/leaves
func leaveCreate(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r)
	if jsonx.Str(body, "kind") == "advance" {
		advanceCreate(w, r, me, body)
		return
	}
	typ := jsonx.Str(body, "type")
	label, known := leaveTypes[typ]
	from, to := jsonx.Str(body, "fromDate"), jsonx.Str(body, "toDate")
	if !known || !leaveDate.MatchString(from) {
		httpx.Error(w, http.StatusBadRequest, "نوع مرخصی یا تاریخ درست نیست.")
		return
	}
	hourly := typ == "HOURLY"
	if hourly || !leaveDate.MatchString(to) {
		to = from
	}
	if to < from {
		httpx.Error(w, http.StatusBadRequest, "تاریخ پایان نباید قبل از تاریخ شروع باشد.")
		return
	}
	ft, tt := jsonx.Str(body, "fromTime"), jsonx.Str(body, "toTime")
	if hourly && (!leaveTime.MatchString(ft) || !leaveTime.MatchString(tt) || tt <= ft) {
		httpx.Error(w, http.StatusBadRequest, "ساعت شروع و پایان مرخصی ساعتی را درست وارد کنید.")
		return
	}
	reason := strings.TrimSpace(jsonx.Str(body, "reason"))
	if len([]rune(reason)) > 600 {
		reason = string([]rune(reason)[:600])
	}
	id := "lv-" + time.Now().UTC().Format("060102150405") + "-" + me.ID() + "-" + randomHex(2)
	doc := jsonx.M{
		"id": id, "userId": me.ID(), "userName": me.Name(), "departmentName": jsonx.Str(me.M, "departmentName"),
		"type": typ, "typeLabel": label, "fromDate": from, "toDate": to, "reason": reason, "status": "PENDING",
		"createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if hourly {
		doc["fromTime"], doc["toTime"] = ft, tt
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO leave_requests (id, user_id, status, data) VALUES ($1, $2, 'PENDING', $3::jsonb)`, id, me.ID(), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	span := from
	if to != from {
		span += " تا " + to
	}
	notifyTo := ceoIDs(r)
	if m := unitManagerOf(r.Context(), me.ID()); m != "" {
		notifyTo = []string{m}
	}
	notify.Notify(r.Context(), notifyTo, notify.Note{
		Kind: "task", Label: "درخواست مرخصی", Title: "درخواست " + label + " از " + me.Name(), Body: span, Ref: ref("leave", id), Repeat: true,
	}, me.ID())
	names := []string{}
	for _, uid := range notifyTo {
		var n string
		if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, uid).Scan(&n) == nil && n != "" {
			names = append(names, n)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "to": names})
}

// advanceCreate: «درخواست مساعده» (an advance on the salary). The same road as a leave: the manager of the unit, or the CEO, decides.
func advanceCreate(w http.ResponseWriter, r *http.Request, me auth.User, body jsonx.M) {
	amount, okA := whNum(body, "amount")
	if !okA || amount <= 0 || amount > 1e12 {
		httpx.Error(w, http.StatusBadRequest, "مبلغ مساعده را درست بنویسید.")
		return
	}
	inst := 1
	if n, ok := whNum(body, "installments"); ok && n >= 1 && n <= 36 {
		inst = int(n)
	}
	reason := strings.TrimSpace(jsonx.Str(body, "reason"))
	if len([]rune(reason)) > 600 {
		reason = string([]rune(reason)[:600])
	}
	need := jsonx.Str(body, "needDate")
	today := time.Now().UTC().Format("2006-01-02")
	if !leaveDate.MatchString(need) {
		need = today
	}
	id := "lv-" + time.Now().UTC().Format("060102150405") + "-" + me.ID() + "-" + randomHex(2)
	doc := jsonx.M{
		"id": id, "kind": "advance", "userId": me.ID(), "userName": me.Name(), "departmentName": jsonx.Str(me.M, "departmentName"),
		"type": "ADVANCE", "typeLabel": "مساعده", "fromDate": need, "toDate": need, "amount": amount, "installments": inst, "needDate": need, "reason": reason, "status": "PENDING",
		"createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO leave_requests (id, user_id, status, data) VALUES ($1, $2, 'PENDING', $3::jsonb)`, id, me.ID(), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	notifyTo := ceoIDs(r)
	if m := unitManagerOf(r.Context(), me.ID()); m != "" {
		notifyTo = []string{m}
	}
	notify.Notify(r.Context(), notifyTo, notify.Note{
		Kind: "task", Label: "درخواست مساعده", Title: "درخواست مساعده از " + me.Name(), Body: strconv.FormatFloat(amount, 'f', 0, 64) + " تومان", Ref: ref("leave", id), Repeat: true,
	}, me.ID())
	names := []string{}
	for _, uid := range notifyTo {
		var n string
		if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, uid).Scan(&n) == nil && n != "" {
			names = append(names, n)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "to": names})
}

// GET /api/leaves?scope=mine|all|forwarded   («all» is for the CEO, the managers and the console; «forwarded» is what the CEO sent on to me after approving)
func leaveList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	q := `SELECT data FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300`
	args := []any{me.ID()}
	managed := managedStaff(r.Context(), me.ID())
if r.URL.Query().Get("scope") == "forwarded" {
q, args = `SELECT data FROM leave_requests WHERE status = 'APPROVED' AND data->'forwardIds' @> to_jsonb($1::text) ORDER BY created_at DESC LIMIT 300`, []any{me.ID()}
}
if r.URL.Query().Get("scope") == "all" {
switch {
		case isCEO(me) || me.Role() == "SUPER_ADMIN":
			q, args = `SELECT data FROM leave_requests ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 500`, nil
		case len(managed) > 0: // a unit manager sees the requests of the unit's people
			q, args = `SELECT data FROM leave_requests WHERE user_id = ANY($1::text[]) ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 500`, []any{managed}
		default:
			httpx.Forbidden(w)
			return
		}
	}
	list, err := store.RawList(r.Context(), q, args...)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"leaves": list, "canDecide": isCEO(me) || len(managed) > 0})
}

// POST /api/leaves/{id}/decide  {status: APPROVED|REJECTED, note}
func leaveDecide(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	status := jsonx.Str(body, "status")
	if status != "APPROVED" && status != "REJECTED" {
		httpx.Error(w, http.StatusBadRequest, "وضعیت درست نیست.")
		return
	}
	id := r.PathValue("id")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM leave_requests WHERE id = $1 AND status = 'PENDING'`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "این درخواست پیدا نشد یا قبلاً تصمیم‌گیری شده است.")
		return
	}
	doc := jsonx.Decode(raw)
	if !isCEO(me) && !isManagerOf(managedStaff(r.Context(), me.ID()), jsonx.Str(doc, "userId")) {
		httpx.Error(w, http.StatusForbidden, "فقط مدیرعامل یا مدیر واحدِ همین همکار می‌تواند مرخصی را تایید یا رد کند.")
		return
	}
doc["status"], doc["decidedBy"], doc["decidedByName"], doc["decidedAt"] = status, me.ID(), me.Name(), time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	// after an approval the request is sent on to the people who have to act on it (the accountant for an advance, the personnel officer for a leave…)
	forwardIDs := []string{}
	forwardNames := []string{}
	if status == "APPROVED" {
		for _, uid := range jsonx.Strings(body, "forwardTo") {
			var n string
			if uid == jsonx.Str(doc, "userId") || store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1 AND COALESCE(data->>'isActive', 'true') <> 'false'`, uid).Scan(&n) != nil {
				continue
			}
			if !jsonx.Contains(forwardIDs, uid) {
				forwardIDs, forwardNames = append(forwardIDs, uid), append(forwardNames, n)
			}
		}
		if len(forwardIDs) > 0 {
			doc["forwardIds"], doc["forwardNames"] = forwardIDs, forwardNames
		}
	}
	if note := strings.TrimSpace(jsonx.Str(body, "note")); note != "" {
		doc["note"] = note
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE leave_requests SET status = $2, data = $3::jsonb WHERE id = $1`, id, status, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
word := map[string]string{"APPROVED": "تایید شد", "REJECTED": "رد شد"}[status]
	thing := "مرخصی"
	if jsonx.Str(doc, "kind") == "advance" {
		thing = "مساعده"
	}
	body2 := jsonx.Str(doc, "note")
	if len(forwardNames) > 0 {
		body2 = strings.TrimSpace(body2 + " · ارجاع شد به: " + strings.Join(forwardNames, "، "))
	}
	notify.Notify(r.Context(), []string{jsonx.Str(doc, "userId")}, notify.Note{
		Kind: "task", Label: thing + " " + word, Title: jsonx.Str(doc, "typeLabel") + " شما " + word, Body: body2, Ref: ref("leave", id), Repeat: true,
	}, me.ID())
	if len(forwardIDs) > 0 {
		notify.Notify(r.Context(), forwardIDs, notify.Note{
			Kind: "task", Label: "ارجاع " + thing, Title: jsonx.Str(doc, "typeLabel") + " تأییدشدهٔ " + jsonx.Str(doc, "userName") + " برای اقدام شما ارجاع شد", Body: "تأیید: " + me.Name(), Ref: ref("leave", id), Repeat: true,
		}, me.ID())
	}
	httpx.OK(w)
}

// DELETE /api/leaves/{id}: the employee withdraws his own pending request
func leaveCancel(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	tag, err := store.Pool.Exec(r.Context(), `DELETE FROM leave_requests WHERE id = $1 AND user_id = $2 AND status = 'PENDING'`, r.PathValue("id"), me.ID())
	if err != nil {
		internalError(w)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Error(w, http.StatusForbidden, "فقط درخواست در انتظارِ خودتان را می‌توانید پس بگیرید.")
		return
	}
	httpx.OK(w)
}

package api

import (
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

// Leave requests («درخواست مرخصی»). An employee sends a request and it goes straight to the CEO (the person who holds the
// «can sign official letters» tick); nobody else approves. The server keeps this honest: only the CEO can decide,
// only a pending request can be decided, and an employee can only cancel his own pending request.

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
	id := "lv-" + time.Now().UTC().Format("060102150405") + "-" + me.ID()
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
	notify.Notify(r.Context(), ceoIDs(r), notify.Note{
		Kind: "task", Label: "درخواست مرخصی", Title: "درخواست " + label + " از " + me.Name(), Body: span, Ref: ref("leave", id), Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

// GET /api/leaves?scope=mine|all   («all» is for the CEO)
func leaveList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	q := `SELECT data FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 300`
	args := []any{me.ID()}
	if r.URL.Query().Get("scope") == "all" {
		if !isCEO(me) && me.Role() != "SUPER_ADMIN" {
			httpx.Forbidden(w)
			return
		}
		q, args = `SELECT data FROM leave_requests ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 500`, nil
	}
	list, err := store.RawList(r.Context(), q, args...)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"leaves": list, "canDecide": isCEO(me)})
}

// POST /api/leaves/{id}/decide  {status: APPROVED|REJECTED, note}
func leaveDecide(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !isCEO(me) {
		httpx.Error(w, http.StatusForbidden, "فقط مدیرعامل می‌تواند مرخصی را تایید یا رد کند.")
		return
	}
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
	doc["status"], doc["decidedBy"], doc["decidedByName"], doc["decidedAt"] = status, me.ID(), me.Name(), time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if note := strings.TrimSpace(jsonx.Str(body, "note")); note != "" {
		doc["note"] = note
	}
	if _, err := store.Pool.Exec(r.Context(), `UPDATE leave_requests SET status = $2, data = $3::jsonb WHERE id = $1`, id, status, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	word := map[string]string{"APPROVED": "تایید شد", "REJECTED": "رد شد"}[status]
	notify.Notify(r.Context(), []string{jsonx.Str(doc, "userId")}, notify.Note{
		Kind: "task", Label: "مرخصی " + word, Title: jsonx.Str(doc, "typeLabel") + " شما " + word, Body: jsonx.Str(doc, "note"), Ref: ref("leave", id), Repeat: true,
	}, me.ID())
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

package api

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func ref(kind, id string) jsonx.M { return jsonx.M{"type": kind, "id": id} }

func without(list []string, drop string) []string {
	out := []string{}
	for _, v := range list {
		if v != drop {
			out = append(out, v)
		}
	}
	return out
}

// ---------- daily reports: one per person per day (id = "<userId>_<yyyy-mm-dd>"), written only by its author ----------

func putReport(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	ctx := r.Context()
	if !me.CanUseTasks() {
		httpx.Forbidden(w)
		return
	}
	date := jsonx.Str(data, "date")
	if !dateRe.MatchString(date) {
		httpx.Error(w, http.StatusBadRequest, "bad date")
		return
	}
	if id != me.ID()+"_"+date {
		httpx.Forbidden(w)
		return
	}
	recipients := without(jsonx.Strings(data, "recipientIds"), me.ID())
	var exists int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM daily_reports WHERE id = $1`, id).Scan(&exists)

	doc := jsonx.Copy(data)
	doc["id"], doc["userId"], doc["authorName"], doc["date"] = id, me.ID(), me.Name(), date
	doc["recipientIds"] = recipients
	doc["updatedAt"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO daily_reports (id, user_id, report_date, recipient_ids, data) VALUES ($1, $2, $3, $4, $5::jsonb)
		 ON CONFLICT (id) DO UPDATE SET recipient_ids = $4, data = $5::jsonb, updated_at = now()`,
		id, me.ID(), date, recipients, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	if exists == 0 {
		summary := strings.TrimSpace(jsonx.Str(doc, "summary"))
		if r := []rune(summary); len(r) > 90 {
			summary = string(r[:90])
		}
		if summary == "" {
			summary = "گزارش جدید ثبت شد"
		}
		notify.Notify(ctx, recipients, notify.Note{Kind: "task", Label: "گزارش روزانه", Title: "گزارش روزانه از " + me.Name(), Body: summary, Ref: ref("report", id)}, me.ID())
	}
	httpx.OK(w)
}

func removeReport(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	var owner string
	err := store.Pool.QueryRow(r.Context(), `SELECT user_id FROM daily_reports WHERE id = $1`, id).Scan(&owner)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	if !me.IsAdmin() && owner != me.ID() {
		httpx.Forbidden(w)
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM daily_reports WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- tasks ----------

var statusFA = map[string]string{"TODO": "انجام نشده", "IN_PROGRESS": "در حال انجام", "REVIEW": "در انتظار بررسی", "DONE": "انجام شده"}

func putTask(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	ctx := r.Context()
	if !me.CanUseTasks() {
		httpx.Forbidden(w)
		return
	}
	var creator string
	var assignees []string
	var exRaw []byte
	err := store.Pool.QueryRow(ctx, `SELECT COALESCE(creator_id, ''), assignee_ids, data FROM tasks WHERE id = $1`, id).Scan(&creator, &assignees, &exRaw)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	before := jsonx.Decode(exRaw)

	var doc jsonx.M
	switch {
	case !exists:
		doc = jsonx.Copy(data)
		doc["id"], doc["creatorId"], doc["creatorName"] = id, me.ID(), me.Name()
	case me.IsAdmin() || creator == me.ID():
		doc = jsonx.Copy(data)
		doc["id"], doc["creatorId"], doc["creatorName"] = id, creator, before["creatorName"]
	case jsonx.Contains(assignees, me.ID()):
		// Assignees may move the task along, tick the checklist and comment; nothing else.
		doc = jsonx.Copy(before)
		for _, k := range []string{"status", "checklist", "comments"} {
			if v, ok := data[k]; ok && v != nil {
				doc[k] = v
			}
		}
		if v, ok := data["completedAt"]; ok {
			doc["completedAt"] = v
		} else {
			delete(doc, "completedAt")
		}
		if v, ok := data["updatedAt"]; ok && v != nil {
			doc["updatedAt"] = v
		}
	default:
		httpx.Forbidden(w)
		return
	}

	newAssignees := jsonx.Strings(doc, "assigneeIds")
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO tasks (id, creator_id, assignee_ids, data) VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (id) DO UPDATE SET assignee_ids = $3, data = $4::jsonb`,
		id, jsonx.Str(doc, "creatorId"), newAssignees, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}

	rf := ref("task", id)
	title := jsonx.Str(doc, "title")
	involved := append([]string{jsonx.Str(doc, "creatorId")}, newAssignees...)
	if !exists {
		notify.Notify(ctx, newAssignees, notify.Note{Kind: "task", Label: "وظیفه جدید", Title: "وظیفه جدید از " + me.Name(), Body: title, Ref: rf}, me.ID())
		httpx.OK(w)
		return
	}

	var added []string
	for _, a := range newAssignees {
		if !jsonx.Contains(assignees, a) {
			added = append(added, a)
		}
	}
	notify.Notify(ctx, added, notify.Note{Kind: "task", Label: "واگذار شد", Title: "وظیفه‌ای به شما واگذار شد (" + me.Name() + ")", Body: title, Ref: rf}, me.ID())
	if jsonx.Str(before, "status") != jsonx.Str(doc, "status") {
		st := jsonx.Str(doc, "status")
		label := statusFA[st]
		if label == "" {
			label = "تغییر وضعیت"
		}
		shown := statusFA[st]
		if shown == "" {
			shown = st
		}
		var others []string
		for _, u := range involved {
			if !jsonx.Contains(added, u) {
				others = append(others, u)
			}
		}
		notify.Notify(ctx, others, notify.Note{Kind: "task", Label: label, Title: "وضعیت وظیفه تغییر کرد: " + shown, Body: title + " — توسط " + me.Name(), Ref: rf}, me.ID())
	}
	oldComments := len(jsonx.Arr(before, "comments"))
	comments := jsonx.Arr(doc, "comments")
	if len(comments) > oldComments {
		for _, c := range comments[oldComments:] {
			cm, _ := c.(map[string]any)
			notify.Notify(ctx, involved, notify.Note{Kind: "task", Label: "نظر جدید", Title: "نظر جدید در وظیفه «" + title + "»", Body: jsonx.Str(cm, "userName") + ": " + jsonx.Str(cm, "text"), Ref: rf}, me.ID())
		}
	}
	httpx.OK(w)
}

func removeTask(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	var creator string
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(creator_id, '') FROM tasks WHERE id = $1`, id).Scan(&creator)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	if !me.IsAdmin() && creator != me.ID() {
		httpx.Forbidden(w)
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM tasks WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- transfers: files and official letters ----------
// The sender, the recipients and admins can change a transfer.

func putTransfer(w http.ResponseWriter, r *http.Request, me auth.User, id string, data jsonx.M) {
	ctx := r.Context()
	var sender string
	var exRecipients []string
	var exRaw []byte
	err := store.Pool.QueryRow(ctx, `SELECT COALESCE(sender_id, ''), recipient_ids, data FROM transfers WHERE id = $1`, id).Scan(&sender, &exRecipients, &exRaw)
	exists := err == nil
	if err != nil && err != pgx.ErrNoRows {
		internalError(w)
		return
	}
	before := jsonx.Decode(exRaw)

	dataSender := jsonx.Str(jsonx.Sub(data, "sender"), "id")
	var allowed bool
	if exists {
		allowed = me.IsAdmin() || sender == me.ID() || jsonx.Contains(exRecipients, me.ID())
	} else {
		allowed = me.IsAdmin() || dataSender == me.ID()
	}
	if !allowed {
		httpx.Forbidden(w)
		return
	}
	senderID := sender
	if !exists {
		senderID = dataSender
		if senderID == "" {
			senderID = me.ID()
		}
	}
	recipients := jsonx.IDs(data, "recipients")

	doc := jsonx.Copy(data)
	doc["id"] = id
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4::jsonb)
		 ON CONFLICT (id) DO UPDATE SET recipient_ids = $3, data = $4::jsonb, updated_at = now()`,
		id, senderID, recipients, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}

	isLetter := jsonx.Bool(data, "isOfficialLetter")
	kind := "file"
	if isLetter {
		kind = "letter"
	}
	rf := ref(kind, id)
	name := jsonx.Str(data, "fileName")
	if name == "" {
		name = "بدون عنوان"
	}

	if !exists {
		if isLetter {
			label, title := "نامه جدید", "نامه جدید از "+me.Name()
			if jsonx.Str(data, "signatureStatus") == "PENDING_SIGNATURE" {
				label, title = "جهت امضا", "نامه جدید جهت امضا از "+me.Name()
			}
			notify.Notify(ctx, recipients, notify.Note{Kind: "letter", Label: label, Title: title, Body: name, Ref: rf}, me.ID())
		} else {
			notify.Notify(ctx, recipients, notify.Note{Kind: "file", Label: "فایل جدید", Title: "فایل جدید از " + me.Name(), Body: name, Ref: rf}, me.ID())
		}
		httpx.OK(w)
		return
	}

	by := " — توسط " + me.Name()
	if jsonx.Str(data, "signatureStatus") != jsonx.Str(before, "signatureStatus") {
		switch jsonx.Str(data, "signatureStatus") {
		case "SIGNED":
			notify.Notify(ctx, append([]string{sender}, recipients...), notify.Note{Kind: "letter", Label: "امضا شد", Title: "نامه امضا شد", Body: name + by, Ref: rf}, me.ID())
		case "REJECTED":
			notify.Notify(ctx, []string{sender}, notify.Note{Kind: "alert", Label: "رد شد", Title: "نامه رد شد", Body: name + by, Ref: rf}, me.ID())
		}
	}
	var added []string
	for _, rid := range recipients {
		if !jsonx.Contains(exRecipients, rid) {
			added = append(added, rid)
		}
	}
	if len(added) > 0 {
		body := name
		if refs := jsonx.Arr(data, "referrals"); len(refs) > 0 {
			if last, ok := refs[len(refs)-1].(map[string]any); ok && jsonx.Str(last, "comment") != "" {
				body = name + " — " + jsonx.Str(last, "comment")
			}
		}
		notify.Notify(ctx, added, notify.Note{Kind: "letter", Label: "ارجاع", Title: "ارجاع نامه از " + me.Name(), Body: body, Ref: rf}, me.ID())
	}
	if jsonx.Int(data, "downloadsCount") > jsonx.Int(before, "downloadsCount") && me.ID() != sender {
		notify.Notify(ctx, []string{sender}, notify.Note{Kind: "file", Label: "دریافت شد", Title: me.Name() + " فایل را دریافت کرد", Body: name, Ref: rf}, me.ID())
	}
	httpx.OK(w)
}

// A file or letter that was sent can never be deleted or hidden: not by the sender, not by a recipient, not by an admin.
// The record stays for everyone concerned and for the audit trail.
func removeTransfer(w http.ResponseWriter, _ *http.Request, _ auth.User, _ string) {
	httpx.Forbidden(w)
}

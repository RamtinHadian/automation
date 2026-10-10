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
	var exists int
	var ownerID, ownerName string
	_ = store.Pool.QueryRow(ctx, `SELECT count(*), COALESCE(max(user_id), ''), COALESCE(max(data->>'authorName'), '') FROM daily_reports WHERE id = $1`, id).Scan(&exists, &ownerID, &ownerName)
	super := me.Role() == "SUPER_ADMIN"
	if exists > 0 && !super {
		// a report that was sent is final: only the top admin can change it
		httpx.Error(w, http.StatusForbidden, "گزارش ارسال‌شده قابل ویرایش نیست؛ فقط مدیر ارشد سامانه می‌تواند آن را تغییر دهد.")
		return
	}
	if id != me.ID()+"_"+date && !(super && exists > 0) {
		httpx.Forbidden(w)
		return
	}
	authorID, authorName := me.ID(), me.Name()
	if exists > 0 && ownerID != "" {
		authorID, authorName = ownerID, ownerName // the top admin's change does not make the report his own
	}
	recipients := without(jsonx.Strings(data, "recipientIds"), authorID)

	doc := jsonx.Copy(data)
	doc["id"], doc["userId"], doc["authorName"], doc["date"] = id, authorID, authorName, date
	doc["recipientIds"] = recipients
	doc["updatedAt"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO daily_reports (id, user_id, report_date, recipient_ids, data) VALUES ($1, $2, $3, $4, $5::jsonb)
		 ON CONFLICT (id) DO UPDATE SET recipient_ids = $4, data = $5::jsonb, updated_at = now()`,
		id, authorID, date, recipients, jsonx.Encode(doc)); err != nil {
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
	// deleting would be a way round «sent reports cannot be edited» (delete, write again): the top admin only
	if me.Role() != "SUPER_ADMIN" {
		httpx.Error(w, http.StatusForbidden, "حذف گزارش ارسال‌شده فقط با مدیر ارشد سامانه است.")
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
		for _, k := range []string{"status", "checklist", "comments", "archived"} {
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

	// only finished work can be archived (and a task that moves again leaves the archive)
	if jsonx.Bool(doc, "archived") && jsonx.Str(doc, "status") != "DONE" {
		delete(doc, "archived")
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
	var assignees []string
	var traw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(creator_id, ''), assignee_ids, data FROM tasks WHERE id = $1`, id).Scan(&creator, &assignees, &traw)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	// nobody deletes a task except the top admin; finished work is archived instead
	if me.Role() != "SUPER_ADMIN" {
		httpx.Error(w, http.StatusForbidden, "حذف وظیفه فقط با مدیر ارشد سامانه است؛ کار پایان‌یافته را بایگانی کنید.")
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM tasks WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	notify.Notify(r.Context(), append([]string{creator}, assignees...), notify.Note{
		Kind: "alert", Label: "وظیفه حذف شد", Title: "وظیفه حذف شد: " + jsonx.Str(jsonx.Decode(traw), "title"), Repeat: true,
	}, me.ID())
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
	// Only the person who holds the CEO tick may sign a letter.
	if jsonx.Bool(data, "isOfficialLetter") && jsonx.Str(data, "signatureStatus") == "SIGNED" &&
		(!exists || jsonx.Str(before, "signatureStatus") != "SIGNED") && !jsonx.Bool(me.M, "canSignOfficialLetters") {
		httpx.Error(w, http.StatusForbidden, "فقط مدیرعامل می‌تواند نامه را امضا کند.")
		return
	}
	// A signed letter is final: its text and number can no longer change.
	if exists && jsonx.Str(before, "signatureStatus") == "SIGNED" && jsonx.Bool(before, "isOfficialLetter") &&
		(jsonx.Str(data, "letterContentHtml") != jsonx.Str(before, "letterContentHtml") || jsonx.Str(data, "letterNumber") != jsonx.Str(before, "letterNumber")) {
		httpx.Error(w, http.StatusForbidden, "نامهٔ امضاشده قابل ویرایش نیست.")
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
	// the admin's «file deleted» / «keep» marks are the server's, not the client's
	keepMarkers(before, doc)
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
	if isLetter && me.ID() == sender && jsonx.Str(data, "signatureStatus") != "SIGNED" &&
		(jsonx.Str(data, "letterContentHtml") != jsonx.Str(before, "letterContentHtml") || jsonx.Str(data, "fileName") != jsonx.Str(before, "fileName")) {
		notify.Notify(ctx, recipients, notify.Note{Kind: "letter", Label: "ویرایش نامه", Title: "نامه ویرایش شد", Body: name + by, Ref: rf, Repeat: true}, me.ID())
	}
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

// A file or letter that was sent can never be deleted by its recipients, and a sent file not even by its sender.
// Allowed: (1) the author of an official letter deletes it while it is not signed yet; (2) an admin removes a single
// item from the admin panel's transfer monitoring. A signed official letter stays protected in every case.
func removeTransfer(w http.ResponseWriter, r *http.Request, me auth.User, id string) {
	var sender string
	var rcpts []string
	var raw []byte
	err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(sender_id, ''), recipient_ids, data FROM transfers WHERE id = $1`, id).Scan(&sender, &rcpts, &raw)
	if err == pgx.ErrNoRows {
		httpx.OK(w)
		return
	}
	if err != nil {
		internalError(w)
		return
	}
	doc := jsonx.Decode(raw)
	isLetter := jsonx.Bool(doc, "isOfficialLetter")
	if isLetter && jsonx.Str(doc, "signatureStatus") == "SIGNED" {
		httpx.Error(w, http.StatusForbidden, "نامهٔ رسمی امضاشده قابل حذف نیست.")
		return
	}
	authorOfUnsignedLetter := isLetter && sender == me.ID()
	if !me.IsAdmin() && !authorOfUnsignedLetter {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM transfers WHERE id = $1`, id)
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM transfer_hidden WHERE transfer_id = $1`, id)
	deleteStoredFiles(id)
	what, label := "فایل", "فایل حذف شد"
	if isLetter {
		what, label = "نامه", "نامه حذف شد"
	}
	notify.Notify(r.Context(), append([]string{sender}, rcpts...), notify.Note{
		Kind: "alert", Label: label, Title: what + " حذف شد: " + jsonx.Str(doc, "fileName"), Body: "توسط " + me.Name(), Repeat: true,
	}, me.ID())
	httpx.OK(w)
}

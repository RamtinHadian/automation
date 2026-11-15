package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Internal correspondence («مکاتبات داخلی»): letters between the people of one company, sent UP the organisation chart.
//
// The chart is: a person → the manager of their unit → (the manager of the unit above, a manager of another unit of the same rank, or the
// managing director). A person who has a unit manager can only send to that manager first; the manager then decides where it goes next
// (forward to a peer manager, a higher manager or the managing director) or returns it with a reason. Every step is written into the letter's
// own history and into the audit journal; nothing is ever deleted.

type icPerson struct {
	id, name, dept string
	ceo, active    bool
}

func icUser(ctx context.Context, id string) (icPerson, bool) {
	var d []byte
	if id == "" || store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, id).Scan(&d) != nil {
		return icPerson{}, false
	}
	m := jsonx.Decode(d)
	return icPerson{id: id, name: jsonx.Str(m, "fullName"), dept: jsonx.Str(m, "departmentId"), ceo: jsonx.Bool(m, "canSignOfficialLetters"), active: jsonx.Str(m, "isActive") != "false"}, true
}

func icCEO(ctx context.Context) string {
	var id string
	_ = store.Pool.QueryRow(ctx, `SELECT id FROM users WHERE data->>'canSignOfficialLetters' = 'true' AND COALESCE(data->>'isActive','true') <> 'false' ORDER BY created_at LIMIT 1`).Scan(&id)
	return id
}

type icDept struct{ manager, parent string }

func icDepts(ctx context.Context) map[string]icDept {
	out := map[string]icDept{}
	rows, err := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'managerId',''), COALESCE(data->>'parentId','') FROM departments`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var d icDept
		if rows.Scan(&id, &d.manager, &d.parent) == nil {
			out[id] = d
		}
	}
	return out
}

func icActive(ctx context.Context, id string) bool {
	p, ok := icUser(ctx, id)
	return ok && p.active
}

// icUnitManager: the manager of the person's own unit ("" when there is none, or the person is the manager).
func icUnitManager(depts map[string]icDept, ctx context.Context, p icPerson) string {
	m := depts[p.dept].manager
	if m == "" || m == p.id || !icActive(ctx, m) {
		return ""
	}
	return m
}

// icUpward: who a manager (or a person whose unit has no manager) may send to: the managers of the units above, the managers of the other
// units (same rank) and the managing director. The managing director has nobody above.
func icUpward(ctx context.Context, depts map[string]icDept, p icPerson) []string {
	if p.ceo {
		return nil
	}
	seen := map[string]bool{p.id: true}
	out := []string{}
	add := func(id string) {
		if id != "" && !seen[id] && icActive(ctx, id) {
			seen[id] = true
			out = append(out, id)
		}
	}
	// the chain of units above, nearest first
	d, hops := depts[p.dept].parent, 0
	for d != "" && hops < 20 {
		add(depts[d].manager)
		d = depts[d].parent
		hops++
	}
	// managers of the other units
	for id, dd := range depts {
		if id != p.dept {
			add(dd.manager)
		}
	}
	add(icCEO(ctx))
	return out
}

// icLadder: where a letter written by this person goes first (the unit manager only, or the upward list when the person has no unit manager).
func icLadder(ctx context.Context, depts map[string]icDept, p icPerson) []string {
	if p.ceo { // the managing director's letters are delivered at once
		return nil
	}
	if m := icUnitManager(depts, ctx, p); m != "" {
		return []string{m}
	}
	return icUpward(ctx, depts, p)
}

// icFinalTargets: who a person may address a letter to (the unit manager and everything above him).
func icFinalTargets(ctx context.Context, depts map[string]icDept, p icPerson) []string {
	out := []string{}
	seen := map[string]bool{p.id: true}
	push := func(ids []string) {
		for _, id := range ids {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
	}
	if p.ceo {
		rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE COALESCE(data->>'isActive','true') <> 'false' AND id <> $1 ORDER BY created_at`, p.id)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					out = append(out, id)
				}
			}
		}
		return out
	}
	lad := icLadder(ctx, depts, p)
	push(lad)
	if m := icUnitManager(depts, ctx, p); m != "" {
		if mp, ok := icUser(ctx, m); ok {
			push(icUpward(ctx, depts, mp))
		}
	}
	return out
}

// icSignature: the sample signature of the writer (his own, or for the managing director the one in the settings), copied into the
// letter when it is written so the letter keeps the signature it was sent with.
func icSignature(ctx context.Context, p icPerson) string {
	var sig string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'signatureUrl','') FROM users WHERE id = $1`, p.id).Scan(&sig)
	if sig == "" && p.ceo {
		sig = jsonx.Str(settingDoc(ctx, "main"), "ceoSignatureUrl")
	}
	if !strings.HasPrefix(sig, "data:image/") || len(sig) > 400*1024 {
		return ""
	}
	return sig
}

func icNowStr() string { return time.Now().UTC().Format("2006-01-02T15:04:05.000Z") }

func icEvent(by auth.User, action, toID, toName, note string) jsonx.M {
	e := jsonx.M{"at": icNowStr(), "byId": by.ID(), "byName": by.Name(), "action": action}
	if toID != "" {
		e["toId"], e["toName"] = toID, toName
	}
	if note != "" {
		e["note"] = clip(note, 2000)
	}
	return e
}

func icAppend(doc jsonx.M, e jsonx.M) {
	h, _ := doc["history"].([]any)
	doc["history"] = append(h, e)
}

func icSave(ctx context.Context, doc jsonx.M) error {
	people := jsonx.Strings(doc, "people")
	_, err := store.Pool.Exec(ctx, `UPDATE internal_letters SET holder_id = $2, status = $3, people = $4, data = $5::jsonb, updated_at = now() WHERE id = $1`,
		jsonx.Str(doc, "id"), jsonx.Str(doc, "holderId"), jsonx.Str(doc, "status"), people, jsonx.Encode(doc))
	return err
}

func icAddPerson(doc jsonx.M, id string) {
	people := jsonx.Strings(doc, "people")
	if id != "" && !jsonx.Contains(people, id) {
		people = append(people, id)
	}
	arr := make([]any, len(people))
	for i, p := range people {
		arr[i] = p
	}
	doc["people"] = arr
}

func icLoad(ctx context.Context, id string) (jsonx.M, bool) {
	var d []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM internal_letters WHERE id = $1`, id).Scan(&d) != nil {
		return nil, false
	}
	return jsonx.Decode(d), true
}

// who may see a letter: everyone who wrote, held, was addressed or passed it on, and the managing director / administrators (audit)
func icMaySee(me auth.User, doc jsonx.M) bool {
	return me.IsAdmin() || jsonx.Bool(me.M, "canSignOfficialLetters") || jsonx.Contains(jsonx.Strings(doc, "people"), me.ID())
}

func icPublic(me auth.User, doc jsonx.M) jsonx.M {
	out := jsonx.Copy(doc)
	read := false
	if rb, ok := doc["readBy"].(map[string]any); ok {
		_, read = rb[me.ID()]
	}
	delete(out, "readBy")
	out["read"] = read
	return out
}

func icNotify(r *http.Request, me auth.User, ids []string, label, subject string) {
	list := []string{}
	for _, id := range ids {
		if id != "" && id != me.ID() {
			list = append(list, id)
		}
	}
	if len(list) == 0 {
		return
	}
	notify.Notify(r.Context(), list, notify.Note{Kind: "letter", Label: label, Title: subject, Body: "از طرف " + me.Name(), Ref: jsonx.M{"type": "icorr"}, Repeat: true}, me.ID())
}

func icPeople(ctx context.Context, ids []string) []jsonx.M {
	out := []jsonx.M{}
	for _, id := range ids {
		if p, ok := icUser(ctx, id); ok {
			sub := ""
			if p.ceo {
				sub = "مدیرعامل"
			} else {
				sub = "مدیر واحد"
			}
			var dn string
			_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name','') FROM departments WHERE id = $1`, p.dept).Scan(&dn)
			if dn != "" && !p.ceo {
				sub += " " + dn
			}
			out = append(out, jsonx.M{"id": id, "name": p.name, "sub": sub})
		}
	}
	return out
}

// GET /api/icorr/options?id=  → {targets: who I may address, route: where my letter goes first} or, with a letter id, {forward: where the holder may send it on}
func icOptions(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	p, ok := icUser(ctx, me.ID())
	if !ok || me.Isolated() {
		httpx.Forbidden(w)
		return
	}
	depts := icDepts(ctx)
	if id := r.URL.Query().Get("id"); id != "" {
		doc, found := icLoad(ctx, id)
		if !found || !icMaySee(me, doc) {
			httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
			return
		}
		fwd := []jsonx.M{}
		if jsonx.Str(doc, "holderId") == me.ID() && jsonx.Str(doc, "status") == "IN_CHAIN" {
			path := jsonx.Strings(doc, "people")
			ids := []string{}
			for _, u := range icUpward(ctx, depts, p) {
				if !jsonx.Contains(path, u) || u == jsonx.Str(doc, "toId") {
					ids = append(ids, u)
				}
			}
			fwd = icPeople(ctx, ids)
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"forward": fwd})
		return
	}
	route := []string{}
	if m := icUnitManager(depts, ctx, p); m != "" {
		if mp, ok := icUser(ctx, m); ok {
			route = append(route, mp.name)
		}
	}
	// the numbers already used, so the page offers the next free one from the numbering the console defined
	numbers := []string{}
	if rows, err := store.Pool.Query(ctx, `SELECT COALESCE(data->>'number','') FROM internal_letters ORDER BY created_at DESC LIMIT 1500`); err == nil {
		for rows.Next() {
			var n string
			if rows.Scan(&n) == nil && n != "" {
				numbers = append(numbers, n)
			}
		}
		rows.Close()
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"targets": icPeople(ctx, icFinalTargets(ctx, depts, p)), "firstHop": route, "isCeo": p.ceo, "numbers": numbers})
}

// POST /api/icorr {subject, body, toId}
func icCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	p, ok := icUser(ctx, me.ID())
	if !ok || me.Isolated() {
		httpx.Forbidden(w)
		return
	}
	subject, text := strings.TrimSpace(jsonx.Str(body, "subject")), strings.TrimSpace(jsonx.Str(body, "body"))
	if subject == "" || text == "" {
		httpx.Error(w, http.StatusBadRequest, "موضوع و متن نامه را بنویسید.")
		return
	}
	depts := icDepts(ctx)
	to := jsonx.Str(body, "toId")
	if !jsonx.Contains(icFinalTargets(ctx, depts, p), to) {
		httpx.Error(w, http.StatusBadRequest, "طبق چارت سازمانی نمی‌توانید به این شخص نامه بزنید؛ نامه از مدیر واحد خودتان به بالا می‌رود.")
		return
	}
	// the number comes from the numbering defined in the console (the page makes it from the counter); without one the letter gets «م-<running number>»
	number := strings.TrimSpace(clip(jsonx.Str(body, "number"), 60))
	if number == "" {
		var n int64
		_ = store.Pool.QueryRow(ctx, `SELECT nextval('internal_letters_seq')`).Scan(&n)
		number = "م-" + strconv.FormatInt(n, 10)
	} else {
		var dup int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM internal_letters WHERE data->>'number' = $1`, number).Scan(&dup)
		if dup > 0 {
			httpx.Error(w, http.StatusConflict, "این شمارهٔ نامه قبلاً استفاده شده؛ پنجره را ببندید و دوباره باز کنید.")
			return
		}
	}
	id := "ic-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	toP, _ := icUser(ctx, to)
	doc := jsonx.M{"id": id, "number": number, "subject": clip(subject, 200), "body": clip(text, 8000), "senderId": me.ID(), "senderName": me.Name(),
		"toId": to, "toName": toP.name, "createdAt": icNowStr(), "history": []any{}, "readBy": map[string]any{}}
	var dn string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name','') FROM departments WHERE id = $1`, p.dept).Scan(&dn)
	doc["senderDept"] = dn
	if sig := icSignature(ctx, p); sig != "" {
		doc["senderSignature"] = sig
	}
	icAddPerson(doc, me.ID())
	icAddPerson(doc, to)
	icAppend(doc, icEvent(me, "CREATED", "", "", ""))
	icMove(ctx, doc, me, depts, p, to, "")
	if _, err := store.Pool.Exec(ctx, `INSERT INTO internal_letters (id, sender_id, holder_id, status, people, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
		id, me.ID(), jsonx.Str(doc, "holderId"), jsonx.Str(doc, "status"), jsonx.Strings(doc, "people"), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	// the counter of the console's numbering moves on past the number just used
	if c, ok := body["counter"].(float64); ok && c >= 1 && c < 1e9 && jsonx.Str(body, "number") != "" {
		step := 1
		if st, ok := jsonx.Sub(settingDoc(ctx, "main"), "internalNumbering")["incrementStep"].(float64); ok && st >= 1 && st <= 1000 {
			step = int(st)
		}
		_, _ = store.Pool.Exec(ctx, `UPDATE settings SET data = jsonb_set(data, '{internalNumbering}', COALESCE(data->'internalNumbering','{}'::jsonb) || jsonb_build_object('nextNumber', GREATEST(COALESCE((data->'internalNumbering'->>'nextNumber')::bigint, 0), $1::bigint))) WHERE key = 'main'`, int64(c)+int64(step))
	}
	label := "مکاتبهٔ داخلی"
	if jsonx.Str(doc, "status") == "DELIVERED" {
		label = "نامهٔ داخلی رسید"
	}
	icNotify(r, me, []string{jsonx.Str(doc, "holderId")}, label, subject)
	auditLine(r, me, "INFO", "مکاتبهٔ داخلی «"+clip(subject, 80)+"» به "+toP.name+" نوشته شد و نزد "+jsonx.Str(doc, "holderName")+" رفت.")
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

// icRoute: the first holder of a letter written by p for «to».
func icRoute(ctx context.Context, depts map[string]icDept, p icPerson, to string, _ []string) string {
	lad := icLadder(ctx, depts, p)
	if jsonx.Contains(lad, to) {
		return to
	}
	if len(lad) > 0 {
		return lad[0]
	}
	return to
}

// icMove sends the letter from `from` to its first holder (used on create and on resend).
func icMove(ctx context.Context, doc jsonx.M, me auth.User, depts map[string]icDept, p icPerson, to, note string) {
	h := icRoute(ctx, depts, p, to, nil)
	hp, _ := icUser(ctx, h)
	icAddPerson(doc, h)
	doc["holderId"], doc["holderName"] = h, hp.name
	if h == to {
		doc["status"] = "DELIVERED"
		icAppend(doc, icEvent(me, "DELIVERED", h, hp.name, note))
	} else {
		doc["status"] = "IN_CHAIN"
		icAppend(doc, icEvent(me, "SENT", h, hp.name, note))
	}
}

// POST /api/icorr/{id}/forward {toId, note}: the holder passes the letter up (to a peer manager, a higher manager or the managing director)
func icForward(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !icMaySee(me, doc) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	if jsonx.Str(doc, "holderId") != me.ID() || jsonx.Str(doc, "status") != "IN_CHAIN" {
		httpx.Error(w, http.StatusForbidden, "این نامه الان نزد شما نیست.")
		return
	}
	p, _ := icUser(ctx, me.ID())
	depts := icDepts(ctx)
	to := jsonx.Str(body, "toId")
	if !jsonx.Contains(icUpward(ctx, depts, p), to) {
		httpx.Error(w, http.StatusBadRequest, "طبق چارت سازمانی نمی‌توانید نامه را برای این شخص بفرستید.")
		return
	}
	if jsonx.Contains(jsonx.Strings(doc, "people"), to) && to != jsonx.Str(doc, "toId") {
		httpx.Error(w, http.StatusBadRequest, "این نامه قبلاً نزد این شخص بوده است.")
		return
	}
	tp, _ := icUser(ctx, to)
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	icAddPerson(doc, to)
	doc["holderId"], doc["holderName"] = to, tp.name
	if to == jsonx.Str(doc, "toId") {
		doc["status"] = "DELIVERED"
		icAppend(doc, icEvent(me, "DELIVERED", to, tp.name, note))
	} else {
		icAppend(doc, icEvent(me, "FORWARDED", to, tp.name, note))
	}
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, []string{to}, "مکاتبهٔ داخلی", jsonx.Str(doc, "subject"))
	icNotify(r, me, []string{jsonx.Str(doc, "senderId")}, "نامهٔ شما بالا رفت", jsonx.Str(doc, "subject"))
	auditLine(r, me, "INFO", "مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» از "+me.Name()+" به "+tp.name+" فرستاده شد.")
	httpx.OK(w)
}

// POST /api/icorr/{id}/return {note}: the holder sends it back to the writer with a reason
func icReturn(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !icMaySee(me, doc) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	if jsonx.Str(doc, "holderId") != me.ID() || jsonx.Str(doc, "senderId") == me.ID() || jsonx.Str(doc, "status") == "RETURNED" {
		httpx.Error(w, http.StatusForbidden, "این نامه را نمی‌شود برگرداند.")
		return
	}
	if note == "" {
		httpx.Error(w, http.StatusBadRequest, "دلیل برگرداندن را بنویسید.")
		return
	}
	sid := jsonx.Str(doc, "senderId")
	doc["holderId"], doc["holderName"], doc["status"] = sid, jsonx.Str(doc, "senderName"), "RETURNED"
	icAppend(doc, icEvent(me, "RETURNED", sid, jsonx.Str(doc, "senderName"), note))
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, []string{sid}, "نامهٔ شما برگشت خورد", jsonx.Str(doc, "subject"))
	auditLine(r, me, "WARNING", "مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» توسط "+me.Name()+" به "+jsonx.Str(doc, "senderName")+" برگردانده شد.")
	httpx.OK(w)
}

// POST /api/icorr/{id}/resend {subject, body, toId}: the writer corrects a returned letter and sends it again from the start of the chain
func icResend(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || jsonx.Str(doc, "senderId") != me.ID() || jsonx.Str(doc, "status") != "RETURNED" {
		httpx.Error(w, http.StatusForbidden, "این نامه را نمی‌شود دوباره فرستاد.")
		return
	}
	p, _ := icUser(ctx, me.ID())
	depts := icDepts(ctx)
	to := jsonx.Str(body, "toId")
	if to == "" {
		to = jsonx.Str(doc, "toId")
	}
	if !jsonx.Contains(icFinalTargets(ctx, depts, p), to) {
		httpx.Error(w, http.StatusBadRequest, "طبق چارت سازمانی نمی‌توانید به این شخص نامه بزنید.")
		return
	}
	subject, text := strings.TrimSpace(jsonx.Str(body, "subject")), strings.TrimSpace(jsonx.Str(body, "body"))
	if subject == "" || text == "" {
		httpx.Error(w, http.StatusBadRequest, "موضوع و متن نامه را بنویسید.")
		return
	}
	if subject != jsonx.Str(doc, "subject") || text != jsonx.Str(doc, "body") {
		icAppend(doc, icEvent(me, "EDITED", "", "", "موضوع یا متن نامه پیش از ارسال دوباره اصلاح شد."))
	}
	doc["subject"], doc["body"] = clip(subject, 200), clip(text, 8000)
	if sig := icSignature(ctx, p); sig != "" {
		doc["senderSignature"] = sig
	} else {
		delete(doc, "senderSignature")
	}
	toP, _ := icUser(ctx, to)
	doc["toId"], doc["toName"] = to, toP.name
	icAddPerson(doc, to)
	icMove(ctx, doc, me, depts, p, to, "ارسال دوباره")
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, []string{jsonx.Str(doc, "holderId")}, "مکاتبهٔ داخلی", subject)
	auditLine(r, me, "INFO", "مکاتبهٔ داخلی «"+clip(subject, 80)+"» دوباره فرستاده شد.")
	httpx.OK(w)
}

// POST /api/icorr/{id}/note {note}: anybody who is part of the letter adds a note or an answer to its history
func icNote(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !jsonx.Contains(jsonx.Strings(doc, "people"), me.ID()) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	if note == "" {
		httpx.Error(w, http.StatusBadRequest, "متن یادداشت را بنویسید.")
		return
	}
	action := "NOTE"
	if jsonx.Str(doc, "toId") == me.ID() {
		action = "REPLY"
	}
	icAppend(doc, icEvent(me, action, "", "", note))
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, jsonx.Strings(doc, "people"), "پاسخ به مکاتبهٔ داخلی", jsonx.Str(doc, "subject"))
	auditLine(r, me, "INFO", "یادداشت تازه در مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» از "+me.Name()+".")
	httpx.OK(w)
}

// POST /api/icorr/{id}/read: the first time a person opens the letter it is written in the history («خواند»)
func icRead(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !icMaySee(me, doc) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	rb, _ := doc["readBy"].(map[string]any)
	if rb == nil {
		rb = map[string]any{}
	}
	if _, seen := rb[me.ID()]; !seen && jsonx.Contains(jsonx.Strings(doc, "people"), me.ID()) {
		rb[me.ID()] = icNowStr()
		doc["readBy"] = rb
		icAppend(doc, icEvent(me, "READ", "", "", ""))
		if icSave(ctx, doc) == nil {
			auditLine(r, me, "INFO", "مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» را "+me.Name()+" خواند.")
		}
	}
	httpx.OK(w)
}

// GET /api/icorr?box=inbox|sent|involved|all
func icList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	q := `SELECT data FROM internal_letters WHERE holder_id = $1 ORDER BY updated_at DESC LIMIT 300`
	switch r.URL.Query().Get("box") {
	case "sent":
		q = `SELECT data FROM internal_letters WHERE sender_id = $1 ORDER BY updated_at DESC LIMIT 300`
	case "referred": // letters referred to me that I have not acted on yet
		q = `SELECT data FROM internal_letters WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'referrals','[]'::jsonb)) r WHERE r->>'toId' = $1 AND r->>'status' = 'PENDING') ORDER BY updated_at DESC LIMIT 300`
	case "involved":
		q = `SELECT data FROM internal_letters WHERE $1 = ANY(people) AND holder_id <> $1 AND sender_id <> $1 ORDER BY updated_at DESC LIMIT 300`
	case "all":
		if !me.IsAdmin() && !jsonx.Bool(me.M, "canSignOfficialLetters") {
			httpx.Forbidden(w)
			return
		}
		q = `SELECT data FROM internal_letters WHERE $1 <> '' ORDER BY updated_at DESC LIMIT 500`
	}
	raws, err := store.RawList(r.Context(), q, me.ID())
	if err != nil {
		internalError(w)
		return
	}
	out := make([]jsonx.M, 0, len(raws))
	for _, raw := range raws {
		out = append(out, icPublic(me, jsonx.Decode(raw)))
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"letters": out})
}

// who may refer a letter on: the person it was delivered to, and everybody it was referred to (a referral can be passed on again, to anyone)
func icCanRefer(me auth.User, doc jsonx.M) bool {
	if jsonx.Str(doc, "holderId") == me.ID() && jsonx.Str(doc, "status") == "DELIVERED" {
		return true
	}
	rs, _ := doc["referrals"].([]any)
	for _, x := range rs {
		if m, ok := x.(map[string]any); ok && jsonx.Str(m, "toId") == me.ID() {
			return true
		}
	}
	return false
}

// POST /api/icorr/{id}/refer {toIds[], note}: ارجاع - the letter goes on to one or more people anywhere in the company, with an instruction
func icRefer(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !icMaySee(me, doc) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	if me.Isolated() || !icCanRefer(me, doc) {
		httpx.Error(w, http.StatusForbidden, "شما نمی‌توانید این نامه را ارجاع بدهید.")
		return
	}
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	refs, _ := doc["referrals"].([]any)
	targets := []string{}
	if arr, ok := body["toIds"].([]any); ok {
		for _, x := range arr {
			if id, _ := x.(string); id != "" && id != me.ID() && !jsonx.Contains(targets, id) && len(targets) < 10 {
				targets = append(targets, id)
			}
		}
	}
	if len(targets) == 0 {
		httpx.Error(w, http.StatusBadRequest, "کسی را برای ارجاع انتخاب کنید.")
		return
	}
	if len(refs)+len(targets) > 60 {
		httpx.Error(w, http.StatusBadRequest, "تعداد ارجاع‌های این نامه به سقف رسیده است.")
		return
	}
	done := []string{}
	for _, t := range targets {
		var d []byte
		if store.Pool.QueryRow(ctx, `SELECT data FROM users WHERE id = $1`, t).Scan(&d) != nil {
			continue
		}
		u := jsonx.Decode(d)
		if jsonx.Str(u, "isActive") == "false" || jsonx.Bool(u, "isAgent") || jsonx.Str(u, "agentOwnerId") != "" {
			continue // inactive people and the isolated sales representatives never receive an internal letter
		}
		name := jsonx.Str(u, "fullName")
		refs = append(refs, map[string]any{"id": "rf-" + strconv.FormatInt(time.Now().UnixNano(), 36) + strconv.Itoa(len(refs)), "byId": me.ID(), "byName": me.Name(), "toId": t, "toName": name, "note": clip(note, 2000), "at": icNowStr(), "status": "PENDING"})
		icAddPerson(doc, t)
		icAppend(doc, icEvent(me, "REFERRED", t, name, note))
		done = append(done, t)
	}
	if len(done) == 0 {
		httpx.Error(w, http.StatusBadRequest, "ارجاع به این افراد ممکن نیست.")
		return
	}
	doc["referrals"] = refs
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, done, "ارجاع نامهٔ داخلی", jsonx.Str(doc, "subject"))
	auditLine(r, me, "INFO", "مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» توسط "+me.Name()+" به "+strconv.Itoa(len(done))+" نفر ارجاع شد.")
	httpx.OK(w)
}

// POST /api/icorr/{id}/acted {note}: the person it was referred to reports that the work asked of him is done
func icActed(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	ctx := r.Context()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	doc, found := icLoad(ctx, r.PathValue("id"))
	if !found || !jsonx.Contains(jsonx.Strings(doc, "people"), me.ID()) {
		httpx.Error(w, http.StatusNotFound, "پیدا نشد.")
		return
	}
	note := strings.TrimSpace(jsonx.Str(body, "note"))
	refs, _ := doc["referrals"].([]any)
	askers := []string{}
	changed := false
	for _, x := range refs {
		m, ok := x.(map[string]any)
		if ok && jsonx.Str(m, "toId") == me.ID() && jsonx.Str(m, "status") == "PENDING" {
			m["status"], m["doneAt"], m["doneNote"] = "DONE", icNowStr(), clip(note, 2000)
			askers = append(askers, jsonx.Str(m, "byId"))
			changed = true
		}
	}
	if !changed {
		httpx.Error(w, http.StatusBadRequest, "ارجاع بازی برای شما در این نامه نیست.")
		return
	}
	icAppend(doc, icEvent(me, "ACTED", "", "", note))
	if err := icSave(ctx, doc); err != nil {
		internalError(w)
		return
	}
	icNotify(r, me, askers, "اقدام روی ارجاع شما انجام شد", jsonx.Str(doc, "subject"))
	auditLine(r, me, "INFO", "ارجاع مکاتبهٔ داخلی «"+clip(jsonx.Str(doc, "subject"), 80)+"» را "+me.Name()+" انجام‌شده اعلام کرد.")
	httpx.OK(w)
}

func registerInternalLetters(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/icorr", auth.Require(icList))
	mux.HandleFunc("GET /api/icorr/options", auth.Require(icOptions))
	mux.HandleFunc("POST /api/icorr", auth.Require(icCreate))
	mux.HandleFunc("POST /api/icorr/{id}/forward", auth.Require(icForward))
	mux.HandleFunc("POST /api/icorr/{id}/return", auth.Require(icReturn))
	mux.HandleFunc("POST /api/icorr/{id}/resend", auth.Require(icResend))
	mux.HandleFunc("POST /api/icorr/{id}/refer", auth.Require(icRefer))
	mux.HandleFunc("POST /api/icorr/{id}/acted", auth.Require(icActed))
	mux.HandleFunc("POST /api/icorr/{id}/note", auth.Require(icNote))
	mux.HandleFunc("POST /api/icorr/{id}/read", auth.Require(icRead))
}

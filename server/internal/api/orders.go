package api

import (
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

// Administrative orders («دستور اداری»): the CEO writes an order to one or more people, for example «pay this commission»; they receive
// it in their «امور اداری» (and a notice), read it on a page of its own and can print it. Only the managers write; everyone reads what was sent to him.

// only the CEO (the one who may sign official letters) writes an order: nobody else, not even the administrator
func orderWriter(me auth.User) bool { return jsonx.Bool(me.M, "canSignOfficialLetters") }

// POST /api/orders {subject, body, recipientIds, kind, ref}
func orderCreate(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !orderWriter(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	subject, text := strings.TrimSpace(jsonx.Str(body, "subject")), strings.TrimSpace(jsonx.Str(body, "body"))
	if subject == "" || text == "" {
		httpx.Error(w, http.StatusBadRequest, "موضوع و متن دستور را بنویسید.")
		return
	}
	ids := []string{}
	names := []any{}
	seen := map[string]bool{}
	if arr, ok := body["recipientIds"].([]any); ok {
		for _, x := range arr {
			id, _ := x.(string)
			if id == "" || seen[id] || len(ids) >= 50 {
				continue
			}
			seen[id] = true
			raws, err := store.RawList(r.Context(), `SELECT data FROM users WHERE id = $1`, id)
			if err != nil || len(raws) == 0 {
				continue
			}
			ids = append(ids, id)
			names = append(names, jsonx.Str(jsonx.Decode(raws[0]), "fullName"))
		}
	}
	if len(ids) == 0 {
		httpx.Error(w, http.StatusBadRequest, "گیرندهٔ دستور را انتخاب کنید.")
		return
	}
	// «رونوشت»: the people who get a copy (the finance manager the CEO chose); they receive it like the others but are named as copies
	copyIDs := []string{}
	copyNames := []any{}
	if arr, ok := body["copyIds"].([]any); ok {
		for _, x := range arr {
			id, _ := x.(string)
			if id == "" || seen[id] || len(copyIDs) >= 20 {
				continue
			}
			seen[id] = true
			raws, err := store.RawList(r.Context(), `SELECT data FROM users WHERE id = $1`, id)
			if err != nil || len(raws) == 0 {
				continue
			}
			copyIDs = append(copyIDs, id)
			copyNames = append(copyNames, jsonx.Str(jsonx.Decode(raws[0]), "fullName"))
		}
	}
	var n int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM admin_orders`).Scan(&n)
	// the number is the one from the system's letter numbering (the page asks for the next free one); without it the order gets its running number
	number := strings.TrimSpace(clip(jsonx.Str(body, "number"), 60))
	if number == "" {
		number = strconv.Itoa(n + 1)
	} else {
		var dup int
		_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM admin_orders WHERE data->>'number' = $1`, number).Scan(&dup)
		if dup > 0 {
			httpx.Error(w, http.StatusConflict, "این شمارهٔ نامه قبلاً برای یک دستور دیگر استفاده شده؛ پنجره را ببندید و دوباره باز کنید.")
			return
		}
	}
	main := settingDoc(r.Context(), "main")
	title := jsonx.Str(main, "ceoTitle")
	if title == "" {
		title = "مدیریت"
	}
	now := time.Now().UTC()
	id := "ord-" + strconv.FormatInt(now.UnixNano(), 36)
	// the name on the order is the CEO of the system (the name in the settings), not whoever happens to be logged in
	senderName := strings.TrimSpace(jsonx.Str(main, "ceoName"))
	if senderName == "" {
		senderName = me.Name()
	}
	doc := jsonx.M{"id": id, "number": number, "subject": clip(subject, 200), "body": clip(text, 6000), "senderId": me.ID(), "senderName": senderName, "senderTitle": title,
		"recipientIds": ids, "recipientNames": names, "copyIds": copyIDs, "copyNames": copyNames, "createdAt": now.Format("2006-01-02T15:04:05.000Z"), "kind": clip(jsonx.Str(body, "kind"), 30), "readBy": map[string]any{}}
	if ref, ok := body["ref"].(map[string]any); ok {
		doc["ref"] = ref
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO admin_orders (id, sender_id, recipient_ids, data) VALUES ($1,$2,$3,$4::jsonb)`, id, me.ID(), append(append([]string{}, ids...), copyIDs...), jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	notify.Notify(r.Context(), ids, notify.Note{Kind: "alert", Label: "دستور اداری", Title: subject, Body: "از طرف " + senderName, Repeat: true}, me.ID())
	if len(copyIDs) > 0 {
		notify.Notify(r.Context(), copyIDs, notify.Note{Kind: "alert", Label: "رونوشت دستور اداری", Title: subject, Body: "از طرف " + senderName, Repeat: true}, me.ID())
	}
	auditLine(r, me, "INFO", "دستور اداری «"+clip(subject, 80)+"» برای "+strconv.Itoa(len(ids))+" نفر ارسال شد.")
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

// GET /api/orders?box=inbox|sent
func orderList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	q := `SELECT data FROM admin_orders WHERE $1 = ANY(recipient_ids) ORDER BY created_at DESC LIMIT 300`
	if r.URL.Query().Get("box") == "sent" {
		if !orderWriter(me) {
			httpx.Forbidden(w)
			return
		}
		q = `SELECT data FROM admin_orders WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 300`
	}
	raws, err := store.RawList(r.Context(), q, me.ID())
	if err != nil {
		internalError(w)
		return
	}
	out := make([]jsonx.M, 0, len(raws))
	for _, raw := range raws {
		d := jsonx.Decode(raw)
		read := false
		if rb, ok := d["readBy"].(map[string]any); ok {
			_, read = rb[me.ID()]
		}
		d["read"] = read
		if cs, ok := d["copyIds"].([]any); ok {
			for _, c := range cs {
				if id, _ := c.(string); id == me.ID() {
					d["copy"] = true
				}
			}
		}
		delete(d, "readBy")
		out = append(out, d)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"orders": out})
}

// POST /api/orders/{id}/read
func orderRead(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	_, _ = store.Pool.Exec(r.Context(), `UPDATE admin_orders SET data = jsonb_set(data, ARRAY['readBy', $2::text], to_jsonb($3::text), true) WHERE id = $1 AND $2 = ANY(recipient_ids)`, r.PathValue("id"), me.ID(), time.Now().UTC().Format("2006-01-02T15:04:05.000Z"))
	httpx.OK(w)
}

func registerOrders(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/orders", auth.Require(orderCreate))
	mux.HandleFunc("GET /api/orders", auth.Require(orderList))
	mux.HandleFunc("POST /api/orders/{id}/read", auth.Require(orderRead))
}

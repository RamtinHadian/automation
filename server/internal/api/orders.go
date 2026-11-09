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

// Administrative orders («دستور اداری»): the CEO (or the administrator) writes an order to one or more people, for example «pay this commission»; they receive
// it in their «امور اداری» (and a notice), read it on a page of its own and can print it. Only the managers write; everyone reads what was sent to him.

func orderWriter(me auth.User) bool { return commissionManager(me) }

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
	var n int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM admin_orders`).Scan(&n)
	main := settingDoc(r.Context(), "main")
	title := jsonx.Str(main, "ceoTitle")
	if title == "" {
		title = "مدیریت"
	}
	now := time.Now().UTC()
	id := "ord-" + strconv.FormatInt(now.UnixNano(), 36)
	doc := jsonx.M{"id": id, "number": strconv.Itoa(n + 1), "subject": clip(subject, 200), "body": clip(text, 6000), "senderId": me.ID(), "senderName": me.Name(), "senderTitle": title,
		"recipientIds": ids, "recipientNames": names, "createdAt": now.Format("2006-01-02T15:04:05.000Z"), "kind": clip(jsonx.Str(body, "kind"), 30), "readBy": map[string]any{}}
	if ref, ok := body["ref"].(map[string]any); ok {
		doc["ref"] = ref
	}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO admin_orders (id, sender_id, recipient_ids, data) VALUES ($1,$2,$3,$4::jsonb)`, id, me.ID(), ids, jsonx.Encode(doc)); err != nil {
		internalError(w)
		return
	}
	notify.Notify(r.Context(), ids, notify.Note{Kind: "alert", Label: "دستور اداری", Title: subject, Body: "از طرف " + me.Name(), Repeat: true}, me.ID())
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

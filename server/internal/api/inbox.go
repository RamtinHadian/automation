package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/msgr"
	"automation/server/internal/store"
)

// The inbox of the messengers: what customers write to the company bots (Telegram, Bale) lands here, next to the answers sent from
// Hoormand. A person sees only the customers the CRM rules give them (their own, their unit's, or everybody's for those with the
// «مشتریان همکاران» right), so the inbox never shows a conversation the customer page itself would hide.

const inboxScope = ` (customer_id IN ` + crmMyCustomerIDs + `)`

// GET /api/inbox?customerId=
func inboxList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	cid := strings.TrimSpace(r.URL.Query().Get("customerId"))
	args := []any{}
	where := ""
	if !crmSeesAll(me) {
		where = "WHERE" + inboxScope
		args = append(args, me.ID(), crmPeople(r.Context(), me))
	}
	if cid != "" {
		if where == "" {
			where = "WHERE customer_id = $1"
		} else {
			where += " AND customer_id = $3"
		}
		args = append(args, cid)
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT id, created_at, channel, customer_id, customer_name, direction, sender, text, read FROM inbox_messages `+where+` ORDER BY created_at DESC LIMIT 500`, args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	unread := 0
	for rows.Next() {
		var id, ch, cust, name, dir, sender, text string
		var at time.Time
		var read bool
		if rows.Scan(&id, &at, &ch, &cust, &name, &dir, &sender, &text, &read) == nil {
			out = append(out, jsonx.M{"id": id, "at": at.UTC().Format("2006-01-02T15:04:05.000Z"), "channel": ch, "customerId": cust, "customerName": name, "direction": dir, "sender": sender, "text": text, "read": read})
			if dir == "in" && !read {
				unread++
			}
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": out, "unread": unread})
}

// POST /api/inbox/reply {customerId, channel, text}: the answer goes to the customer's chat in the same messenger
func inboxReply(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	cid, ch, text := jsonx.Str(body, "customerId"), jsonx.Str(body, "channel"), strings.TrimSpace(jsonx.Str(body, "text"))
	if cid == "" || text == "" || (ch != "telegram" && ch != "bale") {
		httpx.Error(w, http.StatusBadRequest, "مشتری، پیام‌رسان و متن را بنویسید.")
		return
	}
	if !crmOwnsCustomer(r, me, cid) {
		httpx.Error(w, http.StatusForbidden, "این مشتری به شما سپرده نشده است.")
		return
	}
	var name, chat string
	field := "telegramChatId"
	if ch == "bale" {
		field = "baleChatId"
	}
	if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'name', ''), COALESCE(data->>$2, '') FROM crm_customers WHERE id = $1`, cid, field).Scan(&name, &chat) != nil || chat == "" {
		httpx.Error(w, http.StatusBadRequest, "این مشتری هنوز به ربات این پیام‌رسان وصل نشده است.")
		return
	}
	if err := msgr.SendText(r.Context(), ch, chat, text); err != nil {
		httpx.Error(w, http.StatusBadGateway, "پیام فرستاده نشد: "+err.Error())
		return
	}
	id := fmt.Sprintf("im_%x", time.Now().UnixNano())
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO inbox_messages (id, channel, chat_id, customer_id, customer_name, owner_id, direction, sender, text, read) VALUES ($1, $2, $3, $4, $5, $6, 'out', $7, $8, true)`,
		id, ch, chat, cid, name, me.ID(), me.Name(), text)
	_, _ = store.Pool.Exec(r.Context(), `UPDATE inbox_messages SET read = true WHERE customer_id = $1 AND direction = 'in'`, cid)
	httpx.OK(w)
}

// POST /api/inbox/read {customerId}
func inboxRead(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	cid := jsonx.Str(body, "customerId")
	if cid == "" || !crmOwnsCustomer(r, me, cid) {
		httpx.Forbidden(w)
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `UPDATE inbox_messages SET read = true WHERE customer_id = $1 AND direction = 'in'`, cid)
	httpx.OK(w)
}

func registerInbox(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/inbox", auth.Require(inboxList))
	mux.HandleFunc("POST /api/inbox/reply", auth.Require(inboxReply))
	mux.HandleFunc("POST /api/inbox/read", auth.Require(inboxRead))
}

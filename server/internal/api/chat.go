package api

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// One-to-one chat between colleagues. A message has one tick when it was sent and two green ticks once the person has opened
// the conversation (read_at). Messages are never edited or deleted, like sent files and letters.

func chatID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "m-" + strconv.FormatInt(time.Now().UnixMilli(), 36) + hex.EncodeToString(b)
}

func iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }

type chatMsg struct {
	ID   string `json:"id"`
	From string `json:"from"`
	To   string `json:"to"`
	Text string `json:"text"`
	At   string `json:"at"`
	Read bool   `json:"read"`
}

// chatConversations lists the people I have talked with: last message, when, and how many of theirs I have not read.
func chatConversations(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r).ID()
	ctx := r.Context()
	rows, err := store.Pool.Query(ctx, `
		SELECT DISTINCT ON (peer) peer, text, created_at, sender_id = $1, read_at IS NOT NULL
		FROM (SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS peer, sender_id, text, created_at, read_at
		      FROM chat_messages WHERE sender_id = $1 OR recipient_id = $1) m
		ORDER BY peer, created_at DESC`, me)
	if err != nil {
		internalError(w)
		return
	}
	type conv struct {
		UserID     string `json:"userId"`
		LastText   string `json:"lastText"`
		LastAt     string `json:"lastAt"`
		LastFromMe bool   `json:"lastFromMe"`
		LastRead   bool   `json:"lastRead"`
		Unread     int    `json:"unread"`
	}
	list := []*conv{}
	byPeer := map[string]*conv{}
	for rows.Next() {
		c := &conv{}
		var at time.Time
		if rows.Scan(&c.UserID, &c.LastText, &at, &c.LastFromMe, &c.LastRead) == nil {
			c.LastAt = iso(at)
			list = append(list, c)
			byPeer[c.UserID] = c
		}
	}
	rows.Close()
	ur, err := store.Pool.Query(ctx, `SELECT sender_id, count(*) FROM chat_messages WHERE recipient_id = $1 AND read_at IS NULL GROUP BY sender_id`, me)
	if err == nil {
		for ur.Next() {
			var id string
			var n int
			if ur.Scan(&id, &n) == nil && byPeer[id] != nil {
				byPeer[id].Unread = n
			}
		}
		ur.Close()
	}
	sort.Slice(list, func(i, j int) bool { return list[i].LastAt > list[j].LastAt })
	httpx.JSON(w, http.StatusOK, map[string]any{"conversations": list})
}

func chatMessages(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r).ID()
	peer := r.URL.Query().Get("with")
	if peer == "" {
		httpx.Error(w, http.StatusBadRequest, "bad request")
		return
	}
	rows, err := store.Pool.Query(r.Context(), `
		SELECT id, sender_id, recipient_id, text, created_at, read_at IS NOT NULL FROM (
		  SELECT * FROM chat_messages WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
		  ORDER BY created_at DESC LIMIT 200) t ORDER BY created_at ASC`, me, peer)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []chatMsg{}
	for rows.Next() {
		var m chatMsg
		var at time.Time
		if rows.Scan(&m.ID, &m.From, &m.To, &m.Text, &at, &m.Read) == nil {
			m.At = iso(at)
			out = append(out, m)
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": out})
}

func chatSend(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	to := jsonx.Str(body, "to")
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if to == "" || to == me.ID() || text == "" {
		httpx.Error(w, http.StatusBadRequest, "bad request")
		return
	}
	if len([]rune(text)) > 2000 {
		httpx.Error(w, http.StatusBadRequest, "پیام خیلی طولانی است (حداکثر ۲۰۰۰ نویسه).")
		return
	}
	var active bool
	if err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE((data->>'isActive')::boolean, true) FROM users WHERE id = $1`, to).Scan(&active); err != nil || !active {
		httpx.Error(w, http.StatusNotFound, "گیرنده پیدا نشد.")
		return
	}
	id := chatID()
	var at time.Time
	if err := store.Pool.QueryRow(r.Context(),
		`INSERT INTO chat_messages (id, sender_id, recipient_id, text) VALUES ($1, $2, $3, $4) RETURNING created_at`, id, me.ID(), to, text).Scan(&at); err != nil {
		internalError(w)
		return
	}
	preview := text
	if rs := []rune(preview); len(rs) > 140 {
		preview = string(rs[:140]) + "…"
	}
	notify.Notify(r.Context(), []string{to}, notify.Note{
		Kind: "chat", Label: "پیام جدید", Title: "پیام جدید از " + me.Name(), Body: preview,
		Ref: jsonx.M{"type": "chat", "id": me.ID()}, Repeat: true,
	}, me.ID())
	httpx.JSON(w, http.StatusOK, chatMsg{ID: id, From: me.ID(), To: to, Text: text, At: iso(at), Read: false})
}

// chatRead marks everything the other person sent me as read (they see two green ticks).
func chatRead(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r).ID()
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	peer := jsonx.Str(body, "with")
	if peer == "" {
		httpx.Error(w, http.StatusBadRequest, "bad request")
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `UPDATE chat_messages SET read_at = now() WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL`, me, peer)
	_, _ = store.Pool.Exec(r.Context(),
		`UPDATE notifications SET data = jsonb_set(data, '{read}', 'true') WHERE user_id = $1 AND data->>'kind' = 'chat' AND data#>>'{ref,id}' = $2 AND data->>'read' = 'false'`, me, peer)
	httpx.OK(w)
}

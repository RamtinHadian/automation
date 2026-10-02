// Package notify stores a notification for each person concerned and delivers it live (and as web push).
//
// Every relevant change (new file, letter, task, signature...) creates a stored notification, pushed over a
// separate event stream so a browser window in the background or minimised still hears it immediately.
package notify

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"strconv"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/push"
	"automation/server/internal/sms"
	"automation/server/internal/sse"
	"automation/server/internal/store"
)

// Hub holds the open notification streams.
var Hub = sse.NewHub()

// Note is what a caller wants to tell someone.
type Note struct {
	Kind  string // file | letter | task | alert
	Label string // short status shown on the pop-up
	Title string
	Body  string
	Ref   jsonx.M // what to open when clicked: {type, id}
	// From is who caused it; when empty it is looked up from exceptID. Phone notifications show only this name.
	From string
	// Repeat turns off the two-minute duplicate filter (phone calls from the same number are separate events).
	Repeat bool
}

func newID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "n-" + strconv.FormatInt(time.Now().UnixMilli(), 36) + hex.EncodeToString(b)
}

// Notify delivers the note to each user except exceptID (normally the person who caused it).
// The very same text is never sent to a user twice within two minutes.
func Notify(ctx context.Context, userIDs []string, n Note, exceptID string) {
	from := n.From
	if from == "" && exceptID != "" {
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, exceptID).Scan(&from)
	}
	seen := map[string]bool{}
	for _, uid := range userIDs {
		if uid == "" || uid == exceptID || seen[uid] {
			continue
		}
		seen[uid] = true
		doc := jsonx.M{
			"id": newID(), "userId": uid, "kind": n.Kind, "label": n.Label, "title": n.Title, "body": n.Body,
			"ref": nil, "from": from, "createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "read": false,
		}
		if n.Ref != nil {
			doc["ref"] = n.Ref
		}
		if !n.Repeat {
			var dup int
			err := store.Pool.QueryRow(ctx,
				`SELECT count(*) FROM notifications WHERE user_id = $1 AND data->>'title' = $2 AND data->>'body' = $3
				   AND created_at > now() - interval '2 minutes'`, uid, n.Title, n.Body).Scan(&dup)
			if err != nil {
				log.Printf("notify failed: %v", err)
				continue
			}
			if dup > 0 {
				continue
			}
		}
		if _, err := store.Pool.Exec(ctx, `INSERT INTO notifications (id, user_id, data) VALUES ($1, $2, $3::jsonb)`,
			doc["id"], uid, jsonx.Encode(doc)); err != nil {
			log.Printf("notify failed: %v", err)
			continue
		}
		_, _ = store.Pool.Exec(ctx,
			`DELETE FROM notifications WHERE user_id = $1 AND id NOT IN
			   (SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200)`, uid)
		Hub.Publish(uid, []byte(jsonx.Encode(doc)))
		var unread int
		_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE user_id = $1 AND NOT read`, uid).Scan(&unread)
		doc["unread"] = unread
		go push.Send(uid, doc)
		sms.ForNotification(uid, n.Label, n.Title, n.Body)
	}
}

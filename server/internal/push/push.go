// Package push sends web-push notifications to phones and browsers while the app is closed.
package push

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/jackc/pgx/v5"

	"automation/server/internal/config"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

var (
	publicKey  string
	privateKey string
	subject    string
)

// PublicKey is what browsers need to subscribe.
func PublicKey() string { return publicKey }

// Init loads the VAPID keys from the database, creating them on first start (no configuration needed).
func Init(ctx context.Context, cfg config.Config) error {
	subject = cfg.VapidSubject
	var raw []byte
	err := store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'vapid'`).Scan(&raw)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	keys := jsonx.Decode(raw)
	if jsonx.Str(keys, "publicKey") == "" || jsonx.Str(keys, "privateKey") == "" {
		priv, pub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return err
		}
		keys = jsonx.M{"publicKey": pub, "privateKey": priv}
		if _, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('vapid', $1::jsonb)
			ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(keys)); err != nil {
			return err
		}
	}
	publicKey = jsonx.Str(keys, "publicKey")
	privateKey = jsonx.Str(keys, "privateKey")
	return nil
}

// Send delivers one notification to every device the user registered; dead subscriptions are removed.
func Send(userID string, n jsonx.M) {
	ctx := context.Background()
	rows, err := store.Pool.Query(ctx, `SELECT endpoint, data FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		return
	}
	type sub struct {
		endpoint string
		data     []byte
	}
	var subs []sub
	for rows.Next() {
		var s sub
		if rows.Scan(&s.endpoint, &s.data) == nil {
			subs = append(subs, s)
		}
	}
	rows.Close()
	if len(subs) == 0 {
		return
	}
	payload, _ := json.Marshal(Payload(n))
	for _, s := range subs {
		d := jsonx.Decode(s.data)
		keys := jsonx.Sub(d, "keys")
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: s.endpoint,
			Keys:     webpush.Keys{Auth: jsonx.Str(keys, "auth"), P256dh: jsonx.Str(keys, "p256dh")},
		}, &webpush.Options{
			Subscriber:      subject,
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             86400,
			Urgency:         webpush.UrgencyHigh,
		})
		if err != nil {
			log.Printf("push failed: %v", err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			_, _ = store.Pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, s.endpoint)
		}
	}
}

// Payload is what the phone receives. Only who it is from is shown (short); notifications without a sender keep their own text.
func Payload(n jsonx.M) jsonx.M {
	title, body := n["title"], n["body"]
	if from := jsonx.Str(n, "from"); from != "" {
		title, body = "از طرف "+from, ""
	}
	return jsonx.M{"id": n["id"], "title": title, "body": body, "kind": n["kind"], "ref": n["ref"], "unread": n["unread"]}
}

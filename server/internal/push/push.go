// Package push sends web-push notifications to phones and browsers while the app is closed.
package push

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"

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
	// pushHost is the public address of this installation (office.example.com), learnt from the browsers that ask to be notified. Apple's push service refuses a
	// notification whose «sub» (the contact of the sender) is not a believable address (403 BadJwtToken), and a made-up mailto: like admin@company.internal is not:
	// so, unless the administrator set VAPID_SUBJECT himself, the sender is introduced with the address of the installation itself («https://office.example.com»).
	pushHost    string
	subjectEnv  bool
	defaultSubj = "mailto:admin@company.internal"
)

// senderSubject is the contact written in every notification.
func senderSubject() string {
	if !subjectEnv && pushHost != "" {
		return "https://" + pushHost
	}
	return subject
}

// SetHost remembers the public address of this installation (from the Host header of a browser that is registering for notifications). Only a real domain
// name is taken (not an IP address, localhost or an internal name).
func SetHost(ctx context.Context, host string) {
	host = strings.ToLower(strings.TrimSpace(host))
	if i := strings.Index(host, ":"); i >= 0 {
		host = host[:i]
	}
	if host == "" || host == pushHost || !strings.Contains(host, ".") || strings.HasSuffix(host, ".internal") || strings.HasSuffix(host, ".local") || strings.HasSuffix(host, ".localhost") {
		return
	}
	if net.ParseIP(host) != nil {
		return
	}
	pushHost = host
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('pushHost', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(jsonx.M{"host": host}))
}

// PublicKey is what browsers need to subscribe.
func PublicKey() string { return publicKey }

// Init loads the VAPID keys from the database, creating them on first start (no configuration needed).
func Init(ctx context.Context, cfg config.Config) error {
	subject = cfg.VapidSubject
	subjectEnv = subject != defaultSubj
	var hostRaw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'pushHost'`).Scan(&hostRaw) == nil {
		pushHost = jsonx.Str(jsonx.Decode(hostRaw), "host")
	}
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
			Subscriber:      senderSubject(),
			VAPIDPublicKey:  publicKey,
			VAPIDPrivateKey: privateKey,
			TTL:             86400,
			Urgency:         webpush.UrgencyHigh,
		})
		host := s.endpoint
		if u, perr := url.Parse(s.endpoint); perr == nil {
			host = u.Host
		}
		if err != nil {
			// the usual cause on a server inside Iran: the push service (fcm.googleapis.com, web.push.apple.com) cannot be reached
			log.Printf("push failed (%s): %v", host, err)
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			log.Printf("push rejected (%s): HTTP %d %s", host, resp.StatusCode, strings.TrimSpace(string(body)))
		} else {
			log.Printf("push sent (%s): HTTP %d", host, resp.StatusCode)
		}
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			_, _ = store.Pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, s.endpoint)
		}
	}
}

// Result is what happened to one device of a test notification.
type Result struct {
	Host    string `json:"host"`    // the push service of that device (fcm.googleapis.com, web.push.apple.com, …)
	OK      bool   `json:"ok"`      // the push service accepted it
	Status  int    `json:"status"`  // its HTTP answer (0 = it could not be reached)
	Error   string `json:"error"`   // the reason when it could not be reached
	Removed bool   `json:"removed"` // the device was gone (404/410) and has been forgotten
}

// Test sends a test notification to every device of the user and says what each push service answered: this is what the «آزمایش اعلان موبایل» button shows.
func Test(userID string) []Result {
	ctx := context.Background()
	rows, err := store.Pool.Query(ctx, `SELECT endpoint, data FROM push_subscriptions WHERE user_id = $1`, userID)
	if err != nil {
		return nil
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
	payload, _ := json.Marshal(jsonx.M{"id": "test-" + userID, "title": "آزمایش اعلان هورمند", "body": "اگر این را می‌بینید، اعلان موبایل درست کار می‌کند.", "kind": "alert", "test": true})
	out := []Result{}
	for _, s := range subs {
		keys := jsonx.Sub(jsonx.Decode(s.data), "keys")
		host := s.endpoint
		if u, perr := url.Parse(s.endpoint); perr == nil {
			host = u.Host
		}
		r := Result{Host: host}
		resp, err := webpush.SendNotification(payload, &webpush.Subscription{
			Endpoint: s.endpoint,
			Keys:     webpush.Keys{Auth: jsonx.Str(keys, "auth"), P256dh: jsonx.Str(keys, "p256dh")},
		}, &webpush.Options{Subscriber: senderSubject(), VAPIDPublicKey: publicKey, VAPIDPrivateKey: privateKey, TTL: 600, Urgency: webpush.UrgencyHigh})
		if err != nil {
			r.Error = err.Error()
		} else {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 200))
			resp.Body.Close()
			r.Status, r.OK = resp.StatusCode, resp.StatusCode < 300
			if !r.OK {
				r.Error = strings.TrimSpace(string(body))
			}
			if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
				_, _ = store.Pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, s.endpoint)
				r.Removed = true
			}
		}
		out = append(out, r)
	}
	return out
}

// Payload is what the phone receives. Only who it is from is shown (short); notifications without a sender keep their own text.
func Payload(n jsonx.M) jsonx.M {
	title, body := n["title"], n["body"]
	if from := jsonx.Str(n, "from"); from != "" {
		title, body = "از طرف "+from, ""
	}
	return jsonx.M{"id": n["id"], "title": title, "body": body, "kind": n["kind"], "ref": n["ref"], "unread": n["unread"]}
}

package voip

import (
	"context"
	"log"
	"regexp"
	"sync"
	"time"

	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// "PJSIP/501-0000001a" or "SIP/501-00000012" -> the extension 501 (trunks and Local channels do not match an extension).
var channelExt = regexp.MustCompile(`^(?:PJSIP|SIP|IAX2)/([0-9A-Za-z_*#+]+)-[0-9a-fA-F]+$`)

var (
	seenMu sync.Mutex
	seen   = map[string]time.Time{}
)

// firstTime is true the first time an id is seen within a minute (one ringing leg can be reported twice).
func firstTime(id string) bool {
	if id == "" {
		return true
	}
	seenMu.Lock()
	defer seenMu.Unlock()
	now := time.Now()
	for k, t := range seen {
		if now.Sub(t) > time.Minute {
			delete(seen, k)
		}
	}
	if _, ok := seen[id]; ok {
		return false
	}
	seen[id] = now
	return true
}

func pick(ev Event, keys ...string) string {
	for _, k := range keys {
		if v := ev[k]; v != "" && v != "<unknown>" {
			return v
		}
	}
	return ""
}

// userByExtension returns the id and full name of the active user who owns the extension.
func userByExtension(ctx context.Context, ext string) (id, name string, ok bool) {
	err := store.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(data->>'fullName', '') FROM users
		 WHERE data->>'extension' = $1 AND COALESCE((data->>'isActive')::boolean, true) LIMIT 1`, ext).Scan(&id, &name)
	return id, name, err == nil
}

// WatchCalls turns "a phone is ringing" events into a pop-up for the owner of that extension.
func WatchCalls(c *Client) {
	c.OnEvent = func(ev Event) {
		if ev["Event"] != "DialBegin" {
			return
		}
		m := channelExt.FindStringSubmatch(ev["DestChannel"])
		if m == nil {
			return
		}
		if !firstTime(pick(ev, "DestUniqueID", "DestUniqueid")) {
			return
		}
		go func(ext string) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			uid, _, ok := userByExtension(ctx, ext)
			if !ok {
				log.Printf("voip: extension %s is ringing but no user has this extension (set it in the admin panel)", ext)
				return
			}
			log.Printf("voip: extension %s is ringing for user %s", ext, uid)
			number := pick(ev, "CallerIDNum", "ConnectedLineNum")
			who := number
			if who == "" {
				who = "شمارهٔ ناشناس"
			}
			if _, name, ok := userByExtension(ctx, number); ok && name != "" {
				who = name + " (" + number + ")"
			} else if cn := pick(ev, "CallerIDName"); cn != "" && cn != number {
				who = cn + " (" + number + ")"
			}
			notify.Notify(ctx, []string{uid}, notify.Note{
				Kind: "call", Label: "تماس ورودی", Title: "تماس ورودی از " + who, Body: "داخلی " + ext, Repeat: true,
			}, "")
		}(m[1])
	}
}

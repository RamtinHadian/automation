package voip

import (
	"context"
	"strings"
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

// customerByPhone finds a CRM customer whose phone ends with the same last 10 digits as the caller's number.
func customerByPhone(ctx context.Context, number string) (id, name string, ok bool) {
	var d strings.Builder
	for _, r := range number {
		if r >= '0' && r <= '9' {
			d.WriteRune(r)
		}
	}
	digits := d.String()
	if len(digits) < 7 {
		return "", "", false
	}
	if len(digits) > 10 {
		digits = digits[len(digits)-10:]
	}
	err := store.Pool.QueryRow(ctx,
		`SELECT id, COALESCE(NULLIF(data->>'company', ''), '') || CASE WHEN COALESCE(data->>'company','') <> '' THEN ' - ' ELSE '' END || COALESCE(data->>'name', '')
		 FROM crm_customers
		 WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(data->'phones', '[]'::jsonb)) p
		               WHERE right(regexp_replace(p, '\D', '', 'g'), $2) = $1) LIMIT 1`, digits, len(digits)).Scan(&id, &name)
	return id, name, err == nil
}

// WatchCalls turns "a phone is ringing" events into a pop-up for the owner of that extension.
func WatchCalls(c *Client) {
	c.OnEvent = func(ev Event) {
		journalEvent(ev)
		sampleRinging(ev)
		if ev["Event"] == "Cdr" {
			// the journal needs a moment to write its own row first; the phone system's record is only the second source
			go func() { time.Sleep(3 * time.Second); recordCdr(ev) }()
		}
		if ev["Event"] != "DialBegin" {
			return
		}
		extNum := ringingExt(ev["DestChannel"])
		if extNum == "" {
			return
		}
		if !firstTime(pick(ev, "DestUniqueID", "DestUniqueid")) {
			return
		}
		// the same call can ring one extension twice (a ring group or follow-me dials «Local/500@…» and then the phone itself)
		if !firstTime("call|" + extNum + "|" + pick(ev, "Linkedid", "LinkedID", "Uniqueid", "UniqueID")) {
			return
		}
		go func(ext string) {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			uid, _, ok := userByExtension(ctx, ext)
			if !ok {
				Logf("داخلی %s زنگ می‌خورد اما هیچ کاربری این شمارهٔ داخلی را ندارد (در پنل مدیریت، فرم کاربر، داخلی را وارد کنید).", ext)
				return
			}
			Logf("داخلی %s برای کاربر %s زنگ می‌خورد.", ext, uid)
			number := pick(ev, "CallerIDNum", "ConnectedLineNum")
			if number == ext { // the first leg of a call the person started from the app rings their own phone
				Logf("داخلی %s برای تماسی که خودش از برنامه شروع کرده زنگ می‌خورد؛ پاپ‌آپ لازم نیست.", ext)
				return
			}
			who := number
			if who == "" {
				who = "شمارهٔ ناشناس"
			}
			if _, name, ok := userByExtension(ctx, number); ok && name != "" {
				who = name + " (" + number + ")"
			} else if cn := pick(ev, "CallerIDName"); cn != "" && cn != number {
				who = cn + " (" + number + ")"
			}
			note := notify.Note{Kind: "call", Label: "تماس ورودی", Title: "تماس ورودی از " + who, Body: "داخلی " + ext, Repeat: true}
			if cid, cname, found := customerByPhone(ctx, number); found {
				note.Title = "تماس ورودی از مشتری: " + cname
				note.Body = number + " · داخلی " + ext
				note.Ref = map[string]any{"type": "customer", "id": cid}
			} else {
				// an unknown number: the pop-up offers «ذخیره به‌عنوان مشتری»
				note.Ref = map[string]any{"type": "phone", "id": number}
			}
			notify.Notify(ctx, []string{uid}, note, "")
			Logf("پاپ‌آپ برای کاربر %s فرستاده شد: %s", uid, note.Title)
		}(extNum)
	}
}

var (
	sampleMu sync.Mutex
	sampleAt time.Time
	sampleN  int
)

// sampleRinging writes a short description of the first few ringing events of every hour into the diary, so that a
// missing pop-up can be explained from what the phone system really sends (name of the event, channels, caller).
func sampleRinging(ev Event) {
	ringing := ev["Event"] == "DialBegin" || (ev["Event"] == "Newstate" && strings.EqualFold(ev["ChannelStateDesc"], "Ringing"))
	if !ringing {
		return
	}
	sampleMu.Lock()
	defer sampleMu.Unlock()
	if time.Since(sampleAt) > time.Hour {
		sampleAt, sampleN = time.Now(), 0
	}
	if sampleN >= 12 {
		return
	}
	sampleN++
	Logf("نمونهٔ رویداد زنگ از ایزابل: Event=%s Channel=%s DestChannel=%s Caller=%s Context=%s Exten=%s DestExten=%s DialString=%s", ev["Event"], ev["Channel"], pick(ev, "DestChannel", "Destination"), pick(ev, "CallerIDNum", "ConnectedLineNum"), ev["Context"], ev["Exten"], ev["DestExten"], pick(ev, "DialString", "Dialstring"))
}

// localExt is «Local/500@from-internal-0000;1»: how ring groups, follow-me and queues call an extension.
var localExt = regexp.MustCompile(`^Local/([0-9]{2,8})@[^;]+;[12]$`)

// ringingExt returns the extension a channel belongs to (a phone «SIP/500-0000001b» or a «Local/500@…» leg), or "".
func ringingExt(ch string) string {
	if m := channelExt.FindStringSubmatch(ch); m != nil {
		return m[1]
	}
	if m := localExt.FindStringSubmatch(ch); m != nil {
		return m[1]
	}
	return ""
}

package voip

import (
	"context"
	"regexp"
	"strings"
	"sync"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The call journal turns the phone system's events into one row per call (who called whom, answered or missed, how long).
// A call is tracked by Asterisk's Linkedid; it is written when the first channel of the call hangs up.

type callState struct {
	linked     string
	started    time.Time
	callerNum  string
	callerName string
	legExts    []string          // extensions that rang (a ring group has several)
	arrived    []string          // extensions the call reached in the dialplan (even when their phone is off and the call is forwarded)
	legOf      map[string]string // dest unique id -> number
	destNum    string            // the number dialled when it was not an extension (outgoing call)
	answered   bool
	answeredAt time.Time
	answeredBy string
	lastStatus string
}

var digitsOnly = regexp.MustCompile(`^[0-9]{2,6}$`)

var (
	jMu    sync.Mutex
	active = map[string]*callState{}
)

// get returns the first non-empty field, looking the names up case-insensitively (Asterisk versions differ: DestUniqueID / DestUniqueid).
func get(ev Event, names ...string) string {
	for _, n := range names {
		if v := ev[n]; v != "" && v != "<unknown>" {
			return v
		}
	}
	for _, n := range names {
		for k, v := range ev {
			if strings.EqualFold(k, n) && v != "" && v != "<unknown>" {
				return v
			}
		}
	}
	return ""
}

func addUnique(list []string, v string) []string {
	for _, x := range list {
		if x == v {
			return list
		}
	}
	return append(list, v)
}

// dialedNumber is what was dialled when the destination is not one of our extensions ("PJSIP/trunk/09121234567" -> 09121234567).
func dialedNumber(ev Event) string {
	d := get(ev, "Dialstring")
	if i := strings.LastIndex(d, "/"); i >= 0 {
		d = d[i+1:]
	}
	if i := strings.Index(d, "@"); i >= 0 {
		d = d[:i]
	}
	if d == "" {
		d = get(ev, "DestCallerIDNum", "DestConnectedLineNum")
	}
	return d
}

// journalEvent feeds one Asterisk event into the journal.
func journalEvent(ev Event) {
	switch ev["Event"] {
	case "DialBegin":
		linked := get(ev, "Linkedid", "LinkedID")
		if linked == "" {
			linked = get(ev, "Uniqueid", "UniqueID")
		}
		if linked == "" {
			return
		}
		caller := get(ev, "CallerIDNum", "ConnectedLineNum")
		destExt := ""
		if m := channelExt.FindStringSubmatch(ev["DestChannel"]); m != nil && digitsOnly.MatchString(m[1]) { // trunks have names, extensions are numbers
			destExt = m[1]
		}
		if destExt != "" && destExt == caller { // the first leg of a call started from the app rings the person's own phone
			return
		}
		jMu.Lock()
		defer jMu.Unlock()
		st := active[linked]
		if st == nil {
			st = &callState{linked: linked, started: time.Now(), callerNum: caller, callerName: get(ev, "CallerIDName"), legOf: map[string]string{}}
			active[linked] = st
		}
		if st.callerNum == "" {
			st.callerNum = caller
		}
		num := destExt
		if destExt != "" {
			st.legExts = addUnique(st.legExts, destExt)
		} else {
			num = dialedNumber(ev)
			if num != "" {
				st.destNum = num
			}
		}
		if uid := get(ev, "DestUniqueid", "DestUniqueID"); uid != "" {
			st.legOf[uid] = num
		}
	case "Newexten":
		// the call reached an extension in the phone system: this happens also when the extension's phone is off and the
		// extension only forwards the call to another number
		ext := get(ev, "Extension", "Exten")
		if !strings.EqualFold(ev["Context"], "ext-local") || !digitsOnly.MatchString(ext) {
			return
		}
		linked := get(ev, "Linkedid", "LinkedID", "Uniqueid", "UniqueID")
		if linked == "" {
			return
		}
		caller, callerName := callerOf(ev)
		if caller == ext {
			return
		}
		jMu.Lock()
		defer jMu.Unlock()
		st := active[linked]
		if st == nil {
			st = &callState{linked: linked, started: time.Now(), callerNum: caller, callerName: callerName, legOf: map[string]string{}}
			active[linked] = st
		}
		if st.callerNum == "" {
			st.callerNum, st.callerName = caller, callerName
		}
		st.arrived = addUnique(st.arrived, ext)
	case "DialEnd":
		linked := get(ev, "Linkedid", "LinkedID")
		jMu.Lock()
		defer jMu.Unlock()
		st := active[linked]
		if st == nil {
			return
		}
		status := strings.ToUpper(get(ev, "DialStatus"))
		if status == "ANSWER" {
			if !st.answered {
				st.answered, st.answeredAt = true, time.Now()
				st.answeredBy = st.legOf[get(ev, "DestUniqueid", "DestUniqueID")]
			}
		} else if status != "" {
			st.lastStatus = status
		}
	case "Hangup":
		uid := get(ev, "Uniqueid", "UniqueID")
		linked := get(ev, "Linkedid", "LinkedID")
		if uid == "" || uid != linked {
			return // another channel of the same call; the call ends with its first channel
		}
		jMu.Lock()
		st := active[linked]
		delete(active, linked)
		// forget calls that never ended (lost events)
		for k, v := range active {
			if time.Since(v.started) > 6*time.Hour {
				delete(active, k)
			}
		}
		jMu.Unlock()
		if st != nil {
			go finalize(st, time.Now())
		}
	}
}

func finalize(st *callState, ended time.Time) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	callerUID, callerUserName, callerIsExt := userByExtension(ctx, st.callerNum)
	direction := "in"
	other, otherName := st.callerNum, st.callerName
	ext := ""
	switch {
	case callerIsExt && len(st.legExts) > 0:
		direction = "internal"
		ext = st.callerNum
		other = st.legExts[0]
		if st.answered && st.answeredBy != "" {
			other = st.answeredBy
		}
		if _, n, ok := userByExtension(ctx, other); ok {
			otherName = n
		}
	case callerIsExt:
		direction = "out"
		ext = st.callerNum
		other, otherName = st.destNum, ""
	default:
		if st.answered && st.answeredBy != "" {
			ext = st.answeredBy
		} else if len(st.legExts) > 0 {
			ext = st.legExts[0]
		}
		if st.callerName == st.callerNum {
			otherName = ""
		}
	}
	if other == "" {
		other = "ناشناس"
	}

	status := "missed"
	if st.answered {
		status = "answered"
	} else {
		switch st.lastStatus {
		case "BUSY":
			status = "busy"
		case "CONGESTION", "CHANUNAVAIL":
			status = "failed"
		case "":
			if direction == "out" {
				status = "failed"
			}
		}
	}
	dur := 0
	if st.answered {
		dur = int(ended.Sub(st.answeredAt).Seconds())
	}

	userID := ""
	switch direction {
	case "in":
		if uid, _, ok := userByExtension(ctx, ext); ok {
			userID = uid
		}
	default:
		userID = callerUID
	}

	var custID, custName string
	if direction != "internal" {
		if cid, cname, ok := customerByPhone(ctx, other); ok {
			custID, custName = cid, cname
		}
	}
	exts := st.legExts
	if direction != "in" && ext != "" {
		exts = addUnique(append([]string{}, exts...), ext)
	}

	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO voip_calls (id, started_at, answered_at, ended_at, direction, status, ext, exts, user_id, other_num, other_name, customer_id, customer_name, duration_sec)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING`,
		st.linked, st.started, nullTime(st.answered, st.answeredAt), ended, direction, status, ext, exts, userID, other, otherName, custID, custName, dur); err != nil {
		Logf("ثبت تماس در دفترچهٔ تماس‌ها نشد: %v", err)
		return
	}
	Logf("تماس ثبت شد: %s %s ↔ %s (%s%s)", map[string]string{"in": "ورودی", "out": "خروجی", "internal": "داخلی"}[direction], ext, other, map[string]string{"answered": "پاسخ داده شد", "missed": "بی‌پاسخ", "busy": "مشغول", "failed": "ناموفق"}[status], durText(dur))

	// A missed incoming call is reported to everybody whose phone rang (all members of a ring group).
	if direction == "in" && status != "answered" {
		var uids []string
		for _, e := range st.legExts {
			if uid, _, ok := userByExtension(ctx, e); ok {
				uids = addUnique(uids, uid)
			}
		}
		who := other
		if custName != "" {
			who = custName + " (" + other + ")"
		} else if otherName != "" {
			who = otherName + " (" + other + ")"
		}
		note := notify.Note{Kind: "call", Label: "تماس بی‌پاسخ", Title: "تماس بی‌پاسخ از " + who, Body: "داخلی " + strings.Join(st.legExts, "، "), Repeat: true}
		if custID != "" {
			note.Ref = map[string]any{"type": "customer", "id": custID}
		}
		notify.Notify(ctx, uids, note, "")
	}

	// A call with a known customer is written into the customer's history.
	if custID != "" && direction != "internal" {
		var owner, ownerName string
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(owner_id, ''), COALESCE(data->>'ownerName', '') FROM crm_customers WHERE id = $1`, custID).Scan(&owner, &ownerName)
		kind := "تماس ورودی"
		if direction == "out" {
			kind = "تماس خروجی"
		}
		text := kind + " — " + map[string]string{"answered": "پاسخ داده شد" + durText(dur), "missed": "بی‌پاسخ", "busy": "مشغول", "failed": "ناموفق"}[status]
		if callerUserName != "" && direction == "out" {
			text += " (توسط " + callerUserName + ")"
		}
		doc := jsonx.M{
			"id": "call-" + st.linked, "customerId": custID, "type": "CALL", "text": text, "ownerId": owner, "ownerName": ownerName,
			"authorId": "voip", "authorName": "تلفن شرکت", "createdAt": ended.UTC().Format("2006-01-02T15:04:05.000Z"),
		}
		_, _ = store.Pool.Exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`,
			"call-"+st.linked, custID, owner, jsonx.Encode(doc))
	}
}

func nullTime(ok bool, t time.Time) any {
	if !ok {
		return nil
	}
	return t
}

func durText(sec int) string {
	if sec <= 0 {
		return ""
	}
	return " · " + itoa(sec/60) + ":" + pad2(sec%60)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

func pad2(n int) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

// incomingExt is the extension an incoming call belongs to: the one that answered, else the first one that rang, else the
// first one the call reached in the dialplan (an extension whose phone is off and which forwards the call to a mobile).
func incomingExt(st *callState) string {
	if st.answered && digitsOnly.MatchString(st.answeredBy) {
		return st.answeredBy
	}
	if len(st.legExts) > 0 {
		return st.legExts[0]
	}
	if len(st.arrived) > 0 {
		return st.arrived[0]
	}
	return ""
}

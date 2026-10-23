package api

import (
	"strings"
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
	"automation/server/internal/voip"
)

var phone *voip.Client

// SetPhone gives the API the connection to the phone system.
func SetPhone(c *voip.Client) { phone = c }

var onlyDigits = regexp.MustCompile(`^[0-9*#+]{1,20}$`)

// pickExtension: the extension a call starts from: the main one, or one of the person's own extensions they chose in the call window.
func pickExtension(me auth.User, body jsonx.M, main string) (string, bool) {
	pick := strings.TrimSpace(jsonx.Str(body, "from"))
	if pick == "" {
		return main, true
	}
	for _, e := range userExts(me) {
		if e == pick {
			return pick, true
		}
	}
	return main, false
}

// userExts: every phone extension of a person: the main one (used to ring them first when they start a call) and the extra ones
// («extensions»: the same person can have more than one phone, e.g. a desk phone and a softphone).
func userExts(me auth.User) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, e := range append([]string{jsonx.Str(me.M, "extension")}, jsonx.Strings(me.M, "extensions")...) {
		if e = strings.TrimSpace(e); e != "" && !seen[e] {
			seen[e] = true
			out = append(out, e)
		}
	}
	return out
}

// voipStatus tells the page whether the phone integration is on and which extension the user has.
func voipStatus(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	httpx.JSON(w, http.StatusOK, map[string]any{
		// the demo has no phone system; it shows the phone as connected so the call buttons are there to try
		"enabled":   DemoMode || (phone != nil && phone.Enabled()),
		"connected": DemoMode || (phone != nil && phone.Connected()),
		"extension": jsonx.Str(me.M, "extension"),
		"areaCode":  voip.AreaCode(),
	})
}

// voipAreaGet / voipAreaSet: the city (area code) of the company's phone line, chosen in the console; local numbers get it as a prefix.
func voipAreaGet(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	var raw []byte
	d := jsonx.M{}
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'voipArea'`).Scan(&raw) == nil {
		d = jsonx.Decode(raw)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"code": jsonx.Str(d, "code"), "city": jsonx.Str(d, "city")})
}

func voipAreaSet(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	var body struct {
		Code string `json:"code"`
		City string `json:"city"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
		httpx.Error(w, http.StatusBadRequest, "درخواست نامعتبر است.")
		return
	}
	code := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, body.Code)
	if code != "" && (len(code) < 2 || len(code) > 4 || code[0] != '0') {
		httpx.Error(w, http.StatusBadRequest, "پیش‌شماره باید با صفر شروع شود (مثلاً ۰۳۱).")
		return
	}
	city := strings.TrimSpace(body.City)
	if len(city) > 60 {
		city = city[:60]
	}
	d := jsonx.M{"code": code, "city": city}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('voipArea', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(d)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ذخیره نشد.")
		return
	}
	voip.ResetArea()
	httpx.JSON(w, http.StatusOK, map[string]any{"code": code, "city": city})
}

// voipLog is the phone-system diary for admins: connection state, how many events arrived and what was done with the calls.
func voipLog(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Error(w, http.StatusForbidden, "این بخش فقط برای مدیر است.")
		return
	}
	count, last := voip.Stats()
	var lastAt any
	if !last.IsZero() {
		lastAt = last
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"enabled":    DemoMode || (phone != nil && phone.Enabled()),
		"connected":  DemoMode || (phone != nil && phone.Connected()),
		"eventCount": count,
		"lastEvent":  lastAt,
		"entries":    voip.Recent(),
		"capture":    captureInfo(),
	})
}

func captureInfo() map[string]any {
	running, left, lines := voip.CaptureState()
	return map[string]any{"running": running, "secondsLeft": left, "lines": lines}
}

// voipCapture starts a one-minute recording of the raw phone-system events (admins only).
func voipCapture(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	voip.StartCapture()
	httpx.OK(w)
}

// voipTestPopup sends the user an example incoming-call notification, to check the pop-up, sound and desktop window without a real call.
func voipTestPopup(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	note := notify.Note{Kind: "call", Label: "تماس ورودی", Title: "تماس ورودی آزمایشی", Body: "این یک آزمایش است؛ تماس واقعی نیست.", Repeat: true}
	// {customerId}: the test call comes from that customer, so the pop-up shows the customer's history like a real call
	body := jsonx.M{}
	_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body) // the body is optional
	if cid := jsonx.Str(body, "customerId"); cid != "" {
		var name string
		if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'name', '') FROM crm_customers WHERE id = $1`, cid).Scan(&name) == nil {
			note.Title, note.Ref = "تماس ورودی از مشتری: "+name, ref("customer", cid)
		}
	}
	notify.Notify(r.Context(), []string{me.ID()}, note, "")
	httpx.OK(w)
}

// voipCall rings the user's own extension and then dials the target (a number or a colleague's user id).
func voipCall(w http.ResponseWriter, r *http.Request) {
	if DemoMode {
		demoCall(w, r)
		return
	}
	if phone == nil || !phone.Enabled() {
		httpx.Error(w, http.StatusServiceUnavailable, "اتصال به تلفن سازمان تنظیم نشده است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r)
	from := jsonx.Str(me.M, "extension")
	from, ok = pickExtension(me, body, from)
	if !ok {
		httpx.Error(w, http.StatusBadRequest, "این شمارهٔ داخلی برای شما نیست.")
		return
	}
	if from == "" {
		httpx.Error(w, http.StatusBadRequest, "شمارهٔ داخلی شما در پنل مدیریت تعریف نشده است.")
		return
	}
	target := jsonx.Str(body, "to")
	if !onlyDigits.MatchString(target) { // not a number: treat it as a colleague's user id
		var ext string
		err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'extension', '') FROM users WHERE id = $1`, target).Scan(&ext)
		if err == pgx.ErrNoRows || ext == "" {
			httpx.Error(w, http.StatusBadRequest, "این همکار شمارهٔ داخلی ندارد.")
			return
		}
		if err != nil {
			internalError(w)
			return
		}
		target = ext
	}
	if err := phone.Call(from, target); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.OK(w)
}

// voipCalls lists the call journal. Everybody sees their own calls (their extension rang or dialled); admins can ask for the whole company
// (scope=all); a person with customer access can ask for the calls of one customer (customer=<id>).
func voipCalls(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	q := r.URL.Query()
	limit := 150
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 && n <= 500 {
		limit = n
	}
	var where string
	var args []any
	switch {
	case q.Get("customer") != "":
		if !me.CanUseCrm() {
			httpx.Forbidden(w)
			return
		}
		where, args = "customer_id = $1", []any{q.Get("customer")}
	case q.Get("scope") == "all":
		if !me.IsAdmin() {
			httpx.Forbidden(w)
			return
		}
		where = "TRUE"
	default:
		where, args = "(user_id = $1 OR exts && $2::text[])", []any{me.ID(), userExts(me)}
	}
	rows, err := store.Pool.Query(r.Context(),
		`SELECT id, started_at, direction, status, ext, user_id, other_num, other_name, customer_id, customer_name, duration_sec,
		        COALESCE((SELECT data->>'fullName' FROM users WHERE id = voip_calls.user_id), '')
		   FROM voip_calls WHERE `+where+` ORDER BY started_at DESC LIMIT `+strconv.Itoa(limit), args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	staff := voip.StaffPhones(r.Context())
	out := []jsonx.M{}
	for rows.Next() {
		var id, direction, status, ext, uid, num, name, cid, cname, uname string
		var started time.Time
		var dur int
		if rows.Scan(&id, &started, &direction, &status, &ext, &uid, &num, &name, &cid, &cname, &dur, &uname) != nil {
			continue
		}
		// a colleague who rings from their mobile is shown by name (the numbers on their user card)
		if direction != "internal" && cname == "" {
			if sn, ok := voip.MatchStaff(staff, num); ok {
				name = sn + " (همکار شرکت)"
			}
		}
		out = append(out, jsonx.M{"id": id, "startedAt": started.UTC().Format("2006-01-02T15:04:05.000Z"), "direction": direction, "status": status,
			"ext": ext, "userId": uid, "userName": uname, "number": num, "name": name, "customerId": cid, "customerName": cname, "duration": dur, "hasRecording": recordingFile(id) != ""})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"calls": out})
}

// voipStats gives admins the numbers behind the phone dashboard: calls per status today and over the last week, and per extension.
func voipStats(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).CanViewStats() {
		httpx.Forbidden(w)
		return
	}
	type row struct {
		Key      string `json:"key"`
		Total    int    `json:"total"`
		Answered int    `json:"answered"`
		Missed   int    `json:"missed"`
		Seconds  int    `json:"seconds"`
	}
	load := func(sql string) []row {
		rows, err := store.Pool.Query(r.Context(), sql)
		out := []row{}
		if err != nil {
			return out
		}
		defer rows.Close()
		for rows.Next() {
			var x row
			if rows.Scan(&x.Key, &x.Total, &x.Answered, &x.Missed, &x.Seconds) == nil {
				out = append(out, x)
			}
		}
		return out
	}
	agg := `count(*)::int, count(*) FILTER (WHERE status = 'answered')::int, count(*) FILTER (WHERE status <> 'answered' AND direction = 'in')::int, COALESCE(sum(duration_sec), 0)::int`
	httpx.JSON(w, http.StatusOK, map[string]any{
		"byDay": load(`SELECT to_char(started_at AT TIME ZONE 'Asia/Tehran', 'YYYY-MM-DD'), ` + agg + ` FROM voip_calls WHERE started_at > now() - interval '7 days' GROUP BY 1 ORDER BY 1 DESC`),
		"byExt": load(`SELECT ext, ` + agg + ` FROM voip_calls WHERE started_at > now() - interval '7 days' AND ext <> '' GROUP BY ext ORDER BY 2 DESC LIMIT 30`),
	})
}

// demoCall: in the demo nothing rings; the call is only written to the call journal so the history shows what was tried.
func demoCall(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r)
	ext, okExt := pickExtension(me, body, jsonx.Str(me.M, "extension"))
	if !okExt {
		httpx.Error(w, http.StatusBadRequest, "این شمارهٔ داخلی برای شما نیست.")
		return
	}
	target := jsonx.Str(body, "to")
	name := ""
	if !onlyDigits.MatchString(target) { // a colleague's user id
		_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'extension', ''), COALESCE(data->>'fullName', '') FROM users WHERE id = $1`, target).Scan(&target, &name)
	}
	now := time.Now()
	_, _ = store.Pool.Exec(r.Context(), `INSERT INTO voip_calls (id, started_at, answered_at, ended_at, direction, status, ext, exts, user_id, other_num, other_name, customer_id, customer_name, duration_sec)
		VALUES ($1, $2, $2, $3, 'out', 'answered', $4, $5, $6, $7, $8, '', '', 30)`,
		"demo-live-"+strconv.FormatInt(now.UnixNano(), 36), now, now.Add(30*time.Second), ext, []string{ext}, me.ID(), target, name)
	httpx.OK(w)
}

// voipCallCustomer: a representative presses «call» on a customer whose numbers are hidden from him. The company's phone system calls the
// representative's own mobile first and, when he answers, dials the customer's number; the number never reaches his screen.
func voipCallCustomer(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r)
	cid := jsonx.Str(body, "customerId")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM crm_customers WHERE id = $1`, cid).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "مشتری پیدا نشد.")
		return
	}
	cust := jsonx.Decode(raw)
	shown := jsonx.Contains(jsonx.Strings(cust, "agentViewerIds"), me.ID())
	if !shown && !crmOwnsCustomer(r, me, cid) {
		httpx.Forbidden(w)
		return
	}
	numbers := jsonx.Strings(cust, "phones")
	if len(numbers) == 0 {
		httpx.Error(w, http.StatusBadRequest, "برای این مشتری شماره‌ای ثبت نشده است.")
		return
	}
	target := voip.FullNumber(numbers[0])
	mobile := strings.TrimSpace(jsonx.Str(me.M, "mobile"))
	if mobile == "" {
		httpx.Error(w, http.StatusBadRequest, "شمارهٔ موبایل شما در پنل مدیریت تعریف نشده است؛ از مدیر بخواهید ثبت کند.")
		return
	}
	if DemoMode {
		httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "demo": true})
		return
	}
	if phone == nil || !phone.Enabled() {
		httpx.Error(w, http.StatusServiceUnavailable, "اتصال به تلفن سازمان تنظیم نشده است.")
		return
	}
	if err := phone.CallMobile(mobile, target); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.OK(w)
}

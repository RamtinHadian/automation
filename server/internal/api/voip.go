package api

import (
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

// voipStatus tells the page whether the phone integration is on and which extension the user has.
func voipStatus(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"enabled":   phone != nil && phone.Enabled(),
		"connected": phone != nil && phone.Connected(),
		"extension": jsonx.Str(me.M, "extension"),
	})
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
		"enabled":    phone != nil && phone.Enabled(),
		"connected":  phone != nil && phone.Connected(),
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
	notify.Notify(r.Context(), []string{me.ID()}, note, "")
	httpx.OK(w)
}

// voipCall rings the user's own extension and then dials the target (a number or a colleague's user id).
func voipCall(w http.ResponseWriter, r *http.Request) {
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
		ext := jsonx.Str(me.M, "extension")
		where, args = "(user_id = $1 OR ($2 <> '' AND $2 = ANY(exts)))", []any{me.ID(), ext}
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
	out := []jsonx.M{}
	for rows.Next() {
		var id, direction, status, ext, uid, num, name, cid, cname, uname string
		var started time.Time
		var dur int
		if rows.Scan(&id, &started, &direction, &status, &ext, &uid, &num, &name, &cid, &cname, &dur, &uname) != nil {
			continue
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

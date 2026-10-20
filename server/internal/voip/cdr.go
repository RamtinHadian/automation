package voip

import (
	"regexp"
	"context"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// A second source for the call history: the phone system's own call records («Cdr» events, class "cdr"). The journal
// in journal.go follows the legs of a call; when a call is handed on (forwarded to a mobile, a ring group, a trunk with a
// name) it can miss who the call was for. The phone system's record always says «from X to extension Y, answered or not,
// how long», the same as in Issabel's own call report, so a call that the journal did not write is added from it.

// cdrStatus maps Asterisk's «Disposition» to the status words used in the history.
func cdrStatus(disposition string) string {
	switch strings.ToUpper(strings.TrimSpace(disposition)) {
	case "ANSWERED":
		return "answered"
	case "BUSY":
		return "busy"
	case "FAILED", "CONGESTION":
		return "failed"
	}
	return "missed"
}

// recordCdr writes one history row from a «Cdr» event, only when one side is an extension of one of our users and the
// journal has not already written the same call.
func recordCdr(ev Event) {
	src := strings.TrimSpace(ev["Source"])
	dst := strings.TrimSpace(ev["Destination"])
	if src == "" || dst == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	srcUID, srcName, srcIsExt := userByExtension(ctx, src)
	dstUID, dstName, dstIsExt := userByExtension(ctx, dst)
	if !srcIsExt && !dstIsExt {
		recordCompanyCall(ctx, ev, src, dst) // a call that rang a ring group, a queue or an IVR (or was forwarded outside): nobody's own extension, but the company's call
		return
	}
	ended := time.Now()
	total, _ := strconv.Atoi(ev["Duration"])
	billable, _ := strconv.Atoi(ev["BillableSeconds"])
	started := ended.Add(-time.Duration(total) * time.Second)
	status := cdrStatus(ev["Disposition"])
	if status != "answered" {
		billable = 0
	}

	direction, ext, userID, other, otherName := "in", dst, dstUID, src, ev["CallerID"]
	switch {
	case srcIsExt && dstIsExt:
		direction, ext, userID, other, otherName = "internal", src, srcUID, dst, dstName
	case srcIsExt:
		direction, ext, userID, other, otherName = "out", src, srcUID, dst, ""
	default:
		_ = srcName
	}
	if i := strings.Index(otherName, "<"); i >= 0 { // «"Ali" <0912...>» -> Ali
		otherName = strings.Trim(strings.TrimSpace(otherName[:i]), `"`)
	}
	if direction != "internal" {
		other = FullNumber(other)
	}
	if otherName == other {
		otherName = ""
	}

	id := strings.TrimSpace(ev["UniqueID"])
	if id == "" {
		id = "cdr-" + strconv.FormatInt(ended.UnixNano(), 36)
	}
	// the journal (or another leg of the same call) may already have written it: same id, or same people within two minutes
	var exists int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM voip_calls WHERE id = $1 OR (other_num = $2 AND ext = $3 AND started_at BETWEEN $4 AND $5)`,
		id, other, ext, started.Add(-2*time.Minute), started.Add(2*time.Minute)).Scan(&exists)
	if exists > 0 {
		return
	}
	var custID, custName string
	if direction != "internal" {
		if cid, cname, ok := customerByPhone(ctx, other); ok {
			custID, custName = cid, cname
		}
	}
	var answeredAt any
	if status == "answered" {
		answeredAt = ended.Add(-time.Duration(billable) * time.Second)
	}
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO voip_calls (id, started_at, answered_at, ended_at, direction, status, ext, exts, user_id, other_num, other_name, customer_id, customer_name, duration_sec)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (id) DO NOTHING`,
		id, started, answeredAt, ended, direction, status, ext, []string{ext}, userID, other, otherName, custID, custName, billable); err != nil {
		Logf("ثبت تماس از روی سوابق تلفن‌سانتر نشد: %v", err)
		return
	}
	// an incoming call nobody answered (also when the extension's phone was switched off) is reported to its owner
	if direction == "in" && status != "answered" && userID != "" {
		who := other
		if custName != "" {
			who = custName + " (" + other + ")"
		} else if otherName != "" {
			who = otherName + " (" + other + ")"
		}
		note := notify.Note{Kind: "call", Label: "تماس بی‌پاسخ", Title: "تماس بی‌پاسخ از " + who, Body: "داخلی " + ext, Repeat: true}
		if custID != "" {
			note.Ref = map[string]any{"type": "customer", "id": custID}
		} else if otherName == "" && other != "" {
			// a number that is not in the phone bank: opening the notification offers «save the number»
			note.Ref = map[string]any{"type": "phone", "id": other}
		}
		notify.Notify(ctx, []string{userID}, note, "")
	}
	Logf("تماس از روی سوابق تلفن‌سانتر ثبت شد: %s %s ↔ %s (%s)", map[string]string{"in": "ورودی", "out": "خروجی", "internal": "داخلی"}[direction], ext, other, map[string]string{"answered": "پاسخ داده شد", "missed": "بی‌پاسخ", "busy": "مشغول", "failed": "ناموفق"}[status])
}

var longNumber = regexp.MustCompile(`^\+?[0-9]{7,}$`)
var shortNumber = regexp.MustCompile(`^[0-9]{2,6}$`)

// recordCompanyCall writes the call of an outside caller to a number of the company that belongs to nobody's own extension (a ring group, a
// queue, the IVR, the main number) or that the phone system forwarded outside. It has no owner: the managers see it in the company's calls,
// and the people allowed to see every call of the company hear about it when nobody answered. The legs of one call (the ring group's leg, then the
// forwarded one) are one row.
func recordCompanyCall(ctx context.Context, ev Event, src, dst string) {
	if !longNumber.MatchString(src) || !(shortNumber.MatchString(dst) || longNumber.MatchString(dst)) {
		return // not an outside caller (helper steps of the phone system between its own numbers)
	}
	ended := time.Now()
	total, _ := strconv.Atoi(ev["Duration"])
	billable, _ := strconv.Atoi(ev["BillableSeconds"])
	started := ended.Add(-time.Duration(total) * time.Second)
	status := cdrStatus(ev["Disposition"])
	if status != "answered" {
		billable = 0
	}
	other, otherName := src, ev["CallerID"]
	if i := strings.Index(otherName, "<"); i >= 0 {
		otherName = strings.Trim(strings.TrimSpace(otherName[:i]), `"`)
	}
	other = FullNumber(other)
	if otherName == other {
		otherName = ""
	}
	id := strings.TrimSpace(ev["UniqueID"])
	if id == "" {
		id = "cdr-" + strconv.FormatInt(ended.UnixNano(), 36)
	}
	// the same caller within two minutes is the same call (the second leg of a forward): one row
	var exists int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM voip_calls WHERE id = $1 OR (other_num = $2 AND started_at BETWEEN $3 AND $4)`,
		id, other, started.Add(-2*time.Minute), started.Add(2*time.Minute)).Scan(&exists)
	if exists > 0 {
		return
	}
	var custID, custName string
	if cid, cname, ok := customerByPhone(ctx, other); ok {
		custID, custName = cid, cname
	}
	var answeredAt any
	if status == "answered" {
		answeredAt = ended.Add(-time.Duration(billable) * time.Second)
	}
	ext := ""
	if shortNumber.MatchString(dst) {
		ext = dst // the company's number the caller reached (400…)
	}
	if _, err := store.Pool.Exec(ctx,
		`INSERT INTO voip_calls (id, started_at, answered_at, ended_at, direction, status, ext, exts, user_id, other_num, other_name, customer_id, customer_name, duration_sec)
		 VALUES ($1, $2, $3, $4, 'in', $5, $6, $7, '', $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING`,
		id, started, answeredAt, ended, status, ext, []string{}, other, otherName, custID, custName, billable); err != nil {
		Logf("ثبت تماس شرکت از روی سوابق تلفن‌سانتر نشد: %v", err)
		return
	}
	if status != "answered" {
		who := other
		if custName != "" {
			who = custName + " (" + other + ")"
		}
		note := notify.Note{Kind: "call", Label: "تماس بی‌پاسخ", Title: "تماس بی‌پاسخ از " + who, Body: "به شمارهٔ " + dst, Repeat: true}
		if custID != "" {
			note.Ref = map[string]any{"type": "customer", "id": custID}
		} else {
			note.Ref = map[string]any{"type": "phone", "id": other}
		}
		if watchers := callWatchers(ctx, ""); len(watchers) > 0 {
			notify.Notify(ctx, watchers, note, "")
		}
	}
	Logf("تماس شرکت از روی سوابق تلفن‌سانتر ثبت شد: %s ← %s (%s)", dst, other, map[string]string{"answered": "پاسخ داده شد", "missed": "بی‌پاسخ", "busy": "مشغول", "failed": "ناموفق"}[status])
}

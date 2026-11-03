package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A customer that is edited in Hoormand and already exists in Sepidar is sent to Sepidar again by itself: the edit puts a «customer.send»
// request in the queue of the connector program, exactly as the «ارسال به سپیدار» button does (the program then makes the Sepidar customer
// like the Hoormand one: name, numbers, codes, birth date and the main address). It happens only when
// something that Sepidar holds really changed, only for a customer that has a link to Sepidar, and only when the person who edited may update customers in Sepidar.

var sepidarEditFields = []string{"name", "firstName", "lastName", "company", "kind", "nationalCode", "nationalId", "economicCode", "birthDate", "address", "province", "city", "postalCode"}

func phoneDigits(list []string) string {
	var out []string
	for _, p := range list {
		var d strings.Builder
		for _, ch := range faDigits.Replace(p) {
			if ch >= '0' && ch <= '9' {
				d.WriteRune(ch)
			}
		}
		if d.Len() > 0 {
			out = append(out, d.String())
		}
	}
	return strings.Join(out, ",")
}

// customerSepidarChanged: did a field that Sepidar holds change between the two versions of the customer?
func customerSepidarChanged(before, after jsonx.M) bool {
	for _, f := range sepidarEditFields {
		if strings.TrimSpace(jsonx.Str(before, f)) != strings.TrimSpace(jsonx.Str(after, f)) {
			return true
		}
	}
	return phoneDigits(jsonx.Strings(before, "phones")) != phoneDigits(jsonx.Strings(after, "phones"))
}

// queueSepidarCustomerEdit puts the update of an edited customer in the queue of the connector (nothing happens when it does not apply).
func queueSepidarCustomerEdit(ctx context.Context, me auth.User, id, title string, doc jsonx.M) {
	if !sepidarEnabled(ctx) || !sepidarCan(me, "customerUpdate") {
		return
	}
	var linked, pending int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_links WHERE kind = 'customer' AND ref = $1`, id).Scan(&linked)
	// not tied yet, but Sepidar may already hold this very person (the same mobile or national code): that record is updated too.
	// Nothing is ever created from an edit, and a Sepidar customer that belongs to another Hoormand customer is never touched.
	if linked == 0 && !sepidarHasSamePerson(ctx, id, doc) {
		return
	}
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_jobs WHERE kind = 'customer.send' AND ref = $1 AND status = 'pending'`, id).Scan(&pending)
	if pending > 0 {
		return // the one that waits will read the newest version anyway
	}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO sepidar_jobs (id, kind, ref, data, created_by, created_by_name) VALUES ($1, 'customer.send', $2, $3::jsonb, $4, $5)`,
		"sj-"+randomHex(6), id, jsonx.Encode(jsonx.M{"customerId": id, "title": title, "auto": true}), me.ID(), me.Name()+" (ویرایش مشتری)")
}

// sepidarHasSamePerson: Sepidar already has a customer with one of this customer's numbers (last nine digits) or his national code,
// who is not tied to another Hoormand customer.
func sepidarHasSamePerson(ctx context.Context, id string, doc jsonx.M) bool {
	var keys []string
	for _, p := range jsonx.Strings(doc, "phones") {
		if d := digitsOnly(p); len(d) >= 9 {
			keys = append(keys, d[len(d)-9:])
		}
	}
	nat, nid := digitsOnly(jsonx.Str(doc, "nationalCode")), digitsOnly(jsonx.Str(doc, "nationalId"))
	myName := sepidarNameKey(jsonx.Str(doc, "name"))
	if len(keys) == 0 && nat == "" && nid == "" && len(myName) < 6 {
		return false
	}
	// the same full name counts when exactly one Sepidar customer (not tied to another Hoormand customer) carries it
	sameName := 0
	list := loadSepidarCustomers(ctx)
	if len(myName) >= 6 {
		for _, c := range list {
			if sepidarNameKey(jsonx.Str(c, "name")) != myName {
				continue
			}
			var ref string
			if store.Pool.QueryRow(ctx, `SELECT ref FROM sepidar_links WHERE kind = 'customer' AND sepidar_id = $1 LIMIT 1`, sepidarIDOf(c)).Scan(&ref) == nil && ref != id {
				continue
			}
			sameName++
		}
		if sameName == 1 {
			return true
		}
	}
	for _, c := range list {
		hit := false
		for _, p := range jsonx.Strings(c, "phones") {
			d := digitsOnly(p)
			if len(d) < 9 {
				continue
			}
			for _, k := range keys {
				if strings.HasSuffix(d, k) {
					hit = true
				}
			}
		}
		if sn := digitsOnly(jsonx.Str(c, "nationalId")); sn != "" && (sn == nat || sn == nid) {
			hit = true
		}
		if !hit {
			continue
		}
		var ref string
		if store.Pool.QueryRow(ctx, `SELECT ref FROM sepidar_links WHERE kind = 'customer' AND sepidar_id = $1 LIMIT 1`, sepidarIDOf(c)).Scan(&ref) == nil && ref != id {
			continue // that Sepidar customer already belongs to somebody else in Hoormand
		}
		return true
	}
	return false
}

// sepidarNameKey: a name written the same way (Arabic ye / kaf, half spaces, repeated blanks and case do not matter).
func sepidarNameKey(s string) string {
	s = strings.NewReplacer("ي", "ی", "ك", "ک", "‌", " ", "‏", " ", "‎", " ").Replace(s)
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

// GET /api/sepidar/explain/{customerId}: why did (or did not) an edit of this customer go to Sepidar? Every condition, one line each, for the person who edits.
func sepidarExplain(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("customerId")
	ctx := r.Context()
	if !crmOwnsCustomer(r, me, id) {
		httpx.Forbidden(w)
		return
	}
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusNotFound, "این مشتری پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	yes := func(ok bool) string {
		if ok {
			return "✓ "
		}
		return "✗ "
	}
	lines := []string{}
	on := sepidarEnabled(ctx)
	lines = append(lines, yes(on)+"سپیدار در کنسول روشن است")
	can := sepidarCan(me, "customerUpdate")
	lines = append(lines, yes(can)+"شما ("+me.Name()+") حق «بروزرسانی مشتری» در سپیدار را دارید")
	var linked int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_links WHERE kind = 'customer' AND ref = $1`, id).Scan(&linked)
	lines = append(lines, yes(linked > 0)+"این مشتری به یک مشتری سپیدار وصل است")
	cache := loadSepidarCustomers(ctx)
	lines = append(lines, "• فهرست مشتریان سپیدار در هورمند: "+strconv.Itoa(len(cache))+" نفر")
	same := sepidarHasSamePerson(ctx, id, doc)
	lines = append(lines, yes(same)+"در سپیدار یک مشتری با شمارهٔ موبایل، کد ملی یا نام کامل یکسان (و آزاد) هست")
	var pending int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_jobs WHERE kind = 'customer.send' AND ref = $1 AND status = 'pending'`, id).Scan(&pending)
	if pending > 0 {
		lines = append(lines, "• یک درخواست در صف منتظر برنامهٔ سپیدار است")
	}
	var st, msg, at string
	if store.Pool.QueryRow(ctx, `SELECT status, COALESCE(result->>'message', ''), to_char(created_at, 'YYYY-MM-DD HH24:MI') FROM sepidar_jobs WHERE kind = 'customer.send' AND ref = $1 ORDER BY created_at DESC LIMIT 1`, id).Scan(&st, &msg, &at) == nil {
		lines = append(lines, "• آخرین درخواست این مشتری: "+st+" ("+at+") "+msg)
	} else {
		lines = append(lines, "• تا حالا هیچ درخواستی برای این مشتری ساخته نشده")
	}
	verdict := "با این شرایط ویرایش بعدی (اگر نام، شماره، کد ملی یا نشانی عوض شود) به سپیدار می‌رود."
	if !on || !can || (linked == 0 && !same) {
		verdict = "ویرایش به سپیدار نمی‌رود: اولین ✗ بالا دلیل آن است."
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"lines": lines, "verdict": verdict})
}

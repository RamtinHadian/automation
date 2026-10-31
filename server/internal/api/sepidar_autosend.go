package api

import (
	"context"
	"strings"

	"automation/server/internal/auth"
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
	if len(keys) == 0 && nat == "" && nid == "" {
		return false
	}
	for _, c := range loadSepidarCustomers(ctx) {
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

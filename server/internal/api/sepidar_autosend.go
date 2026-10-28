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
func queueSepidarCustomerEdit(ctx context.Context, me auth.User, id, title string) {
	if !sepidarEnabled(ctx) || !sepidarCan(me, "customerUpdate") {
		return
	}
	var linked, pending int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_links WHERE kind = 'customer' AND ref = $1`, id).Scan(&linked)
	if linked == 0 {
		return
	}
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sepidar_jobs WHERE kind = 'customer.send' AND ref = $1 AND status = 'pending'`, id).Scan(&pending)
	if pending > 0 {
		return // the one that waits will read the newest version anyway
	}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO sepidar_jobs (id, kind, ref, data, created_by, created_by_name) VALUES ($1, 'customer.send', $2, $3::jsonb, $4, $5)`,
		"sj-"+randomHex(6), id, jsonx.Encode(jsonx.M{"customerId": id, "title": title, "auto": true}), me.ID(), me.Name()+" (ویرایش مشتری)")
}

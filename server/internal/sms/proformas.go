package sms

import (
	"context"
	"fmt"
	"log"
	"time"

	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

const proformaLastDayKey = "proforma_lastday"

// RunProformaReminders: at about nine in the morning, a customer whose proforma runs out today or tomorrow (and who has not decided yet)
// gets one reminder, when the admin switched the message on. Each proforma is reminded once, however often the program restarts.
func RunProformaReminders(ctx context.Context) {
	tick := time.NewTicker(30 * time.Minute)
	defer tick.Stop()
	first := time.After(75 * time.Second)
	for {
		select {
		case <-ctx.Done():
			return
		case <-first:
		case <-tick.C:
		}
		if now := time.Now().In(tehran); now.Hour() >= 9 && now.Hour() < 18 {
			proformasOnce(ctx, now)
		}
	}
}

func proformasOnce(ctx context.Context, now time.Time) {
	c := Load(ctx)
	on := false
	for _, k := range c.Auto {
		if k == proformaLastDayKey {
			on = true
		}
	}
	if !on || !c.Enabled || c.APIKey == "" {
		return
	}
	today, tomorrow := now.Format("2006-01-02"), now.AddDate(0, 0, 1).Format("2006-01-02")
	rows, err := store.Pool.Query(ctx,
		`SELECT d.id, d.data, COALESCE(c.data, '{}'::jsonb) FROM crm_deals d LEFT JOIN crm_customers c ON c.id = d.customer_id
		 WHERE COALESCE(d.data->>'stage', '') IN ('PROPOSAL', 'NEGOTIATION')
		   AND COALESCE(d.data->>'proformaNumber', '') <> ''
		   AND d.data->>'validUntil' IN ($1, $2)
		   AND COALESCE(d.data->>'lastDayReminded', '') <> d.data->>'validUntil'`, today, tomorrow)
	if err != nil {
		log.Printf("sms proforma reminders: %v", err)
		return
	}
	type item struct {
		id        string
		deal, cus jsonx.M
	}
	var list []item
	for rows.Next() {
		var id string
		var dr, cr []byte
		if rows.Scan(&id, &dr, &cr) == nil {
			list = append(list, item{id, jsonx.Decode(dr), jsonx.Decode(cr)})
		}
	}
	rows.Close()
	for _, it := range list {
		valid := jsonx.Str(it.deal, "validUntil")
		end := valid
		if t, err := time.Parse("2006-01-02", valid); err == nil {
			y, m, d := jalali.FromGregorian(t.Year(), int(t.Month()), t.Day())
			end = fmt.Sprintf("%d/%02d/%02d", y, m, d)
		}
		Auto(ctx, proformaLastDayKey, jsonx.Strings(it.cus, "phones"), map[string]string{"name": jsonx.Str(it.cus, "name"), "number": jsonx.Str(it.deal, "proformaNumber"), "end": end})
		_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = data || jsonb_build_object('lastDayReminded', $2::text) WHERE id = $1`, it.id, valid)
		time.Sleep(300 * time.Millisecond)
	}
}

package crm

import (
	"context"
	"log"
	"strings"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// RunCloseReminders tells the people in charge of an open opportunity when its forecast closing time has come: the day and the hour
// and minute written on it (the time it was created at, when nobody chose another). Once per day-and-time: a changed forecast is reminded again.
func RunCloseReminders(ctx context.Context) {
	tick := time.NewTicker(time.Minute)
	defer tick.Stop()
	first := time.After(40 * time.Second)
	for {
		select {
		case <-ctx.Done():
			return
		case <-first:
		case <-tick.C:
		}
		closeRemindersOnce(ctx)
	}
}

// closeDue returns the moment an opportunity is forecast to close (Tehran time) and the «HH:MM» it shows; ok is false without a forecast day.
func closeDue(d jsonx.M) (due time.Time, hhmm string, ok bool) {
	day := jsonx.Str(d, "expectedClose")
	if len(day) != 10 {
		return time.Time{}, "", false
	}
	hhmm = jsonx.Str(d, "expectedCloseTime")
	if len(hhmm) != 5 {
		// not chosen: the time the opportunity was created at
		if t, err := time.Parse(time.RFC3339, jsonx.Str(d, "createdAt")); err == nil {
			hhmm = t.In(tehran).Format("15:04")
		} else {
			hhmm = "09:00"
		}
	}
	t, err := time.ParseInLocation("2006-01-02 15:04", day+" "+hhmm, tehran)
	if err != nil {
		return time.Time{}, "", false
	}
	return t, hhmm, true
}

func closeRemindersOnce(ctx context.Context) {
	rows, err := store.Pool.Query(ctx,
		`SELECT id, data FROM crm_deals
		 WHERE COALESCE(data->>'stage', '') NOT IN ('WON', 'LOST') AND COALESCE(data->>'expectedClose', '') <> ''`)
	if err != nil {
		log.Printf("crm close reminders: %v", err)
		return
	}
	type item struct {
		id   string
		data jsonx.M
	}
	var due []item
	now := time.Now()
	for rows.Next() {
		var id string
		var raw []byte
		if rows.Scan(&id, &raw) != nil {
			continue
		}
		d := jsonx.Decode(raw)
		at, hhmm, ok := closeDue(d)
		key := jsonx.Str(d, "expectedClose") + " " + hhmm
		// the time has come, and not more than a day ago (older ones are late already and have their own marks in the lists)
		if !ok || now.Before(at) || now.Sub(at) > 24*time.Hour || jsonx.Str(d, "closeRemindedFor") == key {
			continue
		}
		d["closeRemindedFor"] = key
		due = append(due, item{id, d})
	}
	rows.Close()
	for _, it := range due {
		_, hhmm, _ := closeDue(it.data)
		to := []string{jsonx.Str(it.data, "ownerId")}
		to = append(to, jsonx.Strings(it.data, "coOwnerIds")...)
		who := strings.TrimSpace(jsonx.Str(it.data, "customerName"))
		body := "ساعت " + hhmm + " (پیش‌بینی بسته شدن)"
		if who != "" {
			body += " · " + who
		}
		notify.Notify(ctx, to, notify.Note{
			Kind: "task", Label: "زمان بستن فرصت", Title: "زمان پیش‌بینی‌شدهٔ بستن فرصت رسید: " + jsonx.Str(it.data, "title"), Body: body,
			Ref: jsonx.M{"type": "deal", "id": it.id}, Repeat: true,
		}, "")
		_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = jsonb_set(data, '{closeRemindedFor}', to_jsonb($2::text)) WHERE id = $1`, it.id, jsonx.Str(it.data, "closeRemindedFor"))
	}
}

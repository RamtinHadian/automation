// Package crm runs the background job that reminds people of their customer follow-ups.
package crm

import (
	"context"
	"log"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

var tehran = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Tehran")
	if err != nil {
		return time.FixedZone("IRST", 3*3600+1800)
	}
	return loc
}()

// RunReminders checks every ten minutes for follow-ups that are due today (or overdue) and were not reminded yet,
// and notifies their owner once.
func RunReminders(ctx context.Context) {
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	first := time.After(30 * time.Second)
	for {
		select {
		case <-ctx.Done():
			return
		case <-first:
		case <-tick.C:
		}
		remindOnce(ctx)
	}
}

func remindOnce(ctx context.Context) {
	today := time.Now().In(tehran).Format("2006-01-02")
	rows, err := store.Pool.Query(ctx,
		`SELECT id, COALESCE(owner_id, ''), COALESCE(customer_id, ''), data FROM crm_activities
		 WHERE data->>'type' = 'FOLLOWUP'
		   AND COALESCE(data->>'done', 'false') <> 'true'
		   AND COALESCE(data->>'reminded', 'false') <> 'true'
		   AND COALESCE(data->>'dueDate', '') <> '' AND data->>'dueDate' <= $1`, today)
	if err != nil {
		log.Printf("crm reminders: %v", err)
		return
	}
	type item struct {
		id, owner, customer string
		data                jsonx.M
	}
	var due []item
	for rows.Next() {
		var it item
		var raw []byte
		if rows.Scan(&it.id, &it.owner, &it.customer, &raw) == nil {
			it.data = jsonx.Decode(raw)
			due = append(due, it)
		}
	}
	rows.Close()
	for _, it := range due {
		var name string
		_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name', '') FROM crm_customers WHERE id = $1`, it.customer).Scan(&name)
		late := jsonx.Str(it.data, "dueDate") < today
		label := "پیگیری امروز"
		if late {
			label = "پیگیری عقب‌افتاده"
		}
		notify.Notify(ctx, []string{it.owner}, notify.Note{
			Kind: "task", Label: label, Title: "پیگیری مشتری: " + name, Body: jsonx.Str(it.data, "text"),
			Ref: jsonx.M{"type": "customer", "id": it.customer}, Repeat: true,
		}, "")
		it.data["reminded"] = true
		_, _ = store.Pool.Exec(ctx, `UPDATE crm_activities SET data = $2::jsonb WHERE id = $1`, it.id, jsonx.Encode(it.data))
	}
}

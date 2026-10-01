// Package work runs the background job that reminds people of tasks that are due.
package work

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

// RunTaskReminders checks every ten minutes for unfinished tasks that are due today or overdue and were not reminded
// yet, and tells each assignee once (a task that is overdue gets a second, separate reminder).
func RunTaskReminders(ctx context.Context) {
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	first := time.After(45 * time.Second)
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
		`SELECT id, assignee_ids, data FROM tasks
		 WHERE COALESCE(data->>'status', '') <> 'DONE'
		   AND COALESCE(data->>'dueDate', '') <> '' AND data->>'dueDate' <= $1`, today)
	if err != nil {
		log.Printf("task reminders: %v", err)
		return
	}
	type item struct {
		id        string
		assignees []string
		data      jsonx.M
	}
	var due []item
	for rows.Next() {
		var it item
		var raw []byte
		if rows.Scan(&it.id, &it.assignees, &raw) == nil {
			it.data = jsonx.Decode(raw)
			due = append(due, it)
		}
	}
	rows.Close()
	for _, it := range due {
		late := jsonx.Str(it.data, "dueDate") < today
		stage, label, title := "today", "موعد امروز", "موعد وظیفه امروز است: "
		if late {
			stage, label, title = "late", "موعد گذشته", "موعد وظیفه گذشته است: "
		}
		if jsonx.Str(it.data, "reminded") == stage || (stage == "today" && jsonx.Str(it.data, "reminded") == "late") {
			continue
		}
		notify.Notify(ctx, it.assignees, notify.Note{
			Kind: "task", Label: label, Title: title + jsonx.Str(it.data, "title"), Body: "",
			Ref: jsonx.M{"type": "task", "id": it.id}, Repeat: true,
		}, "")
		it.data["reminded"] = stage
		_, _ = store.Pool.Exec(ctx, `UPDATE tasks SET data = $2::jsonb WHERE id = $1`, it.id, jsonx.Encode(it.data))
	}
}

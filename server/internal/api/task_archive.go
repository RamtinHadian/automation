package api

import (
	"context"
	"log"
	"time"

	"automation/server/internal/store"
)

// A task that has been «done» for some days goes to the archive by itself (once an hour; also when the server starts). The number of days is the company's
// (settings «taskArchiveDays», 7 when nothing is written; 0 = never) unless the person who made the task has his own number. The task leaves the board but stays on the
// archive tab of its maker and receivers, and it comes back out if somebody moves it again (the save of a task takes «archived» away from a task that is not done).
func archiveOldDoneTasks(ctx context.Context) {
	tag, err := store.Pool.Exec(ctx, `
		WITH cfg AS (SELECT COALESCE((SELECT NULLIF(data->>'taskArchiveDays', '')::int FROM settings WHERE key = 'main'), 7) AS d),
		days AS (
		  SELECT t.id, COALESCE(NULLIF((SELECT data->>'taskArchiveDays' FROM users WHERE id = t.creator_id), '')::int, cfg.d) AS d
		  FROM tasks t, cfg
		  WHERE t.data->>'status' = 'DONE' AND COALESCE(t.data->>'archived', '') <> 'true'
		    AND COALESCE(NULLIF(t.data->>'completedAt', ''), t.data->>'updatedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
		)
		UPDATE tasks t SET data = t.data || jsonb_build_object('archived', true, 'autoArchived', true)
		FROM days
		WHERE t.id = days.id AND days.d > 0
		  AND COALESCE(NULLIF(t.data->>'completedAt', ''), t.data->>'updatedAt')::timestamptz <= now() - make_interval(days => days.d)`)
	if err != nil {
		log.Printf("task auto-archive: %v", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		log.Printf("task auto-archive: %d finished task(s) archived", n)
	}
}

// RunTaskAutoArchive: see above.
func RunTaskAutoArchive(ctx context.Context) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	for {
		archiveOldDoneTasks(ctx)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

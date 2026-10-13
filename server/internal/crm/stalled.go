package crm

import (
	"context"
	"log"
	"strconv"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// stalledDays: an open opportunity nobody touched for this many days is «گیرکرده».
const stalledDays = 7

// RunStalledDeals tells each owner, once a week at most per opportunity and only in working hours, which of their open
// opportunities have been left without any change. One note per person (not one per opportunity), so nobody is flooded.
func RunStalledDeals(ctx context.Context) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	first := time.After(2 * time.Minute)
	for {
		select {
		case <-ctx.Done():
			return
		case <-first:
		case <-tick.C:
		}
		if h := time.Now().In(tehran).Hour(); h < 8 || h >= 19 {
			continue
		}
		stalledOnce(ctx)
	}
}

func stalledOnce(ctx context.Context) {
	cut := time.Now().UTC().Add(-stalledDays * 24 * time.Hour).Format("2006-01-02T15:04:05.000Z")
	rows, err := store.Pool.Query(ctx,
		`SELECT id, COALESCE(owner_id, ''), data FROM crm_deals
		 WHERE COALESCE(data->>'stage', '') NOT IN ('WON', 'LOST')
		   AND COALESCE(owner_id, '') <> ''
		   AND COALESCE(data->>'updatedAt', data->>'createdAt', '') <> '' AND COALESCE(data->>'updatedAt', data->>'createdAt') <= $1
		   AND (COALESCE(data->>'stalledNotifiedAt', '') = '' OR data->>'stalledNotifiedAt' <= $1)
		 ORDER BY COALESCE(data->>'updatedAt', data->>'createdAt')`, cut)
	if err != nil {
		log.Printf("crm stalled deals: %v", err)
		return
	}
	type item struct {
		id   string
		data jsonx.M
	}
	byOwner := map[string][]item{}
	var owners []string
	for rows.Next() {
		var id, owner string
		var raw []byte
		if rows.Scan(&id, &owner, &raw) != nil {
			continue
		}
		if _, ok := byOwner[owner]; !ok {
			owners = append(owners, owner)
		}
		byOwner[owner] = append(byOwner[owner], item{id, jsonx.Decode(raw)})
	}
	rows.Close()
	stamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	for _, owner := range owners {
		list := byOwner[owner]
		oldest := list[0]
		title := "فرصت «" + jsonx.Str(oldest.data, "title") + "» چند روز است بدون پیگیری مانده"
		body := "قدیمی‌ترین مورد از " + strconv.Itoa(len(list)) + " فرصت باز بدون تغییر"
		if len(list) == 1 {
			body = jsonx.Str(oldest.data, "customerName")
		} else {
			title = strconv.Itoa(len(list)) + " فرصت فروش شما بیش از " + strconv.Itoa(stalledDays) + " روز بدون پیگیری مانده"
			body = "قدیمی‌ترین: «" + jsonx.Str(oldest.data, "title") + "»"
		}
		notify.Notify(ctx, []string{owner}, notify.Note{
			Kind: "task", Label: "فرصت گیرکرده", Title: title, Body: body,
			Ref: jsonx.M{"type": "deal", "id": oldest.id}, Repeat: true,
		}, "")
		for _, it := range list {
			it.data["stalledNotifiedAt"] = stamp
			_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = $2::jsonb WHERE id = $1`, it.id, jsonx.Encode(it.data))
		}
	}
}

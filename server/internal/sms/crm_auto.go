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

// More automatic messages to customers that need no click of a person: they are found by looking at the data once a day (between nine and
// six). Each one is switched on by the admin like the others, and each customer is told only once for the same thing.
//   c_warranty_expiring  the warranty of a product ends within a week
//   c_support_expiring   the support subscription ends within a week
//   c_win_back           the customer has not bought for the «days asleep» of the club (and was not told in the last 90 days)
//   c_survey             three days after a sale was won: how did it go

func init() {
	Templates = append(Templates,
		Template{Key: "c_warranty_expiring", Title: "پایان نزدیک گارانتی", When: "یک هفته مانده به پایان گارانتی کالای مشتری.",
			Text:   "{name} عزیز، اعتبار گارانتی کالای «{product}» شما به شمارهٔ {number} در تاریخ {end} به پایان می‌رسد.",
			Sample: map[string]string{"name": "علی رضایی", "product": "میل لنگ", "number": "G-1405-0012", "end": "1405/07/25"}},
		Template{Key: "c_support_expiring", Title: "پایان نزدیک پشتیبانی", When: "یک هفته مانده به پایان اشتراک پشتیبانی مشتری.",
			Text:   "{name} عزیز، اشتراک پشتیبانی شما ({number}) تا {end} معتبر است. برای تمدید با ما تماس بگیرید.",
			Sample: map[string]string{"name": "علی رضایی", "number": "S-1405-0004", "end": "1405/07/25"}},
		Template{Key: "c_win_back", Title: "بازگشت مشتری خوابیده", When: "وقتی مشتری از «روزهای خواب» باشگاه بیشتر خرید نکرده است (حداکثر هر ۹۰ روز یک‌بار).",
			Text:   "{name} عزیز، مدتی است از شما خبری نداریم. برای خرید بعدی از تخفیف ویژهٔ باشگاه مشتریان بهره‌مند شوید.",
			Sample: map[string]string{"name": "علی رضایی"}},
		Template{Key: "c_survey", Title: "نظرسنجی بعد از خرید", When: "سه روز بعد از بسته‌شدن موفق یک فروش.",
			Text:   "{name} عزیز، نظر شما دربارهٔ خدمات ما برایمان مهم است. امتیاز خود را از ۱ تا ۵ به کارشناس ما اعلام کنید.",
			Sample: map[string]string{"name": "علی رضایی"}},
	)
}

func isOn(c Config, key string) bool {
	for _, k := range c.Auto {
		if k == key {
			return true
		}
	}
	return false
}

// RunCRMAuto checks every half hour; it works only between nine and six.
func RunCRMAuto(ctx context.Context) {
	tick := time.NewTicker(30 * time.Minute)
	defer tick.Stop()
	first := time.After(2 * time.Minute)
	for {
		select {
		case <-ctx.Done():
			return
		case <-first:
		case <-tick.C:
		}
		if now := time.Now().In(tehran); now.Hour() >= 9 && now.Hour() < 18 {
			crmAutoOnce(ctx, now)
		}
	}
}

func fa(day string) string {
	t, err := time.Parse("2006-01-02", day)
	if err != nil {
		return day
	}
	y, m, d := jalali.FromGregorian(t.Year(), int(t.Month()), t.Day())
	return fmt.Sprintf("%d/%02d/%02d", y, m, d)
}

func customerDoc(ctx context.Context, id string) jsonx.M {
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM crm_customers WHERE id = $1`, id).Scan(&raw) != nil {
		return nil
	}
	return jsonx.Decode(raw)
}

func crmAutoOnce(ctx context.Context, now time.Time) {
	c := Load(ctx)
	if !c.Enabled || c.APIKey == "" {
		return
	}
	today := now.Format("2006-01-02")
	week := now.AddDate(0, 0, 7).Format("2006-01-02")

	if isOn(c, "c_warranty_expiring") {
		rows, err := store.Pool.Query(ctx, `SELECT id, data FROM warranties WHERE status = 'ACTIVE' AND data->>'endDate' >= $1 AND data->>'endDate' <= $2
			AND COALESCE(data->>'expiryReminded', '') <> data->>'endDate' LIMIT 50`, today, week)
		if err != nil {
			log.Printf("sms c_warranty_expiring: %v", err)
		} else {
			type it struct {
				id string
				d  jsonx.M
			}
			var list []it
			for rows.Next() {
				var id string
				var raw []byte
				if rows.Scan(&id, &raw) == nil {
					list = append(list, it{id, jsonx.Decode(raw)})
				}
			}
			rows.Close()
			for _, w := range list {
				if cu := customerDoc(ctx, jsonx.Str(w.d, "customerId")); cu != nil {
					Auto(ctx, "c_warranty_expiring", jsonx.Strings(cu, "phones"), map[string]string{"name": jsonx.Str(cu, "name"), "product": jsonx.Str(w.d, "productName"),
						"number": jsonx.Str(w.d, "warrantyNo"), "end": fa(jsonx.Str(w.d, "endDate"))})
				}
				_, _ = store.Pool.Exec(ctx, `UPDATE warranties SET data = data || jsonb_build_object('expiryReminded', data->>'endDate') WHERE id = $1`, w.id)
				time.Sleep(300 * time.Millisecond)
			}
		}
	}

	if isOn(c, "c_support_expiring") {
		rows, err := store.Pool.Query(ctx, `SELECT id, data FROM support_subs WHERE status = 'ACTIVE' AND data->>'endDate' >= $1 AND data->>'endDate' <= $2
			AND COALESCE(data->>'expiryReminded', '') <> data->>'endDate' LIMIT 50`, today, week)
		if err != nil {
			log.Printf("sms c_support_expiring: %v", err)
		} else {
			type it struct {
				id string
				d  jsonx.M
			}
			var list []it
			for rows.Next() {
				var id string
				var raw []byte
				if rows.Scan(&id, &raw) == nil {
					list = append(list, it{id, jsonx.Decode(raw)})
				}
			}
			rows.Close()
			for _, s := range list {
				if cu := customerDoc(ctx, jsonx.Str(s.d, "customerId")); cu != nil {
					Auto(ctx, "c_support_expiring", jsonx.Strings(cu, "phones"), map[string]string{"name": jsonx.Str(cu, "name"), "number": jsonx.Str(s.d, "subNo"), "end": fa(jsonx.Str(s.d, "endDate"))})
				}
				_, _ = store.Pool.Exec(ctx, `UPDATE support_subs SET data = data || jsonb_build_object('expiryReminded', data->>'endDate') WHERE id = $1`, s.id)
				time.Sleep(300 * time.Millisecond)
			}
		}
	}

	if isOn(c, "c_survey") {
		from, to := now.AddDate(0, 0, -10).UTC().Format("2006-01-02T15:04:05.000Z"), now.AddDate(0, 0, -3).UTC().Format("2006-01-02T15:04:05.000Z")
		rows, err := store.Pool.Query(ctx, `SELECT id, customer_id FROM crm_deals WHERE data->>'stage' = 'WON' AND COALESCE(data->>'surveyAt', '') = ''
			AND data->>'closedAt' >= $1 AND data->>'closedAt' <= $2 LIMIT 50`, from, to)
		if err != nil {
			log.Printf("sms c_survey: %v", err)
		} else {
			type it struct{ id, cid string }
			var list []it
			for rows.Next() {
				var x it
				if rows.Scan(&x.id, &x.cid) == nil {
					list = append(list, x)
				}
			}
			rows.Close()
			for _, d := range list {
				if cu := customerDoc(ctx, d.cid); cu != nil {
					Auto(ctx, "c_survey", jsonx.Strings(cu, "phones"), map[string]string{"name": jsonx.Str(cu, "name")})
				}
				_, _ = store.Pool.Exec(ctx, `UPDATE crm_deals SET data = data || jsonb_build_object('surveyAt', $2::text) WHERE id = $1`, d.id, today)
				time.Sleep(300 * time.Millisecond)
			}
		}
	}

	if isOn(c, "c_win_back") {
		days := 60.0
		var raw []byte
		if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'crmClub'`).Scan(&raw) == nil {
			if f := jsonx.Num(jsonx.Decode(raw)["dormantDays"]); f >= 7 {
				days = f
			}
		}
		cut := now.AddDate(0, 0, -int(days)).UTC().Format("2006-01-02T15:04:05.000Z")
		told := now.AddDate(0, 0, -90).Format("2006-01-02")
		// customers who bought before, whose last won sale is older than the limit, and who were not told lately
		rows, err := store.Pool.Query(ctx, `SELECT c.id FROM crm_customers c
			JOIN (SELECT customer_id, max(data->>'closedAt') AS last FROM crm_deals WHERE data->>'stage' = 'WON' GROUP BY customer_id) w ON w.customer_id = c.id
			WHERE w.last < $1 AND COALESCE(c.data->>'status', '') <> 'INACTIVE' AND COALESCE(c.data->>'winBackAt', '') < $2 LIMIT 30`, cut, told)
		if err != nil {
			log.Printf("sms c_win_back: %v", err)
		} else {
			var ids []string
			for rows.Next() {
				var id string
				if rows.Scan(&id) == nil {
					ids = append(ids, id)
				}
			}
			rows.Close()
			for _, id := range ids {
				if cu := customerDoc(ctx, id); cu != nil {
					Auto(ctx, "c_win_back", jsonx.Strings(cu, "phones"), map[string]string{"name": jsonx.Str(cu, "name")})
				}
				_, _ = store.Pool.Exec(ctx, `UPDATE crm_customers SET data = data || jsonb_build_object('winBackAt', $2::text) WHERE id = $1`, id, today)
				time.Sleep(300 * time.Millisecond)
			}
		}
	}
}

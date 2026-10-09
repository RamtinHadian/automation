package sms

import (
	"context"
	"log"
	"time"

	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Occasion messages. When the admin switches the «تبریک تولد (یک روز قبل)» message on, a customer whose birthday is TOMORROW
// (by the Persian calendar: the day and month of the saved birth date) gets one message today at about nine in the morning.
// Each customer is told once per Persian year, the run of a day is remembered, and a restart never sends twice.

var tehran = time.FixedZone("IRST", 3*3600+1800) // Iran has no summer time any more

const birthdayKey = "birthday_eve"

type runState struct {
	Day  string         `json:"day"`  // last day the run was done (Gregorian, Tehran)
	Sent map[string]int `json:"sent"` // customer id -> Persian year told
}

func loadState(ctx context.Context) runState {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'sms_occasions'`).Scan(&raw)
	var st runState
	m := jsonx.Decode(raw)
	st.Day = jsonx.Str(m, "day")
	st.Sent = map[string]int{}
	if sm, ok := m["sent"].(map[string]any); ok {
		for k, v := range sm {
			if f, ok := v.(float64); ok {
				st.Sent[k] = int(f)
			}
		}
	}
	return st
}

func saveState(ctx context.Context, st runState) {
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('sms_occasions', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(jsonx.M{"day": st.Day, "sent": st.Sent}))
}

// RunOccasions checks every ten minutes and does the day's work once, after nine o'clock Tehran time.
func RunOccasions(ctx context.Context) {
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
		now := time.Now().In(tehran)
		if now.Hour() < 9 {
			continue
		}
		birthdaysOnce(ctx, now)
	}
}

// birthdayTomorrow is true when the saved birth date (Gregorian ISO) falls on the Persian month and day of `tomorrow`.
func birthdayTomorrow(birthISO string, tomorrow time.Time) bool {
	t, err := time.Parse("2006-01-02", birthISO)
	if err != nil {
		return false
	}
	_, bm, bd := jalali.FromGregorian(t.Year(), int(t.Month()), t.Day())
	_, tm, td := jalali.FromGregorian(tomorrow.Year(), int(tomorrow.Month()), tomorrow.Day())
	return bm == tm && bd == td
}

func birthdaysOnce(ctx context.Context, now time.Time) {
	today := now.Format("2006-01-02")
	st := loadState(ctx)
	if st.Day == today {
		return
	}
	c := Load(ctx)
	on := false
	for _, k := range c.Auto {
		if k == birthdayKey {
			on = true
		}
	}
	st.Day = today
	if !on || !c.Enabled || c.APIKey == "" {
		saveState(ctx, st) // nothing to do today; it is looked at again tomorrow
		return
	}
	tomorrow := now.AddDate(0, 0, 1)
	jy, _, _ := jalali.FromGregorian(tomorrow.Year(), int(tomorrow.Month()), tomorrow.Day())
	rows, err := store.Pool.Query(ctx, `SELECT id, data FROM crm_customers WHERE COALESCE(data->>'birthDate', '') <> ''`)
	if err != nil {
		log.Printf("sms birthdays: %v", err)
		return
	}
	type who struct {
		id   string
		data jsonx.M
	}
	var list []who
	for rows.Next() {
		var id string
		var raw []byte
		if rows.Scan(&id, &raw) == nil {
			d := jsonx.Decode(raw)
			if birthdayTomorrow(jsonx.Str(d, "birthDate"), tomorrow) && st.Sent[id] != jy {
				list = append(list, who{id, d})
			}
		}
	}
	rows.Close()
	sent := 0
	for _, w := range list {
		var phones []string
		if arr, ok := w.data["phones"].([]any); ok {
			for _, p := range arr {
				if s, ok := p.(string); ok {
					phones = append(phones, s)
				}
			}
		}
		Auto(ctx, birthdayKey, phones, map[string]string{"name": jsonx.Str(w.data, "name")})
		st.Sent[w.id] = jy
		sent++
		time.Sleep(300 * time.Millisecond)
	}
	// keep the memory small: only this Persian year matters
	for k, y := range st.Sent {
		if y < jy {
			delete(st.Sent, k)
		}
	}
	saveState(ctx, st)
	if sent > 0 {
		log.Printf("sms birthdays: %d messages for tomorrow", sent)
	}
}

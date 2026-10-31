package api

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// Suspicious activity is written to the journal and, when it comes in a burst, the administrators get a notification:
//   - many failed sign-ins from one address or against one account name (somebody is guessing passwords);
//   - many refused requests («forbidden») from one signed-in person (somebody is trying doors they have no key for);
//   - very many file or recording downloads by one person in a short time (a mass copy of company data).

type burstCounter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var bursts = &burstCounter{hits: map[string][]time.Time{}}

// hit records one event for key and reports true when this event is the limit-th one inside the window (the counter then starts over,
// so one burst raises one alert).
func (b *burstCounter) hit(key string, limit int, window time.Duration) bool {
	now := time.Now()
	b.mu.Lock()
	defer b.mu.Unlock()
	cut := now.Add(-window)
	kept := b.hits[key][:0]
	for _, t := range b.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	kept = append(kept, now)
	if len(kept) >= limit {
		delete(b.hits, key)
		return true
	}
	b.hits[key] = kept
	if len(b.hits) > 5000 { // forget keys that went quiet
		for k, v := range b.hits {
			if len(v) == 0 || v[len(v)-1].Before(cut) {
				delete(b.hits, k)
			}
		}
	}
	return false
}

// alertAdmins writes a CRITICAL line to the journal and notifies every active top administrator.
func alertAdmins(action, title, body string) {
	entry := jsonx.M{
		"id": "aud-al-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()),
		"userName": "سامانه", "userEmail": "", "action": action, "severity": "CRITICAL", "details": title + " — " + body,
	}
	insertJournal(entry)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		rows, err := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'role' = 'SUPER_ADMIN' AND COALESCE(data->>'isActive', 'true') <> 'false'`)
		if err != nil {
			return
		}
		defer rows.Close()
		var ids []string
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				ids = append(ids, id)
			}
		}
		if len(ids) > 0 {
			notify.Notify(ctx, ids, notify.Note{Kind: "alert", Label: "هشدار امنیتی", Title: title, Body: body, Repeat: true}, "")
		}
	}()
}

// noteFailedLogin is called for every failed sign-in (see journalLogin).
func noteFailedLogin(ip, identifier string) {
	if bursts.hit("login-ip:"+ip, 6, 10*time.Minute) {
		alertAdmins("BRUTE_FORCE_SUSPECTED", "تلاش مکرر برای ورود ناموفق", "از نشانی "+ip+" چند بار با رمز نادرست وارد شدن را امتحان کرده‌اند.")
	} else if bursts.hit("login-acct:"+identifier, 6, 10*time.Minute) {
		alertAdmins("BRUTE_FORCE_SUSPECTED", "تلاش مکرر برای ورود به یک حساب", "حدس رمز برای حساب «"+identifier+"» از چند نشانی انجام شده است.")
	}
}

// noteDenied is called when a signed-in person's request was refused (403). The line is kept in the journal; a burst raises an alert.
func noteDenied(r *http.Request, u auth.User) {
	writeJournal(r, u, "PERMISSION_DENIED", "WARNING", "درخواست بدون دسترسی ("+r.Method+" "+r.URL.Path+")")
	if bursts.hit("denied:"+u.ID(), 15, 5*time.Minute) {
		alertAdmins("PERMISSION_DENIED_BURST", "درخواست‌های مکرر بدون دسترسی", u.Name()+" در چند دقیقه ۱۵ بار به چیزی که دسترسی ندارد درخواست داده است.")
	}
}

// noteDownload counts the downloads of files and recordings; sixty in ten minutes by one person is not normal work.
func noteDownload(u auth.User) {
	if bursts.hit("download:"+u.ID(), 60, 10*time.Minute) {
		alertAdmins("MASS_DOWNLOAD_SUSPECTED", "دریافت انبوه فایل", u.Name()+" در ده دقیقه بیش از ۶۰ فایل یا مکالمه را دریافت کرده است.")
	}
}

var limiter = &burstCounter{hits: map[string][]time.Time{}}

// allow reports whether one more event for key fits into limit events per window, and counts it. It is the general brake for endpoints
// that cost money or can be hammered (SMS, public forms).
func allow(key string, limit int, window time.Duration) bool {
	now := time.Now()
	limiter.mu.Lock()
	defer limiter.mu.Unlock()
	cut := now.Add(-window)
	kept := limiter.hits[key][:0]
	for _, t := range limiter.hits[key] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= limit {
		limiter.hits[key] = kept
		return false
	}
	limiter.hits[key] = append(kept, now)
	if len(limiter.hits) > 5000 {
		for k, v := range limiter.hits {
			if len(v) == 0 || v[len(v)-1].Before(cut) {
				delete(limiter.hits, k)
			}
		}
	}
	return true
}

const slowDown = "درخواست‌ها بیش از حد مجاز است؛ چند دقیقه بعد دوباره امتحان کنید."

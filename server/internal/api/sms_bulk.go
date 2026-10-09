package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/sms"
	"automation/server/internal/store"
)

// Group SMS from the customers menu: the sender picks customers (by type, tag, status…), a text (a ready-made one or their own) and
// confirms. The server checks every customer again (a person can only write to their own customers, an admin to all), takes the
// first mobile number of each, puts the customer's name in place of {name}, and sends them one by one in the background; the page
// follows the progress. Every message is also written in the sms log and in the customer's history.

const (
	bulkMaxPerJob = 300
	bulkDayCap    = 500  // per person per day
	bulkDayCapAdm = 2000 // admins
)

type bulkJob struct {
	ID      string    `json:"id"`
	By      string    `json:"-"`
	Total   int       `json:"total"`
	Sent    int       `json:"sent"`
	Failed  int       `json:"failed"`
	Skipped int       `json:"skipped"`
	Done    bool      `json:"done"`
	Error   string    `json:"error"`
	At      time.Time `json:"-"`
}

var (
	bulkMu   sync.Mutex
	bulkJobs = map[string]*bulkJob{}
)

func bulkSnapshot(id, by string) (bulkJob, bool) {
	bulkMu.Lock()
	defer bulkMu.Unlock()
	j := bulkJobs[id]
	if j == nil || j.By != by {
		return bulkJob{}, false
	}
	return *j, true
}

// POST /api/sms/bulk {customerIds, text}
func smsBulkStart(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() || !me.CanSendSms() {
		httpx.Error(w, http.StatusForbidden, "اجازهٔ ارسال پیامک برای شما فعال نشده است؛ از مدیر بخواهید در کنسول مدیریت به شما اجازه بدهد.")
		return
	}
	c := sms.Load(r.Context())
	if !c.Enabled || c.APIKey == "" {
		httpx.Error(w, http.StatusServiceUnavailable, "ارسال پیامک در سامانه فعال نشده است؛ از مدیر بخواهید پنل پیامک را تنظیم کند.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if text == "" || len([]rune(text)) > 700 {
		httpx.Error(w, http.StatusBadRequest, "متن پیامک خالی یا بیش از حد طولانی است.")
		return
	}
	ids := jsonx.Strings(body, "customerIds")
	if len(ids) == 0 {
		httpx.Error(w, http.StatusBadRequest, "هیچ مشتری‌ای انتخاب نشده است.")
		return
	}
	if len(ids) > bulkMaxPerJob {
		httpx.Error(w, http.StatusBadRequest, fmt.Sprintf("در هر ارسال حداکثر %d مشتری ممکن است؛ فهرست را کوچک‌تر کنید.", bulkMaxPerJob))
		return
	}
	var today int
	_ = store.Pool.QueryRow(r.Context(), `SELECT count(*) FROM sms_log WHERE sent_by = $1 AND created_at > now() - interval '24 hours'`, me.ID()).Scan(&today)
	cap := bulkDayCap
	if me.IsAdmin() {
		cap = bulkDayCapAdm
	}
	if today+len(ids) > cap {
		httpx.Error(w, http.StatusTooManyRequests, fmt.Sprintf("سقف ارسال روزانهٔ شما %d پیامک است و %d تا را امروز فرستاده‌اید.", cap, today))
		return
	}

	type target struct{ id, name, mobile, owner, ownerName string }
	var targets []target
	skipped := 0
	seen := map[string]bool{}
	for _, id := range ids {
		var raw []byte
		var owner string
		if store.Pool.QueryRow(r.Context(), `SELECT data, COALESCE(owner_id, '') FROM crm_customers WHERE id = $1`, id).Scan(&raw, &owner) != nil {
			skipped++
			continue
		}
		if !me.IsAdmin() && owner != me.ID() {
			skipped++
			continue
		}
		cust := jsonx.Decode(raw)
		mobile := ""
		if arr, ok := cust["phones"].([]any); ok {
			for _, p := range arr {
				if s, ok := p.(string); ok {
					if m, ok := sms.Mobile(s); ok {
						mobile = m
						break
					}
				}
			}
		}
		if mobile == "" || seen[mobile] {
			skipped++
			continue
		}
		seen[mobile] = true
		targets = append(targets, target{id, jsonx.Str(cust, "name"), mobile, owner, jsonx.Str(cust, "ownerName")})
	}
	if len(targets) == 0 {
		httpx.Error(w, http.StatusBadRequest, "هیچ‌کدام از مشتریان انتخاب‌شده شمارهٔ موبایل معتبر ندارند.")
		return
	}

	job := &bulkJob{ID: fmt.Sprintf("bj-%d", time.Now().UnixNano()), By: me.ID(), Total: len(targets), Skipped: skipped, At: time.Now()}
	bulkMu.Lock()
	for k, j := range bulkJobs {
		if time.Since(j.At) > time.Hour {
			delete(bulkJobs, k)
		}
	}
	bulkJobs[job.ID] = job
	bulkMu.Unlock()

	by, byName := me.ID(), me.Name()
	go func() {
		ctx := context.Background()
		for _, t := range targets {
			msg := strings.ReplaceAll(text, "{name}", t.name)
			cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
			err := sms.SendAndLog(cctx, by, []string{t.mobile}, msg)
			cancel()
			bulkMu.Lock()
			if err != nil {
				job.Failed++
				if job.Error == "" {
					job.Error = err.Error()
				}
			} else {
				job.Sent++
			}
			bulkMu.Unlock()
			if err == nil {
				id := fmt.Sprintf("sms-%d", time.Now().UnixNano())
				doc := jsonx.M{"id": id, "customerId": t.id, "type": "NOTE", "text": "پیامک گروهی ارسال شد: " + msg, "ownerId": t.owner, "ownerName": t.ownerName,
					"authorId": by, "authorName": byName, "createdAt": now()}
				_, _ = store.Pool.Exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (id) DO NOTHING`, id, t.id, t.owner, jsonx.Encode(doc))
			}
			time.Sleep(250 * time.Millisecond)
		}
		bulkMu.Lock()
		job.Done = true
		bulkMu.Unlock()
	}()
	httpx.JSON(w, http.StatusOK, *job)
}

// GET /api/sms/bulk/{id}
func smsBulkProgress(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	j, ok := bulkSnapshot(r.PathValue("id"), me.ID())
	if !ok {
		httpx.Error(w, http.StatusNotFound, "این ارسال پیدا نشد.")
		return
	}
	httpx.JSON(w, http.StatusOK, j)
}

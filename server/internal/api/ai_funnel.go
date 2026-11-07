package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The AI reading of the sales funnel («تحلیل هوش مصنوعی» in the funnel window): it reads every opportunity the person may see, groups them by
// customer, and for each customer says what the problem was and what to tell him next. The reading takes a while (the customers are sent to
// the AI in small groups), so it runs as a job: start gives an id, and the page asks for the progress and shows each customer as soon as it
// is ready. Only the person who started a job can read it. Which opportunities are read follows the CRM rules (the same filter as the page).

const aiFunnelPrompt = `تو مشاور ارشد فروش یک شرکت ایرانی هستی. برای هر مشتری، فرصت‌های فروش و آخرین فعالیت‌هایش به تو داده می‌شود (JSON).
برای هر مشتری دقیقاً این را بگو و فقط از روی داده‌ها نتیجه بگیر؛ چیزی از خودت نساز و اگر داده کافی نیست همین را صادقانه بنویس:
- problem: مشکل یا گلوگاه این مشتری در یک یا دو جملهٔ ساده (مثلاً چند روز است بی‌حرکت مانده، بعد از پیش‌فاکتور پیگیری نشده، دلیل از دست رفتن چه بوده).
- advice: فهرستی از دو تا چهار کار مشخص که فروشنده باید همین حالا بکند.
- say: متن کوتاه و محترمانهٔ فارسی که فروشنده می‌تواند همین‌طور برای مشتری بفرستد یا بگوید (حداکثر سه جمله، بدون وعدهٔ قیمت یا تخفیف تازه).
- priority: یکی از HIGH (فوری)، MED یا LOW.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن دیگر، به این شکل:
{"items":[{"id":"شناسهٔ مشتری همان‌طور که آمده","problem":"...","advice":["..."],"say":"...","priority":"HIGH"}]}
برای هر مشتریِ ورودی دقیقاً یک مورد بنویس.`

type aiFunnelJob struct {
	ID      string
	Owner   string
	Started time.Time
	Status  string // running | done | error
	Total   int
	Done    int
	Error   string
	Items   []jsonx.M
	Meta    map[string]jsonx.M // the facts shown on the page (name, stage, days…), by customer id
}

var (
	aiFunnelMu   sync.Mutex
	aiFunnelJobs = map[string]*aiFunnelJob{}
)

func aiFunnelGC() {
	for id, j := range aiFunnelJobs {
		if time.Since(j.Started) > 3*time.Hour {
			delete(aiFunnelJobs, id)
		}
	}
}

var funnelOpen = map[string]bool{"NEW": true, "CONTACTED": true, "PROPOSAL": true, "NEGOTIATION": true}

func clip(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}

func daysSince(iso string) int {
	t := parseTime(iso)
	if t.IsZero() {
		return -1
	}
	return int(time.Since(t).Hours() / 24)
}

// POST /api/crm/ai-funnel/start
func aiFunnelStart(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, me, "ai.funnel") {
		return
	}
	ctx := r.Context()
	s := supportSettings(ctx)
	if jsonx.Str(s, "aiKey") == "" || jsonx.Str(s, "aiModel") == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات هوش مصنوعی ذخیره کنید.")
		return
	}
	var raws []json.RawMessage
	var err error
	if crmSeesAll(me) {
		raws, err = store.RawList(ctx, `SELECT data FROM crm_deals ORDER BY id`)
	} else {
		raws, err = store.RawList(ctx, `SELECT data FROM crm_deals WHERE `+crmMyDeals+` ORDER BY id`, me.ID(), crmPeople(ctx, me))
	}
	if err != nil {
		internalError(w)
		return
	}
	money := seesSalesMoney(me)
	byCust := map[string][]jsonx.M{}
	for _, raw := range raws {
		d := jsonx.Decode(raw)
		st := jsonx.Str(d, "stage")
		cid := jsonx.Str(d, "customerId")
		if cid == "" || d["mergedInto"] != nil && jsonx.Str(d, "mergedInto") != "" {
			continue
		}
		lostRecently := st == "LOST" && daysSince(jsonx.Str(d, "closedAt")) <= 120
		if !funnelOpen[st] && !lostRecently {
			continue
		}
		byCust[cid] = append(byCust[cid], d)
	}
	if len(byCust) == 0 {
		httpx.Error(w, http.StatusBadRequest, "فرصت بازی برای تحلیل پیدا نشد.")
		return
	}
	// the customers with the most money in play first (and at most 60 per run, so one run stays quick and cheap)
	type cs struct {
		id  string
		sum float64
	}
	order := []cs{}
	for cid, ds := range byCust {
		sum := 0.0
		for _, d := range ds {
			if funnelOpen[jsonx.Str(d, "stage")] {
				sum += jsonx.Num(d["amount"])
			}
		}
		order = append(order, cs{cid, sum})
	}
	sort.Slice(order, func(i, j int) bool { return order[i].sum > order[j].sum || (order[i].sum == order[j].sum && order[i].id < order[j].id) })
	if len(order) > 60 {
		order = order[:60]
	}
	ids := make([]string, 0, len(order))
	for _, o := range order {
		ids = append(ids, o.id)
	}
	names := map[string]string{}
	if rows, qerr := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'name', '') FROM crm_customers WHERE id = ANY($1)`, ids); qerr == nil {
		for rows.Next() {
			var id, nm string
			if rows.Scan(&id, &nm) == nil {
				names[id] = nm
			}
		}
		rows.Close()
	}
	acts := map[string][]jsonx.M{}
	if rows, qerr := store.Pool.Query(ctx, `SELECT customer_id, data FROM crm_activities WHERE customer_id = ANY($1) AND COALESCE(data->>'type', '') <> 'MISSING' ORDER BY created_at DESC LIMIT 1500`, ids); qerr == nil {
		for rows.Next() {
			var cid string
			var raw []byte
			if rows.Scan(&cid, &raw) == nil && len(acts[cid]) < 8 {
				a := jsonx.Decode(raw)
				acts[cid] = append(acts[cid], jsonx.M{"type": a["type"], "text": clip(jsonx.Str(a, "text"), 160), "daysAgo": daysSince(jsonx.Str(a, "createdAt")), "dueDate": a["dueDate"], "done": a["done"]})
			}
		}
		rows.Close()
	}

	job := &aiFunnelJob{ID: "af-" + strconv.FormatInt(time.Now().UnixNano(), 36), Owner: me.ID(), Started: time.Now(), Status: "running", Total: len(order), Meta: map[string]jsonx.M{}}
	facts := []jsonx.M{}
	for _, o := range order {
		ds := byCust[o.id]
		dl := []jsonx.M{}
		stage, days := "", 0
		for _, d := range ds {
			st := jsonx.Str(d, "stage")
			since := daysSince(jsonx.Str(d, "updatedAt"))
			if funnelOpen[st] && since >= days {
				stage, days = st, since
			}
			item := jsonx.M{"title": clip(jsonx.Str(d, "title"), 80), "stage": st, "daysInThisState": since, "ageDays": daysSince(jsonx.Str(d, "createdAt")),
				"hasProforma": jsonx.Str(d, "proformaNumber") != "", "expectedClose": d["expectedClose"], "notes": clip(jsonx.Str(d, "notes"), 240)}
			if money {
				item["amount"] = d["amount"]
			}
			if st == "LOST" {
				item["lostReason"] = clip(jsonx.Str(d, "lostReason")+" "+jsonx.Str(d, "lostNote"), 200)
			}
			dl = append(dl, item)
		}
		meta := jsonx.M{"id": o.id, "name": names[o.id], "stage": stage, "idleDays": days, "deals": len(ds)}
		if money {
			meta["amount"] = o.sum
		}
		job.Meta[o.id] = meta
		facts = append(facts, jsonx.M{"id": o.id, "name": names[o.id], "deals": dl, "recentActivities": acts[o.id]})
	}
	aiFunnelMu.Lock()
	aiFunnelGC()
	aiFunnelJobs[job.ID] = job
	aiFunnelMu.Unlock()

	go runAiFunnel(job, facts, jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel"))
	httpx.JSON(w, http.StatusOK, map[string]any{"id": job.ID, "total": job.Total})
}

func runAiFunnel(job *aiFunnelJob, facts []jsonx.M, key, model string) {
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Minute)
	defer cancel()
	const batch = 5
	for i := 0; i < len(facts); i += batch {
		end := i + batch
		if end > len(facts) {
			end = len(facts)
		}
		data, _ := json.Marshal(facts[i:end])
		text, err := aiChatOpts(ctx, key, model, []aiMsg{
			{Role: "system", Content: aiFunnelPrompt},
			{Role: "user", Content: "مشتری‌ها و فرصت‌هایشان (JSON):\n" + string(data)},
		}, 3500, 120*time.Second)
		aiFunnelMu.Lock()
		if err != nil {
			job.Status, job.Error = "error", err.Error()
			aiFunnelMu.Unlock()
			return
		}
		out := parseLooseJSON(text)
		got := map[string]bool{}
		if arr, ok := out["items"].([]any); ok {
			for _, x := range arr {
				m, ok := x.(map[string]any)
				if !ok {
					continue
				}
				id := jsonx.Str(m, "id")
				meta, known := job.Meta[id]
				if !known || got[id] {
					continue
				}
				got[id] = true
				item := jsonx.Copy(meta)
				item["problem"] = clip(jsonx.Str(m, "problem"), 400)
				item["say"] = clip(jsonx.Str(m, "say"), 500)
				item["advice"] = m["advice"]
				p := strings.ToUpper(jsonx.Str(m, "priority"))
				if p != "HIGH" && p != "LOW" {
					p = "MED"
				}
				item["priority"] = p
				job.Items = append(job.Items, item)
			}
		}
		for _, f := range facts[i:end] { // a customer the AI skipped is shown as such, never silently dropped
			id := jsonx.Str(f, "id")
			if !got[id] {
				item := jsonx.Copy(job.Meta[id])
				item["problem"] = "هوش مصنوعی برای این مشتری پاسخی نداد؛ دوباره امتحان کنید."
				item["priority"] = "LOW"
				item["advice"] = []any{}
				item["say"] = ""
				job.Items = append(job.Items, item)
			}
		}
		job.Done = end
		aiFunnelMu.Unlock()
	}
	aiFunnelMu.Lock()
	job.Status = "done"
	aiFunnelMu.Unlock()
}

// GET /api/crm/ai-funnel/{id}
func aiFunnelGet(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	aiFunnelMu.Lock()
	defer aiFunnelMu.Unlock()
	j := aiFunnelJobs[r.PathValue("id")]
	if j == nil || j.Owner != me.ID() {
		httpx.Error(w, http.StatusNotFound, "این تحلیل پیدا نشد؛ دوباره شروع کنید.")
		return
	}
	items := make([]jsonx.M, len(j.Items))
	copy(items, j.Items)
	httpx.JSON(w, http.StatusOK, map[string]any{"status": j.Status, "total": j.Total, "done": j.Done, "error": j.Error, "items": items, "startedAt": j.Started.UTC().Format("2006-01-02T15:04:05.000Z")})
}

func registerAiFunnel(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/crm/ai-funnel/start", auth.Require(aiFunnelStart))
	mux.HandleFunc("GET /api/crm/ai-funnel/{id}", auth.Require(aiFunnelGet))
}

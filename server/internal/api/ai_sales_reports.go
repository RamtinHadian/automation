package api

import (
	"context"
	"encoding/json"
	"log"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/store"
)

// The AI reports on the sales team are kept (who asked, when, the numbers they were written from, and the report), so they can be
// opened again later and the manager can see how the team changes. An administrator can also let the server write one by itself
// every few days: it works the numbers out from the opportunities and activities the same way the reports page does.

const saleStaleDays = 14

var openStages = map[string]bool{"NEW": true, "CONTACTED": true, "PROPOSAL": true, "NEGOTIATION": true}

func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t, _ = time.Parse(time.RFC3339, s)
	}
	return t
}

func round1(x float64) float64 { return math.Round(x*10) / 10 }

func rawMaps(ctx context.Context, sql string, args ...any) []jsonx.M {
	rows, err := store.RawList(ctx, sql, args...)
	if err != nil {
		return nil
	}
	out := make([]jsonx.M, 0, len(rows))
	for _, r := range rows {
		if m := jsonx.Decode(r); m != nil {
			out = append(out, m)
		}
	}
	return out
}

// buildSalesPayload works out, for the last `days` days, the same numbers the page sends to the AI.
func buildSalesPayload(ctx context.Context, days int) jsonx.M {
	now := time.Now()
	since := now.AddDate(0, 0, -days)
	todayIso := now.Format("2006-01-02")

	var rawMain []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&rawMain)
	rial := jsonx.Str(jsonx.Decode(rawMain), "currencyUnit") == "RIAL"
	money := func(v float64) float64 {
		if rial {
			return math.Round(v * 10)
		}
		return math.Round(v)
	}
	unit := "تومان"
	if rial {
		unit = "ریال"
	}

	staff := map[string]string{}
	for _, u := range rawMaps(ctx, `SELECT data FROM users WHERE COALESCE((data->>'isActive')::boolean, true)`) {
		staff[jsonx.Str(u, "id")] = jsonx.Str(u, "fullName")
	}
	customers := rawMaps(ctx, `SELECT data FROM crm_customers`)
	isCustomer := map[string]bool{}
	for _, c := range customers {
		if jsonx.Str(c, "contactType") == "" {
			isCustomer[jsonx.Str(c, "id")] = true
		}
	}
	known := map[string]bool{}
	for _, c := range customers {
		known[jsonx.Str(c, "id")] = true
	}
	var deals []jsonx.M
	for _, d := range rawMaps(ctx, `SELECT data FROM crm_deals`) {
		cid := jsonx.Str(d, "customerId")
		if cid == "" || isCustomer[cid] || !known[cid] {
			deals = append(deals, d)
		}
	}
	acts := rawMaps(ctx, `SELECT data - 'text' FROM crm_activities WHERE data->>'type' <> 'MISSING' AND created_at > now() - interval '400 days'`)

	closeAt := func(d jsonx.M) time.Time {
		if s := jsonx.Str(d, "closedAt"); s != "" {
			return parseTime(s)
		}
		return parseTime(jsonx.Str(d, "updatedAt"))
	}

	ids := map[string]bool{}
	for _, d := range deals {
		if o := jsonx.Str(d, "ownerId"); o != "" {
			ids[o] = true
		}
	}
	for _, a := range acts {
		if parseTime(jsonx.Str(a, "createdAt")).After(since) {
			if au := jsonx.Str(a, "authorId"); au != "" {
				ids[au] = true
			}
		}
	}
	var people []string
	for id := range ids {
		if _, ok := staff[id]; ok {
			people = append(people, id)
		}
	}
	sort.Strings(people)

	type loss struct {
		reason string
		count  int
	}
	lossAll := map[string]int{}
	stageTotals := map[string]int{}
	var rows []jsonx.M
	var tWon, tLost, tCreated, tOpen, tStale, tActs int
	var tWonV, tOpenV, tWeighted float64
	var cycleAll []float64
	probs := map[string]float64{"NEW": 0.1, "CONTACTED": 0.25, "PROPOSAL": 0.5, "NEGOTIATION": 0.7}
	for _, id := range people {
		var won, lost, open, stale, overdue, created int
		var wonV, openV, weighted float64
		var cycles []float64
		stageOpen := map[string]int{}
		reasons := map[string]int{}
		byCust := map[string]float64{}
		for _, d := range deals {
			if jsonx.Str(d, "ownerId") != id {
				continue
			}
			stage := jsonx.Str(d, "stage")
			amount := jsonx.Num(d["amount"])
			if parseTime(jsonx.Str(d, "createdAt")).After(since) {
				created++
			}
			switch {
			case stage == "WON" && closeAt(d).After(since):
				won++
				wonV += amount
				byCust[jsonx.Str(d, "customerId")] += amount
				c := closeAt(d).Sub(parseTime(jsonx.Str(d, "createdAt"))).Hours() / 24
				cycles = append(cycles, math.Max(0, c))
			case stage == "LOST" && closeAt(d).After(since):
				lost++
				r := strings.TrimSpace(jsonx.Str(d, "lostReason"))
				if r == "" {
					r = "بدون دلیل ثبت‌شده"
				}
				reasons[r]++
				lossAll[r]++
			case openStages[stage]:
				open++
				openV += amount
				weighted += amount * probs[stage]
				stageOpen[stage]++
				stageTotals[stage]++
				if now.Sub(parseTime(jsonx.Str(d, "updatedAt"))) > saleStaleDays*24*time.Hour {
					stale++
				}
				if ec := jsonx.Str(d, "expectedClose"); ec != "" && ec < todayIso {
					overdue++
				}
			}
		}
		cnt := map[string]int{}
		days := map[string]bool{}
		nActs := 0
		fuOver := 0
		for _, a := range acts {
			t := jsonx.Str(a, "type")
			if jsonx.Str(a, "authorId") == id && parseTime(jsonx.Str(a, "createdAt")).After(since) {
				cnt[t]++
				nActs++
				if s := jsonx.Str(a, "createdAt"); len(s) >= 10 {
					days[s[:10]] = true
				}
			}
			if t == "FOLLOWUP" && jsonx.Str(a, "ownerId") == id && !jsonx.Bool(a, "done") {
				if due := jsonx.Str(a, "dueDate"); due != "" && due < todayIso {
					fuOver++
				}
			}
		}
		newCust := 0
		for _, c := range customers {
			if jsonx.Str(c, "contactType") == "" && jsonx.Str(c, "ownerId") == id && parseTime(jsonx.Str(c, "createdAt")).After(since) {
				newCust++
			}
		}
		topLoss, topN := "", 0
		for r, n := range reasons {
			if n > topN || (n == topN && r < topLoss) {
				topLoss, topN = r, n
			}
		}
		p := jsonx.M{
			"name": staff[id], "createdDeals": created, "won": won, "lost": lost, "winRatePercent": nil, "soldValue": money(wonV), "avgDeal": nil, "cycleDays": nil,
			"openDeals": open, "stageOpen": stageOpen, "staleOpenDeals": stale, "overdueCloseDates": overdue,
			"calls": cnt["CALL"], "meetings": cnt["MEETING"], "notes": cnt["NOTE"], "quotes": cnt["QUOTE"], "followups": cnt["FOLLOWUP"], "followupsOverdue": fuOver,
			"activeDays": len(days), "newCustomers": newCust, "topLossReason": nil,
		}
		if won+lost > 0 {
			p["winRatePercent"] = math.Round(float64(won) * 100 / float64(won+lost))
		}
		if won > 0 {
			p["avgDeal"] = money(wonV / float64(won))
		}
		if len(cycles) > 0 {
			s := 0.0
			for _, c := range cycles {
				s += c
			}
			p["cycleDays"] = math.Round(s / float64(len(cycles)))
		}
		if topLoss != "" {
			p["topLossReason"] = topLoss
		}
		rows = append(rows, p)
		tWon += won
		tLost += lost
		tCreated += created
		tOpen += open
		tStale += stale
		tActs += nActs
		tWonV += wonV
		tOpenV += openV
		tWeighted += weighted
		cycleAll = append(cycleAll, cycles...)
	}
	// the people who did the work, ranked: the most wins, then the most sold
	sort.SliceStable(rows, func(i, j int) bool {
		wi, wj := jsonx.Num(rows[i]["won"]), jsonx.Num(rows[j]["won"])
		if wi != wj {
			return wi > wj
		}
		return jsonx.Num(rows[i]["soldValue"]) > jsonx.Num(rows[j]["soldValue"])
	})
	for i, r := range rows {
		r["systemRank"] = i + 1
	}

	team := jsonx.M{"created": tCreated, "won": tWon, "lost": tLost, "winRatePercent": nil, "soldValue": money(tWonV), "avgDeal": nil, "cycleDays": nil,
		"openDeals": tOpen, "openValue": money(tOpenV), "weightedForecast": money(tWeighted), "staleOpenDeals": tStale, "activities": tActs, "pipelineCoverageMonths": nil}
	if tWon+tLost > 0 {
		team["winRatePercent"] = math.Round(float64(tWon) * 100 / float64(tWon+tLost))
	}
	if tWon > 0 {
		team["avgDeal"] = money(tWonV / float64(tWon))
	}
	if len(cycleAll) > 0 {
		s := 0.0
		for _, c := range cycleAll {
			s += c
		}
		team["cycleDays"] = math.Round(s / float64(len(cycleAll)))
	}
	var last30 float64
	for _, d := range deals {
		if jsonx.Str(d, "stage") == "WON" && closeAt(d).After(now.AddDate(0, 0, -30)) {
			if _, ok := staff[jsonx.Str(d, "ownerId")]; ok {
				last30 += jsonx.Num(d["amount"])
			}
		}
	}
	if last30 > 0 {
		team["pipelineCoverageMonths"] = round1(tWeighted / last30)
	}
	var ls []loss
	for r, n := range lossAll {
		ls = append(ls, loss{r, n})
	}
	sort.Slice(ls, func(i, j int) bool {
		if ls[i].count != ls[j].count {
			return ls[i].count > ls[j].count
		}
		return ls[i].reason < ls[j].reason
	})
	lossOut := []jsonx.M{}
	for i, l := range ls {
		if i >= 6 {
			break
		}
		lossOut = append(lossOut, jsonx.M{"reason": l.reason, "count": l.count})
	}
	return jsonx.M{"periodDays": days, "moneyUnit": unit, "staleDaysRule": saleStaleDays, "team": team, "stageTotals": stageTotals, "lossReasons": lossOut, "people": rows}
}

// writeSalesReport asks the AI for the report on a payload and keeps it; it returns the stored row.
func writeSalesReport(ctx context.Context, payload jsonx.M, trigger, by string) (jsonx.M, error) {
	s := supportSettings(ctx)
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		return nil, &aiErr{Kind: "setup", Msg: "اول کلید API و نام مدل را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» ذخیره کنید."}
	}
	data, _ := json.Marshal(payload)
	period := "آخرین " + strconv.Itoa(int(jsonx.Num(payload["periodDays"]))) + " روز"
	text, err := aiChatOpts(ctx, key, model, []aiMsg{
		{Role: "system", Content: reportAiPrompt},
		{Role: "user", Content: "بازهٔ گزارش: " + period + "\nداده‌های تیم فروش (JSON):\n" + string(data)},
	}, 6500, 160*time.Second)
	if err != nil {
		return nil, err
	}
	rep := parseLooseJSON(text)
	if rep == nil {
		return nil, &aiErr{Kind: "parse", Msg: "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید."}
	}
	id := "air-" + time.Now().UTC().Format("20060102150405") + "-" + trigger
	at := time.Now().UTC()
	_, err = store.Pool.Exec(ctx, `INSERT INTO ai_sales_reports (id, created_at, period_days, trigger, created_by, payload, report) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
		id, at, int(jsonx.Num(payload["periodDays"])), trigger, by, jsonx.Encode(payload), jsonx.Encode(rep))
	if err != nil {
		return nil, err
	}
	return jsonx.M{"id": id, "createdAt": at.Format("2006-01-02T15:04:05.000Z"), "trigger": trigger, "periodDays": payload["periodDays"], "payload": payload, "report": rep}, nil
}

// POST /api/reports/ai-sales  {rangeLabel, data}: the page sends the numbers it shows
func reportAiSales(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanViewStats() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	payload, _ := body["data"].(map[string]any)
	if len(payload) == 0 {
		httpx.Error(w, http.StatusBadRequest, "داده‌ای برای تحلیل نیست.")
		return
	}
	if enc := jsonx.Encode(payload); len(enc) > 120000 {
		httpx.Error(w, http.StatusBadRequest, "داده‌ها بیش از حد بزرگ است.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 175*time.Second)
	defer cancel()
	row, err := writeSalesReport(ctx, payload, "manual", me.ID())
	if err != nil {
		code := http.StatusBadGateway
		if e, ok := err.(*aiErr); ok && e.Kind == "setup" {
			code = http.StatusBadRequest
		}
		httpx.Error(w, code, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, row)
}

// GET /api/reports/ai-history  (administrators): the kept reports, newest first
func reportAiHistory(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows := rawMaps(r.Context(), `SELECT jsonb_build_object('id', id, 'createdAt', to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'trigger', trigger, 'periodDays', period_days,
	    'headline', report->>'headline', 'mood', report->>'mood') FROM ai_sales_reports
	    WHERE ($1::bool OR payload->'team'->'soldValue' IS NULL) ORDER BY created_at DESC LIMIT 60`, seesSalesMoney(me))
	if rows == nil {
		rows = []jsonx.M{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"reports": rows})
}

// GET /api/reports/ai-history/{id}
func reportAiOne(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	m := rawMaps(r.Context(), `SELECT jsonb_build_object('id', id, 'createdAt', to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'trigger', trigger, 'periodDays', period_days, 'payload', payload, 'report', report)
	    FROM ai_sales_reports WHERE id = $1 AND ($2::bool OR payload->'team'->'soldValue' IS NULL)`, r.PathValue("id"), seesSalesMoney(me))
	if len(m) == 0 {
		httpx.Error(w, http.StatusNotFound, "این گزارش پیدا نشد.")
		return
	}
	httpx.JSON(w, http.StatusOK, m[0])
}

// ---- the schedule ----

func aiSchedule(ctx context.Context) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'aiSchedule'`).Scan(&raw)
	m := jsonx.Decode(raw)
	if m == nil {
		m = jsonx.M{}
	}
	return m
}

// GET /api/reports/ai-schedule  (administrators)
func reportAiScheduleGet(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	m := aiSchedule(r.Context())
	httpx.JSON(w, http.StatusOK, map[string]any{"enabled": jsonx.Bool(m, "enabled"), "everyDays": nz(jsonx.Int(m, "everyDays"), 7), "periodDays": nz(jsonx.Int(m, "periodDays"), 30), "lastRunAt": jsonx.Str(m, "lastRunAt"), "lastError": jsonx.Str(m, "lastError")})
}

// the sold amounts are for the people who may see the company's sales money (the same people as on the reports page)
func seesSalesMoney(me auth.User) bool { return jsonx.Bool(me.M, "canSignOfficialLetters") }

func nz(v, d int) int {
	if v <= 0 {
		return d
	}
	return v
}

// PUT /api/reports/ai-schedule  {enabled, everyDays, periodDays}
func reportAiSchedulePut(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	m := aiSchedule(r.Context())
	every, period := jsonx.Int(body, "everyDays"), jsonx.Int(body, "periodDays")
	if every < 1 || every > 90 || period < 7 || period > 365 {
		httpx.Error(w, http.StatusBadRequest, "فاصله باید بین ۱ تا ۹۰ روز و بازهٔ تحلیل بین ۷ تا ۳۶۵ روز باشد.")
		return
	}
	enabled, _ := body["enabled"].(bool)
	if enabled && !jsonx.Bool(m, "enabled") {
		m["lastRunAt"] = time.Now().UTC().Format(time.RFC3339) // the first one is written after one whole interval
	}
	m["enabled"], m["everyDays"], m["periodDays"] = enabled, every, period
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('aiSchedule', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(m)); err != nil {
		internalError(w)
		return
	}
	reportAiScheduleGet(w, r)
}

// POST /api/reports/ai-schedule/run  (administrators): write the report now, from the server's own numbers
func reportAiScheduleRun(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	period := nz(jsonx.Int(aiSchedule(r.Context()), "periodDays"), 30)
	ctx, cancel := context.WithTimeout(r.Context(), 175*time.Second)
	defer cancel()
	row, err := writeSalesReport(ctx, buildSalesPayload(ctx, period), "manual", me.ID())
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, row)
}

// RunAiReports checks twice an hour whether a scheduled report is due and writes it.
func RunAiReports(ctx context.Context) {
	t := time.NewTicker(30 * time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			runAiReportIfDue(ctx)
		}
	}
}

func runAiReportIfDue(ctx context.Context) {
	m := aiSchedule(ctx)
	if !jsonx.Bool(m, "enabled") {
		return
	}
	every := nz(jsonx.Int(m, "everyDays"), 7)
	last := parseTime(jsonx.Str(m, "lastRunAt"))
	if !last.IsZero() && time.Since(last) < time.Duration(every)*24*time.Hour-time.Hour {
		return
	}
	c, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	row, err := writeSalesReport(c, buildSalesPayload(c, nz(jsonx.Int(m, "periodDays"), 30)), "auto", "")
	m["lastRunAt"] = time.Now().UTC().Format(time.RFC3339)
	if err != nil {
		m["lastError"] = err.Error()
		log.Printf("ai report: %v", err)
	} else {
		delete(m, "lastError")
	}
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('aiSchedule', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(m))
	if err != nil {
		return
	}
	var ids []string
	rows, qerr := store.Pool.Query(ctx, `SELECT id FROM users WHERE data->>'role' = 'SUPER_ADMIN' AND COALESCE((data->>'isActive')::boolean, true)`)
	if qerr != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	head, _ := row["report"].(map[string]any)["headline"].(string)
	notify.Notify(ctx, ids, notify.Note{Kind: "alert", Label: "گزارش هوشمند", Title: "گزارش هوشمند تحلیل فروش آماده شد", Body: head + " (گزارشات ← تحلیل فروش همکاران ← گزارش‌های هوشمند قبلی)", Repeat: true}, "")
}

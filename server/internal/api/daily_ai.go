package api

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// The AI reads the daily reports of a period (from a date to a date, for everybody the asker may see or for one person) and writes
// an analysis: how much work, how regular, what blocks people, what the team spends its time on. The numbers for the charts are
// worked out here (the AI only words them); the reports it reads are the ones the asker could open on the daily-report page.

const dailyAiPrompt = `تو مشاور ارشد مدیریت عملکرد هستی و برای مدیر یک شرکت ایرانی «گزارش‌های روزانهٔ کار همکاران» یک بازه را تحلیل می‌کنی. فقط بر پایهٔ داده‌ای که در پیام کاربر آمده بنویس؛ هیچ نام، عدد یا واقعیتی از خودت نساز. اگر گزارش یک نفر کم است، همین را صریح بگو و قضاوت قاطع نکن. نقد را دربارهٔ رفتار کاری بگو نه شخصیت. «ساعت‌های ثبت‌شده» ساعتی است که خود همکار نوشته؛ آن را معیار قطعی بهره‌وری نگیر.
بررسی کن: حجم و توزیع کار (ساعت و تعداد کار)، نظم گزارش‌دادن (روزهای بدون گزارش)، نسبت کارهای انجام‌شده به در جریان و گیرکرده، موانع تکراری، موضوع‌های اصلی کار تیم، بار نابرابر بین افراد، و کارهایی که هر روز «ادامهٔ کارهای در جریان» می‌ماند بدون پیشرفت.
لحن: محترمانه، روشن و عملی، فارسی روان. هر نکته کوتاه (حداکثر دو جمله) و همراه با عدد واقعی از داده باشد. همهٔ عددها را با ارقام لاتین (0-9) بنویس. جمله‌ها کوتاه باشند تا JSON کامل بماند.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن اضافه، با این ساختار:
{
 "headline": "یک جملهٔ صادقانه دربارهٔ وضع کار تیم در این بازه",
 "mood": "good" | "ok" | "bad",
 "summary": "سه تا پنج جمله خلاصهٔ مدیریتی",
 "comments": {"hours": "...", "regularity": "...", "status": "...", "trend": "...", "blockers": "..."},
 "themes": [{"title": "موضوع اصلی کار", "detail": "یک جمله با شواهد از گزارش‌ها"}],
 "team": {"strengths": ["..."], "risks": ["..."], "opportunities": ["..."]},
 "people": [{"name": "نام دقیق از داده", "grade": "عالی" | "خوب" | "متوسط" | "نیازمند توجه" | "دادهٔ کم", "verdict": "یک تا دو جمله", "strengths": ["..."], "weaknesses": ["..."], "coaching": ["گام عملی با ضرب‌الاجل"]}],
 "actions": [{"title": "کار مشخص", "who": "نام یا «مدیر»", "why": "دلیل با عدد", "when": "مثلاً «همین هفته»"}]
}
هر مورد comments یک تا دو جمله است و زیر نمودار همان موضوع چاپ می‌شود (hours: ساعت هر نفر، regularity: روزهای گزارش‌داده، status: وضعیت کارها، trend: روند روزانه، blockers: موانع)؛ اگر داده نیست خالی بگذار. themes سه تا شش مورد، actions سه تا شش مورد به ترتیب اهمیت.`

var isoDay = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func cutRunes(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}

// POST /api/reports/ai-daily  {from, to, userId?}
func reportAiDaily(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseTasks() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	from, to, only := jsonx.Str(body, "from"), jsonx.Str(body, "to"), jsonx.Str(body, "userId")
	if !isoDay.MatchString(from) || !isoDay.MatchString(to) || from > to {
		httpx.Error(w, http.StatusBadRequest, "بازهٔ تاریخ را درست انتخاب کنید (از تاریخ باید پیش از تا تاریخ باشد).")
		return
	}
	t0, _ := time.Parse("2006-01-02", from)
	t1, _ := time.Parse("2006-01-02", to)
	if t1.Sub(t0) > 92*24*time.Hour {
		httpx.Error(w, http.StatusBadRequest, "بازه حداکثر ۹۳ روز می‌تواند باشد؛ بازهٔ کوتاه‌تری انتخاب کنید.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 175*time.Second)
	defer cancel()

	// the reports this person may see (the same rule as the daily-report page)
	var reports []jsonx.M
	if me.IsAdmin() {
		reports = rawMaps(ctx, `SELECT data FROM daily_reports WHERE report_date >= $1 AND report_date <= $2 ORDER BY report_date, user_id LIMIT 800`, from, to)
	} else {
		mgd := managedStaff(ctx, me.ID())
		reports = rawMaps(ctx, `SELECT data FROM daily_reports WHERE report_date >= $1 AND report_date <= $2 AND (user_id = $3 OR $3 = ANY(recipient_ids) OR user_id = ANY($4::text[])) ORDER BY report_date, user_id LIMIT 800`, from, to, me.ID(), mgd)
	}
	if only != "" {
		var kept []jsonx.M
		for _, rp := range reports {
			if jsonx.Str(rp, "userId") == only {
				kept = append(kept, rp)
			}
		}
		reports = kept
	}
	if len(reports) == 0 {
		httpx.Error(w, http.StatusBadRequest, "در این بازه گزارش روزانه‌ای (که شما اجازهٔ دیدنش را داشته باشید) ثبت نشده است.")
		return
	}

	// who is expected to write one: the same people as on the reports page
	expected := map[string]string{}
	for _, u := range rawMaps(ctx, `SELECT data FROM users WHERE COALESCE((data->>'isActive')::boolean, true)`) {
		if jsonx.Bool(u, "canUseTasks") || jsonx.Str(u, "role") != "STAFF" {
			expected[jsonx.Str(u, "id")] = jsonx.Str(u, "fullName")
		}
	}
	// working days of the period (Friday is the weekend)
	var workdays []string
	for d := t0; !d.After(t1); d = d.AddDate(0, 0, 1) {
		if d.Weekday() != time.Friday {
			workdays = append(workdays, d.Format("2006-01-02"))
		}
	}

	type person struct {
		name                                  string
		days                                  map[string]bool
		hours                                 float64
		items, done, inProgress, blocked, blk int
	}
	people := map[string]*person{}
	status := map[string]int{"DONE": 0, "IN_PROGRESS": 0, "BLOCKED": 0}
	perDay := map[string]*struct {
		Reports int
		Hours   float64
	}{}
	blockers := []jsonx.M{}
	var feed []jsonx.M
	for _, rp := range reports {
		uid, date := jsonx.Str(rp, "userId"), jsonx.Str(rp, "date")
		p := people[uid]
		if p == nil {
			name := jsonx.Str(rp, "authorName")
			if n, ok := expected[uid]; ok && name == "" {
				name = n
			}
			p = &person{name: name, days: map[string]bool{}}
			people[uid] = p
		}
		p.days[date] = true
		pd := perDay[date]
		if pd == nil {
			pd = &struct {
				Reports int
				Hours   float64
			}{}
			perDay[date] = pd
		}
		pd.Reports++
		var items []jsonx.M
		for _, it := range jsonx.Arr(rp, "items") {
			m, _ := it.(map[string]any)
			if m == nil {
				continue
			}
			hrs := jsonx.Num(m["hours"])
			st := jsonx.Str(m, "status")
			p.hours += hrs
			pd.Hours += hrs
			p.items++
			switch st {
			case "DONE":
				p.done++
			case "BLOCKED":
				p.blocked++
			default:
				p.inProgress++
				st = "IN_PROGRESS"
			}
			status[st]++
			if len(items) < 8 {
				items = append(items, jsonx.M{"text": cutRunes(jsonx.Str(m, "text"), 140), "hours": hrs, "status": st})
			}
		}
		if b := strings.TrimSpace(jsonx.Str(rp, "blockers")); b != "" {
			p.blk++
			if len(blockers) < 30 {
				blockers = append(blockers, jsonx.M{"name": p.name, "date": date, "text": cutRunes(b, 200)})
			}
		}
		feed = append(feed, jsonx.M{"date": date, "name": p.name, "summary": cutRunes(jsonx.Str(rp, "summary"), 260), "items": items,
			"blockers": cutRunes(jsonx.Str(rp, "blockers"), 160), "tomorrow": cutRunes(jsonx.Str(rp, "tomorrow"), 140)})
	}

	// the numbers of the charts
	var uids []string
	for id := range people {
		uids = append(uids, id)
	}
	sort.Slice(uids, func(i, j int) bool {
		a, b := people[uids[i]], people[uids[j]]
		if a.hours != b.hours {
			return a.hours > b.hours
		}
		return a.name < b.name
	})
	rows := []jsonx.M{}
	var totalHours float64
	for _, id := range uids {
		p := people[id]
		totalHours += p.hours
		rows = append(rows, jsonx.M{"name": p.name, "reports": len(p.days), "expectedDays": len(workdays), "hours": p.hours, "items": p.items, "done": p.done, "inProgress": p.inProgress, "blocked": p.blocked, "blockerNotes": p.blk})
	}
	missing := []string{}
	if only == "" {
		for id, n := range expected {
			if people[id] == nil {
				if me.IsAdmin() || id == me.ID() || jsonx.Contains(managedStaff(ctx, me.ID()), id) {
					missing = append(missing, n)
				}
			}
		}
		sort.Strings(missing)
	}
	var days []string
	for d := range perDay {
		days = append(days, d)
	}
	sort.Strings(days)
	trend := []jsonx.M{}
	for _, d := range days {
		trend = append(trend, jsonx.M{"date": d, "reports": perDay[d].Reports, "hours": perDay[d].Hours})
	}
	stats := jsonx.M{
		"from": from, "to": to, "workdays": len(workdays), "reports": len(reports), "people": rows, "status": status, "trend": trend,
		"totalHours": totalHours, "blockers": blockers, "noReportAtAll": missing,
	}

	aiPayload, _ := json.Marshal(jsonx.M{"period": jsonx.M{"from": from, "to": to, "workdays": len(workdays)}, "stats": stats, "reports": feed})
	if len(aiPayload) > 110000 { // very long periods: the AI reads the numbers and the shortest form of each report
		for _, f := range feed {
			f["items"] = nil
		}
		aiPayload, _ = json.Marshal(jsonx.M{"period": jsonx.M{"from": from, "to": to, "workdays": len(workdays)}, "stats": stats, "reports": feed})
	}
	s := supportSettings(ctx)
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» ذخیره کنید.")
		return
	}
	text, err := aiChatOpts(ctx, key, model, []aiMsg{
		{Role: "system", Content: dailyAiPrompt},
		{Role: "user", Content: "بازهٔ گزارش: از " + from + " تا " + to + " (تاریخ میلادی)\nداده‌ها (JSON):\n" + string(aiPayload)},
	}, 6500, 160*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	rep := parseLooseJSON(text)
	if rep == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "stats": stats, "report": rep})
}

package api

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// «تحلیل مشتری»: the AI reads everything written and said so far with one customer (notes, follow-ups, quotes, opportunities, the text of
// the recorded calls) and says on which of five levels the customer stands, how ready to buy they are, what they want, what holds them
// back and what to do next. The last analysis is kept on the customer with its time. Only people who may see the customer can ask.

const customerAiPrompt = `تو مشاور ارشد فروش یک شرکت ایرانی هستی. از روی همهٔ سابقهٔ یک مشتری (یادداشت‌ها، تماس‌ها و متن مکالمه‌ها، قیمت‌ها، فرصت‌های فروش و خریدها) تعیین می‌کنی این مشتری الان در چه «سطحی» است و فروشنده چه کند. فقط بر پایهٔ داده بنویس؛ هیچ نام، عدد، تاریخ یا حرفی را از خودت نساز و اگر داده کم است همین را صریح بگو و اطمینان را «کم» بگذار.
پنج سطح:
1 «ناآشنا / سرد»: هنوز تعامل واقعی نیست یا نیازش روشن نیست.
2 «علاقه‌مند»: نیاز یا محصول موردنظرش را گفته و اطلاعات می‌خواهد.
3 «در حال ارزیابی»: قیمت گرفته، مقایسه یا چانه می‌زند، ولی تصمیم نگرفته.
4 «آمادهٔ خرید»: پیش‌فاکتور یا مذاکرهٔ نهایی دارد، دربارهٔ زمان، پرداخت یا تحویل حرف می‌زند.
5 «مشتری وفادار»: خرید موفق (به‌ویژه تکراری) دارد و رابطه برقرار است.
اگر مشتری بی‌علاقه شده یا مدت زیادی بی‌تعامل مانده، سطحش را بر پایهٔ آخرین وضع بگذار ولی atRisk را true کن و دلیلش را در risks بنویس.
لحن: محترمانه، روشن، عملی، فارسی روان؛ هر نکته کوتاه (حداکثر دو جمله). شواهد را از خود سابقه نقل کن (کوتاه، با تاریخ اگر معلوم است). همهٔ عددها را با ارقام لاتین (0-9) بنویس. همهٔ تاریخ‌ها را فقط شمسی بنویس (مثل «4 آبان 1405»)؛ در داده تاریخ‌ها از پیش شمسی شده‌اند و هرگز تاریخ میلادی یا قالب 2026-10-09 ننویس.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن اضافه:
{"level": 1 تا 5, "levelTitle": "نام سطح", "temperature": "سرد" | "ولرم" | "گرم" | "داغ", "readiness": 0 تا 100, "confidence": "کم" | "متوسط" | "زیاد", "atRisk": true | false,
 "headline": "یک جملهٔ صریح دربارهٔ این مشتری", "summary": "سه تا پنج جمله بر پایهٔ صحبت‌ها تا امروز",
 "wants": ["آنچه مشتری می‌خواهد"], "signals": [{"text": "نشانهٔ مثبت یا خرید", "evidence": "نقل کوتاه از سابقه"}], "objections": [{"text": "اعتراض یا مانع", "evidence": "نقل کوتاه"}], "risks": ["خطر از دست رفتن"],
 "nextActions": [{"title": "کار مشخص", "why": "دلیل", "when": "مثلاً «امروز»"}], "suggestedMessage": "متن کوتاه و مؤدبانهٔ پیشنهادی برای تماس یا پیامک بعدی"}`

func canSeeCrmCustomer(ctx context.Context, me auth.User, id string) bool {
	if !me.CanUseCrm() {
		return false
	}
	if crmSeesAll(me) {
		return true
	}
	var ok bool
	_ = store.Pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 WHERE $3::text IN `+crmMyCustomerIDs+`)`, me.ID(), crmPeople(ctx, me), id).Scan(&ok)
	return ok
}

// GET /api/customers/{id}/ai-analysis: the last analysis, if there is one
func customerAiGet(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !canSeeCrmCustomer(r.Context(), auth.Current(r), id) {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, auth.Current(r), "ai.customer") {
		return
	}
	m := rawMaps(r.Context(), `SELECT jsonb_build_object('createdAt', to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'by', created_by, 'analysis', result) FROM ai_customer_analyses WHERE customer_id = $1`, id)
	if len(m) == 0 {
		httpx.JSON(w, http.StatusOK, map[string]any{"analysis": nil})
		return
	}
	httpx.JSON(w, http.StatusOK, m[0])
}

// POST /api/customers/{id}/ai-analysis
func customerAiRun(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), 150*time.Second)
	defer cancel()
	if !canSeeCrmCustomer(ctx, me, id) {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, me, "ai.customer") {
		return
	}
	s := supportSettings(ctx)
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» ذخیره کنید.")
		return
	}
	cust := rawMaps(ctx, `SELECT data FROM crm_customers WHERE id = $1`, id)
	if len(cust) == 0 {
		httpx.Error(w, http.StatusNotFound, "این مشتری پیدا نشد.")
		return
	}
	c := cust[0]
	money := seesSalesMoney(me)

	var b strings.Builder
	b.WriteString("امروز: " + jalaliText(time.Now().Format("2006-01-02")) + "\n")
	b.WriteString("مشتری: " + cutRunes(jsonx.Str(c, "name"), 80))
	if v := jsonx.Str(c, "company"); v != "" {
		b.WriteString(" · شرکت: " + cutRunes(v, 80))
	}
	b.WriteString("\nوضعیت: " + jsonx.Str(c, "status") + " · آشنایی: " + jsonx.Str(c, "source") + " · از تاریخ: " + jalaliText(jsonx.Str(c, "createdAt")) + "\n")
	if v := jsonx.Str(c, "interest"); v != "" {
		b.WriteString("دنبال: " + cutRunes(v, 200) + "\n")
	}
	if v := jsonx.Str(c, "notes"); v != "" {
		b.WriteString("توضیح پرونده: " + cutRunes(v, 400) + "\n")
	}
	deals := rawMaps(ctx, `SELECT data FROM crm_deals WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 25`, id)
	b.WriteString("\nفرصت‌های فروش (" + strconv.Itoa(len(deals)) + "):\n")
	for _, d := range deals {
		line := "- «" + cutRunes(jsonx.Str(d, "title"), 80) + "» مرحله " + jsonx.Str(d, "stage") + " · ساخته‌شده " + jalaliText(jsonx.Str(d, "createdAt"))
		if money && jsonx.Num(d["amount"]) > 0 {
			line += " · مبلغ " + strconv.Itoa(int(jsonx.Num(d["amount"])))
		}
		if jsonx.Str(d, "stage") == "LOST" && jsonx.Str(d, "lostReason") != "" {
			line += " · دلیل باخت: " + cutRunes(jsonx.Str(d, "lostReason"), 100)
		}
		if ec := jsonx.Str(d, "expectedClose"); ec != "" {
			line += " · پیش‌بینی بستن " + jalaliText(ec)
		}
		b.WriteString(line + "\n")
	}
	acts := rawMaps(ctx, `SELECT data FROM crm_activities WHERE customer_id = $1 AND data->>'type' <> 'MISSING' ORDER BY created_at DESC LIMIT 60`, id)
	b.WriteString("\nتعامل‌ها (تازه‌ترین اول، " + strconv.Itoa(len(acts)) + " مورد):\n")
	for _, a := range acts {
		line := "- " + jalaliText(jsonx.Str(a, "createdAt")) + " " + jsonx.Str(a, "type") + " (" + cutRunes(jsonx.Str(a, "authorName"), 40) + ")"
		if jsonx.Str(a, "type") == "QUOTE" {
			line += ": قیمت «" + cutRunes(jsonx.Str(a, "itemName"), 60) + "»"
			if money && jsonx.Num(a["price"]) > 0 {
				line += " " + strconv.Itoa(int(jsonx.Num(a["price"])))
			}
		}
		if t := jsonx.Str(a, "text"); t != "" {
			line += ": " + cutRunes(t, 320)
		}
		b.WriteString(line + "\n")
	}
	calls := rawMaps(ctx, `SELECT jsonb_build_object('at', to_char(c.started_at,'YYYY-MM-DD'), 'dir', c.direction, 'status', c.status, 'dur', c.duration_sec, 'text', t.text)
	    FROM voip_calls c LEFT JOIN voip_transcripts t ON t.call_id = c.id AND t.status = 'done' WHERE c.customer_id = $1 ORDER BY c.started_at DESC LIMIT 20`, id)
	b.WriteString("\nتماس‌های تلفنی (" + strconv.Itoa(len(calls)) + " مورد اخیر):\n")
	withText := 0
	for _, k := range calls {
		line := "- " + jalaliText(jsonx.Str(k, "at")) + " " + jsonx.Str(k, "dir") + " " + jsonx.Str(k, "status") + " مدت " + strconv.Itoa(jsonx.Int(k, "dur")) + " ثانیه"
		if t := jsonx.Str(k, "text"); t != "" && withText < 6 {
			withText++
			line += "\n  متن مکالمه: " + cutRunes(t, 1400)
		}
		b.WriteString(line + "\n")
	}

	out, err := aiChatOpts(ctx, key, model, []aiMsg{{Role: "system", Content: customerAiPrompt}, {Role: "user", Content: b.String()}}, 3500, 130*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	res := parseLooseJSON(out)
	if res == nil || res["level"] == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	at := time.Now().UTC()
	if _, err := store.Pool.Exec(ctx, `INSERT INTO ai_customer_analyses (customer_id, created_at, created_by, result) VALUES ($1,$2,$3,$4::jsonb)
	    ON CONFLICT (customer_id) DO UPDATE SET created_at = $2, created_by = $3, result = $4::jsonb`, id, at, me.ID(), jsonx.Encode(res)); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"createdAt": at.Format("2006-01-02T15:04:05.000Z"), "by": me.ID(), "analysis": res, "usedCallTexts": withText})
}

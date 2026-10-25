package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// The AI report on the sales team: the numbers the «تحلیل فروش همکاران» section already worked out (sent by the page, so it
// is the same set of people and the same period the manager is looking at) are given to the AI service, which writes a short
// readable report as JSON. Only people who may see the management statistics can ask for it.

const reportAiPrompt = `تو مشاور ارشد مدیریت فروش هستی و برای مدیر یک شرکت ایرانی گزارش می‌نویسی. فقط بر پایهٔ داده‌ای که در پیام کاربر آمده تحلیل کن؛ هیچ عددی، نامی یا واقعیتی از خودت نساز. اگر دادهٔ یک نفر کم است (فروش بسته‌شدهٔ کم)، همین را صریح بگو و قضاوت قاطع نکن.
معیارها: نرخ موفقیت (برد نسبت به برد+باخت)، تعداد و ارزش فروش، میانگین فروش، طول چرخهٔ فروش، قیف باز و فرصت‌های بی‌حرکت، فعالیت روزانه (تماس، جلسه، یادداشت، قیمت، پیگیری)، پیگیری‌های عقب‌افتاده و امتیاز سامانه.
لحن: محترمانه، روشن و عملی، فارسی روان، بدون کلمهٔ انگلیسی مگر نام کتاب. هر نکته کوتاه (حداکثر دو جمله) و همراه با عدد واقعی از داده باشد. نقد را دربارهٔ رفتار بگو نه شخصیت.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن یا علامت اضافه، با این ساختار دقیق:
{
 "headline": "یک جملهٔ جذاب و صادقانه دربارهٔ وضع تیم",
 "mood": "good" | "ok" | "bad",
 "summary": "سه تا پنج جمله خلاصهٔ مدیریتی",
 "comments": {"winRate": "...", "sales": "...", "activity": "...", "pipeline": "...", "cycle": "...", "losses": "...", "score": "..."},
 "team": {"strengths": ["..."], "risks": ["..."], "opportunities": ["..."]},
 "people": [{"name": "نام دقیق از داده", "rank": 1, "grade": "عالی" | "خوب" | "متوسط" | "نیازمند توجه" | "دادهٔ کم", "verdict": "یک تا دو جمله", "strengths": ["..."], "weaknesses": ["..."], "coaching": ["گام عملی با ضرب‌الاجل"]}],
 "actions": [{"title": "کار مشخص", "who": "نام یا «مدیر فروش»", "why": "دلیل با عدد", "when": "مثلاً «همین هفته»"}]
}
هر مورد comments یک تا دو جمله است که زیر نمودار همان موضوع چاپ می‌شود و باید نمودار را برای مدیر تفسیر کند (چه می‌بینیم، چرا مهم است، چه کنیم) و حتماً از عددهای واقعی داده بنویسد؛ اگر برای موضوعی داده نیست مقدارش را خالی بگذار. همهٔ عددها را با ارقام لاتین (0-9) بنویس. جمله‌ها کوتاه باشند تا JSON کامل بماند. people به ترتیب رتبه و برای همهٔ افراد داده؛ actions بین سه تا هفت مورد و به ترتیب اهمیت.`

// POST /api/reports/ai-sales  {rangeLabel, data}
func reportAiSales(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).CanViewStats() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	s := supportSettings(r.Context())
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» ذخیره کنید.")
		return
	}
	data, _ := json.Marshal(body["data"])
	if len(data) < 20 || len(data) > 120000 {
		httpx.Error(w, http.StatusBadRequest, "داده‌ای برای تحلیل نیست.")
		return
	}
	period := clean(jsonx.Str(body, "rangeLabel"), 60)
	ctx, cancel := context.WithTimeout(r.Context(), 170*time.Second)
	defer cancel()
	text, err := aiChatOpts(ctx, key, model, []aiMsg{
		{Role: "system", Content: reportAiPrompt},
		{Role: "user", Content: "بازهٔ گزارش: " + period + "\nداده‌های تیم فروش (JSON):\n" + string(data)},
	}, 6500, 160*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "تحلیل انجام نشد: "+err.Error())
		return
	}
	rep := parseLooseJSON(text)
	if rep == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ یک بار دیگر «تحلیل دوباره» را بزنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"report": rep})
}

// parseLooseJSON reads the JSON object an AI service wrote: code fences and words around it are dropped, Persian digits are turned
// into ordinary ones (a model sometimes writes «"rank": ۳»), and an answer that was cut short is closed so what was written is kept.
func parseLooseJSON(text string) map[string]any {
	js := strings.TrimSpace(text)
	js = strings.NewReplacer("۰", "0", "۱", "1", "۲", "2", "۳", "3", "۴", "4", "۵", "5", "۶", "6", "۷", "7", "۸", "8", "۹", "9",
		"٠", "0", "١", "1", "٢", "2", "٣", "3", "٤", "4", "٥", "5", "٦", "6", "٧", "7", "٨", "8", "٩", "9").Replace(js)
	i := strings.Index(js, "{")
	if i < 0 {
		return nil
	}
	js = js[i:]
	if j := strings.LastIndex(js, "}"); j > 0 {
		js = js[:j+1]
	}
	var out map[string]any
	if json.Unmarshal([]byte(js), &out) == nil {
		return out
	}
	// closed again: walk the text, remember the open brackets, cut a half-written tail
	var stack []byte
	inStr, esc := false, false
	last := 0 // end of the last complete value
	for k := 0; k < len(js); k++ {
		c := js[k]
		if inStr {
			if esc {
				esc = false
			} else if c == '\\' {
				esc = true
			} else if c == '"' {
				inStr = false
				last = k + 1
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{', '[':
			stack = append(stack, c)
			last = k + 1
		case '}', ']':
			if len(stack) > 0 {
				stack = stack[:len(stack)-1]
			}
			last = k + 1
		case ',', ':', ' ', '\n', '\t', '\r':
		default:
			last = k + 1
		}
	}
	cut := strings.TrimRight(js[:last], " \n\t\r,:")
	if strings.HasSuffix(cut, "\"") {
		// a key left without its value: drop it
		if k := strings.LastIndex(cut[:len(cut)-1], "\""); k >= 0 {
			tail := strings.TrimRight(cut[:k], " \n\t\r")
			if strings.HasSuffix(tail, ":") {
				cut = strings.TrimRight(tail[:len(tail)-1], " \n\t\r")
				if k2 := strings.LastIndex(cut, "\""); k2 >= 0 {
					cut = strings.TrimRight(cut[:k2], " \n\t\r,")
				}
			}
		}
	}
	for k := len(stack) - 1; k >= 0; k-- {
		if stack[k] == '{' {
			cut += "}"
		} else {
			cut += "]"
		}
	}
	if json.Unmarshal([]byte(cut), &out) == nil {
		return out
	}
	return nil
}

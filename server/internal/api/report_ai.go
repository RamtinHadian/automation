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
 "kpis": [{"label": "نام شاخص", "value": "مقدار با واحد", "note": "یک توضیح کوتاه"}],
 "team": {"strengths": ["..."], "risks": ["..."], "opportunities": ["..."]},
 "people": [{"name": "نام دقیق از داده", "rank": 1, "grade": "عالی" | "خوب" | "متوسط" | "نیازمند توجه" | "دادهٔ کم", "verdict": "یک تا دو جمله", "strengths": ["..."], "weaknesses": ["..."], "coaching": ["گام عملی با ضرب‌الاجل"]}],
 "actions": [{"title": "کار مشخص", "who": "نام یا «مدیر فروش»", "why": "دلیل با عدد", "when": "مثلاً «همین هفته»"}]
}
kpis حداکثر شش مورد؛ people به ترتیب رتبه و برای همهٔ افراد داده؛ actions بین سه تا هفت مورد و به ترتیب اهمیت.`

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
	}, 4500, 160*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "تحلیل انجام نشد: "+err.Error())
		return
	}
	js := strings.TrimSpace(text)
	js = strings.TrimPrefix(js, "```json")
	js = strings.TrimPrefix(js, "```")
	js = strings.TrimSuffix(js, "```")
	if i, j := strings.Index(js, "{"), strings.LastIndex(js, "}"); i >= 0 && j > i {
		js = js[i : j+1]
	}
	var rep map[string]any
	if json.Unmarshal([]byte(js), &rep) != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"text": strings.TrimSpace(text)})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"report": rep})
}

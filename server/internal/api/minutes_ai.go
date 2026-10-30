package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// Meeting minutes written by the AI service of the support settings: from the raw notes (or the typed-out talk) it writes the agenda,
// the discussion and the decisions; or it shortens the discussion that is already written. The person reads and edits the result
// before saving; nothing is saved here.

const minutesDraftPrompt = `تو منشی حرفه‌ای جلسه‌های یک شرکت ایرانی هستی و از روی یادداشت یا متن گفتگوی جلسه، «صورتجلسه» رسمی می‌نویسی. فقط از آنچه در متن آمده استفاده کن؛ چیزی نساز، نام یا عدد یا تصمیمی که در متن نیست اضافه نکن. اگر چیزی روشن نیست، همان را نیاور.
لحن رسمی، کوتاه و روان فارسی اداری باشد. «شرح مذاکرات» خلاصهٔ منسجم چند پاراگرافی از آنچه گفته شد (نه رونویسی). «مصوبات» هر کدام یک کار مشخص و قابل اجرا؛ اگر در متن مسئول یا مهلت آمده بنویس. نام مسئول را دقیقاً مثل یکی از «نام‌های حاضر» بنویس اگر همان آدم است.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن اضافه:
{"title":"عنوان کوتاه جلسه (اگر روشن است)","agenda":["بند دستور جلسه"],"discussion":"شرح مذاکرات","decisions":[{"text":"مصوبه","owner":"نام مسئول یا خالی","dueInDays":عدد روز از امروز یا null}]}`

const minutesSummaryPrompt = `تو منشی حرفه‌ای جلسه هستی. متن «شرح مذاکرات» زیر را به یک خلاصهٔ رسمی، منسجم و کوتاه‌تر (حدود یک‌سوم طول) بازنویسی کن. هیچ نکتهٔ تازه، نام یا عدد اضافه نکن و هیچ تصمیم یا عدد مهمی را حذف نکن. خروجی فقط خود متن خلاصه باشد، بدون عنوان و توضیح.`

// POST /api/minutes/ai  {mode: "draft" | "summary", text, people?: [names]}
func minutesAi(w http.ResponseWriter, r *http.Request) {
	if !minutesAllowed(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, auth.Current(r), "ai.minutes") {
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	s := supportSettings(r.Context())
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "هوش مصنوعی هنوز راه‌اندازی نشده است. مدیر سیستم کلید API و نام مدل را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» ذخیره می‌کند.")
		return
	}
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if len([]rune(text)) < 30 {
		httpx.Error(w, http.StatusBadRequest, "متن خیلی کوتاه است؛ یادداشت‌های جلسه را بیشتر بنویسید.")
		return
	}
	if len([]rune(text)) > 30000 {
		httpx.Error(w, http.StatusBadRequest, "متن بیش از ۳۰ هزار نویسه است؛ آن را در چند بخش بدهید.")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 130*time.Second)
	defer cancel()
	if jsonx.Str(body, "mode") == "summary" {
		out, err := aiChatOpts(ctx, key, model, []aiMsg{{Role: "system", Content: minutesSummaryPrompt}, {Role: "user", Content: text}}, 2000, 120*time.Second)
		if err != nil {
			httpx.Error(w, http.StatusBadGateway, "خلاصه‌نویسی انجام نشد: "+err.Error())
			return
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"discussion": strings.TrimSpace(out)})
		return
	}
	names := []string{}
	if arr, ok := body["people"].([]any); ok {
		for _, v := range arr {
			if n, ok := v.(string); ok && n != "" && len(names) < 60 {
				names = append(names, clean(n, 80))
			}
		}
	}
	out, err := aiChatOpts(ctx, key, model, []aiMsg{
		{Role: "system", Content: minutesDraftPrompt},
		{Role: "user", Content: "نام‌های حاضر: " + strings.Join(names, "، ") + "\n\nمتن یادداشت یا گفتگوی جلسه:\n" + text},
	}, 4000, 120*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "نوشتن صورتجلسه انجام نشد: "+err.Error())
		return
	}
	draft := parseLooseJSON(out)
	if draft == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"draft": draft})
}

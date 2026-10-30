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

// The letter editor's «با هوش مصنوعی» button: from a short request (and the text already typed, if any) the AI service writes the
// body of an official letter. It only returns text; the person reads it in the editor, changes it and sends the letter as usual.

const letterAiPrompt = `تو دبیر و نویسندهٔ حرفه‌ای مکاتبات اداری یک شرکت ایرانی هستی. بدنهٔ یک نامهٔ اداری به فارسی روان، درست و مؤدبانه می‌نویسی.
قواعد: فقط از اطلاعاتی که کاربر داده استفاده کن؛ هیچ نام، عدد، تاریخ، مبلغ یا تعهدی از خودت نساز. اگر برای کامل‌شدن نامه جزئیاتی لازم است که داده نشده (مثل تاریخ یا شماره)، همان‌جا بنویس [..........] یا [نام ..] تا نویسنده پر کند. اگر متنی از قبل نوشته شده، منظور و ساختار و جزئیاتش را حفظ کن و آن را کامل و ویرایش کن، نه اینکه موضوع دیگری بنویسی.
ساختار: بند اول فقط خطاب به گیرنده (مثلاً «جناب آقای ... / مدیریت محترم ...»)، بعد «با سلام و احترام،»، سپس دو تا چهار بند اصلی کوتاه و منسجم، و در پایان یک جملهٔ تشکر یا درخواست اقدام. امضا، تاریخ و شمارهٔ نامه را ننویس، سامانه می‌گذارد. از به‌کاربردن جمله‌های کلیشه‌ای و طولانی بپرهیز.
لحن را طبق «لحن خواسته‌شده» تنظیم کن.
خروجی فقط یک JSON معتبر باشد، بدون هیچ متن اضافه، با این ساختار:
{"subject":"موضوع کوتاه نامه (حداکثر ده کلمه)","paragraphs":["خطاب","با سلام و احترام،","بند اول","..."]}`

// POST /api/letters/ai  {subject, instruction, currentText, recipient, sender, tone}
func letterAi(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() && !jsonx.Bool(me.M, "canSendOfficialLetters") && !jsonx.Bool(me.M, "canSignOfficialLetters") {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, me, "ai.letters") {
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
	instruction := clean(jsonx.Str(body, "instruction"), 2000)
	current := clean(jsonx.Str(body, "currentText"), 8000)
	if len([]rune(instruction)) < 5 && len([]rune(current)) < 20 {
		httpx.Error(w, http.StatusBadRequest, "خواستهٔ نامه را کوتاه بنویسید یا اول چند جمله از نامه را در ویرایشگر بنویسید.")
		return
	}
	var b strings.Builder
	b.WriteString("لحن خواسته‌شده: " + clean(jsonx.Str(body, "tone"), 60) + "\n")
	if v := clean(jsonx.Str(body, "recipient"), 160); v != "" {
		b.WriteString("گیرنده: " + v + "\n")
	}
	if v := clean(jsonx.Str(body, "sender"), 160); v != "" {
		b.WriteString("نویسنده / امضاکننده: " + v + "\n")
	}
	if v := clean(jsonx.Str(body, "subject"), 200); v != "" {
		b.WriteString("موضوع فعلی نامه: " + v + "\n")
	}
	if instruction != "" {
		b.WriteString("\nخواستهٔ نویسنده (چه چیزی باید در نامه بیاید):\n" + instruction + "\n")
	}
	if current != "" {
		b.WriteString("\nمتنی که تا الان در نامه نوشته شده (کامل و ویرایش کن):\n" + current + "\n")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 130*time.Second)
	defer cancel()
	out, err := aiChatOpts(ctx, key, model, []aiMsg{{Role: "system", Content: letterAiPrompt}, {Role: "user", Content: b.String()}}, 2500, 120*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, "نوشتن نامه انجام نشد: "+err.Error())
		return
	}
	draft := parseLooseJSON(out)
	paras, _ := draft["paragraphs"].([]any)
	if draft == nil || len(paras) == 0 {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"draft": draft})
}

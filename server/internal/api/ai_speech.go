package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// Text to voice with the AI service of the support settings (togpt): the usual OpenAI-style «audio/speech» endpoint.
// The model and the voice are chosen by an administrator in the AI settings; whoever needs a voice later (reading a letter or an answer aloud)
// calls the same endpoint.

const defaultTtsVoice = "alloy"
const maxSpeechChars = 4000

func ttsVoice(s jsonx.M) string {
	if v := jsonx.Str(s, "aiTtsVoice"); v != "" {
		return v
	}
	return defaultTtsVoice
}

// POST /api/ai/speech {text}: the text read aloud, as an mp3 file. Administrators only for now (the test button of the AI settings).
func aiSpeech(w http.ResponseWriter, r *http.Request) {
	if !canManageWarranty(auth.Current(r)) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if text == "" {
		httpx.Error(w, http.StatusBadRequest, "متنی برای خواندن نیست.")
		return
	}
	if len([]rune(text)) > maxSpeechChars {
		text = string([]rune(text)[:maxSpeechChars])
	}
	s := supportSettings(r.Context())
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiTtsModel")
	voice := ttsVoice(s)
	// the test button of the settings page tries what is typed in the boxes before it is saved
	if m := strings.TrimSpace(jsonx.Str(body, "model")); m != "" && len(m) <= 80 {
		model = m
	}
	if v := strings.TrimSpace(jsonx.Str(body, "voice")); v != "" && len(v) <= 40 {
		voice = v
	}
	if key == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API سرویس هوش مصنوعی را وارد کنید.")
		return
	}
	if model == "" {
		httpx.Error(w, http.StatusBadRequest, "نام مدل تبدیل نوشته به صدا را در تنظیمات هوش مصنوعی وارد کنید.")
		return
	}
	payload, _ := json.Marshal(map[string]any{"model": model, "input": text, "voice": voice, "response_format": "mp3"})
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodPost, aiBaseURL+"/audio/speech", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Do(req)
	if err != nil {
		e := connectionErr(err)
		httpx.Error(w, http.StatusBadGateway, e.Msg)
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 30<<20))
	if resp.StatusCode != http.StatusOK {
		if resp.StatusCode == http.StatusNotFound {
			httpx.Error(w, http.StatusBadGateway, "سرویس هوش مصنوعی این مدل صدا یا این آدرس را ندارد (پاسخ ۴۰۴). نام مدل صدا را از togpt بپرسید.")
			return
		}
		e := classifyAI(resp.StatusCode, string(data))
		httpx.Error(w, http.StatusBadGateway, e.Msg)
		return
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "audio/") {
		ct = "audio/mpeg"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

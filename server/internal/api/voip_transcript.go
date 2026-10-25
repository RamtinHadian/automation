package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Call recordings turned into text by the AI service of the support settings (togpt).
// The text is kept in voip_transcripts and shown under the call to everybody who may listen to that call.
// First the usual «audio/transcriptions» endpoint is tried; if the service has none, the audio is sent to a chat model
// that understands audio (wav and mp3 only).

// togpt has no audio/transcriptions endpoint (it answers 404), so the default is a chat model that takes audio
const defaultSttModel = "google/gemini-3.7-flash"
const fallbackSttModel = "google/gemini-3.7-flash"
const maxTranscribeBytes = 24 << 20

var transcribing sync.Map // call id → true while one is running

func sttModel(s jsonx.M) string {
	if m := jsonx.Str(s, "aiSttModel"); m != "" {
		return m
	}
	return defaultSttModel
}

func transcribeFile(ctx context.Context, key string, s jsonx.M, path string) (string, error) {
	st, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("فایل ضبط‌شده در دسترس نیست.")
	}
	if st.Size() > maxTranscribeBytes {
		return "", fmt.Errorf("فایل ضبط‌شده بزرگ‌تر از ۲۴ مگابایت است و فرستاده نمی‌شود.")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("فایل ضبط‌شده خوانده نشد.")
	}
	ext := strings.ToLower(filepath.Ext(path))

	model := sttModel(s)
	status := 0
	if m := strings.ToLower(model); strings.Contains(m, "transcribe") || strings.Contains(m, "whisper") {
		text, code, err := transcribeEndpoint(ctx, key, model, ext, data)
		if err == nil || code != http.StatusNotFound {
			return text, err
		}
		status, model = code, fallbackSttModel // the service has no such endpoint: use a chat model that hears audio
	}
	return transcribeChat(ctx, key, model, ext, data, status)
}

// the usual OpenAI-style endpoint; the status code is returned so that «no such endpoint» can be told from other failures
func transcribeEndpoint(ctx context.Context, key, model, ext string, data []byte) (string, int, error) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("model", model)
	_ = mw.WriteField("language", "fa")
	_ = mw.WriteField("response_format", "json")
	fw, _ := mw.CreateFormFile("file", "call"+ext)
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, aiBaseURL+"/audio/transcriptions", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+key)
	resp, err := (&http.Client{Timeout: 4 * time.Minute}).Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("اتصال به سرویس هوش مصنوعی انجام نشد.")
	}
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		var out struct {
			Text string `json:"text"`
		}
		if json.Unmarshal(raw, &out) == nil && strings.TrimSpace(out.Text) != "" {
			return strings.TrimSpace(out.Text), resp.StatusCode, nil
		}
		return "", resp.StatusCode, fmt.Errorf("در این مکالمه گفتاری شناخته نشد.")
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return "", resp.StatusCode, fmt.Errorf("کلید API پذیرفته نشد (پاسخ %d).", resp.StatusCode)
	}
	return "", resp.StatusCode, fmt.Errorf("سرویس تبدیل صدا به متن پاسخ %d داد.", resp.StatusCode)
}

// the audio goes to a chat model that understands it (wav and mp3)
func transcribeChat(ctx context.Context, key, model, ext string, data []byte, before int) (string, error) {
	format := strings.TrimPrefix(ext, ".")
	if format != "wav" && format != "mp3" {
		return "", fmt.Errorf("فقط فایل‌های wav و mp3 به متن تبدیل می‌شوند (این فایل %s است).", format)
	}
	payload, _ := json.Marshal(map[string]any{"model": model, "temperature": 0, "messages": []any{map[string]any{"role": "user", "content": []any{
		map[string]any{"type": "text", "text": "این یک مکالمهٔ تلفنی فارسی بین کارمند شرکت و مشتری است. عین گفتگو را بنویس، هر جمله در یک خط و با شروع «کارمند:» یا «مشتری:». چیزی از خودت اضافه نکن. اگر گفتاری شنیده نمی‌شود فقط بنویس: گفتاری شنیده نشد."},
		map[string]any{"type": "input_audio", "input_audio": map[string]any{"data": base64.StdEncoding.EncodeToString(data), "format": format}},
	}}}})
	req2, _ := http.NewRequestWithContext(ctx, http.MethodPost, aiBaseURL+"/chat/completions", bytes.NewReader(payload))
	req2.Header.Set("Content-Type", "application/json")
	req2.Header.Set("Authorization", "Bearer "+key)
	resp2, err := (&http.Client{Timeout: 4 * time.Minute}).Do(req2)
	if err != nil {
		return "", fmt.Errorf("اتصال به سرویس هوش مصنوعی انجام نشد.")
	}
	defer resp2.Body.Close()
	raw2, _ := io.ReadAll(io.LimitReader(resp2.Body, 4<<20))
	if resp2.StatusCode == http.StatusUnauthorized || resp2.StatusCode == http.StatusForbidden {
		return "", fmt.Errorf("کلید API پذیرفته نشد (پاسخ %d).", resp2.StatusCode)
	}
	if resp2.StatusCode != http.StatusOK {
		return "", fmt.Errorf("مدل «%s» صدا را نپذیرفت (پاسخ %d). نام مدلی را که ورودی صدا دارد در «نام مدل تبدیل صدا» بنویسید.", model, resp2.StatusCode)
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw2, &out) != nil || len(out.Choices) == 0 || strings.TrimSpace(out.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("پاسخ سرویس قابل خواندن نبود.")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func saveTranscript(id, status, text, errMsg, model string) {
	_, _ = store.Pool.Exec(context.Background(),
		`INSERT INTO voip_transcripts (call_id, status, text, error, model, updated_at) VALUES ($1,$2,$3,$4,$5,now())
		 ON CONFLICT (call_id) DO UPDATE SET status=$2, text=$3, error=$4, model=$5, updated_at=now()`, id, status, text, errMsg, model)
}

// POST /api/voip/transcribe/{id}: starts the conversion (runs in the background; the page asks for the result)
func voipTranscribe(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	id := r.PathValue("id")
	if !canHearCall(r, me, id) {
		httpx.Forbidden(w)
		return
	}
	p := recordingFile(id)
	if p == "" {
		httpx.Error(w, http.StatusNotFound, "برای این تماس فایل ضبط‌شده‌ای پیدا نشد.")
		return
	}
	s := supportSettings(r.Context())
	key := jsonx.Str(s, "aiKey")
	if key == "" {
		httpx.Error(w, http.StatusBadRequest, "کلید هوش مصنوعی هنوز ذخیره نشده است. مدیر سیستم آن را در پنل ادمین، تنظیمات پشتیبانی، بخش «پاسخ هوشمند» می‌گذارد.")
		return
	}
	if _, busy := transcribing.LoadOrStore(id, true); busy {
		httpx.JSON(w, http.StatusOK, map[string]any{"status": "running"})
		return
	}
	saveTranscript(id, "running", "", "", sttModel(s))
	go func() {
		defer transcribing.Delete(id)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		text, err := transcribeFile(ctx, key, s, p)
		if err != nil {
			saveTranscript(id, "error", "", err.Error(), sttModel(s))
			return
		}
		saveTranscript(id, "done", text, "", sttModel(s))
	}()
	httpx.JSON(w, http.StatusOK, map[string]any{"status": "running"})
}

// GET /api/voip/transcript/{id}
func voipTranscript(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !canHearCall(r, auth.Current(r), id) {
		httpx.Forbidden(w)
		return
	}
	var status, text, errMsg string
	if store.Pool.QueryRow(r.Context(), `SELECT status, text, error FROM voip_transcripts WHERE call_id = $1`, id).Scan(&status, &text, &errMsg) != nil {
		httpx.JSON(w, http.StatusOK, map[string]any{"status": "none"})
		return
	}
	if status == "running" {
		if _, busy := transcribing.Load(id); !busy { // the server restarted in between
			status, errMsg = "error", "تبدیل نیمه‌کاره ماند. دوباره بزنید."
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"status": status, "text": text, "error": errMsg})
}

// transcribedSet tells which of the calls already have their text
func transcribedSet(ctx context.Context, ids []string) map[string]bool {
	out := map[string]bool{}
	if len(ids) == 0 {
		return out
	}
	rows, err := store.Pool.Query(ctx, `SELECT call_id FROM voip_transcripts WHERE status = 'done' AND call_id = ANY($1)`, ids)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			out[id] = true
		}
	}
	return out
}

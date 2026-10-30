package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// The voice of a meeting turned into text, so that the minutes can be written from what was said. The page cuts a long recording into
// pieces of a few minutes (wav or mp3) and sends them one after the other; each piece is converted in the background (a proxy does not
// wait minutes for one answer) and the page asks for its text. Nothing is kept on the disk and the jobs are forgotten after an hour.

const meetingPrompt = "این ضبط صدای یک جلسهٔ کاری فارسی در یک شرکت است. همهٔ حرف‌ها را به همان ترتیب و عیناً بنویس. اگر چند گوینده قابل تشخیص‌اند، هر تغییر گوینده را در یک خط تازه و با «گوینده ۱:»، «گوینده ۲:» و … نشان بده. اعداد و نام‌ها را همان‌طور که شنیده می‌شود بنویس و چیزی از خودت اضافه یا خلاصه نکن. اگر گفتاری شنیده نمی‌شود فقط بنویس: گفتاری شنیده نشد."

type minutesVoiceJob struct {
	user   string
	status string // running | done | error
	text   string
	err    string
	at     time.Time
}

var (
	minutesVoiceMu   sync.Mutex
	minutesVoiceJobs = map[string]*minutesVoiceJob{}
)

func minutesVoiceSweep() {
	for id, j := range minutesVoiceJobs {
		if time.Since(j.at) > time.Hour {
			delete(minutesVoiceJobs, id)
		}
	}
}

// POST /api/minutes/transcribe?ext=wav|mp3   (the audio is the body)
func minutesTranscribeStart(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !minutesAllowed(me) {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, me, "ai.minutes") {
		return
	}
	ext := strings.ToLower(r.URL.Query().Get("ext"))
	if ext != "wav" && ext != "mp3" {
		httpx.Error(w, http.StatusBadRequest, "فقط فایل wav و mp3 به متن تبدیل می‌شود.")
		return
	}
	s := supportSettings(r.Context())
	key := jsonx.Str(s, "aiKey")
	if key == "" {
		httpx.Error(w, http.StatusBadRequest, "کلید هوش مصنوعی هنوز ذخیره نشده است. مدیر سیستم آن را در تنظیمات سیستم، بخش «هوش مصنوعی» می‌گذارد.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxTranscribeBytes+1)
	data, err := io.ReadAll(r.Body)
	if err != nil || len(data) == 0 || len(data) > maxTranscribeBytes {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "هر تکه صدا باید کمتر از ۲۴ مگابایت باشد.")
		return
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	id := hex.EncodeToString(b[:])
	job := &minutesVoiceJob{user: me.ID(), status: "running", at: time.Now()}
	minutesVoiceMu.Lock()
	minutesVoiceSweep()
	minutesVoiceJobs[id] = job
	minutesVoiceMu.Unlock()
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		text, err := transcribeBytes(ctx, key, s, "."+ext, data, meetingPrompt)
		minutesVoiceMu.Lock()
		defer minutesVoiceMu.Unlock()
		job.at = time.Now()
		if err != nil {
			job.status, job.err = "error", err.Error()
			return
		}
		job.status, job.text = "done", text
	}()
	httpx.JSON(w, http.StatusOK, map[string]any{"id": id})
}

// GET /api/minutes/transcribe/{id}
func minutesTranscribeGet(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	minutesVoiceMu.Lock()
	j, ok := minutesVoiceJobs[r.PathValue("id")]
	var out map[string]any
	if ok && j.user == me.ID() {
		out = map[string]any{"status": j.status, "text": j.text, "error": j.err}
	}
	minutesVoiceMu.Unlock()
	if out == nil {
		httpx.Error(w, http.StatusNotFound, "این تبدیل پیدا نشد (شاید سرور دوباره راه افتاده)؛ دوباره بفرستید.")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

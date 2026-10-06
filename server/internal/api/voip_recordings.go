package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Call recordings. The phone system (Issabel / Asterisk) records the calls on its own disk; this program only plays them.
// A recording reaches here in one of two ways:
//   - the PBX's folder with the recordings is mounted into the container (VOIP_RECORDINGS_DIR, default /recordings, read-only),
//     and a file is matched to a call by the call's id (the Asterisk linked id, e.g. 1759660000.123) found in its file name;
//   - the PBX pushes each file with  curl -T file https://<server>/api/voip/recordings/<call id>?ext=wav  and the secret key.
// Who may listen: the people who took part in the call, everybody who may see the customer's calls (CRM), and the admins.

func recordingsDir() string {
	if d := os.Getenv("VOIP_RECORDINGS_DIR"); d != "" {
		return d
	}
	return "/recordings"
}

func uploadedDir() string { return filepath.Join(filesDir(), "voip") }

var idToken = regexp.MustCompile(`\d{9,11}\.\d+`)
var safeCallID = regexp.MustCompile(`^[0-9A-Za-z._-]{3,64}$`)
var audioExt = map[string]string{".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4", ".webm": "audio/webm", ".gsm": "audio/x-gsm"}

// the mounted folder is scanned at most once a minute and remembered as «call id → file»
var (
	recMu    sync.Mutex
	recIndex map[string]string
	recAt    time.Time
)

func mountedIndex() map[string]string {
	recMu.Lock()
	defer recMu.Unlock()
	if recIndex != nil && time.Since(recAt) < time.Minute {
		return recIndex
	}
	idx := map[string]string{}
	root := recordingsDir()
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			// the PBX keeps files in year/month/day folders: do not go deeper than that
			if rel, e := filepath.Rel(root, p); e == nil && strings.Count(rel, string(filepath.Separator)) > 4 {
				return filepath.SkipDir
			}
			return nil
		}
		if _, ok := audioExt[strings.ToLower(filepath.Ext(p))]; !ok {
			return nil
		}
		for _, tok := range idToken.FindAllString(filepath.Base(p), -1) {
			if _, exists := idx[tok]; !exists {
				idx[tok] = p
			}
		}
		return nil
	})
	recIndex, recAt = idx, time.Now()
	return idx
}

// recordingFile returns the file of a call's recording, or "".
func recordingFile(id string) string {
	if !safeCallID.MatchString(id) {
		return ""
	}
	if m, _ := filepath.Glob(filepath.Join(uploadedDir(), id+".*")); len(m) > 0 {
		return m[0]
	}
	if p, ok := mountedIndex()[id]; ok {
		return p
	}
	return ""
}

func recordingKeyFile() string { return filepath.Join(uploadedDir(), ".key") }

// recordingKey is the secret the PBX uses to push files; made once.
func recordingKey() string {
	// the installer panel can hand the key over in the environment (VOIP_RECORDING_KEY), so nobody has to copy it by hand
	if k := strings.TrimSpace(os.Getenv("VOIP_RECORDING_KEY")); len(k) >= 16 {
		return k
	}
	if b, err := os.ReadFile(recordingKeyFile()); err == nil && len(strings.TrimSpace(string(b))) >= 16 {
		return strings.TrimSpace(string(b))
	}
	_ = os.MkdirAll(uploadedDir(), 0o750)
	raw := make([]byte, 24)
	_, _ = rand.Read(raw)
	k := hex.EncodeToString(raw)
	_ = os.WriteFile(recordingKeyFile(), []byte(k), 0o600)
	return k
}

// voipRecordingSetup tells the admins how to connect the PBX (the key is shown to admins only).
func voipRecordingSetup(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	n := len(mountedIndex())
	httpx.JSON(w, http.StatusOK, map[string]any{"key": recordingKey(), "mountedDir": recordingsDir(), "mountedFiles": n})
}

// voipRecordingUpload: PUT or POST /api/voip/recordings/{id}?ext=wav with the audio as the body; authorised by the secret key.
func voipRecordingUpload(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	key := r.Header.Get("X-Recording-Key")
	if key == "" {
		key = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}
	if !safeCallID.MatchString(id) || subtle.ConstantTimeCompare([]byte(key), []byte(recordingKey())) != 1 {
		httpx.Forbidden(w)
		return
	}
	ext := "." + strings.TrimPrefix(strings.ToLower(r.URL.Query().Get("ext")), ".")
	if _, ok := audioExt[ext]; !ok {
		ext = ".wav"
	}
	if err := os.MkdirAll(uploadedDir(), 0o750); err != nil {
		httpx.Error(w, http.StatusServiceUnavailable, "پوشهٔ ذخیره در دسترس نیست.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512<<20)
	tmp := filepath.Join(uploadedDir(), id+ext+".part")
	f, err := os.Create(tmp)
	if err != nil {
		internalError(w)
		return
	}
	n, err := io.Copy(f, r.Body)
	f.Close()
	if err != nil || n < 100 {
		os.Remove(tmp)
		httpx.Error(w, http.StatusBadRequest, "فایل کامل دریافت نشد.")
		return
	}
	if err := os.Rename(tmp, filepath.Join(uploadedDir(), id+ext)); err != nil {
		os.Remove(tmp)
		internalError(w)
		return
	}
	httpx.OK(w)
}

// canHearCall: the people in the call, everybody who may see the customer's calls (CRM), and the admins.
func canHearCall(r *http.Request, me auth.User, id string) bool {
	if me.IsAdmin() {
		return true
	}
	var uid, cid string
	var exts []string
	if err := store.Pool.QueryRow(r.Context(), `SELECT user_id, customer_id, exts FROM voip_calls WHERE id = $1`, id).Scan(&uid, &cid, &exts); err != nil {
		return false
	}
	if uid == me.ID() {
		return true
	}
	if ext := jsonx.Str(me.M, "extension"); ext != "" && jsonx.Contains(exts, ext) {
		return true
	}
	return cid != "" && me.CanUseCrm()
}

// voipRecording: GET /api/voip/recording/{id}
func voipRecording(w http.ResponseWriter, r *http.Request) {
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
	f, err := os.Open(p)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل ضبط‌شده در دسترس نیست.")
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	ct := audioExt[strings.ToLower(filepath.Ext(p))]
	if ct == "" {
		ct = "application/octet-stream"
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeContent(w, r, "", st.ModTime(), f)
}

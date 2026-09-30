package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/config"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/sse"
	"automation/server/internal/store"
)

// ---------- P2P signalling ----------
// Files never touch the server: browsers exchange them directly over WebRTC. The server only relays the
// small connection-setup messages (SDP / ICE) between two signed-in users.

var signalHub = sse.NewHub()

func signalStream(w http.ResponseWriter, r *http.Request) {
	signalHub.Serve(w, r, auth.Current(r).ID(), ": ping\n\n", 25*time.Second)
}

func signalSend(w http.ResponseWriter, r *http.Request) {
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	to := jsonx.Str(body, "to")
	msg, isObject := body["msg"].(map[string]any)
	if to == "" || !isObject {
		httpx.Error(w, http.StatusBadRequest, "bad request")
		return
	}
	msg["from"] = auth.Current(r).ID()
	payload, _ := json.Marshal(msg)
	if len(payload) > 64*1024 {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "message too large")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]int{"delivered": signalHub.Publish(to, payload)})
}

// ---------- config and health ----------

// iceConfig gives the browsers the ICE servers for direct file transfer (set ICE_SERVERS to add a TURN server).
func iceConfig(cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		ice := any([]map[string]string{{"urls": "stun:stun.l.google.com:19302"}})
		if cfg.IceServers != "" {
			var parsed any
			if err := json.Unmarshal([]byte(cfg.IceServers), &parsed); err == nil {
				ice = parsed
			} else {
				log.Println("ICE_SERVERS is not valid JSON; using default STUN server")
			}
		}
		httpx.JSON(w, http.StatusOK, map[string]any{"iceServers": ice})
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	if err := store.Pool.Ping(r.Context()); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// ---------- the built frontend (single-page app) ----------

// frontend serves files from dir; any other path gets index.html so the app's own router can handle it.
func frontend(dir string) http.Handler {
	index := filepath.Join(dir, "index.html")
	if _, err := os.Stat(index); err != nil {
		return http.NotFoundHandler()
	}
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := filepath.Join(dir, filepath.FromSlash(strings.TrimPrefix(filepath.ToSlash(filepath.Clean("/"+r.URL.Path)), "/")))
		if st, err := os.Stat(clean); err == nil && !st.IsDir() {
			if strings.HasSuffix(clean, "sw.js") {
				w.Header().Set("Cache-Control", "no-cache")
			}
			files.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFile(w, r, index)
	})
}

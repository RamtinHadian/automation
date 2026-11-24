package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"automation/server/internal/workflow"
)

//go:embed studio.html
var studioHTML []byte

//go:embed fonts/*.woff2
var studioFonts embed.FS

// studio: «ساز گردشکار» — a page on this computer where a workflow is built with forms and pickers (no JSON to write); it checks the file, signs it with our key
// and can put it on the local demo and switch it on. Only this computer can reach it (127.0.0.1).
func studio(args []string) {
	var port, dir, demo string
	port, dir, demo = "8099", defaultDir(), "http://localhost:8095"
	for i := 0; i+1 < len(args); i += 2 {
		switch args[i] {
		case "-port":
			port = args[i+1]
		case "-dir":
			dir = args[i+1]
		case "-demo":
			demo = args[i+1]
		}
	}
	_ = os.MkdirAll(dir, 0o755)
	keyPath := defaultKey()
	mux := http.NewServeMux()
	local := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			host, _, _ := net.SplitHostPort(r.Host)
			if host != "127.0.0.1" && host != "localhost" { // no other computer, no DNS tricks
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			h(w, r)
		}
	}
	reply := func(w http.ResponseWriter, code int, v any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(v)
	}
	body := func(r *http.Request) (map[string]any, []byte) {
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		var m map[string]any
		_ = json.Unmarshal(raw, &m)
		return m, raw
	}
	mux.HandleFunc("/", local(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(studioHTML)
	}))
	mux.HandleFunc("/fonts/", local(func(w http.ResponseWriter, r *http.Request) {
		b, err := studioFonts.ReadFile("fonts/" + filepath.Base(r.URL.Path))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "font/woff2")
		w.Header().Set("Cache-Control", "max-age=86400")
		_, _ = w.Write(b)
	}))
	mux.HandleFunc("/api/info", local(func(w http.ResponseWriter, r *http.Request) {
		_, err := os.Stat(keyPath)
		reply(w, 200, map[string]any{"dir": dir, "demo": demo, "keyOk": err == nil, "keyPath": keyPath})
	}))
	// the package from the page → is it complete and right?
	mux.HandleFunc("/api/check", local(func(w http.ResponseWriter, r *http.Request) {
		_, raw := body(r)
		p, err := workflow.Parse(raw)
		if err != nil {
			reply(w, 200, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		reply(w, 200, map[string]any{"ok": true, "steps": len(p.Steps)})
	}))
	// save the file (and sign it)
	mux.HandleFunc("/api/save", local(func(w http.ResponseWriter, r *http.Request) {
		m, _ := body(r)
		pk, _ := json.Marshal(m["package"])
		p, err := workflow.Parse(pk)
		if err != nil {
			reply(w, 200, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		name := fmt.Sprintf("%s-v%d", p.ID, p.Version)
		pretty, _ := json.MarshalIndent(m["package"], "", "  ")
		if err := os.WriteFile(filepath.Join(dir, name+".json"), pretty, 0o644); err != nil {
			reply(w, 200, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		out := map[string]any{"ok": true, "file": filepath.Join(dir, name+".json")}
		if m["sign"] == true {
			if _, err := os.Stat(keyPath); err != nil {
				reply(w, 200, map[string]any{"ok": false, "error": "کلید امضا پیدا نشد (" + keyPath + "). یک بار «go run ./cmd/wfpack keygen» را بزنید."})
				return
			}
			signed, err := workflow.Sign(pretty, keyID, loadKey(keyPath))
			if err != nil {
				reply(w, 200, map[string]any{"ok": false, "error": err.Error()})
				return
			}
			sp := filepath.Join(dir, name+".signed.json")
			_ = os.WriteFile(sp, signed, 0o644)
			out["signedFile"], out["signedName"], out["signedText"] = sp, name+".signed.json", string(signed)
		}
		reply(w, 200, out)
	}))
	mux.HandleFunc("/api/list", local(func(w http.ResponseWriter, r *http.Request) {
		var names []string
		ents, _ := os.ReadDir(dir)
		for _, e := range ents {
			if strings.HasSuffix(e.Name(), ".json") && !strings.HasSuffix(e.Name(), ".signed.json") {
				names = append(names, e.Name())
			}
		}
		sort.Strings(names)
		reply(w, 200, names)
	}))
	mux.HandleFunc("/api/load", local(func(w http.ResponseWriter, r *http.Request) {
		n := filepath.Base(r.URL.Query().Get("name"))
		b, err := os.ReadFile(filepath.Join(dir, n))
		if err != nil {
			http.Error(w, "not found", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write(b)
	}))
	// put the signed file on the local demo (as its administrator) and switch it on
	mux.HandleFunc("/api/demo", local(func(w http.ResponseWriter, r *http.Request) {
		m, _ := body(r)
		text, _ := m["signedText"].(string)
		if text == "" {
			reply(w, 200, map[string]any{"ok": false, "error": "اول «ساخت و امضا» را بزنید."})
			return
		}
		msg, err := uploadToDemo(demo, text)
		if err != nil {
			reply(w, 200, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		reply(w, 200, map[string]any{"ok": true, "message": msg, "demo": demo})
	}))

	ln, err := net.Listen("tcp", "127.0.0.1:"+port)
	if err != nil {
		die("پورت %s پر است؛ با «-port 8100» پورت دیگری بدهید: %v", port, err)
	}
	url := "http://127.0.0.1:" + port + "/"
	fmt.Println("ساز گردشکار باز شد:", url)
	fmt.Println("فایل‌ها در:", dir)
	fmt.Println("(برای بستن، این پنجره را ببندید یا Ctrl+C بزنید)")
	go func() {
		time.Sleep(600 * time.Millisecond)
		if runtime.GOOS == "windows" {
			_ = exec.Command("cmd", "/c", "start", "", url).Start()
		} else if runtime.GOOS == "darwin" {
			_ = exec.Command("open", url).Start()
		} else {
			_ = exec.Command("xdg-open", url).Start()
		}
	}()
	_ = http.Serve(ln, mux)
}

func defaultDir() string {
	h, _ := os.UserHomeDir()
	return filepath.Join(h, "Documents", "Hoormand-Workflows")
}

// uploadToDemo signs in to the local demo as its administrator (demo / demo), uploads the signed file and switches it on.
func uploadToDemo(base, text string) (string, error) {
	c := &http.Client{Timeout: 20 * time.Second}
	post := func(path, token string, v any) (int, []byte, error) {
		b, _ := json.Marshal(v)
		req, _ := http.NewRequest("POST", base+path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		resp, err := c.Do(req)
		if err != nil {
			return 0, nil, fmt.Errorf("به دمو (%s) وصل نشدم؛ دموی لوکال روشن است؟", base)
		}
		defer resp.Body.Close()
		raw, _ := io.ReadAll(resp.Body)
		return resp.StatusCode, raw, nil
	}
	code, raw, err := post("/api/auth/login", "", map[string]string{"identifier": "demo", "password": "demo"})
	if err != nil {
		return "", err
	}
	var lg struct{ Token string }
	_ = json.Unmarshal(raw, &lg)
	if code != 200 || lg.Token == "" {
		return "", fmt.Errorf("ورود به دمو (demo / demo) انجام نشد")
	}
	code, raw, err = post("/api/workflow/packages", lg.Token, map[string]string{"file": text})
	if err != nil {
		return "", err
	}
	var up struct {
		Error   string
		ID      string
		Version int
		Name    string
	}
	_ = json.Unmarshal(raw, &up)
	if code == 409 { // the same version is already there: switch it on anyway
		var p struct {
			ID      string `json:"id"`
			Version int    `json:"version"`
		}
		_ = json.Unmarshal([]byte(text), &p)
		up.ID, up.Version = p.ID, p.Version
	} else if code != 200 {
		return "", fmt.Errorf("دمو فایل را نپذیرفت: %s", up.Error)
	}
	code, _, err = post(fmt.Sprintf("/api/workflow/packages/%s/%d/enable", up.ID, up.Version), lg.Token, map[string]bool{"enabled": true})
	if err != nil || code != 200 {
		return "", fmt.Errorf("بارگذاری شد ولی روشن نشد")
	}
	return "در دمو بارگذاری و روشن شد. حالا با یک کاربر عادی (مثلاً peyman@demo.local / demo) در «امور اداری ← گردشکارها» امتحانش کنید.", nil
}

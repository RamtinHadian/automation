package main

import (
	"crypto/ed25519"
	"crypto/rand"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"automation/server/internal/license"
)

//go:embed portal.html
var portalHTML string

//go:embed vazirmatn.woff2
var portalFont []byte

// The vendor portal runs only on the vendor's own computer (127.0.0.1): it signs activation codes with the private key and keeps a
// history of what was issued. Nothing here is ever deployed to a customer or to a public server.

type issued struct {
	Serial   string `json:"serial"`
	Customer string `json:"customer"`
	FP       string `json:"fp"`
	Issued   int64  `json:"issued"`
	Expires  int64  `json:"expires"`
	Users    int    `json:"users"`
	Note     string `json:"note"`
	Code     string `json:"code"`
}

var fpRe = regexp.MustCompile(`^[0-9A-F]{4}(-[0-9A-F]{4}){4}$`)

func serve(args []string) {
	fs := flagSet("serve")
	key := fs.String("key", "", "private key file")
	data := fs.String("data", "", "history file (default: next to the key)")
	port := fs.Int("port", 8765, "local port")
	noOpen := fs.Bool("no-open", false, "do not open the browser")
	_ = fs.Parse(args)
	if *key == "" {
		die("-key <private key file> is required")
	}
	raw, err := os.ReadFile(*key)
	if err != nil {
		die("cannot read the private key: " + err.Error())
	}
	kb, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(kb) != ed25519.PrivateKeySize {
		die("the private key file is damaged")
	}
	priv := ed25519.PrivateKey(kb)
	history := *data
	if history == "" {
		history = filepath.Join(filepath.Dir(*key), "issued-licenses.json")
	}

	tb := make([]byte, 16)
	_, _ = rand.Read(tb)
	token := hex.EncodeToString(tb)
	var mu sync.Mutex

	load := func() []issued {
		var l []issued
		if b, err := os.ReadFile(history); err == nil {
			_ = json.Unmarshal(b, &l)
		}
		return l
	}
	save := func(l []issued) error {
		b, _ := json.MarshalIndent(l, "", "  ")
		return os.WriteFile(history, b, 0o600)
	}
	host := fmt.Sprintf("127.0.0.1:%d", *port)
	guard := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			// only this computer, only this page (a web site opened in the browser must not be able to call the portal)
			if r.Host != host && r.Host != fmt.Sprintf("localhost:%d", *port) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			if r.Header.Get("X-Token") != token {
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

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || (r.Host != host && r.Host != fmt.Sprintf("localhost:%d", *port)) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write([]byte(strings.Replace(portalHTML, "{{TOKEN}}", token, 1)))
	})
	mux.HandleFunc("/vazirmatn.woff2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "font/woff2")
		w.Header().Set("Cache-Control", "max-age=86400")
		_, _ = w.Write(portalFont)
	})
	mux.HandleFunc("/api/list", guard(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		l := load()
		if l == nil {
			l = []issued{}
		}
		reply(w, 200, l)
	}))
	mux.HandleFunc("/api/issue", guard(func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Customer string  `json:"customer"`
			FP       string  `json:"fp"`
			Days     float64 `json:"days"`
			Forever  bool    `json:"forever"`
			Users    int     `json:"users"`
			Note     string  `json:"note"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in) != nil {
			reply(w, 400, map[string]string{"error": "درخواست نامعتبر است."})
			return
		}
		in.Customer = strings.TrimSpace(in.Customer)
		fp := asciiDigits(strings.ToUpper(strings.TrimSpace(in.FP)))
		switch {
		case in.Customer == "":
			reply(w, 400, map[string]string{"error": "نام مشتری را بنویسید."})
			return
		case !fpRe.MatchString(fp):
			reply(w, 400, map[string]string{"error": "کد نصب باید مثل 1A2B-3C4D-5E6F-7A8B-9C0D باشد."})
			return
		case !in.Forever && (in.Days <= 0 || in.Days > 3660):
			reply(w, 400, map[string]string{"error": "مدت اعتبار نامعتبر است."})
			return
		case in.Users < 0 || in.Users > 100000:
			reply(w, 400, map[string]string{"error": "تعداد کاربر نامعتبر است."})
			return
		}
		now := time.Now()
		l := license.License{Serial: now.Format("060102-150405"), Customer: in.Customer, FP: fp, Issued: now.Unix(), Expires: now.Add(time.Duration(in.Days * 24 * float64(time.Hour))).Unix(), MaxUsers: in.Users}
		if in.Forever {
			l.Expires = 0
		}
		code := license.Encode(priv, l)
		rec := issued{Serial: l.Serial, Customer: l.Customer, FP: l.FP, Issued: l.Issued, Expires: l.Expires, Users: l.MaxUsers, Note: strings.TrimSpace(in.Note), Code: code}
		mu.Lock()
		defer mu.Unlock()
		if err := save(append([]issued{rec}, load()...)); err != nil {
			reply(w, 500, map[string]string{"error": "ذخیرهٔ تاریخچه ممکن نشد: " + err.Error()})
			return
		}
		reply(w, 200, rec)
	}))
	mux.HandleFunc("/api/show", guard(func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			Code string `json:"code"`
		}
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&in)
		l, err := license.Decode(in.Code)
		if err != nil {
			reply(w, 400, map[string]string{"error": err.Error()})
			return
		}
		reply(w, 200, issued{Serial: l.Serial, Customer: l.Customer, FP: l.FP, Issued: l.Issued, Expires: l.Expires, Users: l.MaxUsers, Code: in.Code})
	}))

	ln, err := net.Listen("tcp", host)
	if err != nil {
		die("cannot listen on " + host + ": " + err.Error() + " (is the portal already open? try -port 8766)")
	}
	url := "http://" + host + "/"
	fmt.Println("پورتال صدور مجوز آماده است:", url)
	fmt.Println("(این پنجره را باز نگه دارید؛ برای بستن پورتال، پنجره را ببندید یا Ctrl+C بزنید)")
	if !*noOpen {
		openBrowser(url)
	}
	die(http.Serve(ln, mux).Error())
}

func openBrowser(url string) {
	switch runtime.GOOS {
	case "windows":
		_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		_ = exec.Command("open", url).Start()
	default:
		_ = exec.Command("xdg-open", url).Start()
	}
}

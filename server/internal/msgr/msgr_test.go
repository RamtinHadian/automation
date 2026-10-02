package msgr

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func useConfig(c Config) {
	mu.Lock()
	cached, cachedAt = c, time.Now()
	mu.Unlock()
}

func TestSendFileLooksLikeTelegram(t *testing.T) {
	var path, ctype, chat, caption, fname string
	var size int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, ctype = r.URL.Path, r.Header.Get("Content-Type")
		if err := r.ParseMultipartForm(1 << 20); err == nil {
			chat, caption = r.FormValue("chat_id"), r.FormValue("caption")
			f, h, _ := r.FormFile("document")
			if f != nil {
				b, _ := io.ReadAll(f)
				size, fname = len(b), h.Filename
			}
		}
		w.Write([]byte(`{"ok":true,"result":{"message_id":1}}`))
	}))
	defer srv.Close()
	bases["telegram"], bases["bale"] = srv.URL, srv.URL
	useConfig(Config{Telegram: Bot{Enabled: true, Token: "TT:123"}, Bale: Bot{Enabled: true, Token: "BB:456"}})
	for ch, want := range map[string]string{"telegram": "/botTT:123/sendDocument", "bale": "/botBB:456/sendDocument"} {
		if err := SendFile(context.Background(), ch, "5551234", "پیش‌فاکتور", "PF-1405-0001.pdf", []byte("%PDF-1.4 fake")); err != nil {
			t.Fatalf("%s: %v", ch, err)
		}
		if path != want || !strings.HasPrefix(ctype, "multipart/form-data") || chat != "5551234" || caption != "پیش‌فاکتور" || fname != "PF-1405-0001.pdf" || size != 13 {
			t.Fatalf("%s: path=%s type=%s chat=%s caption=%s file=%s size=%d", ch, path, ctype, chat, caption, fname, size)
		}
	}
}

func TestErrorsAreReadable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(400)
		w.Write([]byte(`{"ok":false,"error_code":400,"description":"Bad Request: chat not found"}`))
	}))
	defer srv.Close()
	bases["telegram"] = srv.URL
	useConfig(Config{Telegram: Bot{Enabled: true, Token: "T"}})
	err := SendText(context.Background(), "telegram", "1", "x")
	if err == nil || !strings.Contains(err.Error(), "chat not found") || !strings.Contains(err.Error(), "تلگرام") {
		t.Fatalf("got %v", err)
	}
	useConfig(Config{})
	if err := SendText(context.Background(), "bale", "1", "x"); err == nil || !strings.Contains(err.Error(), "فعال نشده") {
		t.Fatalf("disabled bot should say so, got %v", err)
	}
}

func TestUnreachableTelegramMentionsTheProxy(t *testing.T) {
	bases["telegram"] = "http://127.0.0.1:1"
	useConfig(Config{Telegram: Bot{Enabled: true, Token: "T"}})
	err := SendText(context.Background(), "telegram", "1", "x")
	if err == nil || !strings.Contains(err.Error(), "پروکسی") {
		t.Fatalf("got %v", err)
	}
}

func TestLink(t *testing.T) {
	c := Config{Telegram: Bot{Enabled: true, Token: "T", Username: "hoormand_bot"}, Bale: Bot{Enabled: true, Token: "B", Username: "hoormand"}}
	if got := Link(c, "telegram", "cu-abc"); got != "https://t.me/hoormand_bot?start=cust_cu-abc" {
		t.Fatal(got)
	}
	if got := Link(c, "bale", "cu-abc"); got != "https://ble.ir/hoormand?start=cust_cu-abc" {
		t.Fatal(got)
	}
	if Link(Config{}, "bale", "x") != "" {
		t.Fatal("no link without a bot")
	}
}

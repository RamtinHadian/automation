package sms

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMobile(t *testing.T) {
	for in, want := range map[string]string{
		"09121234567": "09121234567", "۰۹۱۲۱۲۳۴۵۶۷": "09121234567", "+98 912 123 4567": "09121234567",
		"9121234567": "09121234567", "0098-912-123-4567": "09121234567", "0912-123-45-67": "09121234567",
	} {
		if got, ok := Mobile(in); !ok || got != want {
			t.Errorf("Mobile(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
	for _, bad := range []string{"", "021123456", "0912123", "abc", "08121234567"} {
		if _, ok := Mobile(bad); ok {
			t.Errorf("Mobile(%q) should be invalid", bad)
		}
	}
}

func TestSmsIrRequest(t *testing.T) {
	var gotKey, gotPath string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey, gotPath = r.Header.Get("X-API-KEY"), r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &body)
		w.Write([]byte(`{"status":1,"message":"موفق","data":{"packId":"x","messageIds":[111,222],"cost":1}}`))
	}))
	defer srv.Close()
	smsirBase = srv.URL + "/v1"
	ids, err := Send(context.Background(), Config{Provider: "smsir", APIKey: "KEY", Sender: "3000"}, []string{"09121234567"}, "سلام")
	if err != nil || len(ids) != 2 || ids[0] != "111" {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
	if gotKey != "KEY" || gotPath != "/v1/send/bulk" || body["messageText"] != "سلام" || body["lineNumber"] != float64(3000) {
		t.Fatalf("bad request: key=%q path=%q body=%v", gotKey, gotPath, body)
	}
	if m := body["mobiles"].([]any); m[0] != "9121234567" {
		t.Fatalf("sms.ir wants the number without the leading zero, got %v", m)
	}
}

func TestSmsIrError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":104,"message":"اعتبار کافی نیست","data":null}`))
	}))
	defer srv.Close()
	smsirBase = srv.URL
	if _, err := Send(context.Background(), Config{Provider: "smsir", APIKey: "K"}, []string{"09121234567"}, "x"); err == nil || !strings.Contains(err.Error(), "اعتبار") {
		t.Fatalf("expected the panel's message, got %v", err)
	}
}

func TestKavenegarRequest(t *testing.T) {
	var path, q string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, q = r.URL.Path, r.URL.RawQuery
		w.Write([]byte(`{"return":{"status":200,"message":"تایید شد"},"entries":[{"messageid":8792343}]}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	ids, err := Send(context.Background(), Config{Provider: "kavenegar", APIKey: "ABC123", Sender: "10004346"}, []string{"09121234567", "09351112233"}, "تست")
	if err != nil || len(ids) != 1 || ids[0] != "8792343" {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
	if path != "/v1/ABC123/sms/send.json" || !strings.Contains(q, "receptor=09121234567%2C09351112233") || !strings.Contains(q, "sender=10004346") {
		t.Fatalf("bad request: %s ? %s", path, q)
	}
}

func TestKavenegarError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(412)
		w.Write([]byte(`{"return":{"status":412,"message":"ارسال کننده نامعتبر است"}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL
	if _, err := Send(context.Background(), Config{Provider: "kavenegar", APIKey: "K"}, []string{"09121234567"}, "x"); err == nil || !strings.Contains(err.Error(), "نامعتبر") {
		t.Fatalf("expected the panel's message, got %v", err)
	}
}

func TestBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/credit") {
			w.Write([]byte(`{"status":1,"message":"موفق","data":250}`))
			return
		}
		w.Write([]byte(`{"return":{"status":200,"message":"ok"},"entries":{"remaincredit":1500000}}`))
	}))
	defer srv.Close()
	smsirBase, kavenegarBase = srv.URL+"/v1", srv.URL+"/v1"
	if s, err := Balance(context.Background(), Config{Provider: "smsir", APIKey: "K"}); err != nil || s != "250 پیامک" {
		t.Fatalf("smsir balance %q %v", s, err)
	}
	if s, err := Balance(context.Background(), Config{Provider: "kavenegar", APIKey: "K"}); err != nil || s != "1500000 ریال" {
		t.Fatalf("kavenegar balance %q %v", s, err)
	}
}

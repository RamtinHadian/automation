package sms

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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

func TestFooterIsAppended(t *testing.T) {
	var q string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q = r.URL.Query().Get("message")
		w.Write([]byte(`{"return":{"status":200,"message":"ok"},"entries":[{"messageid":1}]}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	if _, err := Send(context.Background(), Config{Provider: "kavenegar", APIKey: "K", Footer: "www.hoormand.ir"}, []string{"09121234567"}, "سلام"); err != nil {
		t.Fatal(err)
	}
	if q != "سلام\nwww.hoormand.ir" {
		t.Fatalf("the footer must be the last line, got %q", q)
	}
	// a text that already ends with the footer is not given a second one
	if _, err := Send(context.Background(), Config{Provider: "kavenegar", APIKey: "K", Footer: "www.hoormand.ir"}, []string{"09121234567"}, "سلام\nwww.hoormand.ir"); err != nil {
		t.Fatal(err)
	}
	if q != "سلام\nwww.hoormand.ir" {
		t.Fatalf("no double footer, got %q", q)
	}
}

func TestBalance(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"return":{"status":200,"message":"ok"},"entries":{"remaincredit":1500000}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	if s, err := Balance(context.Background(), Config{Provider: "kavenegar", APIKey: "K"}); err != nil || s != "1500000 ریال" {
		t.Fatalf("kavenegar balance %q %v", s, err)
	}
}

func TestTemplatesRender(t *testing.T) {
	for _, tpl := range Templates {
		txt := SampleText(tpl)
		if strings.Contains(txt, "{") || strings.TrimSpace(txt) == "" {
			t.Errorf("%s: unfilled or empty sample: %q", tpl.Key, txt)
		}
		if strings.ContainsAny(txt, "0123456789") {
			t.Errorf("%s: digits must be Persian: %q", tpl.Key, txt)
		}
	}
	if got := Render(Templates[2], map[string]string{"name": "علی", "number": "P-1405-0007"}); got != "علی عزیز، پیش‌فاکتور شما به شمارهٔ P-۱۴۰۵-۰۰۰۷ صادر شد." {
		t.Fatalf("got %q", got)
	}
}

func TestBirthdayTomorrow(t *testing.T) {
	// born 21 March 1984 = 1 Farvardin 1363 (Nowruz); 21 March 2026 is 1 Farvardin 1405, so it matches
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 9, 0, 0, 0, time.UTC) }
	if !birthdayTomorrow("1984-03-21", day(2026, 3, 21)) {
		t.Fatal("1 Farvardin must match")
	}
	if birthdayTomorrow("1984-03-21", day(2026, 3, 22)) {
		t.Fatal("2 Farvardin must not match")
	}
	if birthdayTomorrow("not a date", day(2026, 3, 22)) {
		t.Fatal("a bad date never matches")
	}
}

func TestSendTemplateParameters(t *testing.T) {
	var path string
	var q map[string][]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path, q = r.URL.Path, r.URL.Query()
		w.Write([]byte(`{"return":{"status":200,"message":"ok"}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	text, err := SendTemplate(context.Background(), Config{APIKey: "K"}, "0912 123 4567", "warranty_issued",
		map[string]string{"name": "علی رضایی", "company": "شرکت نمونه ۱۲", "product": "میل لنگ", "number": "G-1405-12", "end": "1406/05/16"})
	if err != nil {
		t.Fatal(err)
	}
	if path != "/v1/K/verify/lookup.json" || q["template"][0] != "hmwarrantyissued" || q["receptor"][0] != "09121234567" {
		t.Fatalf("bad request: %s %v", path, q)
	}
	// %token (name) takes no space: the space becomes a half-space; token20 (company) and token10 (product) keep theirs
	if q["token"][0] != "علی‌رضایی" || q["token20"][0] != "شرکت نمونه ۱۲" || q["token10"][0] != "میل لنگ" || q["token2"][0] != "G-۱۴۰۵-۱۲" {
		t.Fatalf("bad tokens: %v", q)
	}
	if !strings.HasSuffix(text, "اتوماسیون هورمند") || !strings.Contains(text, "شرکت نمونه ۱۲") || strings.Contains(text, "{") {
		t.Fatalf("bad text: %q", text)
	}
}

func TestSendTemplateNotApproved(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"return":{"status":424,"message":"الگوی مورد نظر پیدا نشد"}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	_, err := SendTemplate(context.Background(), Config{APIKey: "K"}, "09121234567", "customer_new", map[string]string{"name": "علی", "company": "شرکت"})
	if err == nil || !strings.Contains(err.Error(), "hmcustomernew") {
		t.Fatalf("expected the template name in the message, got %v", err)
	}
	if _, err := SendTemplate(context.Background(), Config{APIKey: "K"}, "09121234567", "nope", nil); err == nil {
		t.Fatal("an unknown template must be refused")
	}
}

func TestEveryTemplateIsConsistent(t *testing.T) {
	seen := map[string]bool{}
	for _, k := range KVTemplates {
		if seen[k.Name] || seen[k.Key] {
			t.Errorf("duplicate template %s/%s", k.Key, k.Name)
		}
		seen[k.Name], seen[k.Key] = true, true
		if !strings.Contains(k.Text, "{name}") || !strings.Contains(k.Text, "{company}") || !strings.HasSuffix(k.Text, "اتوماسیون هورمند") {
			t.Errorf("%s must carry the customer, the company and end with the fixed line: %q", k.Key, k.Text)
		}
	}
	for _, a := range Templates {
		if kv, ok := KVFind(a.Key); !ok || !kv.Auto {
			t.Errorf("automatic message %s has no template", a.Key)
		}
	}
	for _, k := range DefaultLibrary {
		if kv, ok := KVFind(k); !ok || kv.Auto {
			t.Errorf("default library text %s is missing", k)
		}
	}
}

func TestSendTemplateRetriesTheSpaceWriting(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if strings.Contains(r.URL.Query().Get("token"), string(rune(0x200c))) { // this panel refuses a half-space
			w.Write([]byte(`{"return":{"status":431,"message":"ساختار کد صحیح نمی باشد"}}`))
			return
		}
		w.Write([]byte(`{"return":{"status":200,"message":"ok"}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	if _, err := SendTemplate(context.Background(), Config{APIKey: "K"}, "09121234567", "customer_new", map[string]string{"name": "علی رضایی", "company": "شرکت"}); err != nil || calls != 2 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestSendTemplateRefusalExplainsWhatWasSent(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"return":{"status":431,"message":"ساختار کد صحیح نمی باشد"}}`))
	}))
	defer srv.Close()
	kavenegarBase = srv.URL + "/v1"
	_, err := SendTemplate(context.Background(), Config{APIKey: "SECRETKEY"}, "09121234567", "customer_new", map[string]string{"name": "علی", "company": "شرکت نمونه"})
	if err == nil || !strings.Contains(err.Error(), "431") || !strings.Contains(err.Error(), "token20=شرکت نمونه") || strings.Contains(err.Error(), "SECRETKEY") || strings.Contains(err.Error(), "09121234567") {
		t.Fatalf("bad message: %v", err)
	}
}

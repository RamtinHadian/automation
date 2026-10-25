package api

import (
	"context"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The journal: every change a person makes (and every sign-in, sign-out and file download) is written to the audit log with the person, the
// time and the IP address the request came from. It is written by the server itself, after the request succeeded, so it does not depend on
// what the page chooses to report. Contents (letter texts, chat messages, customer details) are never copied into the journal, only what happened.

func init() {
	auth.OnRequest = journal
	auth.OnLogin = journalLogin
}

type rule struct {
	method   string // "" = any changing method
	path     *regexp.Regexp
	action   string
	severity string
	text     string // may use {id}
}

func jr(m, p, action, sev, text string) rule {
	return rule{m, regexp.MustCompile("^" + p + "$"), action, sev, text}
}

// the changing requests that are written down; what is not listed and not skipped below gets a general line
var journalRules = []rule{
	jr("PUT", `/api/customers/[^/]+`, "CUSTOMER", "INFO", "ثبت یا ویرایش پروندهٔ مشتری"),
	jr("DELETE", `/api/customers/[^/]+`, "CUSTOMER", "WARNING", "حذف مشتری"),
	jr("PUT", `/api/deals/[^/]+`, "DEAL", "INFO", "ثبت یا ویرایش فرصت فروش"),
	jr("DELETE", `/api/deals/[^/]+`, "DEAL", "WARNING", "حذف فرصت فروش"),
	jr("PUT", `/api/activities/[^/]+`, "CRM_NOTE", "INFO", "ثبت سابقه یا پیگیری برای مشتری"),
	jr("DELETE", `/api/activities/[^/]+`, "CRM_NOTE", "WARNING", "حذف سابقه یا پیگیری"),
	jr("PUT", `/api/tasks/[^/]+`, "TASK", "INFO", "ثبت یا ویرایش وظیفه"),
	jr("DELETE", `/api/tasks/[^/]+`, "TASK", "WARNING", "حذف وظیفه"),
	jr("PUT", `/api/transfers/[^/]+`, "FILE_TRANSFER", "INFO", "ارسال یا ویرایش فایل یا نامه"),
	jr("DELETE", `/api/transfers/[^/]+`, "FILE_DELETE", "WARNING", "حذف فایل یا نامه"),
	jr("PUT", `/api/reports/[^/]+`, "REPORT", "INFO", "ثبت گزارش روزانه"),
	jr("DELETE", `/api/reports/[^/]+`, "REPORT", "WARNING", "حذف گزارش روزانه"),
	jr("PUT", `/api/staff/[^/]+`, "USER_UPDATE", "WARNING", "ویرایش اطلاعات یا دسترسی یک کاربر"),
	jr("DELETE", `/api/staff/[^/]+`, "USER_DELETE", "CRITICAL", "حذف کاربر"),
	jr("PUT", `/api/departments/[^/]+`, "DEPARTMENT_CHANGE", "WARNING", "ویرایش واحد سازمانی"),
	jr("DELETE", `/api/departments/[^/]+`, "DEPARTMENT_CHANGE", "CRITICAL", "حذف واحد سازمانی"),
	jr("PUT", `/api/settings/[^/]+`, "SETTINGS_UPDATE", "WARNING", "تغییر تنظیمات سامانه"),
	jr("PUT", `/api/files/[^/]+`, "FILE_UPLOAD", "INFO", "بارگذاری فایل روی سرور"),
	jr("GET", `/api/files/[^/]+`, "FILE_DOWNLOAD", "INFO", "دریافت فایل"),
	jr("PUT", `/api/crm/files/[^/]+/[^/]+`, "FILE_UPLOAD", "INFO", "بارگذاری فایل در پروندهٔ مشتری"),
	jr("GET", `/api/crm/files/[^/]+/[^/]+`, "FILE_DOWNLOAD", "INFO", "دریافت فایل پروندهٔ مشتری"),
	jr("DELETE", `/api/crm/files/[^/]+/[^/]+`, "FILE_DELETE", "WARNING", "حذف فایل پروندهٔ مشتری"),
	jr("POST", `/api/crm/merge`, "CUSTOMER", "WARNING", "ادغام دو مشتری"),
	jr("POST", `/api/crm/transfer`, "CUSTOMER", "WARNING", "انتقال مشتری‌ها به همکار دیگر"),
	jr("PUT", `/api/crm/(club|targets|rules)`, "SETTINGS_UPDATE", "WARNING", "تغییر قوانین باشگاه، هدف یا فرایند فروش"),
	jr("POST", `/api/chat/[^/]+`, "CHAT", "INFO", "ارسال پیام گفتگو"),
	jr("POST", `/api/sms/(send|bulk)`, "SMS", "INFO", "ارسال پیامک"),
	jr("POST", `/api/leaves`, "LEAVE", "INFO", "ثبت درخواست مرخصی"),
	jr("POST", `/api/leaves/[^/]+/decide`, "LEAVE", "WARNING", "تصمیم دربارهٔ درخواست مرخصی"),
	jr("DELETE", `/api/leaves/[^/]+`, "LEAVE", "INFO", "پس‌گرفتن درخواست مرخصی"),
	jr("POST", `/api/voip/call`, "CALL", "INFO", "تماس تلفنی با یک کلیک"),
	jr("GET", `/api/voip/recording/[^/]+`, "CALL_LISTEN", "WARNING", "شنیدن مکالمهٔ ضبط‌شده"),
	jr("POST", `/api/voip/transcribe/[^/]+`, "CALL_TRANSCRIBE", "WARNING", "تبدیل مکالمهٔ ضبط‌شده به متن"),
	jr("GET", `/api/voip/transcript/[^/]+`, "CALL_TRANSCRIPT_READ", "WARNING", "خواندن متن مکالمهٔ ضبط‌شده"),
	jr("POST", `/api/auth/change-password`, "SECURITY_EVENT", "WARNING", "تغییر رمز عبور"),
	jr("POST", `/api/warehouse/docs`, "WAREHOUSE", "INFO", "ثبت سند انبار"),
	jr("POST", `/api/warehouse/docs/[^/]+/void`, "WAREHOUSE", "WARNING", "ابطال سند انبار"),
	jr("PUT", `/api/warehouse/(products|warehouses)/[^/]+`, "WAREHOUSE", "INFO", "ثبت یا ویرایش کالا یا انبار"),
	jr("DELETE", `/api/warehouse/(products|warehouses)/[^/]+`, "WAREHOUSE", "WARNING", "حذف کالا یا انبار"),
	jr("POST", `/api/warranty/.*`, "WARRANTY", "INFO", "ثبت یا تغییر در گارانتی"),
	jr("PUT", `/api/warranty/.*`, "WARRANTY", "INFO", "ثبت یا تغییر در گارانتی"),
	jr("POST", `/api/support/.*`, "SUPPORT", "INFO", "ثبت یا تغییر در پشتیبانی"),
	jr("PUT", `/api/support/.*`, "SUPPORT", "INFO", "ثبت یا تغییر در پشتیبانی"),
	jr("POST", `/api/sepidar/.*`, "SEPIDAR", "INFO", "درخواست یا تغییر در بخش سپیدار"),
	jr("PUT", `/api/sepidar/.*`, "SEPIDAR", "WARNING", "تغییر در بخش سپیدار"),
	jr("PUT", `/api/reminders/[^/]+`, "REMINDER", "INFO", "ثبت یا ویرایش یادآور"),
	jr("POST", `/api/reminders.*`, "REMINDER", "INFO", "ثبت یا تغییر یادآور"),
	jr("PUT", `/api/minutes/[^/]+`, "MINUTES", "INFO", "ثبت یا ویرایش صورتجلسه"),
	jr("DELETE", `/api/minutes/[^/]+`, "MINUTES", "WARNING", "حذف صورتجلسه"),
	jr("POST", `/api/announcements.*`, "ANNOUNCEMENT", "INFO", "ثبت اعلان در تابلو"),
	jr("DELETE", `/api/announcements/[^/]+`, "ANNOUNCEMENT", "WARNING", "حذف اعلان از تابلو"),
}

// not worth a line in the journal: background chatter of the page
var journalSkip = regexp.MustCompile(`^/api/(audit/|notifications|push/|net/|p2p|chat/[^/]+/(read|typing)|state|presence|sounds|voip/recordings|backups|msgr/check|notify/test)`)

func journal(r *http.Request, u auth.User, status int) {
	if status >= 400 {
		return
	}
	path := r.URL.Path
	method := r.Method
	changing := method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
	if !changing && method != http.MethodGet {
		return
	}
	if journalSkip.MatchString(path) || strings.HasPrefix(path, "/api/audit") {
		return
	}
	var hit *rule
	for i := range journalRules {
		if (journalRules[i].method == method || journalRules[i].method == "") && journalRules[i].path.MatchString(path) {
			hit = &journalRules[i]
			break
		}
	}
	if hit == nil {
		if !changing {
			return // reading is not written down, except the downloads listed above
		}
		hit = &rule{action: "ACTIVITY", severity: "INFO", text: "تغییر در سامانه (" + method + " " + path + ")"}
	}
	writeJournal(r, u, hit.action, hit.severity, hit.text)
}

func journalLogin(r *http.Request, identifier string, u *auth.User, ok bool, why string) {
	if ok && u != nil {
		writeJournal(r, *u, "LOGIN", "INFO", "ورود به سامانه")
		return
	}
	entry := jsonx.M{
		"id": "aud-lg-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()),
		"userName": "ناشناس", "userEmail": identifier, "action": "LOGIN_FAILED", "severity": "WARNING", "details": "ورود ناموفق: " + why,
	}
	for k, v := range ipFields(r) {
		entry[k] = v
	}
	insertJournal(entry)
}

func writeJournal(r *http.Request, u auth.User, action, severity, text string) {
	entry := jsonx.M{
		"id": "aud-j-" + strconv.FormatInt(time.Now().UnixNano(), 36), "timestamp": jalali.Timestamp(time.Now()),
		"userName": u.Name(), "userEmail": u.Email(), "action": action, "severity": severity, "details": text,
	}
	for k, v := range ipFields(r) {
		entry[k] = v
	}
	insertJournal(entry)
}

// publicIP: an address that belongs to the internet (not the office network, not the router's own, not carrier-grade NAT).
func publicIP(s string) (string, bool) {
	ip := net.ParseIP(strings.TrimSpace(s))
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() || ip.IsMulticast() {
		return "", false
	}
	if v4 := ip.To4(); v4 != nil && v4[0] == 100 && v4[1]&0xC0 == 64 { // 100.64.0.0/10
		return "", false
	}
	return ip.String(), true
}

// ipFields: the address a request came from. The server writes what it saw (ipSeen). When that is an address inside the office network (a
// router that rewrites the sender is the usual reason) and the browser told us the public address it is on, that one is written as the
// person's address (ipVia = "browser"); the browser's word can be faked, which is why ipSeen is always kept next to it.
func ipFields(r *http.Request) jsonx.M {
	seen := strings.TrimSpace(httpx.ClientIP(r))
	out := jsonx.M{"ipAddress": seen, "ipSeen": seen}
	if _, ok := publicIP(seen); ok {
		return out
	}
	if pub, ok := publicIP(r.Header.Get("X-Client-Public-IP")); ok {
		out["ipAddress"], out["ipVia"] = pub, "browser"
	}
	return out
}

func insertJournal(entry jsonx.M) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = store.Pool.Exec(ctx, `INSERT INTO audit_logs (id, data) VALUES ($1, $2::jsonb)`, entry["id"], jsonx.Encode(entry))
	}()
}

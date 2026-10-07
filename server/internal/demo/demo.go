// Package demo turns the server into a public showcase: it fills the database with made-up Persian data, resets it
// every few hours and blocks the few actions that would let a visitor lock others out or fill the disk.
//
// Switch it on with DEMO=1 (and optionally DEMO_RESET_HOURS). Use it only on a separate server with its own database.
package demo

import (
	"strconv"
	"context"
	_ "embed"
	"encoding/base64"
	"log"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/crypto/bcrypt"

	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Password is shown on the login page on purpose; every demo account uses it.
const Password = "demo"

type account struct {
	ID, Name, Email, Title, Role, Dept, Initials string
	Send, Sign, Tasks, CRM                       bool
	Ext                                          string
}

var accounts = []account{
	{"demo-ceo", "رامتین هادیان", "demo", "مدیرعامل", "SUPER_ADMIN", "dept-general", "ر", true, true, true, true, "501"},
	{"demo-secretary", "سارا محمدی", "secretary@demo.local", "منشی مدیرعامل", "STAFF", "dept-general", "م", true, false, true, false, "502"},
	{"demo-sales", "علی رضایی", "sales@demo.local", "کارشناس فروش", "STAFF", "dept-sales", "ر", false, false, true, true, "503"},
	{"demo-staff", "مریم احمدی", "staff@demo.local", "کارشناس مالی", "STAFF", "dept-fin", "ا", false, false, true, false, "504"},
}

var departments = []jsonx.M{
	{"id": "dept-general", "name": "مدیریت", "code": "HQ", "color": "#6E1B1B", "defaultQuotaGB": 100},
	{"id": "dept-sales", "name": "فروش و بازاریابی", "code": "SALES", "color": "#1D4ED8", "defaultQuotaGB": 50},
	{"id": "dept-fin", "name": "مالی و اداری", "code": "FIN", "color": "#166534", "defaultQuotaGB": 50},
	{"id": "dept-it", "name": "فناوری اطلاعات", "code": "IT", "color": "#7C3AED", "defaultQuotaGB": 80},
	{"id": "dept-hr", "name": "منابع انسانی", "code": "HR", "color": "#B45309", "defaultQuotaGB": 40},
}

var tehran = func() *time.Location {
	loc, err := time.LoadLocation("Asia/Tehran")
	if err != nil {
		return time.FixedZone("IRST", 3*3600+1800)
	}
	return loc
}()

// Info is what the login pages need to show the one public demo account (no secrets: the demo password is public).
func Info(enabled bool, resetHours int) http.HandlerFunc {
	if resetHours < 1 {
		resetHours = 1
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if !enabled {
			httpx.JSON(w, http.StatusOK, map[string]any{"demo": false})
			return
		}
		ceo := accounts[0]
		list := []map[string]string{{"name": ceo.Name, "title": ceo.Title, "identifier": ceo.Email, "password": Password}}
		out := map[string]any{"demo": true, "resetHours": resetHours, "accounts": list}
		if t := nextReset.Load(); t != nil {
			out["nextResetAt"] = t.(time.Time).UTC().Format(time.RFC3339)
		}
		httpx.JSON(w, http.StatusOK, out)
	}
}

// ---------- guard ----------

var (
	rateMu sync.Mutex
	writes = map[string][]time.Time{}
)

const (
	maxBody       = 2 << 20 // 2 MB
	writesPerTen  = 240
	blockedMsg    = "در نسخهٔ نمایشی این کار غیرفعال است."
	blockedUsers  = "در نسخهٔ نمایشی ساخت و ویرایش کاربران غیرفعال است."
	tooManyWrites = "درخواست‌ها زیاد است؛ چند دقیقه بعد دوباره امتحان کنید."
)

func allowWrite(ip string) bool {
	rateMu.Lock()
	defer rateMu.Unlock()
	now := time.Now()
	keep := writes[ip][:0]
	for _, t := range writes[ip] {
		if now.Sub(t) < 10*time.Minute {
			keep = append(keep, t)
		}
	}
	if len(keep) >= writesPerTen {
		writes[ip] = keep
		return false
	}
	writes[ip] = append(keep, now)
	return true
}

// Guard wraps the whole handler: body size limit, write rate limit per address and the blocked actions.
func Guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Method != http.MethodOptions {
			p := r.URL.Path
			switch {
			case p == "/api/auth/change-password" || p == "/api/push/subscribe" || strings.HasPrefix(p, "/api/sms/") || strings.HasPrefix(p, "/api/msgr/") || strings.HasPrefix(p, "/api/sounds"):
				httpx.Error(w, http.StatusForbidden, blockedMsg)
				return
			case strings.HasPrefix(p, "/api/staff/") && r.Method != http.MethodPut: // own cosmetic changes (theme...) are allowed, see putStaff
				httpx.Error(w, http.StatusForbidden, blockedUsers)
				return
			}
			if p != "/api/auth/login" && !allowWrite(httpx.ClientIP(r)) {
				httpx.Error(w, http.StatusTooManyRequests, tooManyWrites)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- reset loop ----------

// safeToWipe protects real data: the demo may only wipe a database it has marked as its own, or one that is still
// (almost) empty. A company database with real users, files or customers is never touched.
func safeToWipe(ctx context.Context) bool {
	var marked int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM settings WHERE key = 'demo_marker'`).Scan(&marked)
	if marked > 0 {
		return true
	}
	var users, other int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&users)
	_ = store.Pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM transfers) + (SELECT count(*) FROM tasks) + (SELECT count(*) FROM crm_customers)`).Scan(&other)
	if users <= 1 && other == 0 {
		_ = exec(ctx, `INSERT INTO settings (key, data) VALUES ('demo_marker', '{}'::jsonb) ON CONFLICT DO NOTHING`)
		return true
	}
	return false
}

// nextReset is when the data will be put back to the starting state again (shown to the visitors).
var nextReset atomic.Value

// Run fills the database now and again every resetHours.
func Run(ctx context.Context, resetHours int) {
	if !safeToWipe(ctx) {
		log.Printf("demo: DEMO=1 is set but this database already holds real data; refusing to wipe it. Remove DEMO from the .env of this server.")
		return
	}
	if resetHours < 1 {
		resetHours = 1
	}
	for {
		nextReset.Store(time.Now().Add(time.Duration(resetHours) * time.Hour))
		if err := Reset(ctx); err != nil {
			log.Printf("demo: reset failed: %v", err)
		} else {
			log.Printf("demo: data reset (next in %d h)", resetHours)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Duration(resetHours) * time.Hour):
		}
	}
}

//go:embed assets/logo-small.png
var logoPNG []byte

// brandLogo is the product logo (the picture shipped with the app).
func brandLogo() string { return "data:image/png;base64," + base64.StdEncoding.EncodeToString(logoPNG) }

func svg(s string) string {
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(s))
}

var (
	logoSVG  = brandLogo()
	stampSVG = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88" fill="none" stroke="#1D4ED8" stroke-width="6"/><circle cx="100" cy="100" r="70" fill="none" stroke="#1D4ED8" stroke-width="2"/><text x="100" y="95" font-size="22" text-anchor="middle" fill="#1D4ED8" font-family="Tahoma">هورمند</text><text x="100" y="125" font-size="16" text-anchor="middle" fill="#1D4ED8" font-family="Tahoma">مهر رسمی</text></svg>`)
	signSVG  = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="110" viewBox="0 0 260 110"><path d="M10 80 C40 10 70 110 100 50 S150 20 170 70 S220 90 250 30" fill="none" stroke="#0B2A6F" stroke-width="4" stroke-linecap="round"/><path d="M30 95 L230 88" stroke="#0B2A6F" stroke-width="2.5" stroke-linecap="round"/></svg>`)
)

func iso(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
func day(t time.Time) string { return t.In(tehran).Format("2006-01-02") }

func userDoc(a account) jsonx.M {
	deptName := map[string]string{"dept-general": "مدیریت", "dept-sales": "فروش و بازاریابی", "dept-fin": "مالی و اداری", "dept-it": "فناوری اطلاعات", "dept-hr": "منابع انسانی"}[a.Dept]
	return jsonx.M{
		"id": a.ID, "fullName": a.Name, "email": a.Email, "avatarUrl": "", "avatarInitials": a.Initials, "role": a.Role,
		"departmentId": a.Dept, "departmentName": deptName, "storageQuotaGB": 50, "storageUsedGB": 3, "isActive": true,
		"lastLogin": "نسخهٔ نمایشی", "canSendOfficialLetters": a.Send, "canSignOfficialLetters": a.Sign,
		"canUseTasks": a.Tasks, "canUseCrm": a.CRM, "extension": a.Ext,
	}
}

func exec(ctx context.Context, sql string, args ...any) error {
	_, err := store.Pool.Exec(ctx, sql, args...)
	return err
}

// Reset empties every table and fills it with the demo data.
func Reset(ctx context.Context) error {
	if err := exec(ctx, `TRUNCATE users, departments, transfers, transfer_hidden, audit_logs, tasks, notifications, push_subscriptions,
		daily_reports, crm_customers, crm_deals, crm_activities, voip_calls, chat_messages, warranties, warranty_claims`); err != nil {
		return err
	}
	if err := exec(ctx, `DELETE FROM settings WHERE key = 'main'`); err != nil { // other rows hold the push keys
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(Password), 10)
	if err != nil {
		return err
	}
	now := time.Now()
	by := map[string]account{}
	for _, a := range accounts {
		by[a.ID] = a
		if err := exec(ctx, `INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4::jsonb)`, a.ID, a.Email, string(hash), jsonx.Encode(userDoc(a))); err != nil {
			return err
		}
	}
	for _, d := range departments {
		if err := exec(ctx, `INSERT INTO departments (id, data) VALUES ($1, $2::jsonb)`, jsonx.Str(d, "id"), jsonx.Encode(d)); err != nil {
			return err
		}
	}
	settings := jsonx.M{
		"companyName": "هورمند", "companySubtitle": "سامانه اتوماسیون اداری و بازرگانی",
		"systemTitle": "سامانه اتوماسیون اداری", "companyLogoUrl": logoSVG, "companyStampUrl": stampSVG, "ceoSignatureUrl": signSVG,
		"ceoName": by["demo-ceo"].Name, "ceoTitle": "مدیرعامل",
		"companyAddress": "تهران، خیابان ولیعصر، پلاک ۱۲۳", "companyPhone": "۰۲۱-۱۲۳۴۵۶۷۸", "companyWebsite": "www.example.ir",
		"proformaCompanyName": "هورمند", "proformaBankInfo": "شمارهٔ شبا: IR000000000000000000000000",
	}
	if err := exec(ctx, `INSERT INTO settings (key, data) VALUES ('main', $1::jsonb)`, jsonx.Encode(settings)); err != nil {
		return err
	}
	pub := func(id string) jsonx.M { u := userDoc(by[id]); return u }

	// ---- long conversations so the chat can be scrolled (older than the short ones below) ----
	peerLines := []string{
		"سلام، صبح بخیر", "گزارش هفتگی را آماده کرده‌ام، بفرستم؟", "مشتری جدید از طریق سایت تماس گرفته", "پیش‌فاکتور را بررسی کردید؟",
		"جلسهٔ امروز ساعت ۱۱ است", "ممنون، دریافت شد", "فایل قرارداد را در بخش فایل‌ها فرستادم", "تخفیف را تا ۵٪ می‌توانیم بدهیم؟",
		"تماس بی‌پاسخ داشتید، پیگیری کنم؟", "موعد تحویل پروژه فردا است", "صورت‌حساب این ماه تأیید شد", "نامهٔ ابلاغیه را امضا کردید؟",
		"برای هماهنگی با انبار منتظر پاسخ هستم", "جلسه را به ساعت ۱۴ منتقل کردم", "لیست مشتریان فعال را به‌روز کردم", "پرداخت مشتری انجام شد",
		"پیشنهاد قیمت را اصلاح کردم", "مدارک ثبت‌نام را کامل کردم", "امروز مرخصی ساعتی دارم", "گزارش روزانه را ثبت کردم",
		"تعمیرکار برای چاپگر آمد", "صدای خوبی داشت، ممنون از پیگیری", "خسته نباشید", "فردا صبح اول وقت خدمتتان هستم",
		"سفارش جدید ثبت شد", "فاکتور فروش صادر شد", "پیگیری چک انجام شد", "نماینده شرکت تدبیر صنعت امروز آمد",
		"برای ارسال محموله نیاز به آدرس دقیق است", "حتماً تا آخر وقت انجام می‌شود",
	}
	ceoLines := []string{
		"سلام، صبح شما هم بخیر", "بله لطفاً بفرستید", "عالی، پیگیری کنید و نتیجه را بگویید", "هنوز ندیده‌ام، امروز بررسی می‌کنم",
		"باشد، حاضر می‌شوم", "ممنون از پیگیری شما", "دریافت کردم، بررسی می‌کنم", "تا ۳٪ مشکلی نیست، بیشتر نه",
		"بله حتماً تماس بگیرید", "پس اولویت با آن پروژه باشد", "خوب است، پرداخت را انجام دهید", "بعدازظهر امضا می‌کنم",
		"با انبار تماس بگیرید و خبر بدهید", "اشکالی ندارد", "ممنون، لطفاً فایلش را بفرستید", "عالی، تبریک",
		"با مدیر فروش هم مشورت کنید", "تأیید می‌کنم", "موافقم، ثبت کنید", "دستتان درد نکند",
		"لطفاً صورت‌جلسه را هم بنویسید", "خسته نباشید", "پیگیری کنید لطفاً", "موفق باشید",
	}
	type convSpec struct {
		peer string
		n    int
		off  int
	}
	for _, c := range []convSpec{{"demo-secretary", 74, 0}, {"demo-sales", 52, 7}, {"demo-staff", 44, 13}, {"demo-sales2", 36, 3}, {"demo-fin2", 32, 11}, {"demo-hr1", 28, 19}} {
		for i := 0; i < c.n; i++ {
			from, to, lines := c.peer, "demo-ceo", peerLines
			if i%2 == 1 {
				from, to, lines = "demo-ceo", c.peer, ceoLines
			}
			// spread over the last six days, oldest first, a few minutes between lines of the same burst
			at := now.Add(-6*24*time.Hour + time.Duration(i)*(6*24*time.Hour-7*time.Hour)/time.Duration(c.n))
			unread := i >= c.n-2 && from != "demo-ceo" && (c.peer == "demo-sales2" || c.peer == "demo-fin2")
			var readAt any
			if !unread {
				readAt = at.Add(4 * time.Minute)
			}
			txt := lines[(i/2+c.off)%len(lines)]
			if err := exec(ctx, `INSERT INTO chat_messages (id, sender_id, recipient_id, text, created_at, read_at) VALUES ($1, $2, $3, $4, $5, $6)`,
				"demo-g-"+c.peer+"-"+strconv.Itoa(i), from, to, txt, at, readAt); err != nil {
				return err
			}
		}
	}

	// ---- chat (the demo account is the CEO): some read, some not yet seen ----
	for i, m := range []struct {
		id, from, to, text string
		ago               time.Duration
		read              bool
	}{
		{"demo-m1", "demo-sales", "demo-ceo", "گزارش فروش این هفته آماده است.", 5 * time.Hour, true},
		{"demo-m2", "demo-ceo", "demo-sales", "عالی، لطفاً پیش‌فاکتور شرکت تدبیر صنعت را هم برایم بفرستید.", 4*time.Hour + 30*time.Minute, true},
		{"demo-m3", "demo-sales", "demo-ceo", "حتماً، تا آخر وقت امروز می‌فرستم.", 4 * time.Hour, true},
		{"demo-m4", "demo-secretary", "demo-ceo", "سلام، نامهٔ بودجهٔ تبلیغات برای امضا در کارتابل شماست.", 3 * time.Hour, false},
		{"demo-m5", "demo-secretary", "demo-ceo", "جلسهٔ فردا ساعت ۱۰ صبح هماهنگ شد.", 2 * time.Hour, false},
		{"demo-m6", "demo-ceo", "demo-secretary", "ممنون، بعدازظهر بررسی می‌کنم.", 1 * time.Hour, true},
		{"demo-m7", "demo-ceo", "demo-staff", "گزارش مالی ماه گذشته را لطفاً امروز بفرستید.", 90 * time.Minute, false},
	} {
		_ = i
		at := now.Add(-m.ago)
		var readAt any
		if m.read {
			readAt = at.Add(10 * time.Minute)
		}
		if err := exec(ctx, `INSERT INTO chat_messages (id, sender_id, recipient_id, text, created_at, read_at) VALUES ($1, $2, $3, $4, $5, $6)`, m.id, m.from, m.to, m.text, at, readAt); err != nil {
			return err
		}
	}

	// ---- files and letters ----
	letterHTML := `<p>با سلام و احترام</p><p>بدین وسیله برنامهٔ فروش فصل پاییز به شرح پیوست ابلاغ می‌گردد. خواهشمند است نسبت به اجرای دقیق آن اقدام و گزارش پیشرفت را هر هفته به این دفتر ارسال فرمایید.</p><p>پیشاپیش از همکاری شما سپاسگزارم.</p>`
	transfers := []struct {
		id, sender string
		to         []string
		doc        jsonx.M
	}{
		{"demo-tr-letter1", "demo-secretary", []string{"demo-sales", "demo-staff", "demo-ceo"}, jsonx.M{
			"fileId": "f-letter1", "fileName": "ابلاغ برنامهٔ فروش فصل پاییز", "fileSize": "—", "category": "word",
			"letterContentHtml": letterHTML, "letterNumber": "۱۴۰۵/۱۰۱", "pageSize": "A4", "status": "DELIVERED",
			"sentAt": iso(now.Add(-26 * time.Hour)), "expiresAt": iso(now.Add(30 * 24 * time.Hour)), "downloadsCount": 2,
			"isOfficialLetter": true, "signatureStatus": "SIGNED", "signedBy": by["demo-ceo"].Name, "signedAt": iso(now.Add(-24 * time.Hour)),
			"signatureImageUrl": signSVG, "companyStampImageUrl": stampSVG, "referrals": []any{},
		}},
		{"demo-tr-letter2", "demo-secretary", []string{"demo-ceo"}, jsonx.M{
			"fileId": "f-letter2", "fileName": "درخواست تأیید بودجهٔ تبلیغات", "fileSize": "—", "category": "word",
			"letterContentHtml": `<p>با سلام</p><p>پیشنهاد بودجهٔ تبلیغات سه‌ماههٔ آینده برای بررسی و امضا تقدیم می‌شود.</p>`, "letterNumber": "۱۴۰۵/۱۰۲", "pageSize": "A4",
			"status": "DELIVERED", "sentAt": iso(now.Add(-3 * time.Hour)), "expiresAt": iso(now.Add(30 * 24 * time.Hour)), "downloadsCount": 0,
			"isOfficialLetter": true, "signatureStatus": "PENDING_SIGNATURE", "referrals": []any{},
		}},
		{"demo-tr-file1", "demo-staff", []string{"demo-sales"}, jsonx.M{
			"fileId": "f-file1", "fileName": "راهنمای نسخهٔ نمایشی.txt", "fileSize": "۱ کیلوبایت", "category": "doc",
			"note": "فایل نمونه برای امتحان دانلود", "status": "DELIVERED", "sentAt": iso(now.Add(-5 * time.Hour)),
			"expiresAt": iso(now.Add(7 * 24 * time.Hour)), "downloadsCount": 0, "isOfficialLetter": false,
			"fileDataUrl": "data:text/plain;base64," + base64.StdEncoding.EncodeToString([]byte("این یک فایل نمونه در نسخهٔ نمایشی است.\nهر چند ساعت اطلاعات نسخهٔ نمایشی بازنشانی می‌شود.\n")),
		}},
	}
	for _, t := range transfers {
		doc := t.doc
		doc["id"] = t.id
		doc["sender"] = pub(t.sender)
		rcp := make([]any, 0, len(t.to))
		for _, id := range t.to {
			rcp = append(rcp, pub(id))
		}
		doc["recipients"] = rcp
		if err := exec(ctx, `INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, t.id, t.sender, t.to, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- tasks ----
	task := func(id, title, desc, status, prio, creator string, assignees []string, dueDays int, checklist []jsonx.M) error {
		doc := jsonx.M{
			"id": id, "title": title, "description": desc, "status": status, "priority": prio, "creatorId": creator, "creatorName": by[creator].Name,
			"assigneeIds": assignees, "dueDate": day(now.AddDate(0, 0, dueDays)), "checklist": checklist, "createdAt": iso(now.Add(-48 * time.Hour)), "updatedAt": iso(now.Add(-2 * time.Hour)),
			"comments": []jsonx.M{{"id": id + "-c1", "userId": assignees[0], "userName": by[assignees[0]].Name, "text": "روی آن کار می‌کنم و تا موعد آماده می‌شود.", "createdAt": iso(now.Add(-3 * time.Hour))}},
		}
		return exec(ctx, `INSERT INTO tasks (id, creator_id, assignee_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, id, creator, assignees, jsonx.Encode(doc))
	}
	ck := func(done ...bool) []jsonx.M {
		texts := []string{"جمع‌آوری اطلاعات", "تهیهٔ پیش‌نویس", "بازبینی نهایی"}
		out := []jsonx.M{}
		for i, d := range done {
			out = append(out, jsonx.M{"id": "ck" + string(rune('a'+i)), "text": texts[i], "done": d})
		}
		return out
	}
	for _, t := range []struct {
		id, title, desc, status, prio, creator string
		who                                    []string
		due                                    int
		ck                                     []jsonx.M
	}{
		{"demo-t1", "تهیهٔ گزارش فروش ماهانه", "گزارش فروش ماه گذشته به تفکیک محصول", "IN_PROGRESS", "HIGH", "demo-ceo", []string{"demo-sales"}, 3, ck(true, false, false)},
		{"demo-t2", "ثبت اسناد مالی هفتهٔ جاری", "", "TODO", "MEDIUM", "demo-ceo", []string{"demo-staff"}, 5, ck(false, false)},
		{"demo-t3", "هماهنگی جلسهٔ هیئت‌مدیره", "تعیین زمان و ارسال دعوت‌نامه", "REVIEW", "URGENT", "demo-ceo", []string{"demo-secretary"}, 1, ck(true, true, false)},
		{"demo-t4", "به‌روزرسانی فهرست قیمت‌ها", "", "DONE", "LOW", "demo-sales", []string{"demo-sales", "demo-staff"}, 7, ck(true, true, true)},
	} {
		if err := task(t.id, t.title, t.desc, t.status, t.prio, t.creator, t.who, t.due, t.ck); err != nil {
			return err
		}
	}

	// ---- daily reports ----
	for _, r := range []struct{ user, summary string }{
		{"demo-sales", "سه تماس فروش انجام شد و یک پیش‌فاکتور برای مشتری جدید صادر شد."},
		{"demo-staff", "اسناد مالی هفته ثبت و تطبیق حساب‌های بانکی انجام شد."},
	} {
		d := day(now)
		id := r.user + "_" + d
		doc := jsonx.M{
			"id": id, "userId": r.user, "authorName": by[r.user].Name, "date": d, "summary": r.summary,
			"items":    []jsonx.M{{"id": "i1", "text": r.summary, "hours": 4, "status": "DONE"}, {"id": "i2", "text": "پیگیری موارد باز", "hours": 2, "status": "IN_PROGRESS"}},
			"blockers": "", "tomorrow": "ادامهٔ کارهای در جریان", "recipientIds": []string{"demo-ceo"}, "createdAt": iso(now.Add(-time.Hour)), "updatedAt": iso(now.Add(-time.Hour)),
		}
		if err := exec(ctx, `INSERT INTO daily_reports (id, user_id, report_date, recipient_ids, data) VALUES ($1, $2, $3, $4, $5::jsonb)`, id, r.user, d, []string{"demo-ceo"}, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- CRM ----
	owner := "demo-sales"
	customers := []jsonx.M{
		{"id": "demo-c1", "name": "حسین کاظمی", "company": "شرکت آرمان صنعت", "phones": []string{"09121234567"}, "email": "kazemi@arman.example", "address": "تهران، خیابان آزادی", "status": "ACTIVE", "source": "معرفی دوستان", "tags": []string{"صنعتی"}},
		{"id": "demo-c2", "name": "نرگس موسوی", "company": "گروه بازرگانی ستاره", "phones": []string{"09351112233"}, "email": "mousavi@setareh.example", "status": "LEAD", "source": "وب‌سایت", "tags": []string{"بازرگانی"}},
		{"id": "demo-c3", "name": "رضا حیدری", "company": "داروسازی سلامت", "phones": []string{"09124445566"}, "status": "LEAD", "source": "نمایشگاه", "tags": []string{}},
		{"id": "demo-c4", "name": "لیلا صادقی", "company": "فناوران پارس", "phones": []string{"09370001122"}, "status": "INACTIVE", "source": "شبکه‌های اجتماعی", "tags": []string{}},
	}
	// official details and introducers, so the customer form, the detail view and the marketing table have something to show
	customers[0]["kind"], customers[0]["firstName"], customers[0]["lastName"], customers[0]["fatherName"] = "PERSON", "حسین", "کاظمی", "علی"
	customers[0]["nationalCode"], customers[0]["idNumber"], customers[0]["gender"], customers[0]["birthDate"] = "0084575948", "1204", "M", "1984-03-21"
	customers[0]["province"], customers[0]["city"], customers[0]["postalCode"] = "تهران", "تهران", "1458914551"
	customers[0]["phones"] = []string{"09121234567", "09351230000", "02188776655", "02188776656"}
	customers[1]["kind"], customers[1]["companyType"], customers[1]["nationalId"] = "COMPANY", "مسئولیت محدود", "10320543217"
	customers[1]["economicCode"], customers[1]["registrationNumber"], customers[1]["repName"], customers[1]["repPosition"] = "411234567890", "458712", "نرگس موسوی", "مدیرعامل"
	customers[1]["province"], customers[1]["city"] = "اصفهان", "اصفهان"
	customers[1]["referrer"] = jsonx.M{"kind": "CUSTOMER", "id": "demo-c1", "name": "حسین کاظمی", "phone": "09121234567"}
	customers[2]["referrer"] = jsonx.M{"kind": "STAFF", "id": "demo-sales", "name": by["demo-sales"].Name}
	customers[3]["referrer"] = jsonx.M{"kind": "OTHER", "name": "آقای مهدوی", "phone": "09125550000"}
	for _, c := range customers {
		c["ownerId"], c["ownerName"], c["notes"] = owner, by[owner].Name, ""
		c["createdAt"], c["updatedAt"] = iso(now.Add(-72*time.Hour)), iso(now.Add(-6*time.Hour))
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, jsonx.Str(c, "id"), owner, jsonx.Encode(c)); err != nil {
			return err
		}
	}
	deals := []jsonx.M{
		{"id": "demo-d1", "title": "قرارداد پشتیبانی سالانه", "customerId": "demo-c1", "customerName": "حسین کاظمی", "amount": 54000000, "stage": "NEGOTIATION"},
		{"id": "demo-d2", "title": "پیاده‌سازی سامانهٔ اتوماسیون", "customerId": "demo-c2", "customerName": "نرگس موسوی", "amount": 126000000, "stage": "PROPOSAL",
			"proformaNumber": "PF-1405-0001", "proformaAt": day(now), "validUntil": day(now.AddDate(0, 0, 7)), "discountPercent": 5, "taxPercent": 10,
			"items": []jsonx.M{{"title": "پیاده‌سازی و راه‌اندازی", "qty": 1, "unit": "مورد", "unitPrice": 90000000}, {"title": "آموزش کاربران", "qty": 4, "unit": "جلسه", "unitPrice": 3000000}, {"title": "پشتیبانی سه‌ماهه", "qty": 3, "unit": "ماه", "unitPrice": 8000000}}},
		{"id": "demo-d3", "title": "خرید لایسنس سازمانی", "customerId": "demo-c3", "customerName": "رضا حیدری", "amount": 30000000, "stage": "NEW"},
		{"id": "demo-d4", "title": "تمدید قرارداد قبلی", "customerId": "demo-c1", "customerName": "حسین کاظمی", "amount": 18000000, "stage": "WON", "closedAt": iso(now.Add(-48 * time.Hour))},
		{"id": "demo-d5", "title": "مشاورهٔ فناوری", "customerId": "demo-c4", "customerName": "لیلا صادقی", "amount": 9000000, "stage": "LOST", "closedAt": iso(now.Add(-96 * time.Hour))},
	}
	for _, d := range deals {
		d["ownerId"], d["ownerName"], d["notes"] = owner, by[owner].Name, ""
		d["createdAt"], d["updatedAt"] = iso(now.Add(-60*time.Hour)), iso(now.Add(-5*time.Hour))
		if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(d, "id"), jsonx.Str(d, "customerId"), owner, jsonx.Encode(d)); err != nil {
			return err
		}
	}
	acts := []jsonx.M{
		{"id": "demo-a1", "customerId": "demo-c1", "type": "CALL", "text": "تماس گرفته شد؛ برای تمدید قرارداد علاقه‌مند است."},
		{"id": "demo-a2", "customerId": "demo-c2", "type": "MEETING", "text": "جلسهٔ معرفی سامانه برگزار شد."},
		{"id": "demo-a3", "customerId": "demo-c2", "type": "FOLLOWUP", "text": "ارسال پیش‌فاکتور و پیگیری تأیید", "dueDate": day(now.AddDate(0, 0, 2)), "done": false},
		{"id": "demo-a4", "customerId": "demo-c3", "type": "NOTE", "text": "از نمایشگاه با ما آشنا شد؛ فهرست قیمت ارسال شود."},
	}
	for i, a := range acts {
		a["ownerId"], a["ownerName"], a["authorId"], a["authorName"] = owner, by[owner].Name, owner, by[owner].Name
		a["createdAt"] = iso(now.Add(-time.Duration(30-i*5) * time.Hour))
		if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(a, "id"), jsonx.Str(a, "customerId"), owner, jsonx.Encode(a)); err != nil {
			return err
		}
	}

	// ---- a few notifications so the bell is not empty ----
	notes := []struct {
		user, kind, label, title, body, refType, refID string
	}{
		{"demo-ceo", "letter", "جهت امضا", "نامه جدید جهت امضا از " + by["demo-secretary"].Name, "درخواست تأیید بودجهٔ تبلیغات", "letter", "demo-tr-letter2"},
		{"demo-ceo", "task", "گزارش روزانه", "گزارش روزانه از " + by["demo-sales"].Name, "سه تماس فروش انجام شد", "report", "demo-sales_" + day(now)},
		{"demo-sales", "file", "فایل جدید", "فایل جدید از " + by["demo-staff"].Name, "راهنمای نسخهٔ نمایشی.txt", "file", "demo-tr-file1"},
		{"demo-sales", "task", "وظیفه جدید", "وظیفه جدید از " + by["demo-ceo"].Name, "تهیهٔ گزارش فروش ماهانه", "task", "demo-t1"},
		{"demo-staff", "task", "وظیفه جدید", "وظیفه جدید از " + by["demo-ceo"].Name, "ثبت اسناد مالی هفتهٔ جاری", "task", "demo-t2"},
		{"demo-secretary", "letter", "امضا شد", "نامه امضا شد", "ابلاغ برنامهٔ فروش فصل پاییز", "letter", "demo-tr-letter1"},
	}
	for i, n := range notes {
		id := "demo-n" + string(rune('a'+i))
		doc := jsonx.M{"id": id, "userId": n.user, "kind": n.kind, "label": n.label, "title": n.title, "body": n.body, "ref": jsonx.M{"type": n.refType, "id": n.refID}, "createdAt": iso(now.Add(-time.Duration(i+1) * 20 * time.Minute)), "read": false}
		if err := exec(ctx, `INSERT INTO notifications (id, user_id, data) VALUES ($1, $2, $3::jsonb)`, id, n.user, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	if err := addWarranty(ctx, now, by); err != nil {
		return err
	}
	if err := addBulk(ctx, now, string(hash), by); err != nil {
		return err
	}
	store.BackfillDealCreators(ctx) // the sample opportunities also say who made them
	return nil
}

package demo

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"automation/server/internal/jsonx"
)

// More colleagues so lists, pickers and the admin table look like a real office (they can sign in too, with the same password).
var extraAccounts = []account{
	{"demo-sales2", "نگین حیدری", "negin@demo.local", "کارشناس فروش", "STAFF", "dept-sales", "ح", false, false, true, true, "505"},
	{"demo-sales3", "پیمان سلطانی", "peyman@demo.local", "مسئول فروش سازمانی", "STAFF", "dept-sales", "س", false, false, true, true, "506"},
	{"demo-sales4", "الهام فرجی", "elham@demo.local", "کارشناس بازاریابی", "STAFF", "dept-sales", "ف", false, false, true, true, "507"},
	{"demo-sales5", "رضا اکبری", "reza@demo.local", "کارشناس فروش", "STAFF", "dept-sales", "ا", false, false, true, true, "508"},
	{"demo-fin2", "حسین نوری", "hossein@demo.local", "حسابدار", "STAFF", "dept-fin", "ن", false, false, true, false, "509"},
	{"demo-fin3", "زهرا کاظمی", "zahra@demo.local", "کارپرداز", "STAFF", "dept-fin", "ک", false, false, true, false, "510"},
	{"demo-fin4", "مهدی صادقی", "mehdi@demo.local", "خزانه‌دار", "STAFF", "dept-fin", "ص", false, false, true, false, "511"},
	{"demo-fin5", "سمیه جلالی", "somayeh@demo.local", "کارشناس اسناد", "STAFF", "dept-fin", "ج", false, false, true, false, "512"},
	{"demo-hr1", "فاطمه رستمی", "fatemeh@demo.local", "مسئول منابع انسانی", "STAFF", "dept-hr", "ر", true, false, true, false, "513"},
	{"demo-hr2", "امیر بهرامی", "amir@demo.local", "کارشناس استخدام", "STAFF", "dept-hr", "ب", false, false, true, false, "514"},
	{"demo-hr3", "مینا کریمی", "mina@demo.local", "کارشناس آموزش", "STAFF", "dept-hr", "م", false, false, true, false, "515"},
	{"demo-it1", "کوروش نیکزاد", "kourosh@demo.local", "مدیر فناوری اطلاعات", "DEPT_ADMIN", "dept-it", "ن", true, false, true, true, "516"},
	{"demo-it2", "ندا شریفی", "neda@demo.local", "برنامه‌نویس", "STAFF", "dept-it", "ش", false, false, true, false, "517"},
	{"demo-it3", "آرش فتحی", "arash@demo.local", "پشتیبان شبکه", "STAFF", "dept-it", "ف", false, false, true, false, "518"},
	{"demo-gen2", "بهنام یزدانی", "behnam@demo.local", "معاون اداری", "STAFF", "dept-general", "ی", true, false, true, false, "519"},
	{"demo-gen3", "شیرین قاسمی", "shirin@demo.local", "مسئول دفتر", "STAFF", "dept-general", "ق", true, false, true, false, "520"},
}

const faDigits = "۰۱۲۳۴۵۶۷۸۹"

func fa(n int) string {
	var b strings.Builder
	for _, r := range fmt.Sprint(n) {
		if r >= '0' && r <= '9' {
			b.WriteString(string([]rune(faDigits)[r-'0']))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func csvDataURL(text string) string {
	return "data:text/plain;base64," + base64.StdEncoding.EncodeToString(append([]byte{0xEF, 0xBB, 0xBF}, text...))
}

// addBulk adds the rest of the sample office: more colleagues, letters, files, tasks, reports, customers, deals and notifications.
func addBulk(ctx context.Context, now time.Time, hash string, by map[string]account) error {
	for _, a := range extraAccounts {
		by[a.ID] = a
		if err := exec(ctx, `INSERT INTO users (id, email, password_hash, data) VALUES ($1, $2, $3, $4::jsonb)`, a.ID, a.Email, hash, jsonx.Encode(userDoc(a))); err != nil {
			return err
		}
	}
	pub := func(id string) jsonx.M { return userDoc(by[id]) }
	hours := func(h int) time.Time { return now.Add(-time.Duration(h) * time.Hour) }

	// ---- letters (6 signed, 2 waiting for a signature) and files ----
	type letter struct {
		subject, body string
		from          string
		to            []string
		signed        bool
	}
	letters := []letter{
		{"ابلاغ دستورالعمل جدید ایمنی محیط کار", "دستورالعمل ایمنی پیوست ابلاغ می‌شود. رعایت آن برای همهٔ واحدها الزامی است.", "demo-gen2", []string{"demo-sales", "demo-fin2", "demo-it1", "demo-hr1"}, true},
		{"دعوت به جلسهٔ هماهنگی فصلی", "جلسهٔ هماهنگی فصلی روز شنبه ساعت ده در سالن اجتماعات برگزار می‌شود. حضور مدیران واحدها ضروری است.", "demo-secretary", []string{"demo-sales", "demo-fin", "demo-it1", "demo-hr1", "demo-gen2"}, true},
		{"تأیید صورت‌جلسهٔ کمیتهٔ خرید", "صورت‌جلسهٔ کمیتهٔ خرید مورد تأیید است. اقدامات لازم انجام شود.", "demo-fin2", []string{"demo-fin3", "demo-fin4"}, true},
		{"اعلام نتایج ارزیابی عملکرد", "نتایج ارزیابی عملکرد سه‌ماههٔ گذشته به پیوست اعلام می‌گردد.", "demo-hr1", []string{"demo-sales2", "demo-fin5", "demo-it2", "demo-hr2"}, true},
		{"تمدید قرارداد پشتیبانی شبکه", "با تمدید قرارداد پشتیبانی شبکه برای یک سال دیگر موافقت شد.", "demo-it1", []string{"demo-fin", "demo-fin2"}, true},
		{"درخواست خرید تجهیزات شبکه", "فهرست تجهیزات موردنیاز واحد فناوری اطلاعات جهت بررسی و تأیید ارسال می‌شود.", "demo-it1", []string{"demo-ceo"}, false},
		{"گزارش عملکرد فروش فصل", "گزارش عملکرد فروش فصل جاری برای مطالعه و امضا تقدیم می‌شود.", "demo-secretary", []string{"demo-ceo"}, false},
		{"درخواست مرخصی تشویقی", "خواهشمند است با مرخصی تشویقی همکاران واحد مالی از تاریخ اعلام‌شده موافقت فرمایید.", "demo-gen3", []string{"demo-ceo"}, false},
	}
	for i, l := range letters {
		id := fmt.Sprintf("demo-trl%d", i+3)
		to := append([]string{}, l.to...)
		rcp := make([]any, 0, len(to))
		for _, t := range to {
			rcp = append(rcp, pub(t))
		}
		doc := jsonx.M{
			"id": id, "fileId": "f-" + id, "fileName": l.subject, "fileSize": "—", "category": "word", "sender": pub(l.from), "recipients": rcp,
			"letterContentHtml": "<p>با سلام و احترام</p><p>" + l.body + "</p><p>با تشکر</p>", "letterNumber": "۱۴۰۵/" + fa(103+i), "pageSize": "A4",
			"status": "DELIVERED", "sentAt": iso(hours(30 + i*17)), "expiresAt": iso(now.Add(30 * 24 * time.Hour)), "downloadsCount": i % 4,
			"isOfficialLetter": true, "referrals": []any{},
		}
		if l.signed {
			doc["signatureStatus"] = "SIGNED"
			doc["signedBy"] = by["demo-ceo"].Name
			doc["signedAt"] = iso(hours(28 + i*17))
			doc["signatureImageUrl"] = signSVG
			doc["companyStampImageUrl"] = stampSVG
		} else {
			doc["signatureStatus"] = "PENDING_SIGNATURE"
		}
		if err := exec(ctx, `INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, id, l.from, to, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	type file struct {
		name, size, category, from string
		to                         []string
		content                    string
	}
	files := []file{
		{"گزارش فروش ماهانه.csv", "۱ کیلوبایت", "sheet", "demo-sales", []string{"demo-ceo", "demo-fin"}, "ماه,محصول,تعداد,مبلغ (تومان)\nمهر,پشتیبانی,12,54000000\nمهر,نصب و راه‌اندازی,3,24000000\nمهر,آموزش,6,18000000\n"},
		{"فهرست قیمت‌ها.csv", "۱ کیلوبایت", "sheet", "demo-sales2", []string{"demo-sales", "demo-sales3"}, "کد,عنوان,قیمت واحد (تومان)\n101,لایسنس سازمانی,30000000\n102,پشتیبانی ماهانه,4500000\n103,آموزش حضوری,3000000\n"},
		{"صورت‌جلسهٔ هفتگی.txt", "۱ کیلوبایت", "doc", "demo-gen3", []string{"demo-ceo", "demo-gen2"}, "صورت‌جلسهٔ هفتگی\n۱. بررسی گزارش فروش\n۲. تعیین زمان جلسهٔ بعد\n۳. پیگیری کارهای باز\n"},
		{"تقویم جلسات.txt", "۱ کیلوبایت", "doc", "demo-hr1", []string{"demo-fin", "demo-it1", "demo-sales"}, "تقویم جلسات این ماه\nشنبه: جلسهٔ هماهنگی\nمنگل: جلسهٔ فروش\nچهارشنبه: جلسهٔ مالی\n"},
	}
	for i, f := range files {
		id := fmt.Sprintf("demo-trf%d", i+2)
		rcp := make([]any, 0, len(f.to))
		for _, t := range f.to {
			rcp = append(rcp, pub(t))
		}
		doc := jsonx.M{
			"id": id, "fileId": "f-" + id, "fileName": f.name, "fileSize": f.size, "category": f.category, "sender": pub(f.from), "recipients": rcp,
			"status": "DELIVERED", "sentAt": iso(hours(6 + i*21)), "expiresAt": iso(now.Add(7 * 24 * time.Hour)), "downloadsCount": i,
			"isOfficialLetter": false, "fileDataUrl": csvDataURL(f.content),
		}
		if err := exec(ctx, `INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, id, f.from, f.to, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- tasks (16 more) ----
	all := []string{"demo-ceo", "demo-secretary", "demo-sales", "demo-staff"}
	for _, a := range extraAccounts {
		all = append(all, a.ID)
	}
	titles := []string{
		"تهیهٔ پیش‌نویس قرارداد با تأمین‌کننده", "بررسی و تطبیق صورتحساب‌های بانکی", "به‌روزرسانی فهرست دارایی‌های شرکت", "برگزاری جلسهٔ آموزشی برای همکاران جدید",
		"پشتیبان‌گیری هفتگی از سرورها", "تهیهٔ گزارش ماهانهٔ هزینه‌ها", "پیگیری مطالبات معوق مشتریان", "نصب نرم‌افزار جدید روی رایانه‌های واحد فروش",
		"تدوین برنامهٔ فروش فصل زمستان", "هماهنگی بازدید از نمایشگاه", "ثبت اسناد حسابداری هفته", "ارزیابی پیشنهادهای رسیده برای خرید تجهیزات",
		"به‌روزرسانی راهنمای کاربران", "پاسخ به درخواست‌های پشتیبانی", "آماده‌سازی گزارش برای جلسهٔ هیئت‌مدیره", "بازبینی دستورالعمل‌های اداری",
	}
	statuses := []string{"TODO", "IN_PROGRESS", "REVIEW", "DONE"}
	prios := []string{"LOW", "MEDIUM", "HIGH", "URGENT"}
	for i, t := range titles {
		who := all[(i*3+2)%len(all)]
		who2 := all[(i*5+7)%len(all)]
		assignees := []string{who}
		if who2 != who && i%3 == 0 {
			assignees = append(assignees, who2)
		}
		creator := "demo-ceo"
		if i%4 == 1 {
			creator = "demo-it1"
		}
		checklist := []jsonx.M{{"id": "c1", "text": "جمع‌آوری اطلاعات", "done": i%2 == 0}, {"id": "c2", "text": "انجام کار", "done": i%4 == 3}, {"id": "c3", "text": "بازبینی نهایی", "done": i%4 == 3}}
		id := fmt.Sprintf("demo-t%d", i+5)
		doc := jsonx.M{
			"id": id, "title": t, "description": "توضیحات تکمیلی این وظیفه در نسخهٔ نمایشی ثبت شده است.", "status": statuses[i%4], "priority": prios[(i*3)%4],
			"creatorId": creator, "creatorName": by[creator].Name, "assigneeIds": assignees, "dueDate": day(now.AddDate(0, 0, 2+(i%12))),
			"checklist": checklist, "createdAt": iso(hours(60 + i*5)), "updatedAt": iso(hours(1 + i)),
			"comments": []jsonx.M{{"id": id + "-c1", "userId": assignees[0], "userName": by[assignees[0]].Name, "text": "در حال انجام است.", "createdAt": iso(hours(2 + i))}},
		}
		if i%4 == 3 {
			doc["completedAt"] = iso(hours(3 + i))
		}
		if err := exec(ctx, `INSERT INTO tasks (id, creator_id, assignee_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, id, creator, assignees, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- daily reports for the last three days ----
	reporters := []string{"demo-sales2", "demo-fin2", "demo-it2", "demo-hr2", "demo-sales3", "demo-fin3", "demo-it3", "demo-sales"}
	notes := []string{"تماس با مشتریان و ثبت نتیجه در سامانه", "ثبت اسناد و تطبیق حساب‌ها", "رفع اشکال و پشتیبانی کاربران", "بررسی رزومه‌ها و هماهنگی مصاحبه", "ارسال پیش‌فاکتور و پیگیری تأیید", "بررسی فاکتورهای خرید", "به‌روزرسانی سرورها", "پیگیری قراردادهای در جریان"}
	for i, r := range reporters {
		d := day(now.AddDate(0, 0, -(1 + i%3)))
		id := r + "_" + d
		doc := jsonx.M{
			"id": id, "userId": r, "authorName": by[r].Name, "date": d, "summary": notes[i],
			"items":    []jsonx.M{{"id": "i1", "text": notes[i], "hours": 3 + i%3, "status": "DONE"}, {"id": "i2", "text": "پیگیری موارد باز", "hours": 2, "status": "IN_PROGRESS"}},
			"blockers": "", "tomorrow": "ادامهٔ کارهای در جریان", "recipientIds": []string{"demo-ceo"}, "createdAt": iso(hours(20 + i)), "updatedAt": iso(hours(20 + i)),
		}
		if err := exec(ctx, `INSERT INTO daily_reports (id, user_id, report_date, recipient_ids, data) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT DO NOTHING`, id, r, d, []string{"demo-ceo"}, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- CRM: 16 more customers, 20 more deals, 16 more activities ----
	owners := []string{"demo-sales", "demo-sales2", "demo-sales3", "demo-sales4", "demo-sales5"}
	names := [][2]string{
		{"محمد صالحی", "شرکت تدبیر صنعت"}, {"زهره نجفی", "فروشگاه‌های زنجیره‌ای آریا"}, {"کامران رحیمی", "گروه ساختمانی بنیان"}, {"سحر انصاری", "کلینیک تخصصی مهر"},
		{"بابک فروغی", "شرکت حمل و نقل راهبر"}, {"آیدا پورمحمد", "آموزشگاه زبان پارس"}, {"سعید مرادی", "کارخانه نساجی سپهر"}, {"پروین عزیزی", "داروخانهٔ شبانه‌روزی نور"},
		{"داریوش کمالی", "شرکت نرم‌افزاری آوا"}, {"طاهره شیرازی", "هتل بین‌المللی ایرانیان"}, {"مجتبی قنبری", "شرکت بازرگانی کیان"}, {"نازنین امیری", "رستوران زیتون"},
		{"ایمان طاهری", "شرکت مهندسی نیرو"}, {"رویا جعفری", "فروشگاه لوازم خانگی هما"}, {"حمید زارعی", "گروه صنعتی البرز"}, {"مهسا نصیری", "آژانس مسافرتی پرواز"},
	}
	sources := []string{"معرفی دوستان", "وب‌سایت", "تماس ورودی", "نمایشگاه", "شبکه‌های اجتماعی", "مشتری قبلی"}
	cstatus := []string{"LEAD", "ACTIVE", "LEAD", "INACTIVE", "ACTIVE"}
	for i, n := range names {
		id := fmt.Sprintf("demo-c%d", i+5)
		o := owners[i%len(owners)]
		doc := jsonx.M{
			"id": id, "name": n[0], "company": n[1], "phones": []string{fmt.Sprintf("0912%07d", 3000000+i*7919)}, "email": fmt.Sprintf("customer%d@example.com", i+1),
			"address": "تهران، خیابان شمارهٔ " + fa(i+10), "status": cstatus[i%5], "source": sources[i%len(sources)], "tags": []string{}, "ownerId": o, "ownerName": by[o].Name, "notes": "",
			"createdAt": iso(hours(90 + i*6)), "updatedAt": iso(hours(5 + i)),
		}
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, id, o, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	dealTitles := []string{"قرارداد پشتیبانی سالانه", "پیاده‌سازی سامانهٔ اتوماسیون", "خرید لایسنس سازمانی", "آموزش کارکنان", "مشاورهٔ فناوری", "تمدید قرارداد", "نصب و راه‌اندازی شبکه", "توسعهٔ ماژول اختصاصی"}
	stages := []string{"NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"}
	for i := 0; i < 20; i++ {
		cIdx := i % len(names)
		cid := fmt.Sprintf("demo-c%d", cIdx+5)
		o := owners[cIdx%len(owners)]
		stage := stages[i%6]
		amount := (3 + (i*7)%40) * 3000000
		doc := jsonx.M{
			"id": fmt.Sprintf("demo-d%d", i+6), "title": dealTitles[i%len(dealTitles)], "customerId": cid, "customerName": names[cIdx][0], "amount": amount, "stage": stage,
			"ownerId": o, "ownerName": by[o].Name, "notes": "", "createdAt": iso(hours(80 + i*4)), "updatedAt": iso(hours(4 + i)),
		}
		if stage == "WON" || stage == "LOST" {
			doc["closedAt"] = iso(hours(30 + i*3))
		}
		if stage == "PROPOSAL" {
			doc["proformaNumber"] = fmt.Sprintf("PF-1405-%04d", 2+i/6)
			doc["proformaAt"] = day(now.AddDate(0, 0, -(i % 5)))
			doc["validUntil"] = day(now.AddDate(0, 0, 7-(i%5)))
			doc["discountPercent"] = 0
			doc["taxPercent"] = 10
			doc["items"] = []jsonx.M{{"title": dealTitles[i%len(dealTitles)], "qty": 1, "unit": "مورد", "unitPrice": amount}}
		}
		if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(doc, "id"), cid, o, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	atypes := []string{"CALL", "NOTE", "MEETING", "FOLLOWUP"}
	atext := map[string]string{
		"CALL": "تماس گرفته شد؛ مشتری علاقه‌مند بود و خواست پیشنهاد کتبی ارسال شود.", "NOTE": "نکته: مشتری بودجهٔ سال آینده را در دست بررسی دارد.",
		"MEETING": "جلسهٔ حضوری برگزار شد و نیازها بررسی گردید.", "FOLLOWUP": "پیگیری و ارسال پیش‌فاکتور",
	}
	for i := 0; i < 16; i++ {
		cIdx := i % len(names)
		cid := fmt.Sprintf("demo-c%d", cIdx+5)
		o := owners[cIdx%len(owners)]
		t := atypes[i%4]
		doc := jsonx.M{
			"id": fmt.Sprintf("demo-a%d", i+5), "customerId": cid, "type": t, "text": atext[t], "ownerId": o, "ownerName": by[o].Name, "authorId": o, "authorName": by[o].Name,
			"createdAt": iso(hours(70 - i*3)),
		}
		if t == "FOLLOWUP" {
			doc["dueDate"] = day(now.AddDate(0, 0, 1+i%6))
			doc["done"] = false
		}
		if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(doc, "id"), cid, o, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---- 24 more notifications for the accounts shown on the login page ----
	targets := []string{"demo-ceo", "demo-secretary", "demo-sales", "demo-staff"}
	kinds := []struct{ kind, label, title, body string }{
		{"letter", "جهت امضا", "نامه جدید جهت امضا از " + by["demo-it1"].Name, "درخواست خرید تجهیزات شبکه"},
		{"file", "فایل جدید", "فایل جدید از " + by["demo-sales2"].Name, "فهرست قیمت‌ها.csv"},
		{"task", "وظیفه جدید", "وظیفه جدید از " + by["demo-ceo"].Name, "بررسی و تطبیق صورتحساب‌های بانکی"},
		{"task", "گزارش روزانه", "گزارش روزانه از " + by["demo-fin2"].Name, "ثبت اسناد و تطبیق حساب‌ها"},
		{"task", "پیگیری امروز", "پیگیری مشتری: شرکت تدبیر صنعت", "ارسال پیش‌فاکتور و پیگیری تأیید"},
		{"letter", "امضا شد", "نامه امضا شد", "ابلاغ دستورالعمل جدید ایمنی محیط کار"},
	}
	for i := 0; i < 24; i++ {
		k := kinds[i%len(kinds)]
		u := targets[i%len(targets)]
		id := fmt.Sprintf("demo-nb%d", i)
		doc := jsonx.M{"id": id, "userId": u, "kind": k.kind, "label": k.label, "title": k.title, "body": k.body, "ref": nil, "createdAt": iso(now.Add(-time.Duration(40+i*25) * time.Minute)), "read": i%5 == 4}
		if err := exec(ctx, `INSERT INTO notifications (id, user_id, data, read) VALUES ($1, $2, $3::jsonb, $4)`, id, u, jsonx.Encode(doc), i%5 == 4); err != nil {
			return err
		}
	}
	// ---- phone call journal: 24 calls over the last three days ----
	type cl struct {
		dir, status, ext, user, num, name, cust, custName string
		mins, secs                                        int
	}
	calls := []cl{
		{"in", "answered", "503", "demo-sales", "09121234567", "", "demo-c1", "شرکت آرمان صنعت - حسین کاظمی", 4, 12},
		{"in", "missed", "503", "demo-sales", "09351112233", "", "demo-c2", "گروه بازرگانی ستاره - نرگس موسوی", 0, 0},
		{"out", "answered", "503", "demo-sales", "09124445566", "", "demo-c3", "داروسازی سلامت - رضا حیدری", 6, 40},
		{"in", "answered", "505", "demo-sales2", "09123000000", "", "", "", 2, 5},
		{"out", "answered", "506", "demo-sales3", "09123007919", "", "", "", 3, 30},
		{"in", "missed", "501", "demo-ceo", "09120001111", "", "", "", 0, 0},
		{"internal", "answered", "502", "demo-secretary", "501", "رامتین هادیان", "", "", 1, 20},
		{"in", "answered", "504", "demo-staff", "09127776655", "", "", "", 5, 2},
		{"out", "busy", "509", "demo-fin2", "09125554433", "", "", "", 0, 0},
		{"in", "answered", "513", "demo-hr1", "09129998877", "", "", "", 7, 45},
		{"internal", "answered", "516", "demo-it1", "517", "ندا شریفی", "", "", 2, 10},
		{"in", "missed", "505", "demo-sales2", "09351234000", "", "", "", 0, 0},
	}
	for i, c := range calls {
		for rep := 0; rep < 2; rep++ {
			start := now.Add(-time.Duration(2+i*3+rep*29) * time.Hour)
			dur := c.mins*60 + c.secs
			if rep == 1 && dur > 0 {
				dur += 25
			}
			var answered any
			if c.status == "answered" {
				answered = start.Add(8 * time.Second)
			}
			if err := exec(ctx, `INSERT INTO voip_calls (id, started_at, answered_at, ended_at, direction, status, ext, exts, user_id, other_num, other_name, customer_id, customer_name, duration_sec)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
				fmt.Sprintf("demo-call-%d-%d", i, rep), start, answered, start.Add(time.Duration(dur+10)*time.Second), c.dir, c.status, c.ext, []string{c.ext}, c.user, c.num, c.name, c.cust, c.custName, dur); err != nil {
				return err
			}
		}
	}
	return nil
}

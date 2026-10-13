package demo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"automation/server/internal/jsonx"
)

// The demo shows every module with every field filled: customers of all three kinds with all their details, the warehouse, the Sepidar page,
// reminders, prices quoted to customers, the permission table with different rights per person.
// Everything here runs only inside Reset(), which never touches a database that holds real data (see safeToWipe).

// validNationalCode builds a valid Iranian national code from a seed (9 digits and the check digit).
func validNationalCode(seed int) string {
	n := fmt.Sprintf("%09d", 100000000+(seed*7919)%899999999)
	sum := 0
	for i := 0; i < 9; i++ {
		sum += int(n[i]-'0') * (10 - i)
	}
	r := sum % 11
	c := r
	if r >= 2 {
		c = 11 - r
	}
	return n + fmt.Sprint(c)
}

func digitsN(seed, n int) string {
	s := fmt.Sprint(1000000000000000 + seed*7919823)
	return s[len(s)-n:]
}

var places = [][2]string{{"تهران", "تهران"}, {"اصفهان", "اصفهان"}, {"خراسان رضوی", "مشهد"}, {"فارس", "شیراز"}, {"آذربایجان شرقی", "تبریز"}, {"البرز", "کرج"}, {"خوزستان", "اهواز"}, {"گیلان", "رشت"}, {"مازندران", "ساری"}, {"یزد", "یزد"}}
var interests = []string{"لپ‌تاپ و ایستگاه کاری برای ۱۲ نفر از کارکنان", "سوئیچ و روتر شبکه برای دفتر جدید", "سرور و ذخیره‌ساز برای مرکز داده", "UPS و باتری برای اتاق سرور", "لایسنس آنتی‌ویروس و آفیس سازمانی", "پیاده‌سازی سامانهٔ اتوماسیون اداری", "قرارداد پشتیبانی ماهانهٔ شبکه و سرور"}
var noteTexts = []string{"مشتری قدیمی؛ پرداخت‌ها به‌موقع است.", "ترجیح می‌دهد صبح‌ها تماس گرفته شود.", "برای خرید عمده تخفیف می‌خواهد.", "پیگیری قیمت و موجودی انجام شود.", "از طریق معرفی آشنا شده؛ جلسهٔ حضوری هماهنگ شد.", "نیاز به مشاورهٔ فنی دارد."}
var tagSets = [][]string{{"مشتری قدیمی", "قرارداد پشتیبانی"}, {"VIP"}, {"نمایندگی"}, {"خرده‌فروش", "پیگیری ماهانه"}, {"سازمانی"}, {"تازه‌وارد"}}

func addModules(ctx context.Context, now time.Time, by map[string]account) error {
	// ---------------- every customer gets every field ----------------
	rows, err := queryRows(ctx, `SELECT id, data FROM crm_customers ORDER BY id`)
	if err != nil {
		return err
	}
	for i, r := range rows {
		d := r.data
		set := func(k string, v any) {
			if cur, ok := d[k]; !ok || cur == nil || cur == "" {
				d[k] = v
			}
		}
		kind := jsonx.Str(d, "kind")
		if kind == "" {
			kind = "PERSON"
			d["kind"] = kind
		}
		name := jsonx.Str(d, "name")
		parts := strings.Fields(name)
		pl := places[i%len(places)]
		set("province", pl[0])
		set("city", pl[1])
		set("postalCode", digitsN(i+3, 10))
		set("website", fmt.Sprintf("www.customer%d.example.ir", i+1))
		set("email", fmt.Sprintf("customer%d@example.ir", i+1))
		set("address", fmt.Sprintf("%s، خیابان %s، پلاک %s، طبقهٔ %s", pl[1], []string{"ولیعصر", "آزادی", "چهارباغ", "امام", "مطهری", "فردوسی"}[i%6], fa(10+i*3), fa(1+i%4)))
		set("interest", interests[i%len(interests)])
		if jsonx.Str(d, "notes") == "" {
			d["notes"] = noteTexts[i%len(noteTexts)]
		}
		if len(jsonx.Strings(d, "tags")) == 0 {
			d["tags"] = tagSets[i%len(tagSets)]
		}
		set("source", []string{"معرفی دوستان", "وب‌سایت", "تماس ورودی", "نمایشگاه", "شبکه‌های اجتماعی", "مشتری قبلی"}[i%6])
		if kind == "PERSON" && len(parts) > 0 {
			set("firstName", parts[0])
			set("lastName", strings.Join(parts[1:], " "))
			set("fatherName", []string{"علی", "محمد", "حسن", "رضا", "مهدی"}[i%5])
			set("idNumber", fmt.Sprint(100+i*37))
			set("gender", map[bool]string{true: "M", false: "F"}[i%3 != 0])
			set("birthDate", fmt.Sprintf("%d-%02d-%02d", 1962+i%32, 1+i%12, 1+(i*5)%27))
			set("nationalCode", validNationalCode(i+11))
		}
		if kind == "COMPANY" {
			set("companyType", []string{"سهامی خاص", "مسئولیت محدود", "تضامنی"}[i%3])
			set("nationalId", digitsN(i+5, 11))
			set("economicCode", digitsN(i+9, 12))
			set("registrationNumber", fmt.Sprint(20000+i*131))
			set("registrationDate", fmt.Sprintf("%d-%02d-%02d", 2008+i%14, 1+i%12, 1+(i*3)%27))
			set("repName", name)
			set("repPosition", []string{"مدیرعامل", "مدیر خرید", "مدیر فروش"}[i%3])
			set("repMobile", fmt.Sprintf("0912%07d", 5100000+i*173))
		}
		// phones: a mobile, two landlines, one of them is the fax; the main number comes first
		phones := jsonx.Strings(d, "phones")
		have := map[string]bool{}
		for _, p := range phones {
			have[p] = true
		}
		add := func(p string) {
			if !have[p] {
				phones = append(phones, p)
				have[p] = true
			}
		}
		if len(phones) == 0 {
			add(fmt.Sprintf("0912%07d", 3300000+i*211))
		}
		land := fmt.Sprintf("0%d%08d", []int{21, 31, 51, 71, 41, 26, 61, 13, 11, 35}[i%10], 22000000+i*9871)
		add(land)
		fax := fmt.Sprintf("0%d%08d", []int{21, 31, 51, 71, 41, 26, 61, 13, 11, 35}[i%10], 22000000+i*9871+1)
		add(fax)
		d["phones"], d["faxNumber"] = phones, fax
		if _, ok := d["referrer"]; !ok && i%3 == 0 {
			d["referrer"] = jsonx.M{"kind": "OTHER", "name": []string{"آقای مهدوی", "خانم رحیمی", "آقای صفایی"}[i%3], "phone": fmt.Sprintf("0912%07d", 6100000+i*97)}
		}
		if err := exec(ctx, `UPDATE crm_customers SET data = $2::jsonb WHERE id = $1`, r.id, jsonx.Encode(d)); err != nil {
			return err
		}
	}

	// ---------------- shops (the third kind of customer) with a won sale each ----------------
	shops := []struct{ id, name, kind, owner, last string }{
		{"demo-shop1", "کامپیوتر آوا", "فروش کامپیوتر و لپ‌تاپ", "اکبر", "جوادی"},
		{"demo-shop2", "دیجی‌نت شبکه", "تجهیزات شبکه و اینترنت", "مهران", "صدری"},
		{"demo-shop3", "مرکز لپ‌تاپ پارس", "لپ‌تاپ و تعمیرات", "داوود", "نیک‌پور"},
		{"demo-shop4", "فروشگاه چاپگر ایران", "چاپگر و لوازم مصرفی", "سعید", "عباسی"},
		{"demo-shop5", "رایانه‌سرای گلستان", "سخت‌افزار و قطعات", "شهرام", "گلزار"},
	}
	for i, s := range shops {
		k := len(rows) + i
		pl := places[(k+2)%len(places)]
		land := fmt.Sprintf("0%d%08d", []int{21, 31, 51, 71, 41}[i], 33100000+i*4411)
		fax := fmt.Sprintf("0%d%08d", []int{21, 31, 51, 71, 41}[i], 33100000+i*4411+1)
		doc := jsonx.M{
			"id": s.id, "name": s.name, "company": s.name, "kind": "SHOP", "shopType": s.kind, "licenseNumber": fmt.Sprintf("%d/%d", 14000+i*77, 5000+i*13),
			"firstName": s.owner, "lastName": s.last, "fatherName": "حسین", "gender": "M", "birthDate": fmt.Sprintf("%d-%02d-%02d", 1965+i*4, 2+i, 9+i*3),
			"nationalCode": validNationalCode(k + 40), "economicCode": digitsN(k+8, 12), "idNumber": fmt.Sprint(300 + i*41),
			"province": pl[0], "city": pl[1], "postalCode": digitsN(k+21, 10), "website": fmt.Sprintf("www.shop%d.example.ir", i+1), "email": fmt.Sprintf("shop%d@example.ir", i+1),
			"address": fmt.Sprintf("%s، پاساژ کامپیوتر، پلاک %s", pl[1], fa(20+i*4)),
			"phones":  []string{fmt.Sprintf("0913%07d", 7200000+i*313), land, fax}, "faxNumber": fax,
			"interest": interests[(k+1)%len(interests)], "notes": noteTexts[(k+2)%len(noteTexts)], "tags": tagSets[(k+i)%len(tagSets)],
			"status": []string{"ACTIVE", "ACTIVE", "LEAD", "ACTIVE", "LEAD"}[i], "source": []string{"معرفی دوستان", "نمایشگاه", "تماس ورودی", "وب‌سایت", "مشتری قبلی"}[i],
			"referrer": jsonx.M{"kind": "STAFF", "id": "demo-sales", "name": by["demo-sales"].Name},
			"ownerId": "demo-sales", "ownerName": by["demo-sales"].Name, "createdAt": iso(now.Add(-time.Duration(50+i*9) * time.Hour)), "updatedAt": iso(now.Add(-time.Duration(3+i) * time.Hour)),
		}
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, s.id, "demo-sales", jsonx.Encode(doc)); err != nil {
			return err
		}
		rows = append(rows, custRow{id: s.id, data: doc})
	}

	// ---------------- sales that were won, spread over the last weeks (the «buyers» report) ----------------
	buyers := []struct {
		cid, title string
		amount     int
		ago        int
	}{
		{"demo-shop1", "خرید عمدهٔ روتر وای‌فای", 38400000, 2}, {"demo-shop2", "سفارش کارتریج لیزری", 21600000, 4}, {"demo-shop3", "سوئیچ شبکه برای شعب", 17700000, 6},
		{"demo-shop4", "یو‌پی‌اس برای اتاق سرور", 29400000, 9}, {"demo-c2", "تمدید پشتیبانی سه‌ماهه", 24000000, 11}, {"demo-c3", "خرید لایسنس سازمانی", 30000000, 15},
		{"demo-shop1", "سفارش تکمیلی هارد SSD", 9600000, 19}, {"demo-c1", "قرارداد خدمات فصلی", 45000000, 24}, {"demo-shop5", "لایسنس آنتی‌ویروس", 7200000, 27},
	}
	for i, b := range buyers {
		name := ""
		for _, r := range rows {
			if r.id == b.cid {
				name = jsonx.Str(r.data, "name")
			}
		}
		if name == "" {
			continue
		}
		at := now.Add(-time.Duration(b.ago) * 24 * time.Hour)
		doc := jsonx.M{"id": fmt.Sprintf("demo-w%d", i+1), "title": b.title, "customerId": b.cid, "customerName": name, "amount": b.amount, "stage": "WON", "closedAt": iso(at),
			"ownerId": "demo-sales", "ownerName": by["demo-sales"].Name, "notes": "", "createdAt": iso(at.Add(-72 * time.Hour)), "updatedAt": iso(at)}
		// the shop sales carry the product lines (code, count, price) so the profit report has something to work out
		if l, ok := map[int][3]int{0: {1001, 12, 3200000}, 1: {1003, 18, 1200000}, 2: {1002, 3, 5900000}, 3: {1005, 3, 9800000}, 6: {1004, 4, 2400000}, 8: {1006, 15, 480000}}[i]; ok {
			doc["items"] = []jsonx.M{{"title": b.title, "code": fmt.Sprint(l[0]), "qty": l[1], "unit": "عدد", "unitPrice": l[2]}}
		}
		if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(doc, "id"), b.cid, "demo-sales", jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---------------- prices quoted to customers (link them to the warehouse's products) ----------------
	type quote struct {
		cid, title, pid, code, unit, spec string
		qty                               int
		price, asked, ago                 int
		by                                string
	}
	quotes := []quote{
		{"demo-c4", "روتر وای‌فای ax1800", "p-router", "1001", "عدد", "دو بانده", 6, 3450000, 3200000, 2, "demo-sales"},
		{"demo-c4", "هارد SSD ۵۱۲ گیگ", "p-ssd", "1004", "عدد", "اینترنال SATA", 2, 2350000, 0, 5, "demo-sales"},
		{"demo-c1", "سوئیچ ۲۴ پورت گیگابیت", "p-switch", "1002", "عدد", "قیمت نمایندگی", 4, 5400000, 5000000, 1, "demo-sales2"},
		{"demo-c1", "لایسنس آنتی‌ویروس سازمانی", "p-av", "1006", "لایسنس", "", 10, 420000, 0, 4, "demo-sales2"},
		{"demo-c2", "کارتریج لیزری HP 85A", "p-toner", "1003", "عدد", "برای ۱۲ چاپگر", 24, 1100000, 1000000, 3, "demo-sales"},
		{"demo-c3", "یو‌پی‌اس ۱۰۰۰ ولت آنلاین", "p-ups", "1005", "دستگاه", "", 2, 9800000, 0, 6, "demo-sales3"},
		{"demo-shop1", "روتر وای‌فای ax1800", "p-router", "1001", "عدد", "قیمت عمده", 40, 3100000, 3000000, 2, "demo-sales"},
		{"demo-shop2", "لایسنس آنتی‌ویروس سازمانی", "p-av", "1006", "لایسنس", "قیمت عمده", 30, 420000, 400000, 4, "demo-sales3"},
		{"demo-shop3", "هارد SSD ۵۱۲ گیگ", "p-ssd", "1004", "عدد", "", 12, 2100000, 0, 7, "demo-sales2"},
		{"demo-shop4", "سوئیچ ۲۴ پورت گیگابیت", "p-switch", "1002", "عدد", "", 10, 5400000, 5200000, 8, "demo-sales"},
	}
	for i, q := range quotes {
		at := now.Add(-time.Duration(q.ago)*24*time.Hour - time.Duration(i)*time.Hour)
		doc := jsonx.M{"id": fmt.Sprintf("demo-q%d", i+1), "customerId": q.cid, "type": "QUOTE", "text": "قیمت «" + q.title + "»", "itemName": q.title, "productId": q.pid, "productCode": q.code, "unit": q.unit, "qty": q.qty, "price": q.price,
			"ownerId": q.by, "ownerName": by[q.by].Name, "authorId": q.by, "authorName": by[q.by].Name, "createdAt": iso(at)}
		if q.asked > 0 {
			doc["askedPrice"] = q.asked
		}
		if q.spec != "" {
			doc["spec"] = q.spec
		}
		if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data, created_at) VALUES ($1, $2, $3, $4::jsonb, $5)`, jsonx.Str(doc, "id"), q.cid, q.by, jsonx.Encode(doc), at); err != nil {
			return err
		}
	}

	// ---------------- the rights of each person (the permission table has something to show) ----------------
	type rights struct {
		mobile string
		patch  jsonx.M
	}
	perUser := map[string]jsonx.M{
		"demo-secretary": {"canUseWarehouse": true, "canPostAnnouncements": true, "canUseWarranty": true, "sepidarPerms": []string{"view"}},
		"demo-sales":     {"canSendSms": true, "canUseWarranty": true, "canUseWarehouse": true, "sepidarPerms": []string{"view", "customer", "quotation"}},
		"demo-staff":     {"canUseWarehouse": true, "canViewStats": true, "sepidarPerms": []string{"view", "invoice", "receipt"}, "hiddenSub": []string{"warehouse.write"}},
		"demo-sales2":    {"canSendSms": true, "canUseWarranty": true, "sepidarPerms": []string{"view", "quotation"}, "hiddenSub": []string{"crm.import"}},
		"demo-sales3":    {"canSeeTeamCrm": true, "canSendSms": true, "canViewStats": true, "sepidarPerms": []string{"view", "customer", "quotation", "invoice"}, "hiddenSub": []string{"crm.import", "crm.proforma"}},
		"demo-sales4":    {"canSendSms": true, "hiddenSub": []string{"crm.reports", "crm.phonebook"}},
		"demo-sales5":    {"canUseWarranty": true, "hiddenSub": []string{"files.chat"}},
		"demo-fin2":      {"canUseWarehouse": true, "sepidarPerms": []string{"view", "invoice", "receipt"}},
		"demo-fin3":      {"canUseWarehouse": true, "hiddenSub": []string{"warehouse.write", "warehouse.warehouses"}},
		"demo-fin4":      {"sepidarPerms": []string{"view", "receipt"}, "canViewStats": true},
		"demo-hr1":       {"canPostAnnouncements": true, "hiddenSub": []string{"tasks.reports"}},
		"demo-it1":       {"canUseWarranty": true, "canViewStats": true, "canPostAnnouncements": true},
		"demo-it3":       {"canUseWarranty": true, "hiddenSub": []string{"warranty.warranty"}},
	}
	urows, err := queryRows(ctx, `SELECT id, data FROM users ORDER BY id`)
	if err != nil {
		return err
	}
	for i, u := range urows {
		d := u.data
		if jsonx.Str(d, "mobile") == "" {
			d["mobile"] = fmt.Sprintf("0912%07d", 1200000+i*3917)
		}
		for k, v := range perUser[u.id] {
			d[k] = v
		}
		if err := exec(ctx, `UPDATE users SET data = $2::jsonb WHERE id = $1`, u.id, jsonx.Encode(d)); err != nil {
			return err
		}
	}

	if err := addWarehouse(ctx, now, by); err != nil {
		return err
	}
	if err := addSepidar(ctx, now, by); err != nil {
		return err
	}
	// ---------------- leave taken by people (the «خلاصهٔ مرخصی‌ها» of each person has something to show) ----------------
	type leaveRow struct {
		user, typ, label, status, reason, decider string
		ago, days                                  int
		fromTime, toTime                           string
	}
	leaves := []leaveRow{
		{"demo-ceo", "ANNUAL", "مرخصی استحقاقی", "APPROVED", "سفر خانوادگی", "demo-ceo", 42, 3, "", ""},
		{"demo-ceo", "SICK", "مرخصی استعلاجی", "APPROVED", "سرماخوردگی", "demo-ceo", 78, 2, "", ""},
		{"demo-ceo", "MISSION", "ماموریت", "APPROVED", "بازدید از نمایشگاه شیراز", "demo-ceo", 26, 2, "", ""},
		{"demo-ceo", "HOURLY", "مرخصی ساعتی", "APPROVED", "کار شخصی", "demo-ceo", 12, 1, "09:00", "13:00"},
		{"demo-ceo", "ANNUAL", "مرخصی استحقاقی", "PENDING", "", "", -10, 2, "", ""},
		{"demo-sales", "ANNUAL", "مرخصی استحقاقی", "APPROVED", "", "demo-sales2", 55, 5, "", ""},
		{"demo-sales", "HOURLY", "مرخصی ساعتی", "APPROVED", "مراجعه به بانک", "demo-sales2", 9, 1, "10:00", "12:30"},
		{"demo-sales", "UNPAID", "مرخصی بدون حقوق", "REJECTED", "هماهنگ نشد", "demo-sales2", 20, 1, "", ""},
		{"demo-sales", "ANNUAL", "مرخصی استحقاقی", "PENDING", "", "", -6, 2, "", ""},
		{"demo-fin3", "ANNUAL", "مرخصی استحقاقی", "PENDING", "", "", -4, 2, "", ""},
		{"demo-it2", "SICK", "مرخصی استعلاجی", "APPROVED", "عمل دندان", "demo-it1", 33, 3, "", ""},
	}
	for i, l := range leaves {
		from := now.AddDate(0, 0, -l.ago)
		to := from.AddDate(0, 0, l.days-1)
		doc := jsonx.M{"id": fmt.Sprintf("demo-lv%d", i+1), "userId": l.user, "userName": by[l.user].Name, "type": l.typ, "typeLabel": l.label, "fromDate": day(from), "toDate": day(to),
			"reason": l.reason, "status": l.status, "createdAt": iso(from.AddDate(0, 0, -3))}
		if l.typ == "HOURLY" {
			doc["toDate"], doc["fromTime"], doc["toTime"] = day(from), l.fromTime, l.toTime
		}
		if l.decider != "" {
			doc["decidedBy"], doc["decidedByName"], doc["decidedAt"] = l.decider, by[l.decider].Name, iso(from.AddDate(0, 0, -2))
		}
		if err := exec(ctx, `INSERT INTO leave_requests (id, user_id, status, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(doc, "id"), l.user, l.status, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	// ---------------- reminders ----------------
	rem := []struct {
		user, title, note, repeat, status string
		hours                             int
	}{
		{"demo-ceo", "تماس با آقای کاظمی برای تأیید پیش‌فاکتور", "سؤال کنید تأییدیه را فرستاده‌اند یا نه.", "none", "pending", 20},
		{"demo-ceo", "ارسال گزارش فروش هفتگی", "برای هیئت‌مدیره", "weekly", "pending", 52},
		{"demo-ceo", "پرداخت قسط بیمهٔ انبار", "", "none", "pending", 96},
		{"demo-ceo", "بازبینی قیمت‌های عمده", "قیمت روتر و سوئیچ را با تأمین‌کننده چک کنید.", "daily", "pending", 30},
		{"demo-ceo", "جلسهٔ هماهنگی با فروش", "", "none", "done", -30},
		{"demo-sales", "پیگیری مشتری‌های بدون پاسخ", "", "daily", "pending", 24},
		{"demo-secretary", "هماهنگی جلسهٔ فردا", "", "none", "pending", 14},
	}
	for i, r := range rem {
		due := now.Add(time.Duration(r.hours) * time.Hour)
		if err := exec(ctx, `INSERT INTO reminders (id, user_id, title, note, due_at, repeat, status, done_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			fmt.Sprintf("demo-rm%d", i+1), r.user, r.title, r.note, due, r.repeat, r.status, func() any {
				if r.status == "done" {
					return due
				}
				return nil
			}()); err != nil {
			return err
		}
	}
	return nil
}

type custRow struct {
	id   string
	data jsonx.M
}

func queryRows(ctx context.Context, sql string) ([]custRow, error) {
	return queryRowsStore(ctx, sql)
}

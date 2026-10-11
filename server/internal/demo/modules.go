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
var interests = []string{"روغن موتور و فیلتر برای ناوگان ۱۲ خودرو", "لنت و دیسک ترمز پژو ۲۰۶", "تسمه تایم و واترپمپ سمند", "ضدیخ عمده، ماهانه ۴۰ گالن", "شمع و وایر موتور", "لوازم یدکی خودروهای سنگین", "قیمت عمدهٔ فیلتر هوا"}
var noteTexts = []string{"مشتری قدیمی؛ پرداخت‌ها به‌موقع است.", "ترجیح می‌دهد صبح‌ها تماس گرفته شود.", "برای خرید عمده تخفیف می‌خواهد.", "پیگیری قیمت و موجودی انجام شود.", "از طریق معرفی آشنا شده؛ جلسهٔ حضوری هماهنگ شد.", "نیاز به مشاورهٔ فنی دارد."}
var tagSets = [][]string{{"مشتری قدیمی", "عمده"}, {"VIP"}, {"نمایندگی"}, {"خرده‌فروش", "پیگیری ماهانه"}, {"صنعتی"}, {"تازه‌وارد"}}

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
		{"demo-shop1", "لوازم یدکی ستاره", "لوازم یدکی خودرو", "اکبر", "جوادی"},
		{"demo-shop2", "فروشگاه روغن و فیلتر آسمان", "روان‌کار و فیلتر", "مهران", "صدری"},
		{"demo-shop3", "مرکز تعمیرات و لوازم پارس", "تعمیرگاه و لوازم", "داوود", "نیک‌پور"},
		{"demo-shop4", "فروشگاه لنت و ترمز ایران", "ترمز", "سعید", "عباسی"},
		{"demo-shop5", "لوازم یدکی گلستان", "لوازم یدکی خودرو", "شهرام", "گلزار"},
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
			"address": fmt.Sprintf("%s، بازار لوازم یدکی، پلاک %s", pl[1], fa(20+i*4)),
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
		{"demo-shop1", "خرید عمدهٔ روغن موتور و فیلتر", 38400000, 2}, {"demo-shop2", "سفارش ضدیخ و روغن", 21600000, 4}, {"demo-shop3", "لنت و تسمه تایم", 17500000, 6},
		{"demo-shop4", "لنت ترمز دو پالت", 29800000, 9}, {"demo-c2", "تمدید پشتیبانی سه‌ماهه", 24000000, 11}, {"demo-c3", "خرید لایسنس سازمانی", 30000000, 15},
		{"demo-shop1", "سفارش تکمیلی فیلتر", 9600000, 19}, {"demo-c1", "قرارداد خدمات فصلی", 45000000, 24}, {"demo-shop5", "شمع و وایر", 7200000, 27},
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
		{"demo-c4", "روغن موتور ۵ لیتری", "p-oil", "1001", "عدد", "سینتتیک ۵W-40", 6, 1450000, 1350000, 2, "demo-sales"},
		{"demo-c4", "لنت ترمز جلو پژو ۲۰۶", "p-pad", "1004", "جفت", "مارک اصلی", 2, 1250000, 0, 5, "demo-sales"},
		{"demo-c1", "تسمه تایم سمند", "p-belt", "1003", "عدد", "قیمت نمایندگی", 4, 780000, 700000, 1, "demo-sales2"},
		{"demo-c1", "ضدیخ ۴ لیتری", "p-coolant", "1006", "گالن", "", 10, 340000, 0, 4, "demo-sales2"},
		{"demo-c2", "فیلتر روغن پراید", "p-filter", "1002", "عدد", "برای ۱۲ خودرو", 24, 160000, 150000, 3, "demo-sales"},
		{"demo-c3", "شمع موتور پایه کوتاه", "p-plug", "1005", "ست", "", 8, 560000, 0, 6, "demo-sales3"},
		{"demo-shop1", "روغن موتور ۵ لیتری", "p-oil", "1001", "عدد", "قیمت عمده", 40, 1300000, 1250000, 2, "demo-sales"},
		{"demo-shop2", "ضدیخ ۴ لیتری", "p-coolant", "1006", "گالن", "قیمت عمده", 30, 340000, 320000, 4, "demo-sales3"},
		{"demo-shop3", "لنت ترمز جلو پژو ۲۰۶", "p-pad", "1004", "جفت", "", 12, 1100000, 0, 7, "demo-sales2"},
		{"demo-shop4", "تسمه تایم سمند", "p-belt", "1003", "عدد", "", 10, 780000, 750000, 8, "demo-sales"},
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
		"demo-sales3":    {"canSendSms": true, "canViewStats": true, "sepidarPerms": []string{"view", "customer", "quotation", "invoice"}, "hiddenSub": []string{"crm.import", "crm.proforma"}},
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
	// ---------------- reminders ----------------
	rem := []struct {
		user, title, note, repeat, status string
		hours                             int
	}{
		{"demo-ceo", "تماس با آقای کاظمی برای تأیید پیش‌فاکتور", "سؤال کنید تأییدیه را فرستاده‌اند یا نه.", "none", "pending", 20},
		{"demo-ceo", "ارسال گزارش فروش هفتگی", "برای هیئت‌مدیره", "weekly", "pending", 52},
		{"demo-ceo", "پرداخت قسط بیمهٔ انبار", "", "none", "pending", 96},
		{"demo-ceo", "بازبینی قیمت‌های عمده", "قیمت روغن و فیلتر را با تأمین‌کننده چک کنید.", "daily", "pending", 30},
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

package demo

import (
	"context"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"automation/server/internal/jsonx"
)

// The demo is made full: a hundred and fifty more customers (people, companies, shops) with their opportunities, notes, calls
// and follow-ups spread over the last year, and thirty more tasks. Everything is made from a fixed seed, so every reset gives
// the same demo. addCrowd runs before addModules (which gives every customer its codes and addresses); addSocial runs at the end.

var (
	maleFirst   = []string{"محمد", "علی", "رضا", "حسین", "مهدی", "امیر", "حسن", "سعید", "بهنام", "کیوان", "آرش", "پویا", "سینا", "نیما", "فرهاد", "کاوه", "بابک", "داریوش", "یوسف", "مصطفی"}
	femaleFirst = []string{"فاطمه", "زهرا", "مریم", "سارا", "نگار", "مینا", "ندا", "الهام", "شیما", "لیلا", "پریسا", "نازنین", "سمیرا", "آزاده", "مهسا", "ثمین", "رویا", "شقایق"}
	lastNames   = []string{"احمدی", "رضایی", "کریمی", "حسینی", "موسوی", "جعفری", "صادقی", "محمدی", "قاسمی", "نوری", "اکبری", "رحیمی", "یزدانی", "مرادی", "کاظمی", "امینی", "طاهری", "فرهادی", "زارعی", "شریفی", "عباسی", "نصیری", "سلیمانی", "حیدری", "پورمحمد", "بهرامی"}
	latinMale   = []string{"mohammad", "ali", "reza", "hossein", "mehdi", "amir", "hassan", "saeed", "behnam", "keyvan", "arash", "pouya", "sina", "nima", "farhad", "kaveh", "babak", "dariush", "yousef", "mostafa"}
	latinFemale = []string{"fatemeh", "zahra", "maryam", "sara", "negar", "mina", "neda", "elham", "shima", "leila", "parisa", "nazanin", "samira", "azadeh", "mahsa", "samin", "roya", "shaghayegh"}
	latinLast   = []string{"ahmadi", "rezaei", "karimi", "hosseini", "mousavi", "jafari", "sadeghi", "mohammadi", "ghasemi", "nouri", "akbari", "rahimi", "yazdani", "moradi", "kazemi", "amini", "taheri", "farhadi", "zarei", "sharifi", "abbasi", "nasiri", "soleimani", "heidari", "pourmohammad", "bahrami"}
	coPrefix    = []string{"شرکت", "گروه صنعتی", "شرکت بازرگانی", "کارخانه", "شرکت مهندسی", "شرکت خدماتی", "مجتمع"}
	coWord      = []string{"آریا", "پارس", "سپهر", "نیکان", "آوا", "تدبیر", "کیان", "البرز", "زاگرس", "دنا", "سیمرغ", "فرهنگ", "رسا", "نگین", "صبا", "ماهان", "آفتاب", "مهرگان", "یگانه", "پویا", "ایرانیان", "بنیان", "کوثر", "امید"}
	coLatin     = []string{"arya", "pars", "sepehr", "nikan", "ava", "tadbir", "kian", "alborz", "zagros", "dena", "simorgh", "farhang", "rasa", "negin", "saba", "mahan", "aftab", "mehregan", "yegane", "pouya", "iranian", "bonyan", "kowsar", "omid"}
	shopTypes   = []string{"پوشاک", "لوازم خانگی", "مواد غذایی", "لوازم‌التحریر", "موبایل و کامپیوتر", "لوازم یدکی", "طلا و جواهر", "کتاب و لوازم هنری"}
	crowdPlaces      = [][2]string{{"تهران", "تهران"}, {"اصفهان", "اصفهان"}, {"فارس", "شیراز"}, {"خراسان رضوی", "مشهد"}, {"آذربایجان شرقی", "تبریز"}, {"خوزستان", "اهواز"}, {"کرمان", "کرمان"}, {"گیلان", "رشت"}, {"مازندران", "ساری"}, {"البرز", "کرج"}, {"قم", "قم"}, {"یزد", "یزد"}, {"هرمزگان", "بندرعباس"}, {"همدان", "همدان"}, {"کرمانشاه", "کرمانشاه"}}
	dealTitles  = []string{"قرارداد پشتیبانی سالانه", "پیاده‌سازی سامانهٔ اتوماسیون", "خرید لایسنس سازمانی", "آموزش کارکنان", "مشاورهٔ فناوری", "تمدید قرارداد", "نصب و راه‌اندازی شبکه", "توسعهٔ ماژول اختصاصی", "خرید تجهیزات شبکه", "سامانهٔ دوربین مداربسته", "طراحی وب‌سایت", "راه‌اندازی مرکز تماس", "پشتیبانی ماهانه", "ارتقای سرور", "ممیزی امنیت شبکه"}
	sources     = []string{"معرفی دوستان", "وب‌سایت", "تماس ورودی", "نمایشگاه", "شبکه‌های اجتماعی", "مشتری قبلی", "اینستاگرام", "تبلیغات"}
	lostReasons = []string{"قیمت بالاتر بود", "از رقیب خرید کرد", "بودجه نداشت", "فعلاً نیازی ندارد"}
	taskTitles  = []string{"تهیهٔ گزارش فروش هفتگی", "بازبینی قراردادهای در جریان", "هماهنگی تحویل تجهیزات", "پیگیری مطالبات معوق", "به‌روزرسانی فهرست مشتریان", "آماده‌سازی ارائه برای جلسه", "بررسی شکایت‌های مشتریان", "ثبت اسناد پایان ماه", "تماس با مشتریان غیرفعال", "تهیهٔ پیش‌فاکتور مشتریان کلیدی", "برگزاری جلسهٔ آموزشی", "بازدید از دفتر شعبه", "تطبیق موجودی انبار", "پاسخ به استعلام‌های رسیده", "طراحی پوستر نمایشگاه"}
)

func pickS(r *rand.Rand, list []string) string { return list[r.Intn(len(list))] }

func addCrowd(ctx context.Context, now time.Time, by map[string]account) error {
	r := rand.New(rand.NewSource(20261031))
	owners := []string{"demo-sales", "demo-sales2", "demo-sales3", "demo-sales4", "demo-sales5"}
	hoursAgo := func(h int) time.Time { return now.Add(-time.Duration(h) * time.Hour) }
	dealN, actN, pfN := 0, 0, 40

	const count = 150
	for i := 0; i < count; i++ {
		id := fmt.Sprintf("demo-x%03d", i+1)
		o := owners[i%len(owners)]
		pl := crowdPlaces[r.Intn(len(crowdPlaces))]
		kind := "PERSON"
		switch k := r.Intn(100); {
		case k >= 85:
			kind = "SHOP"
		case k >= 60:
			kind = "COMPANY"
		}
		female := r.Intn(100) < 40
		first := pickS(r, maleFirst)
		if female {
			first = pickS(r, femaleFirst)
		}
		last := pickS(r, lastNames)
		person := first + " " + last
		doc := jsonx.M{
			"id": id, "kind": kind, "phones": []string{fmt.Sprintf("09%02d%07d", []int{12, 13, 15, 19, 21, 35, 36, 37, 90, 91}[r.Intn(10)], 1000000+(i*7919+r.Intn(900))%8999999)},
			"province": pl[0], "city": pl[1], "address": fmt.Sprintf("%s، خیابان شمارهٔ %s، پلاک %s", pl[1], fa(r.Intn(60)+1), fa(r.Intn(300)+1)),
			"status": []string{"ACTIVE", "ACTIVE", "LEAD", "LEAD", "INACTIVE"}[r.Intn(5)], "source": pickS(r, sources), "tags": []string{}, "ownerId": o, "ownerName": by[o].Name, "notes": "",
			"createdAt": iso(hoursAgo(24 * (3 + r.Intn(420)))), "updatedAt": iso(hoursAgo(1 + r.Intn(200))),
		}
		switch kind {
		case "COMPANY":
			co := pickS(r, coPrefix) + " " + pickS(r, coWord)
			doc["name"], doc["company"], doc["repName"], doc["repPosition"] = person, co, person, "مدیرعامل"
			doc["email"] = fmt.Sprintf("info@%s.example", fmt.Sprint(i+1))
		case "SHOP":
			doc["name"], doc["company"] = "فروشگاه "+pickS(r, coWord), "فروشگاه "+pickS(r, coWord)
			doc["firstName"], doc["lastName"], doc["shopType"] = first, last, pickS(r, shopTypes)
			doc["name"] = doc["company"]
		default:
			doc["name"], doc["firstName"], doc["lastName"] = person, first, last
			if female {
				doc["gender"] = "F"
			} else {
				doc["gender"] = "M"
			}
			doc["email"] = fmt.Sprintf("customer%d@example.com", i+20)
		}
		if r.Intn(100) < 40 {
			doc["birthDate"] = fmt.Sprintf("%04d-%02d-%02d", 1350+r.Intn(45), 1+r.Intn(12), 1+r.Intn(28)) // Gregorian-looking date, shown in the Persian calendar
		}
		if r.Intn(100) < 30 {
			doc["phones"] = append(doc["phones"].([]string), fmt.Sprintf("021%08d", 22000000+r.Intn(5000000)))
		}
		if r.Intn(100) < 18 {
			doc["referrer"] = jsonx.M{"kind": "STAFF", "id": "demo-sales2", "name": by["demo-sales2"].Name}
		}
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, id, o, jsonx.Encode(doc)); err != nil {
			return err
		}
		name := jsonx.Str(doc, "name")

		// opportunities
		if r.Intn(100) < 72 {
			n := 1 + r.Intn(2)
			if r.Intn(100) < 15 {
				n++
			}
			for j := 0; j < n; j++ {
				dealN++
				stage := []string{"NEW", "NEW", "CONTACTED", "CONTACTED", "CONTACTED", "PROPOSAL", "PROPOSAL", "PROPOSAL", "NEGOTIATION", "NEGOTIATION", "WON", "WON", "WON", "WON", "LOST", "LOST"}[r.Intn(16)]
				amount := (2 + r.Intn(90)) * 5000000
				created := hoursAgo(24 * (2 + r.Intn(300)))
				title := pickS(r, dealTitles)
				d := jsonx.M{
					"id": fmt.Sprintf("demo-xd%03d", dealN), "title": title, "customerId": id, "customerName": name, "amount": amount, "stage": stage, "ownerId": o, "ownerName": by[o].Name, "notes": "",
					"createdAt": iso(created), "updatedAt": iso(hoursAgo(1 + r.Intn(24*40))),
				}
				if stage == "WON" || stage == "LOST" {
					d["closedAt"] = iso(created.Add(time.Duration(48+r.Intn(24*30)) * time.Hour))
					if stage == "LOST" {
						d["lostReason"] = pickS(r, lostReasons)
					}
				} else if r.Intn(100) < 60 {
					d["expectedClose"] = day(now.AddDate(0, 0, r.Intn(40)-3))
				}
				if stage == "PROPOSAL" || stage == "NEGOTIATION" || stage == "WON" {
					pfN++
					d["proformaNumber"] = fmt.Sprintf("PF-1405-%04d", pfN)
					d["proformaAt"] = day(created.AddDate(0, 0, 1))
					d["validUntil"] = day(created.AddDate(0, 0, 8))
					d["discountPercent"], d["taxPercent"] = 0, 10
					d["items"] = []jsonx.M{{"title": title, "qty": 1, "unit": "مورد", "unitPrice": amount}}
				}
				if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(d, "id"), id, o, jsonx.Encode(d)); err != nil {
					return err
				}
			}
		}

		// notes, calls, meetings and follow-ups
		for j, na := 0, r.Intn(4); j < na; j++ {
			actN++
			t := []string{"CALL", "CALL", "NOTE", "MEETING", "FOLLOWUP", "FOLLOWUP"}[r.Intn(6)]
			text := map[string]string{
				"CALL":     "تماس گرفته شد؛ مشتری علاقه‌مند بود و خواست پیشنهاد کتبی ارسال شود.",
				"NOTE":     "نکته: مشتری بودجهٔ سال آینده را در دست بررسی دارد.",
				"MEETING":  "جلسهٔ حضوری برگزار شد و نیازها بررسی گردید.",
				"FOLLOWUP": "پیگیری و ارسال پیش‌فاکتور",
			}[t]
			a := jsonx.M{
				"id": fmt.Sprintf("demo-xa%03d", actN), "customerId": id, "type": t, "text": text, "ownerId": o, "ownerName": by[o].Name, "authorId": o, "authorName": by[o].Name,
				"createdAt": iso(hoursAgo(1 + r.Intn(24*200))),
			}
			if t == "FOLLOWUP" {
				a["dueDate"] = day(now.AddDate(0, 0, r.Intn(14)-4))
				a["done"] = r.Intn(100) < 35
			}
			if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(a, "id"), id, o, jsonx.Encode(a)); err != nil {
				return err
			}
		}
	}

	// ---- tasks: thirty more, between the managers and the staff ----
	creators := []string{"demo-ceo", "demo-secretary", "demo-gen2", "demo-hr1", "demo-fin2", "demo-it1"}
	workers := []string{"demo-sales", "demo-sales2", "demo-sales3", "demo-staff", "demo-fin3", "demo-it2", "demo-hr2", "demo-gen3"}
	for i := 0; i < 30; i++ {
		id := fmt.Sprintf("demo-xt%02d", i+1)
		creator := creators[r.Intn(len(creators))]
		who := []string{workers[r.Intn(len(workers))]}
		if r.Intn(100) < 30 {
			who = append(who, workers[r.Intn(len(workers))])
		}
		status := []string{"TODO", "TODO", "IN_PROGRESS", "IN_PROGRESS", "REVIEW", "DONE", "DONE"}[r.Intn(7)]
		ck := []jsonx.M{
			{"id": id + "-k1", "text": "جمع‌آوری اطلاعات", "done": status != "TODO"},
			{"id": id + "-k2", "text": "تهیهٔ پیش‌نویس", "done": status == "REVIEW" || status == "DONE"},
			{"id": id + "-k3", "text": "بازبینی نهایی", "done": status == "DONE"},
		}
		doc := jsonx.M{
			"id": id, "title": pickS(r, taskTitles), "description": "", "status": status, "priority": []string{"LOW", "MEDIUM", "MEDIUM", "HIGH", "URGENT"}[r.Intn(5)],
			"creatorId": creator, "creatorName": by[creator].Name, "assigneeIds": who, "dueDate": day(now.AddDate(0, 0, r.Intn(24)-6)), "checklist": ck,
			"createdAt": iso(hoursAgo(24 * (1 + r.Intn(30)))), "updatedAt": iso(hoursAgo(1 + r.Intn(100))), "comments": []jsonx.M{},
		}
		if status == "DONE" {
			doc["completedAt"] = iso(hoursAgo(1 + r.Intn(24*10)))
		}
		if err := exec(ctx, `INSERT INTO tasks (id, creator_id, assignee_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, id, creator, who, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	return nil
}

// addSocial gives most customers their networks (Bale, Eitaa, Rubika, Instagram, WhatsApp, WhatsApp Business, Telegram and a web address),
// with accounts and counts of interactions, and writes the ready-made messages the staff can send to them.
func addSocial(ctx context.Context, now time.Time, by map[string]account) error {
	rows, err := queryRows(ctx, `SELECT id, data FROM crm_customers ORDER BY id`)
	if err != nil {
		return err
	}
	r := rand.New(rand.NewSource(77))
	type net struct {
		id     string
		weight int // out of 100
	}
	nets := []net{{"whatsapp", 78}, {"telegram", 52}, {"instagram", 48}, {"eitaa", 30}, {"bale", 30}, {"rubika", 12}, {"whatsappBusiness", 11}, {"website", 22}}
	for _, row := range rows {
		d := row.data
		if r.Intn(100) >= 88 { // some customers really have none
			continue
		}
		phones := jsonx.Strings(d, "phones")
		mobile := ""
		for _, p := range phones {
			if strings.HasPrefix(p, "09") {
				mobile = p
				break
			}
		}
		fi, li := r.Intn(len(latinMale)+len(latinFemale)), r.Intn(len(latinLast))
		fn := append(append([]string{}, latinMale...), latinFemale...)[fi]
		user := fn + "_" + latinLast[li]
		if r.Intn(100) < 40 {
			user = fn + "." + latinLast[li] + fmt.Sprint(r.Intn(90)+10)
		}
		social := jsonx.M{}
		for _, n := range nets {
			if r.Intn(100) >= n.weight {
				continue
			}
			var accounts []string
			switch n.id {
			case "instagram":
				accounts = []string{user}
				if r.Intn(100) < 20 {
					accounts = append(accounts, coLatin[r.Intn(len(coLatin))]+"_official")
				}
			case "website":
				accounts = []string{coLatin[r.Intn(len(coLatin))] + "-" + latinLast[li] + ".ir"}
			case "telegram", "eitaa", "bale", "rubika":
				if mobile != "" && r.Intn(100) < 55 {
					accounts = []string{mobile}
				} else {
					accounts = []string{user}
				}
				if n.id == "eitaa" && r.Intn(100) < 15 {
					accounts = []string{fmt.Sprint(1000000 + r.Intn(9000000))}
				}
			default: // whatsapp, whatsappBusiness: the mobile number
				if mobile == "" {
					continue
				}
				accounts = []string{mobile}
			}
			count := 0
			if r.Intn(100) < 70 {
				count = 1 + r.Intn(14)
				if r.Intn(100) < 12 {
					count += r.Intn(30)
				}
			}
			social[n.id] = jsonx.M{"on": true, "accounts": accounts, "count": count}
		}
		if len(social) == 0 {
			continue
		}
		d["social"] = social
		if err := exec(ctx, `UPDATE crm_customers SET data = $2::jsonb WHERE id = $1`, row.id, jsonx.Encode(d)); err != nil {
			return err
		}
	}

	templates := []jsonx.M{
		{"id": "tm-intro", "title": "معرفی شرکت", "text": "{name} گرامی، با سلام و احترام.\nشرکت داده پرداز هورمند در حوزهٔ هوش مصنوعی و سامانه‌های سازمانی فعالیت می‌کند. خوشحال می‌شویم در خدمت شما باشیم.", "link": "https://" + demoSite},
		{"id": "tm-catalog", "title": "ارسال کاتالوگ محصولات", "text": "{name} گرامی، کاتالوگ محصولات و خدمات ما را برایتان فرستادیم. هر پرسشی بود در خدمتیم.", "link": "https://" + demoSite + "/catalog"},
		{"id": "tm-proforma", "title": "یادآوری پیش‌فاکتور", "text": "{name} گرامی، پیش‌فاکتور ارسال‌شده تا چند روز دیگر اعتبار دارد. در صورت نیاز به اصلاح یا توضیح بیشتر، پیام بدهید."},
		{"id": "tm-thanks", "title": "تشکر از خرید", "text": "{name} عزیز، از اعتماد و خرید شما سپاسگزاریم. پشتیبانی ما همیشه در کنار شماست."},
		{"id": "tm-expo", "title": "دعوت به نمایشگاه", "text": "{name} گرامی، غرفهٔ ما در نمایشگاه هوش مصنوعی میزبان شماست. منتظر دیدارتان هستیم.", "link": "https://" + demoSite + "/expo"},
		{"id": "tm-contact", "title": "راه‌های ارتباطی با ما", "text": "{name} گرامی، می‌توانید ما را از طریق شبکه‌های اجتماعی پیگیری نمایید.", "link": "https://" + demoSite},
	}
	return exec(ctx, `UPDATE settings SET data = data || $1::jsonb WHERE key = 'main'`, jsonx.Encode(jsonx.M{"customerMsgTemplates": templates}))
}

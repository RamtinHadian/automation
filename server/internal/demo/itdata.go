package demo

import (
	"context"
	"fmt"
	"os"
	"time"

	"automation/server/internal/jsonx"
)

// addITData fills the demo with a large set of samples from the IT and information-technology trade: companies that buy network gear,
// servers, software licences, hosting, cyber-security and support contracts, with their opportunities, quotes and follow-ups.
// It runs only on the server that sets DEMO_THEME=it (the other demos keep the general sample data).
func addITData(ctx context.Context, now time.Time, by map[string]account) error {
	if os.Getenv("DEMO_THEME") != "it" {
		return nil
	}
	owners := []string{"demo-sales", "demo-sales2", "demo-sales3", "demo-sales4", "demo-sales5"}
	companies := []string{
		"سامانه‌گستر پارس", "شبکه‌سازان آریا", "داده‌پردازان نوین", "فناوران ابری ایران", "پایدار سرور", "امن‌افزار شریف", "رایان‌سازه کویر", "هوشمند ارتباطات پیشرو",
		"نرم‌افزار بهین‌کار", "مرکز داده توسعه", "آسمان‌داده", "تلاش‌گران شبکه", "مدیریت فناوری امین", "زیرساخت‌پردازان آتی", "رهیاب سیستم", "ارتباطات سیار آرمان",
		"دیجیتال‌سازان پویا", "سیستم‌های یکپارچه ایرانیان", "پارس‌هاست", "ابر ایرانیان", "برنامه‌نویسان خلاق", "امنیت شبکه ققنوس", "فن‌آوا نگار", "پیشگامان هوش مصنوعی",
		"داتیس شبکه", "گسترش ارتباطات نیلوفر", "کیان سیستم", "تکنو‌ارتباط سپهر", "نواندیشان داده", "پرداخت الکترونیک سینا", "راهبران سرور", "اطلاعات‌گستر مهر",
		"سخت‌افزار برتر", "مجتمع فناوری آوا", "شبکه رسان خاورمیانه", "لوح داده", "توسعه‌دهندگان وب سپید", "پایگاه داده آرمان", "الکترونیک رایانه پارسیان", "پشتیبان‌سازان فردا",
		"آی‌تی همراه", "راه‌کار پردازش", "فراشبکه", "بایت‌افزار", "کلود‌نگار", "نت‌پرداز تهران", "سیمرغ سیستم", "تجهیزات مخابراتی دماوند",
	}
	reps := []string{"مهدی", "سعید", "علی", "رضا", "پویا", "امیر", "بهزاد", "کامران", "نیما", "آرش", "محسن", "حمید", "سارا", "نگار", "مریم", "الهام", "نسرین", "فرزانه"}
	fams := []string{"احمدی", "کریمی", "رحیمی", "صادقی", "موسوی", "حسینی", "قاسمی", "نوری", "جعفری", "اکبری", "فرهادی", "شریفی", "رضایی", "ملکی", "باقری", "عباسی"}
	cities := [][2]string{{"تهران", "تهران"}, {"اصفهان", "اصفهان"}, {"خراسان رضوی", "مشهد"}, {"فارس", "شیراز"}, {"آذربایجان شرقی", "تبریز"}, {"البرز", "کرج"}, {"خوزستان", "اهواز"}, {"گیلان", "رشت"}}
	codes := []string{"21", "31", "51", "71", "41", "26", "61", "13"}
	sources := []string{"وب‌سایت", "نمایشگاه الکامپ", "معرفی دوستان", "تماس ورودی", "لینکدین", "مشتری قبلی", "وبینار"}
	tags := [][]string{{"زیرساخت"}, {"شبکه"}, {"امنیت"}, {"نرم‌افزار"}, {"ابری"}, {"پشتیبانی"}, {"سخت‌افزار"}, {"نرم‌افزار", "ابری"}}

	type deal struct {
		title string
		price int
	}
	deals := []deal{
		{"فایروال سازمانی نسل بعد و راه‌اندازی", 285000000}, {"سوئیچ لایه ۳ ۴۸ پورت PoE (۴ دستگاه)", 196000000}, {"سرور رک HPE DL380 Gen11", 740000000},
		{"سامانهٔ ذخیره‌سازی SAN ۴۰ ترابایت", 510000000}, {"لایسنس سازمانی Microsoft 365 (۱۰۰ کاربر، یک‌ساله)", 360000000}, {"لایسنس VMware و مهاجرت به مجازی‌سازی", 420000000},
		{"قرارداد پشتیبانی سالانهٔ شبکه و سرور", 180000000}, {"طراحی و اجرای شبکهٔ ساختارمند ساختمان اداری", 335000000}, {"سامانهٔ دوربین مداربسته IP و ذخیره‌سازی", 225000000},
		{"رایانهٔ رومیزی برای سایت آموزشی (۴۰ دستگاه)", 980000000}, {"لپ‌تاپ سازمانی (۳۰ دستگاه)", 870000000}, {"پشتیبان‌گیری ابری و بازیابی بحران", 150000000},
		{"پیاده‌سازی SIEM و مرکز عملیات امنیت", 620000000}, {"تست نفوذ و ممیزی امنیتی", 95000000}, {"هاست اختصاصی و VPS (قرارداد یک‌ساله)", 72000000},
		{"سامانهٔ تلفن تحت شبکه VoIP (۱۲۰ داخلی)", 240000000}, {"اینترنت اختصاصی و لینک بین‌شعب", 130000000}, {"توسعهٔ اپلیکیشن موبایل سازمانی", 460000000},
		{"پیاده‌سازی سامانهٔ اتوماسیون اداری و CRM", 280000000}, {"مرکز داده کوچک: رک، سرمایش و یو‌پی‌اس", 890000000}, {"آنتی‌ویروس و EDR سازمانی (۳۰۰ کاربر)", 210000000},
		{"سرویس مدیریت‌شدهٔ فناوری اطلاعات ماهانه (MSP)", 96000000}, {"نصب و پیکربندی اکتیو دایرکتوری و سیاست‌های امنیتی", 78000000}, {"پهنای‌باند و سرویس CDN برای وب‌سایت", 64000000},
	}
	stages := []string{"NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "WON", "LOST", "PROPOSAL", "NEGOTIATION", "CONTACTED"}
	lost := []string{"قیمت بالاتر بود", "مشتری از رقیب خرید", "پروژه به تعویق افتاد", "بودجه تصویب نشد"}
	callTexts := []string{
		"تماس گرفته شد؛ نیازمندی‌های شبکه و تعداد کاربران را اعلام کردند.", "مدیر فناوری اطلاعات مشخصات فنی را ایمیل کرد.", "برای جلسهٔ ارائهٔ فنی هماهنگ شد.",
		"درخواست تخفیف برای خرید عمده دارند.", "مقایسهٔ قیمت با دو شرکت دیگر انجام می‌دهند.", "نسخهٔ آزمایشی (POC) دو هفته‌ای تحویل شد.", "قرارداد برای بررسی به واحد حقوقی ارسال شد.",
		"مشکل پشتیبانی سرور گزارش شد و به تیم فنی ارجاع شد.", "تمدید لایسنس‌ها برای ماه آینده یادآوری شد.", "نمونهٔ معماری شبکه ارسال شد و منتظر نظر هستند.",
	}
	follow := []string{
		"پیگیری تأیید پیش‌فاکتور", "ارسال کاتالوگ فنی تجهیزات", "هماهنگی بازدید از محل نصب", "پیگیری پرداخت پیش‌پرداخت", "ارسال پیشنهاد فنی و مالی بازنگری‌شده", "تماس برای تمدید قرارداد پشتیبانی",
	}
	hrs := func(h int) time.Time { return now.Add(-time.Duration(h) * time.Hour) }

	for i, comp := range companies {
		id := fmt.Sprintf("demo-it-c%d", i+1)
		owner := owners[i%len(owners)]
		rep := reps[i%len(reps)] + " " + fams[(i*7)%len(fams)]
		pl := cities[i%len(cities)]
		status := "ACTIVE"
		if i%5 == 0 {
			status = "LEAD"
		} else if i%11 == 0 {
			status = "INACTIVE"
		}
		doc := jsonx.M{
			"id": id, "kind": "COMPANY", "name": rep, "company": "شرکت " + comp, "companyType": []string{"سهامی خاص", "مسئولیت محدود"}[i%2],
			"nationalId": digitsN(i+31, 11), "economicCode": digitsN(i+41, 12), "registrationNumber": fmt.Sprint(310000 + i*97), "repName": rep, "repPosition": []string{"مدیرعامل", "مدیر فناوری اطلاعات", "مدیر خرید"}[i%3],
			"phones": []string{fmt.Sprintf("0912%07d", 7400000+i*137), fmt.Sprintf("0%s%08d", codes[i%len(codes)], 44000000+i*3571)},
			"email": fmt.Sprintf("info@it-company%d.example.ir", i+1), "website": fmt.Sprintf("www.it-company%d.example.ir", i+1),
			"address": pl[1] + "، خیابان " + []string{"ولیعصر", "شریعتی", "آزادی", "فردوسی", "امام"}[i%5] + "، پلاک " + fa(10+i*3),
			"postalCode": digitsN(i+61, 10), "province": pl[0], "city": pl[1], "status": status, "source": sources[i%len(sources)], "tags": tags[i%len(tags)],
			"interest": []string{"تجهیزات شبکه", "سرور و ذخیره‌سازی", "امنیت اطلاعات", "لایسنس نرم‌افزار", "خدمات ابری", "پشتیبانی فناوری اطلاعات"}[i%6],
			"ownerId": owner, "ownerName": by[owner].Name, "notes": "مشتری حوزهٔ فناوری اطلاعات؛ برای تجهیزات، لایسنس و خدمات پشتیبانی پیگیری می‌شود.",
			"createdAt": iso(hrs(24 * (80 - i))), "updatedAt": iso(hrs(3 + i%30)),
		}
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, id, owner, jsonx.Encode(doc)); err != nil {
			return err
		}

		// one or two opportunities per company
		for k := 0; k < 1+i%2; k++ {
			d := deals[(i*3+k*5)%len(deals)]
			st := stages[(i+k*3)%len(stages)]
			amount := d.price + (i%7)*5000000
			did := fmt.Sprintf("demo-it-d%d-%d", i+1, k+1)
			dd := jsonx.M{
				"id": did, "title": d.title, "customerId": id, "customerName": rep, "amount": amount, "stage": st, "ownerId": owner, "ownerName": by[owner].Name, "notes": "",
				"createdAt": iso(hrs(24*(40-i%30) + k*12)), "updatedAt": iso(hrs(2 + (i+k)%40)),
			}
			if st == "PROPOSAL" || st == "NEGOTIATION" {
				dd["proformaNumber"] = fmt.Sprintf("PF-1405-%04d", 200+i*2+k)
				dd["proformaAt"] = day(now.AddDate(0, 0, -(i%9 + 1)))
				dd["validUntil"] = day(now.AddDate(0, 0, 7-(i%9)))
				dd["discountPercent"], dd["taxPercent"] = i%4, 10
				dd["items"] = []jsonx.M{
					{"title": d.title, "qty": 1, "unit": "مورد", "unitPrice": amount * 8 / 10},
					{"title": "نصب، راه‌اندازی و آموزش", "qty": 1, "unit": "مورد", "unitPrice": amount * 15 / 100},
					{"title": "پشتیبانی سه‌ماهه", "qty": 1, "unit": "دوره", "unitPrice": amount * 5 / 100},
				}
			}
			if st == "WON" || st == "LOST" {
				dd["closedAt"] = iso(hrs(24 * (1 + i%20)))
			}
			if st == "LOST" {
				dd["lostReason"] = lost[i%len(lost)]
				dd["lostNote"] = "مشتری پس از مقایسهٔ چند پیشنهاد تصمیم گرفت."
			}
			if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, did, id, owner, jsonx.Encode(dd)); err != nil {
				return err
			}
		}

		// calls, meetings and follow-ups
		for k := 0; k < 3; k++ {
			typ := []string{"CALL", "MEETING", "NOTE"}[(i+k)%3]
			a := jsonx.M{
				"id": fmt.Sprintf("demo-it-a%d-%d", i+1, k+1), "customerId": id, "type": typ, "text": callTexts[(i+k*3)%len(callTexts)],
				"ownerId": owner, "ownerName": by[owner].Name, "authorId": owner, "authorName": by[owner].Name, "createdAt": iso(hrs(6 + i*7 + k*30)),
			}
			if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(a, "id"), id, owner, jsonx.Encode(a)); err != nil {
				return err
			}
		}
		if i%2 == 0 {
			due := now.AddDate(0, 0, i%9-2)
			a := jsonx.M{
				"id": fmt.Sprintf("demo-it-f%d", i+1), "customerId": id, "type": "FOLLOWUP", "text": follow[i%len(follow)], "dueDate": day(due), "done": false,
				"ownerId": owner, "ownerName": by[owner].Name, "authorId": owner, "authorName": by[owner].Name, "createdAt": iso(hrs(10 + i)),
			}
			if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(a, "id"), id, owner, jsonx.Encode(a)); err != nil {
				return err
			}
		}
	}
	return nil
}

package demo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
)

// Extra demo content so a visitor understands every part of the system at a glance: the official identity of the company and its
// proforma settings, official customers with proformas under three issuers, the customer club, ready letter texts and a letterhead, the
// notice board, the journal with addresses of people inside and outside the office, the connection monitor, SMS and messenger logs.

const demoSite = "www.hoormand-demo.ir"

func addEnrichment(ctx context.Context, now time.Time, by map[string]account) error {
	hours := func(h int) time.Time { return now.Add(-time.Duration(h) * time.Hour) }
	days := func(d int) time.Time { return now.AddDate(0, 0, d) }
	pub := func(id string) jsonx.M { return userDoc(by[id]) }

	if err := exec(ctx, `TRUNCATE announcements, sms_log, msgr_log, net_events`); err != nil {
		return err
	}
	if err := exec(ctx, `DELETE FROM settings WHERE key = 'crmClub'`); err != nil {
		return err
	}

	// ---------------------------------------------------------------- the company: identity, proforma defaults, issuers, letters
	address := "تهران، خیابان ولیعصر، بالاتر از میدان ونک، کوچهٔ دوم، پلاک ۱۲۳، طبقهٔ ۴، واحد ۱۶"
	phone := "۰۲۱-۸۸۷۷۶۶۵۵"
	bank := "بانک ملت، شعبهٔ ونک، به نام داده پرداز هورمند\nشمارهٔ حساب: ۱۲۳۴۵۶۷۸۹۰\nشمارهٔ کارت: ۶۱۰۴-۳۳۷۳-۱۲۳۴-۵۶۷۸\nشمارهٔ شبا:\nIR120120000000001234567890"
	terms := "۱. اعتبار این پیش‌فاکتور تا تاریخ ذکرشده است و پس از آن قیمت‌ها قابل تغییر است.\n۲. پرداخت: ۵۰٪ هنگام تأیید سفارش و ۵۰٪ هنگام تحویل.\n۳. زمان تحویل: حداکثر ۱۴ روز کاری پس از دریافت پیش‌پرداخت.\n۴. گارانتی کالا و پشتیبانی نرم‌افزار طبق شرایط درج‌شده در قرارداد است.\n۵. مالیات بر ارزش افزوده طبق قانون به مبلغ نهایی افزوده شده است."

	letterhead := jsonx.M{"id": 2413, "showAddress": true, "showPhone": true, "address": address, "phone": phone, "showWebsite": true, "website": demoSite}
	textTpls := []jsonx.M{
		{"id": "lt1", "title": "ابلاغ دستورالعمل", "subject": "ابلاغ دستورالعمل جدید", "bodyHtml": "<p>با سلام و احترام</p><p>بدین‌وسیله دستورالعمل پیوست جهت اجرا ابلاغ می‌گردد. خواهشمند است نسبت به اطلاع‌رسانی به همکاران و اجرای دقیق آن اقدام فرمایید.</p><p>با تشکر</p>"},
		{"id": "lt2", "title": "دعوت به جلسه", "subject": "دعوت به جلسه", "bodyHtml": "<p>با سلام و احترام</p><p>جلسه‌ای با موضوع بررسی عملکرد و برنامهٔ آینده در تاریخ و ساعت اعلام‌شده در سالن اجتماعات برگزار می‌شود. حضور جنابعالی موجب امتنان خواهد بود.</p>"},
		{"id": "lt3", "title": "پاسخ به استعلام", "subject": "پاسخ به استعلام قیمت", "bodyHtml": "<p>با سلام</p><p>پیرو استعلام آن شرکت، پیش‌فاکتور رسمی به پیوست ارسال می‌شود. اعتبار قیمت‌ها هفت روز است. آمادهٔ ارائهٔ هرگونه توضیح هستیم.</p>"},
		{"id": "lt4", "title": "درخواست مرخصی", "subject": "درخواست موافقت با مرخصی", "bodyHtml": "<p>با سلام و احترام</p><p>خواهشمند است با مرخصی همکار نامبرده از تاریخ اعلام‌شده موافقت فرمایید.</p>"},
		{"id": "lt5", "title": "تأییدیهٔ پرداخت", "subject": "تأییدیهٔ پرداخت", "bodyHtml": "<p>با سلام</p><p>پرداخت مبلغ مندرج در سند پیوست مورد تأیید است. خواهشمند است نسبت به ثبت و واریز اقدام شود.</p>"},
		{"id": "lt6", "title": "تقدیر و تشکر", "subject": "تقدیر و تشکر", "bodyHtml": "<p>با سلام و احترام</p><p>از تلاش و پشتکار شما در پیشبرد اهداف سازمان صمیمانه سپاسگزاریم و برای شما آرزوی موفقیت داریم.</p>"},
	}
	issuers := []jsonx.M{
		{"id": "iss-isfahan", "label": "دفتر اصفهان", "kind": "OFFICIAL", "name": "داده پرداز هورمند (دفتر اصفهان)", "subtitle": "نمایندگی رسمی استان اصفهان",
			"address": "اصفهان، ملاصدرا، کوچهٔ سوم، پلاک ۳۴، طبقهٔ ۴", "phone": "۰۳۱-۳۳۹۲۰۰۰۱", "website": demoSite, "economicCode": "411234509876", "nationalId": "10103456790",
			"registrationNumber": "312456", "postalCode": "8173913456", "province": "اصفهان", "county": "اصفهان", "city": "اصفهان", "taxPercent": 10, "numberPrefix": "ES-",
			"bankInfo": "بانک ملی، شعبهٔ ملاصدرا، به نام داده پرداز هورمند\nشمارهٔ حساب: ۰۱۰۲۳۴۵۶۷۸۹۰\nشمارهٔ شبا:\nIR340170000000102345678901"},
		{"id": "iss-net", "label": "هورمند شبکه (غیررسمی)", "kind": "UNOFFICIAL", "name": "هورمند شبکه و امنیت", "subtitle": "طراحی، اجرا و پشتیبانی شبکه",
			"address": "تهران، خیابان آزادی، نبش خیابان قدس، پلاک ۸", "phone": "۰۲۱-۶۶۵۴۳۲۱۰", "website": demoSite, "numberPrefix": "N-", "taxPercent": 0},
	}
	extra := jsonx.M{
		"companyEconomicCode": "411234567890", "companyNationalId": "10103456789", "companyRegistrationNumber": "457812", "companyPostalCode": "1966813457",
		"companyProvince": "تهران", "companyCounty": "تهران", "companyCity": "تهران", "companyAddress": address, "companyPhone": phone, "companyWebsite": demoSite,
		"proformaTerms": terms, "proformaBankInfo": bank, "proformaTaxPercent": 10, "proformaValidDays": 7, "currencyUnit": "TOMAN",
		"proformaApprovalRequired": false, "proformaApproverId": "demo-ceo", "proformaIssuers": issuers, "letterTextTemplates": textTpls,
		"defaultFooterNote": "سامانه مکاتبات و اسناد رسمی اداری", "showFooterNote": true,
		"letterTemplate": jsonx.M{
			"layout": jsonx.M{"pageSize": "A4", "letterhead": letterhead, "logoSize": 64, "orgTextScale": 1, "showLogo": true, "showOrgName": true, "showSubject": true,
				"showLetterNumber": true, "showLetterDate": true, "showLetterAttachment": true},
			"bodyHtml": "", "locked": false, "savedBy": by["demo-ceo"].Name, "savedAt": iso(hours(72)),
		},
	}
	if err := exec(ctx, `UPDATE settings SET data = data || $1::jsonb WHERE key = 'main'`, jsonx.Encode(extra)); err != nil {
		return err
	}

	// ---------------------------------------------------------------- official customers + proformas under the three issuers
	type buyer struct {
		id, rep, company, kind, nid, eco, reg, post, prov, city, owner, phone, addr, source string
	}
	buyers := []buyer{
		{"demo-e1", "بهزاد رضوی", "شرکت بازرگانی آرمان‌تجارت", "سهامی خاص", "10320987654", "411236748821", "234512", "1587946321", "تهران", "تهران", "demo-sales2", "09121110011", "تهران، خیابان شریعتی، بالاتر از پل سیدخندان، پلاک ۵۱۰", "نمایشگاه"},
		{"demo-e2", "سمیرا اکبری", "گروه صنعتی پارس‌آریا", "مسئولیت محدود", "10260345987", "411278965412", "98765", "8184915672", "اصفهان", "اصفهان", "demo-sales3", "09131112233", "اصفهان، خیابان چهارباغ بالا، پلاک ۲۲۰", "معرفی مشتری"},
		{"demo-e3", "محمد رحیمی", "شرکت دارویی سپنتا", "سهامی عام", "10380765432", "411234098712", "445566", "9185631247", "خراسان رضوی", "مشهد", "demo-sales4", "09151234455", "مشهد، بلوار وکیل‌آباد، نبش وکیل‌آباد ۲۷", "وب‌سایت"},
		{"demo-e4", "ژیلا نیک‌نام", "مجتمع آموزشی نیکان", "مسئولیت محدود", "10200896543", "411290123456", "77123", "7134915623", "فارس", "شیراز", "demo-sales5", "09171113344", "شیراز، بلوار چمران، خیابان ۲۱، پلاک ۱۴", "تماس ورودی"},
		{"demo-e5", "کامران دریایی", "شرکت حمل‌ونقل دریابار", "سهامی خاص", "10570987123", "411255667788", "55231", "7915613245", "هرمزگان", "بندرعباس", "demo-sales2", "09161115566", "بندرعباس، خیابان امام خمینی، پلاک ۹۰", "نمایشگاه"},
		{"demo-e6", "الهام جعفری", "فروشگاه‌های زنجیره‌ای افق", "سهامی خاص", "10850123987", "411211223344", "66784", "5156913248", "آذربایجان شرقی", "تبریز", "demo-sales3", "09141117788", "تبریز، خیابان ولیعصر، پلاک ۳۶۰", "شبکه‌های اجتماعی"},
	}
	for i, b := range buyers {
		doc := jsonx.M{
			"id": b.id, "kind": "COMPANY", "name": b.rep, "company": b.company, "companyType": b.kind, "nationalId": b.nid, "economicCode": b.eco, "registrationNumber": b.reg,
			"repName": b.rep, "repPosition": "مدیرعامل", "phones": []string{b.phone, fmt.Sprintf("021%08d", 88000000+i*1111)}, "email": fmt.Sprintf("info%d@company%d.example", i+1, i+1),
			"address": b.addr, "postalCode": b.post, "province": b.prov, "city": b.city, "status": "ACTIVE", "source": b.source, "tags": []string{"پیش‌فاکتور رسمی"},
			"ownerId": b.owner, "ownerName": by[b.owner].Name, "notes": "مشتری سازمانی با اطلاعات رسمی کامل برای صدور پیش‌فاکتور و فاکتور رسمی.",
			"createdAt": iso(hours(24 * (40 - i*3))), "updatedAt": iso(hours(6 + i)),
		}
		if err := exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, b.id, b.owner, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	type pitem struct {
		title, unit string
		qty, price  int
	}
	type pf struct {
		id, buyer, title, stage, issuer, number string
		items                                   []pitem
		discount                                int
		ageDays                                 int
		approval                                string
	}
	pfs := []pf{
		{"demo-pf1", "demo-e1", "تأمین تجهیزات شبکه و فایروال شعبهٔ مرکزی", "PROPOSAL", "main", "PF-1405-0101", []pitem{{"فایروال سازمانی ۱۰ پورت", "دستگاه", 2, 85000000}, {"سوئیچ مدیریتی ۴۸ پورت", "دستگاه", 3, 38000000}, {"نصب، پیکربندی و آموزش", "مورد", 1, 24000000}}, 5, 1, "APPROVED"},
		{"demo-pf2", "demo-e2", "پیاده‌سازی سامانهٔ اتوماسیون اداری و CRM", "NEGOTIATION", "iss-isfahan", "ES-1405-0007", []pitem{{"لایسنس سامانه (۵۰ کاربر)", "مورد", 1, 180000000}, {"راه‌اندازی و انتقال اطلاعات", "مورد", 1, 45000000}, {"آموزش کاربران", "جلسه", 6, 6000000}}, 8, 2, "APPROVED"},
		{"demo-pf3", "demo-e3", "قرارداد پشتیبانی سالانهٔ شبکه و سرور", "PROPOSAL", "main", "PF-1405-0102", []pitem{{"پشتیبانی ماهانه شبکه", "ماه", 12, 7500000}, {"بازدید دوره‌ای حضوری", "نوبت", 4, 5000000}}, 10, 3, "PENDING"},
		{"demo-pf4", "demo-e4", "تجهیز سایت کامپیوتر آموزشی", "PROPOSAL", "iss-net", "N-1405-0031", []pitem{{"رایانهٔ رومیزی", "دستگاه", 20, 24500000}, {"مانیتور ۲۴ اینچ", "دستگاه", 20, 7800000}, {"کابل‌کشی و شبکه‌سازی", "مورد", 1, 36000000}}, 3, 1, ""},
		{"demo-pf5", "demo-e5", "سامانهٔ دوربین مداربسته و کنترل تردد", "NEGOTIATION", "main", "PF-1405-0103", []pitem{{"دوربین IP مگاپیکسل", "دستگاه", 16, 9800000}, {"دستگاه ضبط ۳۲ کاناله", "دستگاه", 1, 41000000}, {"دستگاه کنترل تردد", "دستگاه", 4, 12500000}}, 5, 4, "APPROVED"},
		{"demo-pf6", "demo-e6", "تجهیز شعب فروشگاه با صندوق‌های فروش", "PROPOSAL", "iss-isfahan", "ES-1405-0008", []pitem{{"صندوق فروشگاهی لمسی", "دستگاه", 12, 31000000}, {"اسکنر بارکد", "دستگاه", 12, 3200000}, {"نرم‌افزار انبار و فروش", "لایسنس", 12, 8000000}}, 7, 2, ""},
	}
	for i, p := range pfs {
		sub := 0
		items := make([]jsonx.M, 0, len(p.items))
		for _, it := range p.items {
			sub += it.qty * it.price
			items = append(items, jsonx.M{"title": it.title, "qty": it.qty, "unit": it.unit, "unitPrice": it.price})
		}
		b := buyers[i]
		owner := b.owner
		taxPct := 10
		if p.issuer == "iss-net" {
			taxPct = 0
		}
		fields := jsonx.M{
			"title": "پیش‌فاکتور رسمی", "subject": p.title,
			"buyerName": b.rep, "buyerCompany": b.company, "buyerPhones": b.phone, "buyerAddress": b.addr, "buyerEmail": fmt.Sprintf("info%d@company%d.example", i+1, i+1),
			"buyerNationalId": b.nid, "buyerEconomicCode": b.eco, "buyerPostalCode": b.post, "buyerProvince": b.prov, "buyerCity": b.city,
			"footerText": "این پیش‌فاکتور بدون مهر و امضای مجاز اعتبار ندارد.",
		}
		deal := jsonx.M{
			"id": p.id, "title": p.title, "customerId": p.buyer, "customerName": b.rep, "amount": sub, "stage": p.stage, "proformaNumber": p.number,
			"proformaAt": day(days(-p.ageDays)), "validUntil": day(days(7 - p.ageDays)), "discountPercent": p.discount, "taxPercent": taxPct, "items": items,
			"proformaIssuerId": p.issuer, "proformaFields": fields, "terms": terms, "expectedClose": day(days(10 + i*2)),
			"ownerId": owner, "ownerName": by[owner].Name, "notes": "", "createdAt": iso(hours(24*p.ageDays + 30)), "updatedAt": iso(hours(5 + i)),
		}
		if p.approval != "" {
			ap := jsonx.M{"status": p.approval, "requestedBy": owner, "requestedByName": by[owner].Name, "requestedAt": iso(hours(24*p.ageDays + 20))}
			if p.approval == "APPROVED" {
				ap["decidedBy"], ap["decidedByName"], ap["decidedAt"], ap["note"] = "demo-ceo", by["demo-ceo"].Name, iso(hours(24*p.ageDays+10)), "تأیید شد؛ مهر و امضا زده شود."
			}
			deal["proformaApproval"] = ap
		}
		if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, p.id, p.buyer, owner, jsonx.Encode(deal)); err != nil {
			return err
		}
		fu := jsonx.M{"id": "demo-pf-fu" + fmt.Sprint(i+1), "customerId": p.buyer, "type": "FOLLOWUP", "text": "پیگیری تأیید پیش‌فاکتور " + p.number, "dueDate": day(days(1 + i%3)), "done": false,
			"ownerId": owner, "ownerName": by[owner].Name, "authorId": owner, "authorName": by[owner].Name, "createdAt": iso(hours(8 + i))}
		if err := exec(ctx, `INSERT INTO crm_activities (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(fu, "id"), p.buyer, owner, jsonx.Encode(fu)); err != nil {
			return err
		}
	}
	// won sales and lost ones: the club points, the buyers report and the lost-reasons chart
	type sale struct {
		id, buyer, title, stage, reason string
		amount, ago                     int
	}
	for _, s := range []sale{
		{"demo-ew1", "demo-e1", "تأمین رایانه و چاپگر اداری", "WON", "", 215000000, 12},
		{"demo-ew2", "demo-e1", "تمدید لایسنس آنتی‌ویروس سازمانی", "WON", "", 96000000, 40},
		{"demo-ew3", "demo-e2", "راه‌اندازی شبکهٔ کارخانه", "WON", "", 540000000, 25},
		{"demo-ew4", "demo-e3", "خرید لایسنس سرور", "WON", "", 128000000, 33},
		{"demo-ew5", "demo-e4", "پروژهٔ وای‌فای مجتمع", "WON", "", 74000000, 51},
		{"demo-el1", "demo-e5", "سامانهٔ حضور و غیاب", "LOST", "قیمت بالاتر از رقیب", 38000000, 18},
		{"demo-el2", "demo-e6", "خرید نرم‌افزار حسابداری", "LOST", "از رقیب خرید کرد", 52000000, 27},
	} {
		b := map[string]buyer{}
		for _, x := range buyers {
			b[x.id] = x
		}
		bb := b[s.buyer]
		deal := jsonx.M{"id": s.id, "title": s.title, "customerId": s.buyer, "customerName": bb.rep, "amount": s.amount, "stage": s.stage, "closedAt": iso(hours(24 * s.ago)),
			"ownerId": bb.owner, "ownerName": by[bb.owner].Name, "notes": "", "createdAt": iso(hours(24*s.ago + 96)), "updatedAt": iso(hours(24 * s.ago))}
		if s.reason != "" {
			deal["lostReason"] = s.reason
		}
		if err := exec(ctx, `INSERT INTO crm_deals (id, customer_id, owner_id, data) VALUES ($1, $2, $3, $4::jsonb)`, s.id, s.buyer, bb.owner, jsonx.Encode(deal)); err != nil {
			return err
		}
	}

	club := jsonx.M{"enabled": true, "tomanPerPoint": 1000000, "dormantDays": 45, "tiers": []jsonx.M{
		{"id": "ta", "name": "برنزی", "minPoints": 0, "discountPercent": 0},
		{"id": "tb", "name": "نقره‌ای", "minPoints": 80, "discountPercent": 3},
		{"id": "tc", "name": "طلایی", "minPoints": 200, "discountPercent": 5},
		{"id": "td", "name": "الماس", "minPoints": 450, "discountPercent": 8},
	}}
	if err := exec(ctx, `INSERT INTO settings (key, data) VALUES ('crmClub', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, jsonx.Encode(club)); err != nil {
		return err
	}

	// ---------------------------------------------------------------- letters on the ready-made letterheads
	type lt struct {
		id, subject, body, from, page string
		to                            []string
		signed                        bool
		lh                            int
		sig, stamp                    bool
	}
	for i, l := range []lt{
		{"demo-lh1", "ابلاغ مصوبهٔ هیئت‌مدیره دربارهٔ بودجهٔ سال ۱۴۰۵", "مصوبهٔ جلسهٔ اخیر هیئت‌مدیره دربارهٔ بودجهٔ سال جاری ابلاغ می‌گردد. اجرای آن برای همهٔ واحدها الزامی است.", "demo-secretary", "A4", []string{"demo-sales", "demo-staff", "demo-it1"}, true, 2413, true, true},
		{"demo-lh2", "تقدیر از کارکنان نمونهٔ فصل", "از تلاش و پشتکار کارکنان نمونهٔ فصل بهار صمیمانه تقدیر می‌شود. امیدواریم این روند ادامه یابد.", "demo-hr1", "A5", []string{"demo-sales2", "demo-it2", "demo-fin2"}, true, 52081, true, false},
		{"demo-lh3", "پاسخ به استعلام شرکت آرمان‌تجارت", "پیرو استعلام آن شرکت، پیش‌فاکتور رسمی به پیوست ارسال می‌شود. اعتبار قیمت‌ها هفت روز است.", "demo-sales2", "Letter", []string{"demo-ceo"}, true, 120045, false, true},
		{"demo-lh4", "درخواست تأیید قرارداد پشتیبانی دفتر اصفهان", "پیش‌نویس قرارداد پشتیبانی دفتر اصفهان برای مطالعه و امضا تقدیم می‌شود.", "demo-gen3", "A4", []string{"demo-ceo"}, false, 3987, false, false},
		{"demo-lh5", "اعلام برنامهٔ تعطیلات نوروزی", "برنامهٔ تعطیلات نوروزی و ساعت کار شرکت به پیوست اعلام می‌گردد.", "demo-gen2", "A4", []string{"demo-ceo"}, false, 77310, false, false},
	} {
		rcp := make([]any, 0, len(l.to))
		for _, t := range l.to {
			rcp = append(rcp, pub(t))
		}
		doc := jsonx.M{
			"id": l.id, "fileId": "f-" + l.id, "fileName": l.subject, "fileSize": "—", "category": "word", "sender": pub(l.from), "recipients": rcp,
			"letterContentHtml": "<p>با سلام و احترام</p><p>" + l.body + "</p><p>با تشکر</p>", "letterNumber": "۱۴۰۵/" + fa(130+i), "pageSize": l.page,
			"status": "DELIVERED", "sentAt": iso(hours(10 + i*9)), "expiresAt": iso(days(30)), "downloadsCount": i, "isOfficialLetter": true, "referrals": []any{},
			"letterhead": jsonx.M{"id": l.lh, "showAddress": true, "showPhone": true, "address": address, "phone": phone, "showWebsite": i%2 == 0, "website": demoSite},
			"logoSize":   60, "orgTextScale": 1,
		}
		if l.signed {
			doc["signatureStatus"], doc["signedBy"], doc["signedAt"] = "SIGNED", by["demo-ceo"].Name, iso(hours(6+i*9))
			doc["signatureImageUrl"], doc["companyStampImageUrl"] = signSVG, stampSVG
			doc["showSignatureImage"], doc["showStampImage"] = l.sig, l.stamp
		} else {
			doc["signatureStatus"] = "PENDING_SIGNATURE"
		}
		if err := exec(ctx, `INSERT INTO transfers (id, sender_id, recipient_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, l.id, l.from, l.to, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---------------------------------------------------------------- notice board
	for i, a := range []struct {
		title, text       string
		important, pinned bool
		banner            bool
		author            string
		ago               int
		eventDays         int
	}{
		{"جلسهٔ هماهنگی فصلی", "جلسهٔ هماهنگی فصلی مدیران واحدها روز شنبه ساعت ۱۰ صبح در سالن اجتماعات برگزار می‌شود. حضور همهٔ مدیران الزامی است.", true, true, true, "demo-ceo", 5, 3},
		{"تعطیلی شرکت در روز سه‌شنبه", "به‌مناسبت مراسم سالانهٔ شرکت، سه‌شنبه آینده شرکت تعطیل است. کارهای فوری به همکاران مسئول سپرده شود.", true, false, true, "demo-gen2", 20, 5},
		{"راه‌اندازی بخش جدید «باشگاه مشتریان»", "از امروز مشتریان سازمانی بر پایهٔ خرید خود امتیاز می‌گیرند. فروشندگان می‌توانند جایگاه مشتری را در پروندهٔ او ببینند.", false, true, false, "demo-sales3", 30, 0},
		{"یادآوری ثبت گزارش روزانه", "لطفاً گزارش روزانه را تا ساعت ۱۷ هر روز ثبت کنید تا مدیر واحد بتواند آن را بررسی کند.", false, false, false, "demo-hr1", 52, 0},
		{"به‌روزرسانی نسخهٔ سامانه", "سامانه به نسخهٔ جدید به‌روز شد؛ سربرگ‌های آماده، ذره‌بین نامه و دکمهٔ امضا و مهر مدیرعامل اضافه شده است.", false, false, false, "demo-it1", 70, 0},
		{"تبریک سال نو", "آغاز سال نو را به همهٔ همکاران عزیز تبریک می‌گوییم. امیدواریم سالی پربار و موفق داشته باشید.", false, false, false, "demo-ceo", 120, 0},
	} {
		id := fmt.Sprintf("an-demo-%d", i+1)
		doc := jsonx.M{"id": id, "title": a.title, "text": a.text, "important": a.important, "pinned": a.pinned, "authorId": a.author, "authorName": by[a.author].Name, "createdAt": iso(hours(a.ago))}
		if a.banner {
			doc["banner"], doc["bannerDays"], doc["bannerUntil"] = true, 7, iso(days(5))
			if a.eventDays > 0 {
				doc["eventDate"] = day(days(a.eventDays))
			}
		}
		if err := exec(ctx, `INSERT INTO announcements (id, pinned, created_at, data) VALUES ($1, $2, $3, $4::jsonb)`, id, a.pinned, hours(a.ago), jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	// ---------------------------------------------------------------- the journal: who did what, from which address (office, outside, behind the router)
	type who struct{ id, ip, seen, via string }
	people := []who{
		{"demo-ceo", "192.168.2.20", "192.168.2.20", ""},
		{"demo-sales", "5.160.112.34", "192.168.2.254", "browser"},
		{"demo-sales2", "192.168.2.31", "192.168.2.31", ""},
		{"demo-secretary", "192.168.2.12", "192.168.2.12", ""},
		{"demo-staff", "37.255.201.88", "37.255.201.88", ""},
		{"demo-it1", "192.168.2.5", "192.168.2.5", ""},
		{"demo-hr1", "2.187.45.19", "2.187.45.19", ""},
		{"demo-fin2", "192.168.2.44", "192.168.2.44", ""},
	}
	type ev struct{ action, sev, text string }
	events := []ev{
		{"LOGIN", "INFO", "ورود به سامانه"}, {"FILE_TRANSFER", "INFO", "ارسال یا ویرایش فایل یا نامه"}, {"FILE_DOWNLOAD", "INFO", "دریافت فایل"},
		{"DEAL", "INFO", "ثبت یا ویرایش فرصت فروش"}, {"CUSTOMER", "INFO", "ثبت یا ویرایش پروندهٔ مشتری"}, {"CRM_NOTE", "INFO", "ثبت سابقه یا پیگیری برای مشتری"},
		{"REPORT", "INFO", "ثبت گزارش روزانه"}, {"TASK", "INFO", "ثبت یا ویرایش وظیفه"}, {"SMS", "INFO", "ارسال پیامک"}, {"LEAVE", "INFO", "ثبت درخواست مرخصی"},
		{"SETTINGS_UPDATE", "WARNING", "تغییر تنظیمات سامانه"}, {"USER_UPDATE", "WARNING", "ویرایش اطلاعات یا دسترسی یک کاربر"}, {"SECURITY_EVENT", "WARNING", "تغییر رمز عبور"},
		{"WAREHOUSE", "INFO", "ثبت سند انبار"}, {"ANNOUNCEMENT", "INFO", "ثبت اعلان در تابلو"}, {"CALL", "INFO", "تماس تلفنی با یک کلیک"},
	}
	for i := 0; i < 64; i++ {
		p := people[i%len(people)]
		e := events[(i*5+i/3)%len(events)]
		at := now.Add(-time.Duration(i*43+7) * time.Minute)
		entry := jsonx.M{
			"id": fmt.Sprintf("aud-demo-%03d", i), "timestamp": jalali.Timestamp(at), "userName": by[p.id].Name, "userEmail": by[p.id].Email, "action": e.action, "severity": e.sev,
			"details": e.text, "ipAddress": p.ip, "ipSeen": p.seen,
		}
		if p.via != "" {
			entry["ipVia"] = p.via
		}
		if err := exec(ctx, `INSERT INTO audit_logs (id, data, created_at) VALUES ($1, $2::jsonb, $3)`, entry["id"], jsonx.Encode(entry), at); err != nil {
			return err
		}
	}
	for i, f := range []struct{ ip, why string }{{"185.143.233.12", "رمز عبور نادرست است"}, {"91.99.101.7", "کاربری با این نشانی وجود ندارد"}, {"185.143.233.12", "رمز عبور نادرست است"}} {
		at := now.Add(-time.Duration(150+i*210) * time.Minute)
		entry := jsonx.M{"id": fmt.Sprintf("aud-demo-f%d", i), "timestamp": jalali.Timestamp(at), "userName": "ناشناس", "userEmail": "admin", "action": "LOGIN_FAILED", "severity": "WARNING",
			"details": "ورود ناموفق: " + f.why, "ipAddress": f.ip, "ipSeen": f.ip}
		if err := exec(ctx, `INSERT INTO audit_logs (id, data, created_at) VALUES ($1, $2::jsonb, $3)`, entry["id"], jsonx.Encode(entry), at); err != nil {
			return err
		}
	}

	// ---------------------------------------------------------------- connection monitor
	for _, n := range []struct {
		kind    string
		seconds int
		detail  string
		ago     int
	}{
		{"update", 18, "به‌روزرسانی خودکار", 20}, {"stall", 12, "کندی موقت سرور", 55}, {"net-down", 140, "قطع اینترنت سرور", 90},
		{"restart", 64, "راه‌اندازی دوبارهٔ سرور", 150}, {"update", 22, "به‌روزرسانی خودکار", 220}, {"stall", 9, "کندی موقت سرور", 300},
	} {
		if err := exec(ctx, `INSERT INTO net_events (at, kind, seconds, version, detail) VALUES ($1, $2, $3, '1.25', $4)`, hours(n.ago), n.kind, n.seconds, n.detail); err != nil {
			return err
		}
	}

	// ---------------------------------------------------------------- SMS and messenger logs
	for i, s := range []struct{ to, text, status string }{
		{"09121110011", "پیش‌فاکتور شمارهٔ PF-1405-0101 برای شما صادر شد. اعتبار تا هفت روز آینده است.", "sent"},
		{"09131112233", "یادآوری: پیش‌فاکتور ES-1405-0007 فردا منقضی می‌شود.", "sent"},
		{"09151234455", "از خرید شما سپاسگزاریم. امتیاز باشگاه مشتریان شما به‌روز شد.", "sent"},
		{"09171113344", "تیم پشتیبانی فردا ساعت ۱۰ به مجموعهٔ شما مراجعه می‌کند.", "sent"},
		{"09161115566", "پیش‌فاکتور شمارهٔ PF-1405-0103 آمادهٔ بررسی شماست.", "sent"},
		{"09141117788", "یادآوری پیگیری تمدید قرارداد پشتیبانی.", "failed"},
		{"09121234567", "جلسهٔ فردا ساعت ۱۰ صبح برگزار می‌شود.", "sent"},
		{"09351230000", "گزارش هفتگی شما آماده است.", "sent"},
	} {
		detail := ""
		if s.status == "failed" {
			detail = "شمارهٔ گیرنده در لیست سیاه اپراتور است."
		}
		if err := exec(ctx, `INSERT INTO sms_log (id, created_at, sent_by, to_num, text, status, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			fmt.Sprintf("sms-demo-%d", i), hours(3+i*7), []string{"demo-sales", "demo-sales2", "demo-sales3", "demo-it1"}[i%4], s.to, s.text, s.status, detail); err != nil {
			return err
		}
	}
	for i, m := range []struct{ ch, chat, text, status string }{
		{"whatsapp", "09121110011", "پیش‌فاکتور PF-1405-0101.pdf", "sent"}, {"telegram", "@arman_trade", "پیش‌فاکتور PF-1405-0102.pdf", "sent"},
		{"whatsapp", "09131112233", "کاتالوگ محصولات.pdf", "sent"}, {"telegram", "@sepanta_pharma", "فهرست قیمت.csv", "failed"},
	} {
		detail := ""
		if m.status == "failed" {
			detail = "ارتباط با پیام‌رسان برقرار نشد."
		}
		if err := exec(ctx, `INSERT INTO msgr_log (id, created_at, sent_by, channel, chat, text, status, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			fmt.Sprintf("mg-demo-%d", i), hours(5+i*11), []string{"demo-sales", "demo-sales2"}[i%2], m.ch, m.chat, m.text, m.status, detail); err != nil {
			return err
		}
	}
	_ = strings.TrimSpace
	return nil
}

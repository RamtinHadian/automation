package api

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/sms"
	"automation/server/internal/store"
)

// The full registration form a customer (usually a COMPANY) fills in about itself: /register?k=KEY. It has every field of the «new customer» form
// except the Sepidar part and the internal ones (status, the person in charge, tags, lead status: those are the company's own business; the source
// is written by the program). The customer becomes a customer of the marketer who owns the key. Which fields exist and which are required is decided
// in the management console (form «selfreg»); the list below is the only place that knows the fields (the page and the console fetch it).

type selfField struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Type    string   `json:"type"` // text | tel | num | email | url | area | select | date | check
	Kinds   []string `json:"kinds,omitempty"`
	Options []string `json:"options,omitempty"`
	Max     int      `json:"max,omitempty"`
	Hint    string   `json:"hint,omitempty"`
	DefHide bool     `json:"defHidden,omitempty"` // hidden until the administrator adds it in the console
	Group   string   `json:"group"`
}

var (
	kP = []string{"PERSON"}
	kC = []string{"COMPANY"}
	kS = []string{"SHOP"}
)

// the labels are also the keys of the console's tuning (unique in the form)
var selfFields = []selfField{
	{Key: "kind", Label: "نوع مشتری", Type: "select", Options: []string{"حقوقی (شرکت)", "حقیقی (شخص)", "فروشگاه"}, Group: "نوع"},
	{Key: "prefix", Label: "پیشوند (عنوان)", Type: "select", Options: []string{"آقای", "خانم", "دکتر", "مهندس", "استاد"}, DefHide: true, Group: "هویت"},
	// real person
	{Key: "firstName", Label: "نام", Type: "text", Kinds: kP, Group: "هویت"},
	{Key: "lastName", Label: "نام خانوادگی", Type: "text", Kinds: kP, Group: "هویت"},
	{Key: "fatherName", Label: "نام پدر", Type: "text", Kinds: kP, DefHide: true, Group: "هویت"},
	{Key: "nationalCode", Label: "کد ملی", Type: "num", Kinds: kP, Max: 10, Group: "هویت"},
	{Key: "idNumber", Label: "شمارهٔ شناسنامه", Type: "num", Kinds: kP, DefHide: true, Group: "هویت"},
	{Key: "gender", Label: "جنسیت", Type: "select", Options: []string{"مرد", "زن"}, Kinds: kP, DefHide: true, Group: "هویت"},
	{Key: "birthDate", Label: "تاریخ تولد", Type: "date", Kinds: kP, DefHide: true, Hint: "۱۳۶۵/۰۵/۲۰", Group: "هویت"},
	{Key: "jobPlace", Label: "شغل / محل کار", Type: "text", Kinds: kP, DefHide: true, Group: "هویت"},
	// company
	{Key: "company", Label: "نام شرکت", Type: "text", Kinds: kC, Group: "مشخصات شرکت"},
	{Key: "companyType", Label: "نوع شرکت", Type: "select", Kinds: kC, Options: []string{"سهامی خاص", "سهامی عام", "مسئولیت محدود", "تضامنی", "نسبی", "تعاونی", "مختلط", "دیگر"}, Group: "مشخصات شرکت"},
	{Key: "nationalId", Label: "شناسهٔ ملی (۱۱ رقم)", Type: "num", Kinds: kC, Max: 11, Group: "مشخصات شرکت"},
	{Key: "economicCode", Label: "کد اقتصادی (۱۲ رقم)", Type: "num", Kinds: kC, Max: 12, Group: "مشخصات شرکت"},
	{Key: "registrationNumber", Label: "شمارهٔ ثبت", Type: "num", Kinds: kC, Group: "مشخصات شرکت"},
	{Key: "registrationDate", Label: "تاریخ ثبت", Type: "date", Kinds: kC, DefHide: true, Hint: "۱۳۹۰/۰۱/۱۵", Group: "مشخصات شرکت"},
	{Key: "repName", Label: "نام و نام خانوادگی نماینده", Type: "text", Kinds: kC, Group: "نماینده"},
	{Key: "repPosition", Label: "سمت نماینده", Type: "text", Kinds: kC, Group: "نماینده"},
	{Key: "repMobile", Label: "موبایل نماینده", Type: "tel", Kinds: kC, DefHide: true, Group: "نماینده"},
	{Key: "reps", Label: "نمایندگان بیشتر", Type: "area", Kinds: kC, DefHide: true, Hint: "هر نماینده در یک خط: نام - سمت - موبایل", Group: "نماینده"},
	// shop
	{Key: "shopName", Label: "نام فروشگاه", Type: "text", Kinds: kS, Group: "مشخصات فروشگاه"},
	{Key: "shopType", Label: "نوع فعالیت / صنف", Type: "text", Kinds: kS, Group: "مشخصات فروشگاه"},
	{Key: "licenseNumber", Label: "شمارهٔ پروانهٔ کسب / شناسهٔ صنفی", Type: "text", Kinds: kS, DefHide: true, Group: "مشخصات فروشگاه"},
	{Key: "ownerFirst", Label: "نام مالک", Type: "text", Kinds: kS, Group: "مالک فروشگاه"},
	{Key: "ownerLast", Label: "نام خانوادگی مالک", Type: "text", Kinds: kS, Group: "مالک فروشگاه"},
	{Key: "ownerCode", Label: "کد ملی مالک", Type: "num", Kinds: kS, Max: 10, Group: "مالک فروشگاه"},
	{Key: "shopEconomic", Label: "کد اقتصادی (اگر دارد)", Type: "num", Kinds: kS, Max: 12, DefHide: true, Group: "مالک فروشگاه"},
	{Key: "ownerBirth", Label: "تاریخ تولد مالک", Type: "date", Kinds: kS, DefHide: true, Hint: "۱۳۶۵/۰۵/۲۰", Group: "مالک فروشگاه"},
	// contact and address
	{Key: "phone", Label: "موبایل", Type: "tel", Hint: "09123456789", Group: "تماس"},
	{Key: "phone2", Label: "موبایل دوم", Type: "tel", DefHide: true, Group: "تماس"},
	{Key: "landline", Label: "تلفن ثابت", Type: "tel", Hint: "02112345678", Group: "تماس"},
	{Key: "fax", Label: "فکس", Type: "tel", DefHide: true, Group: "تماس"},
	{Key: "email", Label: "ایمیل", Type: "email", Group: "تماس"},
	{Key: "website", Label: "وب‌سایت", Type: "url", Hint: "example.com", Group: "تماس"},
	{Key: "province", Label: "استان", Type: "text", Group: "نشانی"},
	{Key: "city", Label: "شهر", Type: "text", Group: "نشانی"},
	{Key: "postalCode", Label: "کد پستی (۱۰ رقم)", Type: "num", Max: 10, Group: "نشانی"},
	{Key: "address", Label: "نشانی کامل", Type: "area", Group: "نشانی"},
	// other
	{Key: "industry", Label: "صنعت", Type: "text", DefHide: true, Group: "سایر"},
	{Key: "role", Label: "نقش (سمت)", Type: "text", DefHide: true, Group: "سایر"},
	{Key: "interest", Label: "مشتری دنبال چه کالایی می‌گردد؟", Type: "text", Group: "سایر"},
	{Key: "isSupplier", Label: "تأمین‌کنندهٔ کالا هم هستم", Type: "check", DefHide: true, Group: "سایر"},
	{Key: "noEmail", Label: "نمی‌خواهم ایمیل تبلیغاتی بگیرم", Type: "check", DefHide: true, Group: "سایر"},
	{Key: "referrerName", Label: "نام معرف", Type: "text", DefHide: true, Group: "سایر"},
	{Key: "referrerPhone", Label: "شمارهٔ تماس معرف", Type: "tel", DefHide: true, Group: "سایر"},
	{Key: "event", Label: "نمایشگاه / محل ثبت", Type: "text", Hint: "مثلاً نمایشگاه ماشین‌آلات راهسازی", DefHide: true, Group: "سایر"},
	{Key: "note", Label: "توضیحات", Type: "area", Group: "سایر"},
}

// required until the administrator chooses his own list (only the fields that the chosen kind shows are checked)
var selfDefaultRequired = []string{"نام شرکت", "نام و نام خانوادگی نماینده", "نام", "نام خانوادگی", "نام فروشگاه", "موبایل"}

func selfDefaultHidden() []string {
	out := []string{}
	for _, f := range selfFields {
		if f.DefHide {
			out = append(out, f.Label)
		}
	}
	return out
}

func selfAppliesTo(f selfField, kind string) bool {
	return len(f.Kinds) == 0 || jsonx.Contains(f.Kinds, kind)
}

func selfKindOf(label string) string {
	switch {
	case strings.HasPrefix(label, "حقیقی"):
		return "PERSON"
	case strings.HasPrefix(label, "فروشگاه"):
		return "SHOP"
	}
	return "COMPANY"
}

var enDigits = strings.NewReplacer("۰", "0", "۱", "1", "۲", "2", "۳", "3", "۴", "4", "۵", "5", "۶", "6", "۷", "7", "۸", "8", "۹", "9", "٠", "0", "١", "1", "٢", "2", "٣", "3", "٤", "4", "٥", "5", "٦", "6", "٧", "7", "٨", "8", "٩", "9")

var emailRe = regexp.MustCompile(`^[^@\s]{1,64}@[^@\s]{1,200}\.[^@\s]{2,}$`)

// jalaliToISO turns «1365/05/20» (also with Persian digits or «-») into «1986-08-11»; "" when it is not a real date.
func jalaliToISO(s string) string {
	s = enDigits.Replace(strings.TrimSpace(s))
	p := regexp.MustCompile(`[/\-.]`).Split(s, -1)
	if len(p) != 3 {
		return ""
	}
	jy, e1 := strconv.Atoi(p[0])
	jm, e2 := strconv.Atoi(p[1])
	jd, e3 := strconv.Atoi(p[2])
	if e1 != nil || e2 != nil || e3 != nil || jy < 1200 || jy > 1500 || jm < 1 || jm > 12 || jd < 1 || jd > 31 || (jm > 6 && jd > 30) {
		return ""
	}
	gy, gm, gd := jalaliToGregorian(jy, jm, jd)
	return fmt.Sprintf("%04d-%02d-%02d", gy, gm, gd)
}

func jalaliToGregorian(jy, jm, jd int) (int, int, int) {
	jy += 1595
	days := -355668 + 365*jy + (jy/33)*8 + ((jy%33)+3)/4 + jd
	if jm < 7 {
		days += (jm - 1) * 31
	} else {
		days += (jm-7)*30 + 186
	}
	gy := 400 * (days / 146097)
	days %= 146097
	if days > 36524 {
		days--
		gy += 100 * (days / 36524)
		days %= 36524
		if days >= 365 {
			days++
		}
	}
	gy += 4 * (days / 1461)
	days %= 1461
	if days > 365 {
		gy += (days - 1) / 365
		days = (days - 1) % 365
	}
	gd := days + 1
	feb := 28
	if (gy%4 == 0 && gy%100 != 0) || gy%400 == 0 {
		feb = 29
	}
	months := []int{0, 31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	gm := 0
	for gm = 0; gm < 13 && gd > months[gm]; gm++ {
		gd -= months[gm]
	}
	return gy, gm, gd
}

// the quick form (the marketer's page and the web-site form) starts with these fields only; the administrator adds the others in the console
var quickShown = []string{"نوع مشتری", "نام", "نام خانوادگی", "نام شرکت", "نام فروشگاه", "موبایل", "شهر", "نمایشگاه / محل ثبت", "توضیحات"}
var quickRequired = []string{"نام", "نام خانوادگی", "نام شرکت", "نام فروشگاه", "موبایل"}

func quickDefaultHidden() []string {
	out := []string{}
	for _, f := range selfFields {
		if !jsonx.Contains(quickShown, f.Label) {
			out = append(out, f.Label)
		}
	}
	return out
}

// formDefaults: what a form has until the administrator chooses his own list («selfreg»: the full registration form; «field»: the quick form)
func formDefaults(formID string) (hidden, required []string) {
	if formID == "field" {
		return quickDefaultHidden(), quickRequired
	}
	return selfDefaultHidden(), selfDefaultRequired
}

// the list as the page and the console need it
func selfSpec(ctx context.Context, formID string) jsonx.M {
	hidden, required := selfCfgFor(ctx, formID)
	return jsonx.M{"hidden": hidden, "required": required, "company": companyName(ctx), "fields": selfFields}
}

// selfCfgFor: what the console decided about one form; until he chooses, the defaults
func selfCfgFor(ctx context.Context, formID string) (hidden, required []string) {
	hidden, required = formDefaults(formID)
	var raw []byte
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw) != nil {
		return
	}
	cfg := jsonx.Sub(jsonx.Sub(jsonx.Decode(raw), "formConfig"), formID)
	if _, set := cfg["hidden"]; set {
		hidden = jsonx.Strings(cfg, "hidden")
	}
	if _, set := cfg["required"]; set {
		required = jsonx.Strings(cfg, "required")
	}
	return
}

// GET /api/field/self-fields: the same description for the console (the sample form of «فرم‌ها»)
func selfFieldsList(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"fields": selfFields, "defaultHidden": selfDefaultHidden(), "defaultRequired": selfDefaultRequired, "quickDefaultHidden": quickDefaultHidden(), "quickDefaultRequired": quickRequired})
}

// createSelfCustomer registers a customer from its own form. A mobile number or a national id that is already in the system creates nothing (the
// owner of the key is told); the visitor is told nothing about whose customer that is.
// selfOpt says which form's tuning applies, what is written as the source and who wrote the first note, and whether a number that already exists is
// refused out loud (the marketer's own page: the message names the owner) or quietly (a public page).
type selfOpt struct {
	Form, Source, By string
	Loud             bool
	Force            []string // labels hidden whatever the console says
}

func createSelfCustomer(ctx context.Context, owner auth.User, in map[string]string, opt selfOpt) (jsonx.M, *leadErr) {
	hidden, required := selfCfgFor(ctx, opt.Form)
	hidden = append(append([]string{}, hidden...), opt.Force...)
	kind := "COMPANY"
	if !labelOn(hidden, "نوع مشتری") {
		kind = selfKindOf(in["kind"])
	}
	val := map[string]string{}
	for _, f := range selfFields {
		v := strings.TrimSpace(in[f.Key])
		max := 200
		if f.Type == "area" {
			max = 1000
		}
		if utf8.RuneCountInString(v) > max {
			v = string([]rune(v)[:max])
		}
		if labelOn(hidden, f.Label) || !selfAppliesTo(f, kind) {
			v = ""
		}
		val[f.Key] = v
	}
	mobile, ok := sms.Mobile(in["phone"])
	if !ok {
		return nil, &leadErr{http.StatusBadRequest, "شمارهٔ موبایل درست نیست (۱۱ رقم، مثل ۰۹۱۲۳۴۵۶۷۸۹)."}
	}
	var name string
	switch kind {
	case "PERSON":
		name = strings.TrimSpace(val["firstName"] + " " + val["lastName"])
		if utf8.RuneCountInString(name) < 2 {
			return nil, &leadErr{http.StatusBadRequest, "نام را وارد کنید."}
		}
	case "SHOP":
		name = val["shopName"]
		if utf8.RuneCountInString(name) < 2 {
			return nil, &leadErr{http.StatusBadRequest, "نام فروشگاه را وارد کنید."}
		}
	default:
		name = val["company"]
		if utf8.RuneCountInString(name) < 2 {
			return nil, &leadErr{http.StatusBadRequest, "نام شرکت را وارد کنید."}
		}
	}
	for _, f := range selfFields {
		if selfAppliesTo(f, kind) && !labelOn(hidden, f.Label) && labelOn(required, f.Label) && val[f.Key] == "" && f.Type != "check" {
			return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» را وارد کنید."}
		}
		if f.Type == "check" && labelOn(required, f.Label) && !labelOn(hidden, f.Label) && in[f.Key] != "1" {
			return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» را تأیید کنید."}
		}
	}
	// the numbers: digits only, the right length
	for _, f := range selfFields {
		if f.Type != "num" || val[f.Key] == "" {
			continue
		}
		d := enDigits.Replace(val[f.Key])
		for _, c := range d {
			if c < '0' || c > '9' {
				return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» فقط عدد است."}
			}
		}
		if f.Max > 0 && (strings.Contains(f.Label, "رقم") || f.Key == "nationalCode" || f.Key == "ownerCode") && len(d) != f.Max {
			return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» باید " + map[int]string{10: "۱۰", 11: "۱۱", 12: "۱۲"}[f.Max] + " رقم باشد."}
		}
		val[f.Key] = d
	}
	for _, f := range selfFields {
		if f.Type == "date" && val[f.Key] != "" {
			iso := jalaliToISO(val[f.Key])
			if iso == "" {
				return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» درست نیست (مثل ۱۳۶۵/۰۵/۲۰)."}
			}
			val[f.Key] = iso
		}
	}
	if val["email"] != "" && !emailRe.MatchString(val["email"]) {
		return nil, &leadErr{http.StatusBadRequest, "نشانی ایمیل درست نیست."}
	}
	phones := []string{mobile}
	if val["phone2"] != "" {
		if m2, ok := sms.Mobile(val["phone2"]); ok {
			phones = append(phones, m2)
		} else {
			return nil, &leadErr{http.StatusBadRequest, "«موبایل دوم» درست نیست."}
		}
	}
	for _, k := range []string{"landline", "fax"} {
		if val[k] != "" {
			phones = append(phones, enDigits.Replace(val[k]))
		}
	}
	// already known: nothing is created
	if n, o, dup := phoneOwner(ctx, mobile, ""); dup {
		if opt.Loud {
			return nil, &leadErr{http.StatusConflict, dupMessage(n, o)}
		}
		notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "ثبت‌نام تکراری", Title: "«" + name + "» فرم ثبت مشخصات را پر کرد؛ این شماره از قبل برای «" + n + "» (مسئول: " + o + ") هست"}, "")
		return nil, &leadErr{http.StatusConflict, ""}
	}
	natID := val["nationalId"]
	if natID != "" {
		var n string
		if store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name', '') FROM crm_customers WHERE data->>'nationalId' = $1 LIMIT 1`, natID).Scan(&n) == nil {
			if opt.Loud {
				return nil, &leadErr{http.StatusConflict, "این شناسهٔ ملی الان متعلق به «" + n + "» است؛ مشتری تکراری ثبت نمی‌شود."}
			}
			notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "ثبت‌نام تکراری", Title: "«" + name + "» فرم ثبت مشخصات را پر کرد؛ این شناسهٔ ملی از قبل برای «" + n + "» هست"}, "")
			return nil, &leadErr{http.StatusConflict, ""}
		}
	}
	t := now()
	doc := jsonx.M{
		"id": "cu-" + randHex(8), "kind": kind, "name": name, "phones": phones, "email": val["email"], "website": val["website"], "province": val["province"], "city": val["city"],
		"postalCode": val["postalCode"], "address": val["address"], "industry": val["industry"], "role": val["role"], "prefix": val["prefix"], "interest": val["interest"],
		"status": "LEAD", "source": opt.Source, "tags": []string{}, "ownerId": owner.ID(), "ownerName": owner.Name(), "notes": "", "createdAt": t, "updatedAt": t,
	}
	if in["isSupplier"] == "1" && !labelOn(hidden, "تأمین‌کنندهٔ کالا هم هستم") {
		doc["isSupplier"] = true
	}
	if in["noEmail"] == "1" && !labelOn(hidden, "نمی‌خواهم ایمیل تبلیغاتی بگیرم") {
		doc["noEmail"] = true
	}
	if val["referrerName"] != "" || val["referrerPhone"] != "" {
		doc["referrer"] = jsonx.M{"kind": "OTHER", "name": val["referrerName"], "phone": val["referrerPhone"]}
	}
	switch kind {
	case "PERSON":
		doc["firstName"], doc["lastName"], doc["fatherName"], doc["nationalCode"], doc["idNumber"], doc["birthDate"], doc["company"] = val["firstName"], val["lastName"], val["fatherName"], val["nationalCode"], val["idNumber"], val["birthDate"], val["jobPlace"]
		switch val["gender"] {
		case "مرد":
			doc["gender"] = "M"
		case "زن":
			doc["gender"] = "F"
		}
	case "SHOP":
		doc["company"], doc["shopType"], doc["licenseNumber"] = name, val["shopType"], val["licenseNumber"]
		doc["firstName"], doc["lastName"], doc["nationalCode"], doc["economicCode"], doc["birthDate"] = val["ownerFirst"], val["ownerLast"], val["ownerCode"], val["shopEconomic"], val["ownerBirth"]
	default:
		doc["company"], doc["companyType"], doc["nationalId"], doc["economicCode"], doc["registrationNumber"], doc["registrationDate"] = name, val["companyType"], val["nationalId"], val["economicCode"], val["registrationNumber"], val["registrationDate"]
		doc["repName"], doc["repPosition"], doc["repMobile"] = val["repName"], val["repPosition"], val["repMobile"]
		if doc["repMobile"] == "" {
			doc["repMobile"] = mobile
		}
		reps := []jsonx.M{}
		for _, ln := range strings.Split(val["reps"], "\n") {
			p := strings.Split(ln, "-")
			if n := strings.TrimSpace(p[0]); n != "" && len(reps) < 10 {
				r := jsonx.M{"name": n}
				if len(p) > 1 {
					r["position"] = strings.TrimSpace(p[1])
				}
				if len(p) > 2 {
					r["mobile"] = strings.TrimSpace(p[2])
				}
				reps = append(reps, r)
			}
		}
		if len(reps) > 0 {
			doc["reps"] = reps
		}
	}
	var lines []string
	if val["event"] != "" {
		lines = append(lines, "ثبت‌شده در: "+val["event"])
	}
	if val["note"] != "" {
		lines = append(lines, val["note"])
	}
	if len(lines) > 0 {
		text := strings.Join(lines, "\n")
		doc["notes"] = text
		doc["noteLog"] = []jsonx.M{{"text": text, "at": t, "byId": owner.ID(), "byName": opt.By}}
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, jsonx.Str(doc, "id"), owner.ID(), jsonx.Encode(doc)); err != nil {
		return nil, &leadErr{http.StatusInternalServerError, "ثبت نشد؛ دوباره امتحان کنید."}
	}
	queueSepidarCustomerNew(ctx, owner, jsonx.Str(doc, "id"), name, doc)
	smsAutoCustomer("customer_new", doc, nil)
	notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "مشتری جدید", Title: "«" + name + "» ثبت شد (" + opt.By + ")", Ref: ref("customer", jsonx.Str(doc, "id"))}, "")
	return doc, nil
}

// collectFields reads {fields: {...}} of a request: text and ticks
func collectFields(body jsonx.M) map[string]string {
	in := map[string]string{}
	for k, v := range jsonx.Sub(body, "fields") {
		switch t := v.(type) {
		case string:
			in[k] = t
		case bool:
			if t {
				in[k] = "1"
			}
		}
	}
	return in
}

// leadSubmitForm: the POST of a public form {form, fields: {...}, trap}: a robot is told «done» and nothing is saved; a number that exists is not told to the visitor
func leadSubmitForm(w http.ResponseWriter, r *http.Request, owner auth.User, key string, body jsonx.M, opt selfOpt) {
	if jsonx.Str(body, "trap") != "" {
		httpx.OK(w)
		return
	}
	if leadLimited(httpx.ClientIP(r), key) {
		httpx.Error(w, http.StatusTooManyRequests, "درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.")
		return
	}
	if _, e := createSelfCustomer(r.Context(), owner, collectFields(body), opt); e != nil {
		if e.Status == http.StatusConflict {
			httpx.OK(w)
			return
		}
		httpx.Error(w, e.Status, e.Msg)
		return
	}
	httpx.OK(w)
}

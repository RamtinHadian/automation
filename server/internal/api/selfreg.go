package api

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/notify"
	"automation/server/internal/sms"
	"automation/server/internal/store"
)

// The full registration form that a COMPANY fills in about itself (a link the marketer sends, or a form on the company's site): /register?k=KEY.
// The company's complete details land in Hoormand as a customer of the marketer who owns the key. Which fields exist and which are required is
// decided in the management console (form «selfreg»).

type selfField struct{ Key, Label string }

// the labels are also the keys of the console's tuning
var selfFields = []selfField{
	{"company", "نام شرکت"}, {"companyType", "نوع شرکت"}, {"nationalId", "شناسهٔ ملی (۱۱ رقم)"}, {"economicCode", "کد اقتصادی (۱۲ رقم)"}, {"registrationNumber", "شمارهٔ ثبت"},
	{"repName", "نام و نام خانوادگی نماینده"}, {"repPosition", "سمت نماینده"}, {"phone", "موبایل"}, {"landline", "تلفن ثابت"}, {"email", "ایمیل"}, {"website", "وب‌سایت"},
	{"province", "استان"}, {"city", "شهر"}, {"postalCode", "کد پستی (۱۰ رقم)"}, {"address", "نشانی کامل"}, {"industry", "زمینهٔ فعالیت"}, {"note", "توضیحات"},
}

var selfDefaultRequired = []string{"نام شرکت", "نام و نام خانوادگی نماینده", "موبایل"}

func selfLabel(key string) string {
	for _, f := range selfFields {
		if f.Key == key {
			return f.Label
		}
	}
	return key
}

var enDigits = strings.NewReplacer("۰", "0", "۱", "1", "۲", "2", "۳", "3", "۴", "4", "۵", "5", "۶", "6", "۷", "7", "۸", "8", "۹", "9", "٠", "0", "١", "1", "٢", "2", "٣", "3", "٤", "4", "٥", "5", "٦", "6", "٧", "7", "٨", "8", "٩", "9")

var emailRe = regexp.MustCompile(`^[^@\s]{1,64}@[^@\s]{1,200}\.[^@\s]{2,}$`)

func selfInfo(ctx context.Context) jsonx.M {
	hidden, required := formCfg(ctx, "selfreg", selfDefaultRequired)
	return jsonx.M{"hidden": hidden, "required": required, "company": companyName(ctx)}
}

// createSelfCustomer registers a company from its own form. A mobile number or a national id that is already in the system creates nothing (the
// owner of the key is told); the visitor is told nothing about whose customer that is.
func createSelfCustomer(ctx context.Context, owner auth.User, in map[string]string) (jsonx.M, *leadErr) {
	hidden, required := formCfg(ctx, "selfreg", selfDefaultRequired)
	val := map[string]string{}
	for _, f := range selfFields {
		v := strings.TrimSpace(in[f.Key])
		max := 200
		switch f.Key {
		case "address", "note":
			max = 1000
		}
		if utf8.RuneCountInString(v) > max {
			v = string([]rune(v)[:max])
		}
		if labelOn(hidden, f.Label) {
			v = ""
		}
		val[f.Key] = v
	}
	// the company's name and a mobile number are always needed (the number is how the company is reached and how a duplicate is found)
	if utf8.RuneCountInString(val["company"]) < 2 {
		return nil, &leadErr{http.StatusBadRequest, "نام شرکت را وارد کنید."}
	}
	mobile, ok := sms.Mobile(in["phone"])
	if !ok {
		return nil, &leadErr{http.StatusBadRequest, "شمارهٔ موبایل درست نیست (۱۱ رقم، مثل ۰۹۱۲۳۴۵۶۷۸۹)."}
	}
	for _, f := range selfFields {
		if labelOn(required, f.Label) && val[f.Key] == "" && !labelOn(hidden, f.Label) {
			return nil, &leadErr{http.StatusBadRequest, "«" + f.Label + "» را وارد کنید."}
		}
	}
	digits := func(key string, n int, name string) *leadErr {
		if val[key] == "" {
			return nil
		}
		d := enDigits.Replace(val[key])
		for _, c := range d {
			if c < '0' || c > '9' {
				return &leadErr{http.StatusBadRequest, name + " فقط عدد است."}
			}
		}
		if len(d) != n {
			return &leadErr{http.StatusBadRequest, name + " باید " + map[int]string{10: "۱۰", 11: "۱۱", 12: "۱۲"}[n] + " رقم باشد."}
		}
		val[key] = d
		return nil
	}
	for _, c := range []struct {
		k string
		n int
		t string
	}{{"nationalId", 11, "شناسهٔ ملی"}, {"economicCode", 12, "کد اقتصادی"}, {"postalCode", 10, "کد پستی"}} {
		if e := digits(c.k, c.n, c.t); e != nil {
			return nil, e
		}
	}
	if val["email"] != "" && !emailRe.MatchString(val["email"]) {
		return nil, &leadErr{http.StatusBadRequest, "نشانی ایمیل درست نیست."}
	}
	phones := []string{mobile}
	if val["landline"] != "" {
		phones = append(phones, enDigits.Replace(val["landline"]))
	}
	// already known: nothing is created
	if n, o, dup := phoneOwner(ctx, mobile, ""); dup {
		notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "ثبت‌نام تکراری", Title: "شرکت «" + val["company"] + "» فرم ثبت مشخصات را پر کرد؛ این شماره از قبل برای «" + n + "» (مسئول: " + o + ") هست"}, "")
		return nil, &leadErr{http.StatusConflict, ""}
	}
	if val["nationalId"] != "" {
		var n string
		if store.Pool.QueryRow(ctx, `SELECT COALESCE(data->>'name', '') FROM crm_customers WHERE data->>'nationalId' = $1 LIMIT 1`, val["nationalId"]).Scan(&n) == nil {
			notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "ثبت‌نام تکراری", Title: "شرکت «" + val["company"] + "» فرم ثبت مشخصات را پر کرد؛ این شناسهٔ ملی از قبل برای «" + n + "» هست"}, "")
			return nil, &leadErr{http.StatusConflict, ""}
		}
	}
	t := now()
	doc := jsonx.M{
		"id": "cu-" + randHex(8), "kind": "COMPANY", "name": val["company"], "company": val["company"], "companyType": val["companyType"], "nationalId": val["nationalId"],
		"economicCode": val["economicCode"], "registrationNumber": val["registrationNumber"], "repName": val["repName"], "repPosition": val["repPosition"], "repMobile": mobile,
		"phones": phones, "email": val["email"], "website": val["website"], "province": val["province"], "city": val["city"], "postalCode": val["postalCode"], "address": val["address"],
		"industry": val["industry"], "status": "LEAD", "source": "ثبت‌نام شرکت (فرم اینترنتی)", "tags": []string{}, "ownerId": owner.ID(), "ownerName": owner.Name(), "notes": "", "createdAt": t, "updatedAt": t,
	}
	if val["note"] != "" {
		doc["notes"] = val["note"]
		doc["noteLog"] = []jsonx.M{{"text": val["note"], "at": t, "byId": owner.ID(), "byName": "فرم ثبت مشخصات شرکت"}}
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO crm_customers (id, owner_id, data) VALUES ($1, $2, $3::jsonb)`, jsonx.Str(doc, "id"), owner.ID(), jsonx.Encode(doc)); err != nil {
		return nil, &leadErr{http.StatusInternalServerError, "ثبت نشد؛ دوباره امتحان کنید."}
	}
	queueSepidarCustomerNew(ctx, owner, jsonx.Str(doc, "id"), val["company"], doc)
	smsAutoCustomer("customer_new", doc, nil)
	notify.Notify(ctx, []string{owner.ID()}, notify.Note{Kind: "customer", Label: "مشتری جدید", Title: "شرکت «" + val["company"] + "» مشخصات خود را ثبت کرد", Ref: ref("customer", jsonx.Str(doc, "id"))}, "")
	return doc, nil
}

// leadSubmitFull: the POST of the full form {form: "full", fields: {...}, trap}
func leadSubmitFull(w http.ResponseWriter, r *http.Request, owner auth.User, key string, body jsonx.M) {
	if jsonx.Str(body, "trap") != "" {
		httpx.OK(w)
		return
	}
	if leadLimited(httpx.ClientIP(r), key) {
		httpx.Error(w, http.StatusTooManyRequests, "درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.")
		return
	}
	in := map[string]string{}
	for k, v := range jsonx.Sub(body, "fields") {
		if s, ok := v.(string); ok {
			in[k] = s
		}
	}
	if _, e := createSelfCustomer(r.Context(), owner, in); e != nil {
		if e.Status == http.StatusConflict {
			httpx.OK(w) // the visitor is not told whose customer that is
			return
		}
		httpx.Error(w, e.Status, e.Msg)
		return
	}
	httpx.OK(w)
}

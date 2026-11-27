package api

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
)

// «چه کسانی این کالا را قیمت گرفته‌اند / خریده‌اند»: from the warehouse card of a product. It lists, per customer, every proforma and invoice
// that has the product code in its rows, with the customer's details and the figures; and the AI can read the same facts and analyse them.
// Only what the person may see (the CRM rules) is read; the money only for those who may see sales money.

const productAiPrompt = `تو تحلیلگر ارشد فروش و انبار یک شرکت ایرانی هستی. برای یک کالا، موجودی و فهرست مشتریانی که قیمت گرفته‌اند یا خریده‌اند، با سند، تعداد، قیمت و تاریخ، به تو داده می‌شود. فقط از روی همین داده بنویس؛ هیچ نام، عدد یا تاریخی از خودت نساز و اگر داده کم است صادقانه بگو. فارسی روان و کوتاه، عددها لاتین (0-9)، تاریخ‌ها فقط شمسی همان‌طور که در داده آمده.
خروجی فقط یک JSON معتبر:
{"headline":"یک جملهٔ صریح دربارهٔ وضع فروش این کالا","summary":"سه تا پنج جمله","demand":"وضع تقاضا: چند نفر قیمت گرفته و چند نفر خریده، روند زمانی","pricing":"تحلیل قیمت‌ها: بازهٔ قیمت، تفاوت قیمت‌های داده‌شده و فروخته‌شده، تخفیف‌ها","topBuyers":[{"name":"","why":""}],"hotLeads":[{"name":"","why":"قیمت گرفته ولی نخریده و چه باید کرد"}],"stock":"نتیجه‌گیری با موجودی (کمبود یا انباشت) اگر موجودی داده شده","risks":["..."],"nextActions":[{"title":"","why":""}]}`

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

// the documents (proformas and issued invoices) that carry the product code, for the opportunities this person may see
func productFacts(ctx context.Context, me auth.User, code string) (priced, sold []jsonx.M) {
	if !me.CanUseCrm() {
		return nil, nil
	}
	probe := `[{"code":` + strconv.Quote(code) + `}]`
	var rows []jsonx.M
	if crmSeesAll(me) {
		rows = rawMaps(ctx, `SELECT data FROM crm_deals WHERE (data->'items' @> $1::jsonb OR data->'invoice'->'items' @> $1::jsonb) ORDER BY created_at DESC LIMIT 800`, probe)
	} else {
		rows = rawMaps(ctx, `SELECT data FROM crm_deals WHERE `+crmMyDeals+` AND (data->'items' @> $3::jsonb OR data->'invoice'->'items' @> $3::jsonb) ORDER BY created_at DESC LIMIT 800`, me.ID(), crmPeople(ctx, me), probe)
	}
	ids := map[string]bool{}
	for _, d := range rows {
		ids[jsonx.Str(d, "customerId")] = true
	}
	idList := make([]string, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	cust := map[string]jsonx.M{}
	for _, c := range rawMaps(ctx, `SELECT jsonb_set(data, '{id}', to_jsonb(id)) FROM crm_customers WHERE id = ANY($1)`, idList) {
		cust[jsonx.Str(c, "id")] = c
	}
	pick := func(items any) (qty, price, disc float64, title string) {
		arr, _ := items.([]any)
		for _, it := range arr {
			m, _ := it.(map[string]any)
			if m != nil && jsonx.Str(m, "code") == code {
				qty += jsonx.Num(m["qty"])
				price, disc, title = jsonx.Num(m["unitPrice"]), disc+jsonx.Num(m["discount"]), jsonx.Str(m, "title")
			}
		}
		return
	}
	for _, d := range rows {
		if jsonx.Str(d, "mergedInto") != "" {
			continue
		}
		c := cust[jsonx.Str(d, "customerId")]
		base := jsonx.M{
			"customerId": jsonx.Str(d, "customerId"), "customerName": jsonx.Str(d, "customerName"),
			"company": jsonx.Str(c, "company"), "city": jsonx.Str(c, "city"), "status": jsonx.Str(c, "status"), "phones": c["phones"],
			"owner": jsonx.Str(d, "ownerName"), "dealTitle": jsonx.Str(d, "title"), "stage": jsonx.Str(d, "stage"),
			"lostReason": jsonx.Str(d, "lostReason"),
		}
		if no := jsonx.Str(d, "proformaNumber"); no != "" && !jsonx.Bool(d, "standalone") {
			if q, p, ds, t := pick(d["items"]); q > 0 {
				e := jsonx.M{"number": no, "at": firstNonEmpty(jsonx.Str(d, "proformaAt"), jsonx.Str(d, "createdAt")), "qty": q, "unitPrice": p, "discount": ds, "itemTitle": t, "discountPercent": jsonx.Num(d["discountPercent"])}
				for k, v := range base {
					e[k] = v
				}
				priced = append(priced, e)
			}
		}
		if inv, _ := d["invoice"].(map[string]any); inv != nil && jsonx.Str(inv, "status") != "cancelled" {
			if q, p, ds, t := pick(inv["items"]); q > 0 {
				e := jsonx.M{"number": jsonx.Str(inv, "number"), "at": jsonx.Str(inv, "issuedAt"), "qty": q, "unitPrice": p, "discount": ds, "itemTitle": t, "discountPercent": jsonx.Num(inv["discountPercent"]), "kind": jsonx.Str(inv, "kind"), "invoiceStatus": jsonx.Str(inv, "status")}
				for k, v := range base {
					e[k] = v
				}
				sold = append(sold, e)
			}
		}
	}
	byAt := func(l []jsonx.M) {
		sort.Slice(l, func(i, j int) bool { return jsonx.Str(l[i], "at") > jsonx.Str(l[j], "at") })
	}
	byAt(priced)
	byAt(sold)
	return priced, sold
}

func stripMoney(l []jsonx.M) {
	for _, e := range l {
		delete(e, "unitPrice")
		delete(e, "discount")
		delete(e, "discountPercent")
	}
}

func nonNil(l []jsonx.M) []jsonx.M {
	if l == nil {
		return []jsonx.M{}
	}
	return l
}

// GET /api/warehouse/product-customers?code=
func productCustomers(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	if code == "" {
		httpx.JSON(w, http.StatusOK, map[string]any{"priced": []any{}, "sold": []any{}})
		return
	}
	priced, sold := productFacts(r.Context(), me, code)
	if !seesSalesMoney(me) {
		stripMoney(priced)
		stripMoney(sold)
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"priced": nonNil(priced), "sold": nonNil(sold)})
}

// POST /api/warehouse/product-ai?code=&stock=
func productAiRun(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	if aiDenied(w, me, "ai.product") {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 150*time.Second)
	defer cancel()
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	s := supportSettings(ctx)
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات هوش مصنوعی ذخیره کنید.")
		return
	}
	priced, sold := productFacts(ctx, me, code)
	if len(priced)+len(sold) == 0 {
		httpx.Error(w, http.StatusBadRequest, "برای این کالا پیش‌فاکتور یا فاکتوری پیدا نشد که تحلیل شود.")
		return
	}
	money := seesSalesMoney(me)
	var b strings.Builder
	b.WriteString("امروز: " + jalaliText(time.Now().Format("2006-01-02")) + "\nکد کالا: " + code + "\n")
	if p := rawMaps(ctx, `SELECT data FROM wh_products WHERE data->>'code' = $1 LIMIT 1`, code); len(p) > 0 {
		b.WriteString("نام: " + cutRunes(jsonx.Str(p[0], "title"), 100) + " · واحد: " + jsonx.Str(p[0], "unit") + "\n")
	}
	if q := r.URL.Query().Get("stock"); q != "" {
		b.WriteString("موجودی فعلی انبار: " + cutRunes(q, 20) + "\n")
	}
	line := func(e jsonx.M) string {
		t := "- " + cutRunes(jsonx.Str(e, "customerName"), 60)
		if v := jsonx.Str(e, "company"); v != "" {
			t += " (" + cutRunes(v, 50) + ")"
		}
		t += " · سند " + jsonx.Str(e, "number") + " · " + jalaliText(jsonx.Str(e, "at")) + " · تعداد " + strconv.Itoa(int(jsonx.Num(e["qty"])))
		if money && jsonx.Num(e["unitPrice"]) > 0 {
			t += " · قیمت واحد " + strconv.Itoa(int(jsonx.Num(e["unitPrice"])))
		}
		if money && jsonx.Num(e["discountPercent"]) > 0 {
			t += " · تخفیف کل " + strconv.Itoa(int(jsonx.Num(e["discountPercent"]))) + "٪"
		}
		t += " · فروشنده " + cutRunes(jsonx.Str(e, "owner"), 40) + " · مرحلهٔ فرصت " + jsonx.Str(e, "stage")
		if v := jsonx.Str(e, "lostReason"); v != "" {
			t += " · دلیل باخت: " + cutRunes(v, 100)
		}
		return t + "\n"
	}
	cut := func(l []jsonx.M) []jsonx.M {
		if len(l) > 80 {
			return l[:80]
		}
		return l
	}
	b.WriteString("\nفاکتورهای صادرشده با این کالا (" + strconv.Itoa(len(sold)) + "):\n")
	for _, e := range cut(sold) {
		b.WriteString(line(e))
	}
	b.WriteString("\nپیش‌فاکتورها (قیمت‌های داده‌شده) (" + strconv.Itoa(len(priced)) + "):\n")
	for _, e := range cut(priced) {
		b.WriteString(line(e))
	}
	out, err := aiChatOpts(ctx, key, model, []aiMsg{{Role: "system", Content: productAiPrompt}, {Role: "user", Content: b.String()}}, 3000, 130*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	res := parseLooseJSON(out)
	if res == nil || res["headline"] == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"analysis": res, "createdAt": time.Now().UTC().Format("2006-01-02T15:04:05.000Z")})
}

func registerProductCustomers(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/warehouse/product-customers", auth.Require(productCustomers))
	mux.HandleFunc("POST /api/warehouse/product-ai", auth.Require(productAiRun))
}

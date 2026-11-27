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
	"automation/server/internal/store"
)

// «گزارش هفتگی کالاها» in the warehouse, for management decisions: for each product, in the last 7 days against the 7 days before, how much was
// priced (proformas) and sold (issued invoices), to how many customers, what is in stock, and what the numbers say (shortage, demand higher than
// stock, priced but not sold). Built from the opportunities the person may see; the money only for those who may see sales money.

const weeklyAiPrompt = `تو مشاور ارشد مدیریت فروش و انبار یک شرکت ایرانی هستی. گزارش یک هفتهٔ کالاها (قیمت‌های داده‌شده، فروش، موجودی، نسبت به هفتهٔ قبل) به تو داده می‌شود. فقط از روی همین داده بنویس؛ هیچ عدد یا نامی از خودت نساز و اگر داده کم است صادقانه بگو. فارسی روان و کوتاه، عددها لاتین (0-9).
خروجی فقط یک JSON معتبر:
{"headline":"یک جملهٔ صریح دربارهٔ وضع هفته","summary":"سه تا پنج جمله","decisions":[{"title":"تصمیم پیشنهادی برای مدیر","why":"دلیل از روی داده"}],"reorder":[{"product":"نام کالا","why":"چرا باید سفارش یا تأمین شود"}],"slow":[{"product":"","why":"کالایی که قیمت می‌گیرند ولی نمی‌خرند یا فروش افت کرده و چه کنیم"}],"risks":["..."]}`

type weekAgg struct {
	PricedQty, SoldQty, PricedPrev, SoldPrev, Revenue float64
	PricedCust, SoldCust                               map[string]bool
	PricedDocs, SoldDocs                               int
}

func weeklyRows(ctx context.Context, me auth.User, offsetDays int) ([]jsonx.M, string, string) {
	now := time.Now()
	end := now.AddDate(0, 0, -offsetDays)
	start := end.AddDate(0, 0, -7)
	prevStart := end.AddDate(0, 0, -14)
	day := func(t time.Time) string { return t.Format("2006-01-02") }
	sDay, eDay, pDay := day(start), day(end), day(prevStart)

	prods := map[string]jsonx.M{} // by code
	byCode := []string{}
	for _, p := range rawMaps(ctx, `SELECT jsonb_set(data, '{id}', to_jsonb(id)) FROM wh_products`) {
		if jsonx.Str(p, "kind") == "service" || (p["active"] == false) {
			continue
		}
		if !whProductOK(me, jsonx.Str(p, "id"), jsonx.Str(p, "group")) {
			continue
		}
		c := strings.TrimSpace(jsonx.Str(p, "code"))
		if c == "" {
			continue
		}
		prods[c] = p
		byCode = append(byCode, c)
	}
	bal, _ := whBalances(ctx, store.Pool)
	stockOf := func(p jsonx.M) float64 {
		t := 0.0
		for wh, n := range bal[jsonx.Str(p, "id")] {
			if whWarehouseOK(me, wh) {
				t += n
			}
		}
		return t
	}

	var deals []jsonx.M
	if me.CanUseCrm() {
		cond := `(COALESCE(data->>'proformaAt', '') >= $%d OR COALESCE(data->'invoice'->>'issuedAt', '') >= $%d)`
		if crmSeesAll(me) {
			deals = rawMaps(ctx, `SELECT data FROM crm_deals WHERE `+strings.ReplaceAll(cond, "%d", "1")+` LIMIT 3000`, pDay)
		} else {
			deals = rawMaps(ctx, `SELECT data FROM crm_deals WHERE `+crmMyDeals+` AND `+strings.ReplaceAll(cond, "%d", "3")+` LIMIT 3000`, me.ID(), crmPeople(ctx, me), pDay)
		}
	}
	money := seesSalesMoney(me)
	agg := map[string]*weekAgg{}
	get := func(code string) *weekAgg {
		a := agg[code]
		if a == nil {
			a = &weekAgg{PricedCust: map[string]bool{}, SoldCust: map[string]bool{}}
			agg[code] = a
		}
		return a
	}
	// which of the two weeks a date falls in: 1 = this week, 2 = the week before, 0 = neither
	week := func(at string) int {
		if len(at) < 10 {
			return 0
		}
		d := at[:10]
		switch {
		case d > sDay && d <= eDay:
			return 1
		case d > pDay && d <= sDay:
			return 2
		}
		return 0
	}
	for _, d := range deals {
		if jsonx.Str(d, "mergedInto") != "" {
			continue
		}
		cid := jsonx.Str(d, "customerId")
		if no := jsonx.Str(d, "proformaNumber"); no != "" && !jsonx.Bool(d, "standalone") {
			wk := week(jsonx.Str(d, "proformaAt"))
			items, _ := d["items"].([]any)
			for _, it := range items {
				m, _ := it.(map[string]any)
				code := strings.TrimSpace(jsonx.Str(m, "code"))
				if m == nil || prods[code] == nil || wk == 0 {
					continue
				}
				a := get(code)
				if wk == 1 {
					a.PricedQty += jsonx.Num(m["qty"])
					a.PricedCust[cid] = true
					a.PricedDocs++
				} else {
					a.PricedPrev += jsonx.Num(m["qty"])
				}
			}
		}
		if inv, _ := d["invoice"].(map[string]any); inv != nil && jsonx.Str(inv, "status") != "cancelled" {
			wk := week(jsonx.Str(inv, "issuedAt"))
			items, _ := inv["items"].([]any)
			for _, it := range items {
				m, _ := it.(map[string]any)
				code := strings.TrimSpace(jsonx.Str(m, "code"))
				if m == nil || prods[code] == nil || wk == 0 {
					continue
				}
				a := get(code)
				if wk == 1 {
					q := jsonx.Num(m["qty"])
					a.SoldQty += q
					a.SoldCust[cid] = true
					a.SoldDocs++
					a.Revenue += q * jsonx.Num(m["unitPrice"])
				} else {
					a.SoldPrev += jsonx.Num(m["qty"])
				}
			}
		}
	}
	out := []jsonx.M{}
	for _, code := range byCode {
		p := prods[code]
		a := agg[code]
		stock := stockOf(p)
		minQty := jsonx.Num(p["minQty"])
		low := minQty > 0 && stock < minQty
		if a == nil && !low {
			continue
		}
		if a == nil {
			a = &weekAgg{PricedCust: map[string]bool{}, SoldCust: map[string]bool{}}
		}
		flags := []string{}
		if low {
			flags = append(flags, "کمبود")
		}
		if a.PricedQty > 0 && stock < a.PricedQty {
			flags = append(flags, "تقاضا بیشتر از موجودی")
		}
		if a.PricedQty > 0 && a.SoldQty == 0 {
			flags = append(flags, "قیمت می‌گیرند، نمی‌خرند")
		}
		if a.SoldPrev > 0 && a.SoldQty < a.SoldPrev/2 {
			flags = append(flags, "افت فروش")
		}
		if a.SoldQty > 0 && a.SoldQty >= 2*a.SoldPrev && a.SoldPrev >= 0 && a.SoldQty > a.SoldPrev {
			flags = append(flags, "رشد فروش")
		}
		notSold := 0
		for c := range a.PricedCust {
			if !a.SoldCust[c] {
				notSold++
			}
		}
		row := jsonx.M{
			"code": code, "title": jsonx.Str(p, "title"), "unit": jsonx.Str(p, "unit"), "group": jsonx.Str(p, "group"),
			"stock": stock, "minQty": minQty,
			"pricedQty": a.PricedQty, "pricedPrev": a.PricedPrev, "pricedCustomers": len(a.PricedCust), "pricedDocs": a.PricedDocs,
			"soldQty": a.SoldQty, "soldPrev": a.SoldPrev, "soldCustomers": len(a.SoldCust), "soldDocs": a.SoldDocs,
			"flags": flags, "pricedNotSoldCustomers": notSold,
		}
		if money {
			row["revenue"] = a.Revenue
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		si, sj := jsonx.Num(out[i]["soldQty"])+jsonx.Num(out[i]["pricedQty"]), jsonx.Num(out[j]["soldQty"])+jsonx.Num(out[j]["pricedQty"])
		if si != sj {
			return si > sj
		}
		return jsonx.Str(out[i], "title") < jsonx.Str(out[j], "title")
	})
	return out, sDay, eDay
}

// GET /api/warehouse/weekly-report?offset=0 (offset = how many days back the week ends; 0 = the last 7 days up to today)
func whWeeklyReport(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if off < 0 || off > 365 {
		off = 0
	}
	rows, from, to := weeklyRows(r.Context(), me, off)
	httpx.JSON(w, http.StatusOK, map[string]any{"rows": rows, "from": from, "to": to, "money": seesSalesMoney(me), "crm": me.CanUseCrm()})
}

// POST /api/warehouse/weekly-ai?offset=0
func whWeeklyAi(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	if aiDenied(w, me, "ai.product") {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 150*time.Second)
	defer cancel()
	s := supportSettings(ctx)
	key, model := jsonx.Str(s, "aiKey"), jsonx.Str(s, "aiModel")
	if key == "" || model == "" {
		httpx.Error(w, http.StatusBadRequest, "اول کلید API و نام مدل را در پنل ادمین، تنظیمات هوش مصنوعی ذخیره کنید.")
		return
	}
	off, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if off < 0 || off > 365 {
		off = 0
	}
	rows, from, to := weeklyRows(ctx, me, off)
	if len(rows) == 0 {
		httpx.Error(w, http.StatusBadRequest, "در این هفته کالایی برای تحلیل نیست.")
		return
	}
	if len(rows) > 60 {
		rows = rows[:60]
	}
	money := seesSalesMoney(me)
	var b strings.Builder
	b.WriteString("هفتهٔ " + jalaliText(from) + " تا " + jalaliText(to) + "\n")
	n := func(v any) string { return strconv.Itoa(int(jsonx.Num(v))) }
	for _, x := range rows {
		b.WriteString("- " + cutRunes(jsonx.Str(x, "title"), 70) + " (کد " + jsonx.Str(x, "code") + "): قیمت‌داده " + n(x["pricedQty"]) + " (هفتهٔ قبل " + n(x["pricedPrev"]) + ") به " + n(x["pricedCustomers"]) + " نفر · فروش " + n(x["soldQty"]) + " (هفتهٔ قبل " + n(x["soldPrev"]) + ") به " + n(x["soldCustomers"]) + " نفر · موجودی " + n(x["stock"]) + " · حداقل " + n(x["minQty"]))
		if money && jsonx.Num(x["revenue"]) > 0 {
			b.WriteString(" · درآمد " + n(x["revenue"]))
		}
		if f, ok := x["flags"].([]string); ok && len(f) > 0 {
			b.WriteString(" · " + strings.Join(f, "، "))
		}
		b.WriteString("\n")
	}
	out, err := aiChatOpts(ctx, key, model, []aiMsg{{Role: "system", Content: weeklyAiPrompt}, {Role: "user", Content: b.String()}}, 3000, 130*time.Second)
	if err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	res := parseLooseJSON(out)
	if res == nil || res["headline"] == nil {
		httpx.Error(w, http.StatusBadGateway, "پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"analysis": res})
}

func registerWeeklyReport(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/warehouse/weekly-report", auth.Require(whWeeklyReport))
	mux.HandleFunc("POST /api/warehouse/weekly-ai", auth.Require(whWeeklyAi))
}

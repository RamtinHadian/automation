package api

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// POST /api/warehouse/prices-from-sepidar {apply, mode: "add"|"replace", divisor}
// Copies the SELLING prices of Sepidar's price list (the copy the tool keeps: «priceNotes») into the named prices of the products of the warehouse, matched by
// the product code. The title of every price is the name of its sale type in Sepidar. The amounts are divided by `divisor` (Sepidar usually works in rial,
// Hoormand stores toman: 10; the program guesses it from the main currency of Sepidar when it is not given). Only the top administrator may do it.
//   - mode «add» (default): the prices Sepidar has are added to the product, the ones typed by hand with another title stay, one with the same title is updated;
//   - mode «replace»: the prices of the product become exactly Sepidar's.
// Without `apply` nothing is written: it only says what would happen (counts and a few examples).
func whPricesFromSepidar(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, "گرفتن قیمت‌ها از سپیدار فقط برای مدیر کل است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	apply := jsonx.Bool(body, "apply")
	replace := jsonx.Str(body, "mode") == "replace"
	notes, _ := cacheItems(ctx, "priceNotes")
	if len(notes) == 0 {
		httpx.Error(w, http.StatusConflict, "هنوز لیست قیمت سپیدار به هورمند نرسیده است؛ ابزار سپیدار را روشن نگه دارید یا «بروزرسانی و اجرا» را بزنید.")
		return
	}
	divisor, _ := whNum(body, "divisor")
	if divisor <= 0 {
		divisor = 1
		curs, _ := cacheItems(ctx, "currencies")
		for _, c := range curs {
			if t, _ := c["Title"].(string); strings.Contains(t, "ریال") && (c["IsMain"] == true || len(curs) == 1) {
				divisor = 10
			}
		}
	}
	titles := map[string]string{}
	types, _ := cacheItems(ctx, "saleTypes")
	for _, t := range types {
		id := strconv.FormatInt(int64(numAny(t["SaleTypeID"])), 10)
		if s, _ := t["Title"].(string); s != "" {
			titles[id] = s
		}
	}
	type pr struct {
		title  string
		amount float64
	}
	byCode := map[string][]pr{}
	for _, n := range notes {
		if numAny(n["groupingRef"]) != 0 { // a price for one group of customers only is not a general price
			continue
		}
		code := strings.TrimSpace(faDigits.Replace(strAny(n["code"])))
		fee := numAny(n["fee"])
		if code == "" || fee <= 0 {
			continue
		}
		title := titles[strconv.FormatInt(int64(numAny(n["saleTypeRef"])), 10)]
		if title == "" {
			title = "نوع فروش " + strconv.FormatInt(int64(numAny(n["saleTypeRef"])), 10)
		}
		byCode[code] = append(byCode[code], pr{title, math.Round(fee / divisor)})
	}
	rows, err := store.Pool.Query(ctx, `SELECT id, code, data FROM wh_products`)
	if err != nil {
		internalError(w)
		return
	}
	type upd struct {
		id     string
		prices []any
	}
	var todo []upd
	examples := []jsonx.M{}
	matched, added := 0, 0
	seenCodes := map[string]bool{}
	for rows.Next() {
		var id, code string
		var raw []byte
		if rows.Scan(&id, &code, &raw) != nil {
			continue
		}
		code = strings.TrimSpace(faDigits.Replace(code))
		list := byCode[code]
		if len(list) == 0 {
			continue
		}
		seenCodes[code] = true
		matched++
		doc := jsonx.Decode(raw)
		cur := []any{}
		if !replace {
			cur = append(cur, jsonx.Arr(doc, "prices")...)
		}
		before := len(jsonx.Arr(doc, "prices"))
		for _, p := range list {
			done := false
			for i, x := range cur {
				if m, ok := x.(map[string]any); ok && jsonx.Str(m, "title") == p.title {
					cur[i] = map[string]any{"title": p.title, "amount": p.amount}
					done = true
					break
				}
			}
			if !done && len(cur) < 12 {
				cur = append(cur, map[string]any{"title": p.title, "amount": p.amount})
				added++
			}
		}
		todo = append(todo, upd{id, cur})
		if len(examples) < 8 {
			examples = append(examples, jsonx.M{"code": code, "title": jsonx.Str(doc, "title"), "before": before, "after": len(cur), "prices": cur})
		}
	}
	rows.Close()
	missing := []string{}
	for c := range byCode {
		if !seenCodes[c] {
			missing = append(missing, c)
		}
	}
	sort.Strings(missing)
	if len(missing) > 15 {
		missing = missing[:15]
	}
	updated := 0
	if apply {
		for _, u := range todo {
			if _, err := store.Pool.Exec(ctx, `UPDATE wh_products SET data = jsonb_set(data, '{prices}', $2::jsonb) WHERE id = $1`, u.id, jsonx.Encode(u.prices)); err == nil {
				updated++
			}
		}
	}
	httpx.JSON(w, http.StatusOK, jsonx.M{"applied": apply, "mode": map[bool]string{true: "replace", false: "add"}[replace], "divisor": divisor, "matched": matched, "updated": updated, "added": added, "notFound": len(byCode) - len(seenCodes), "notFoundCodes": missing, "examples": examples})
}

func numAny(v any) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return f
	}
	if n, ok := v.(interface{ Float64() (float64, error) }); ok {
		f, _ := n.Float64()
		return f
	}
	return 0
}

func strAny(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if v == nil {
		return ""
	}
	return strconv.FormatFloat(numAny(v), 'f', -1, 64)
}

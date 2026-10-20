package api

import (
	"context"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// In the mode «connected to Sepidar» the goods leave the warehouse with Sepidar's sales invoices. The program copies the invoices that
// carry goods («saleDocs»); here they are shown among the warehouse documents as read-only «حواله خروج (فاکتور فروش سپیدار)».
// They never change the stock (the stock itself comes from Sepidar's own inventory).

// whSaleDocs returns the invoice copies as documents that fit the filters of the document list.
func whSaleDocs(ctx context.Context, me auth.User, kind, warehouse, product, from, to string) []jsonx.M {
	if mode, _, _ := whModeInfo(ctx); mode != "sepidar" {
		return nil
	}
	if (kind != "" && kind != "issue") || warehouse != "" || product != "" || !jsonx.Contains(whAllowedKinds(me), "issue") {
		return nil
	}
	if real, _ := cacheItems(ctx, "stockDocs"); len(real) > 0 { // the real documents of Sepidar are there: the invoices would only repeat them
		return nil
	}
	items, _ := cacheItems(ctx, "saleDocs")
	if len(items) == 0 {
		return nil
	}
	// the goods of a line are matched with the warehouse's products by code, so a person limited to some groups sees only those
	type prod struct{ id, title, unit string }
	byCode := map[string]prod{}
	if rows, err := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'code', ''), COALESCE(data->>'title', ''), COALESCE(data->>'unit', '') FROM wh_products`); err == nil {
		for rows.Next() {
			var id, code, title, unit string
			if rows.Scan(&id, &code, &title, &unit) == nil && code != "" {
				byCode[code] = prod{id, title, unit}
			}
		}
		rows.Close()
	}
	out := []jsonx.M{}
	for _, it := range items {
		m := jsonx.M(it)
		date := jsonx.Str(m, "date")
		if len(date) >= 10 {
			date = date[:10]
		}
		if (from != "" && date < from) || (to != "" && date > to) {
			continue
		}
		lines := []any{}
		for _, l := range jsonx.Arr(m, "lines") {
			lm, ok := l.(map[string]any)
			if !ok {
				continue
			}
			code := strings.TrimSpace(jsonx.Str(lm, "code"))
			p := byCode[code]
			title := jsonx.Str(lm, "title")
			if title == "" {
				title = p.title
			}
			lines = append(lines, map[string]any{"productId": p.id, "code": code, "title": title, "unit": p.unit, "qty": jsonx.Num(lm["qty"])})
		}
		if len(lines) == 0 {
			continue
		}
		out = append(out, jsonx.M{
			"id": "sepinv-" + jsonx.Str(m, "id"), "kind": "issue", "number": int(jsonx.Num(m["number"])), "date": date,
			"warehouseId": "", "warehouseName": "فاکتور فروش سپیدار", "party": jsonx.Str(m, "customerName"),
			"note": "خروج کالا بر پایهٔ فاکتور فروش سپیدار (فقط نمایش؛ موجودی از خود سپیدار می‌آید)", "lines": lines,
			"createdByName": "سپیدار", "source": "sepidar", "voided": false,
		})
	}
	sort.SliceStable(out, func(i, j int) bool { return jsonx.Str(out[i], "date") > jsonx.Str(out[j], "date") })
	return whGroupDocs(ctx, me, out)
}

// ---------- the warehouse documents of Sepidar (خروج انبار / برگشت از خروج انبار), imported from the list Sepidar exports to Excel ----------
// Sepidar's web service has no address for warehouse documents, so the manager exports the list («فهرست خروج انبار») from Sepidar's own window
// and imports the file here. Only the head of each document is in that list (number, date, warehouse, receiver, description).

var whDocDay = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func whSepDocKey(typ string, m map[string]any) string {
	return strings.Join([]string{typ, jsonx.Str(m, "number"), jsonx.Str(m, "date"), jsonx.Str(m, "warehouseCode"), jsonx.Str(m, "warehouse"), jsonx.Str(m, "receiverCode"), jsonx.Str(m, "receiver")}, "|")
}

// POST /api/warehouse/sepidar-docs: {type: issue | issueReturn, rows: [...]}: adds the rows (a row already there is updated, never doubled).
func whSepDocsImport(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	typ := jsonx.Str(body, "type")
	if typ != "issue" && typ != "issueReturn" {
		httpx.Error(w, http.StatusBadRequest, "نوع سند نامعتبر است.")
		return
	}
	rows := jsonx.Arr(body, "rows")
	if len(rows) == 0 || len(rows) > 3000 {
		httpx.Error(w, http.StatusBadRequest, "تعداد ردیف‌ها نامعتبر است (۱ تا ۳۰۰۰).")
		return
	}
	ctx := r.Context()
	cur, _ := cacheItems(ctx, "stockDocs")
	idx := map[string]int{}
	for i, it := range cur {
		idx[whSepDocKey(jsonx.Str(it, "type"), it)] = i
	}
	added, updated := 0, 0
	for _, x := range rows {
		m, isMap := x.(map[string]any)
		if !isMap || !whDocDay.MatchString(jsonx.Str(m, "date")) {
			continue
		}
		d := map[string]any{"type": typ, "date": jsonx.Str(m, "date")}
		for _, k := range []string{"number", "warehouse", "warehouseCode", "receiver", "receiverCode", "issuer", "description"} {
			d[k] = whCut(strings.TrimSpace(jsonx.Str(m, k)), 300)
		}
		key := whSepDocKey(typ, d)
		if i, dup := idx[key]; dup {
			cur[i] = d
			updated++
		} else {
			if len(cur) >= 20000 {
				break
			}
			idx[key] = len(cur)
			cur = append(cur, d)
			added++
		}
	}
	if _, err := store.Pool.Exec(ctx, `INSERT INTO sepidar_cache (key, data) VALUES ('stockDocs', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb, updated_at = now()`, jsonx.Encode(cur)); err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"added": added, "updated": updated, "total": len(cur)})
}

// whStockDocs: the imported documents as read-only documents that fit the filters of the list.
func whStockDocs(ctx context.Context, me auth.User, kind, warehouse, product, from, to string) []jsonx.M {
	if (kind != "" && kind != "issue" && kind != "issueReturn") || product != "" || !jsonx.Contains(whAllowedKinds(me), "issue") {
		return nil
	}
	items, _ := cacheItems(ctx, "stockDocs")
	if len(items) == 0 {
		return nil
	}
	ids := map[string]string{} // warehouse code or title -> the warehouse's id here
	if rows, err := store.Pool.Query(ctx, `SELECT id, COALESCE(data->>'code', ''), COALESCE(data->>'title', '') FROM wh_warehouses`); err == nil {
		for rows.Next() {
			var id, code, title string
			if rows.Scan(&id, &code, &title) == nil {
				if code != "" {
					ids["c:"+code] = id
				}
				ids["t:"+title] = id
			}
		}
		rows.Close()
	}
	out := []jsonx.M{}
	for _, it := range items {
		typ := jsonx.Str(it, "type")
		if (kind == "issue" && typ != "issue") || (kind == "issueReturn" && typ != "issueReturn") {
			continue
		}
		date := jsonx.Str(it, "date")
		if (from != "" && date < from) || (to != "" && date > to) {
			continue
		}
		wid := ids["c:"+jsonx.Str(it, "warehouseCode")]
		if wid == "" {
			wid = ids["t:"+jsonx.Str(it, "warehouse")]
		}
		if warehouse != "" && wid != warehouse {
			continue
		}
		num, _ := strconv.Atoi(jsonx.Str(it, "number"))
		d := jsonx.M{
			"id": "sepdoc-" + whSepDocKey(typ, it), "kind": "issue", "subtype": typ, "number": num, "date": date,
			"warehouseId": wid, "warehouseName": jsonx.Str(it, "warehouse"), "party": jsonx.Str(it, "receiver"),
			"note": strings.TrimSpace("خروج انبار ثبت‌شده در سپیدار (فقط نمایش). " + jsonx.Str(it, "description")), "reason": jsonx.Str(it, "issuer"),
			"lines": []any{}, "createdByName": "سپیدار", "source": "sepidar", "voided": false,
		}
		out = append(out, d)
	}
	sort.SliceStable(out, func(i, j int) bool { return jsonx.Str(out[i], "date") > jsonx.Str(out[j], "date") })
	return out
}

package api

import (
	"context"
	"sort"
	"strings"

	"automation/server/internal/auth"
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

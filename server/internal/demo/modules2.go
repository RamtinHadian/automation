package demo

import (
	"context"
	"fmt"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

func queryRowsStore(ctx context.Context, sql string) ([]custRow, error) {
	rs, err := store.Pool.Query(ctx, sql)
	if err != nil {
		return nil, err
	}
	defer rs.Close()
	var out []custRow
	for rs.Next() {
		var id string
		var raw []byte
		if rs.Scan(&id, &raw) == nil {
			d := jsonx.Decode(raw)
			out = append(out, custRow{id: id, data: d})
		}
	}
	return out, rs.Err()
}

// addWarehouse: two warehouses, six products with named prices and a month of documents (the stock is the sum of their movements).
func addWarehouse(ctx context.Context, now time.Time, by map[string]account) error {
	type wh struct{ id, title, code, location string }
	whs := []wh{{"wh-main", "انبار مرکزی", "A1", "کارخانه، سالن ۲"}, {"wh-shop", "انبار فروشگاه", "B1", "خیابان اصلی، پلاک ۱۲"}}
	for _, w := range whs {
		doc := jsonx.M{"id": w.id, "title": w.title, "code": w.code, "location": w.location, "keeperId": "demo-staff", "note": "", "active": true}
		if err := exec(ctx, `INSERT INTO wh_warehouses (id, data) VALUES ($1, $2::jsonb)`, w.id, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	type prod struct {
		id, code, title, unit, group string
		min                          int
		prices                       []jsonx.M
	}
	pr := func(t string, a int) jsonx.M { return jsonx.M{"title": t, "amount": a} }
	prods := []prod{
		{"p-oil", "1001", "روغن موتور ۵ لیتری", "عدد", "روان‌کار", 10, []jsonx.M{pr("خرده‌فروشی", 1450000), pr("عمده", 1300000)}},
		{"p-filter", "1002", "فیلتر روغن پراید", "عدد", "فیلتر", 20, []jsonx.M{pr("خرده‌فروشی", 185000), pr("عمده", 160000)}},
		{"p-belt", "1003", "تسمه تایم سمند", "عدد", "تسمه", 5, []jsonx.M{pr("خرده‌فروشی", 920000), pr("نمایندگی", 780000)}},
		{"p-pad", "1004", "لنت ترمز جلو پژو ۲۰۶", "جفت", "ترمز", 8, []jsonx.M{pr("خرده‌فروشی", 1250000), pr("عمده", 1100000)}},
		{"p-plug", "1005", "شمع موتور پایه کوتاه", "ست", "برق", 12, []jsonx.M{pr("خرده‌فروشی", 560000)}},
		{"p-coolant", "1006", "ضدیخ ۴ لیتری", "گالن", "روان‌کار", 15, []jsonx.M{pr("خرده‌فروشی", 390000), pr("عمده", 340000)}},
	}
	byID := map[string]prod{}
	for _, p := range prods {
		byID[p.id] = p
		doc := jsonx.M{"id": p.id, "code": p.code, "title": p.title, "unit": p.unit, "group": p.group, "minQty": p.min, "barcode": "62" + p.code + "0001", "note": "", "active": true, "prices": p.prices, "cost": map[string]int{"p-oil": 1000000, "p-filter": 120000, "p-belt": 600000, "p-pad": 900000, "p-plug": 380000, "p-coolant": 270000}[p.id]}
		if err := exec(ctx, `INSERT INTO wh_products (id, code, data) VALUES ($1, $2, $3::jsonb)`, p.id, p.code, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	type line struct {
		pid string
		qty float64
	}
	type document struct {
		kind, wid, to, party, reason string
		ago, number                  int
		lines                        []line
	}
	docs := []document{
		{"receipt", "wh-main", "", "تأمین‌کننده: شرکت پارس‌لوب", "", 12, 1001, []line{{"p-oil", 60}, {"p-filter", 120}, {"p-belt", 30}, {"p-pad", 40}, {"p-plug", 50}, {"p-coolant", 36}}},
		{"transfer", "wh-main", "wh-shop", "", "", 9, 1001, []line{{"p-oil", 20}, {"p-filter", 40}, {"p-pad", 12}, {"p-coolant", 10}}},
		{"issue", "wh-main", "", "فروش به نمایندگی اصفهان", "", 6, 1001, []line{{"p-oil", 34}, {"p-belt", 26}, {"p-plug", 40}}},
		{"issue", "wh-shop", "", "فروش خرده", "", 3, 1002, []line{{"p-oil", 14}, {"p-filter", 31}}},
		{"adjust", "wh-main", "", "", "انبارگردانی پایان هفته", 1, 1001, []line{{"p-pad", 27}}},
	}
	titleOf := map[string]string{"wh-main": "انبار مرکزی", "wh-shop": "انبار فروشگاه"}
	bal := map[string]float64{}
	for di, d := range docs {
		at := now.Add(-time.Duration(d.ago) * 24 * time.Hour)
		id := fmt.Sprintf("demo-wd%d", di+1)
		lines := []jsonx.M{}
		type mv struct {
			pid, wid string
			qty      float64
		}
		var moves []mv
		for _, l := range d.lines {
			p := byID[l.pid]
			row := jsonx.M{"productId": l.pid, "code": p.code, "title": p.title, "unit": p.unit, "qty": l.qty}
			switch d.kind {
			case "receipt":
				moves = append(moves, mv{l.pid, d.wid, l.qty})
			case "issue":
				moves = append(moves, mv{l.pid, d.wid, -l.qty})
			case "transfer":
				moves = append(moves, mv{l.pid, d.wid, -l.qty}, mv{l.pid, d.to, l.qty})
			case "adjust":
				before := bal[l.pid+"|"+d.wid]
				row["before"], row["delta"] = before, l.qty-before
				moves = append(moves, mv{l.pid, d.wid, l.qty - before})
			}
			lines = append(lines, row)
		}
		for _, m := range moves {
			bal[m.pid+"|"+m.wid] += m.qty
		}
		doc := jsonx.M{"id": id, "kind": d.kind, "number": d.number, "date": day(at), "warehouseId": d.wid, "warehouseName": titleOf[d.wid], "party": d.party, "customerId": "", "customerName": "",
			"note": "", "reason": d.reason, "lines": lines, "createdBy": "demo-staff", "createdByName": by["demo-staff"].Name, "createdAt": iso(at)}
		if d.to != "" {
			doc["toWarehouseId"], doc["toWarehouseName"] = d.to, titleOf[d.to]
		}
		if err := exec(ctx, `INSERT INTO wh_docs (id, kind, number, data) VALUES ($1, $2, $3, $4::jsonb)`, id, d.kind, d.number, jsonx.Encode(doc)); err != nil {
			return err
		}
		for _, m := range moves {
			if err := exec(ctx, `INSERT INTO wh_moves (doc_id, product_id, warehouse_id, qty, doc_date) VALUES ($1, $2, $3, $4, $5)`, id, m.pid, m.wid, m.qty, day(at)); err != nil {
				return err
			}
		}
	}
	return nil
}

// addSepidar: the bridge is shown alive, with copies of Sepidar's data, links of three customers/proformas and a list of requests.
func addSepidar(ctx context.Context, now time.Time, by map[string]account) error {
	cache := func(k string, v any) error {
		return exec(ctx, `INSERT INTO sepidar_cache (key, data) VALUES ($1, $2::jsonb)`, k, jsonx.Encode(v))
	}
	d := func(n int) string { return iso(now.Add(-time.Duration(n) * 24 * time.Hour)) }
	if err := cache("invoices", []jsonx.M{
		{"InvoiceID": 701, "Number": 1182, "Date": d(5), "CustomerRef": 501, "NetPrice": 126000000}, {"InvoiceID": 702, "Number": 1183, "Date": d(3), "CustomerRef": 502, "NetPrice": 54000000},
		{"InvoiceID": 703, "Number": 1184, "Date": d(1), "CustomerRef": 503, "NetPrice": 18600000}, {"InvoiceID": 704, "Number": 1185, "Date": d(0), "CustomerRef": 504, "NetPrice": 38400000}}); err != nil {
		return err
	}
	if err := cache("balances", []jsonx.M{{"CustomerID": 501, "Title": "نرگس موسوی", "Remainder": 36000000}, {"CustomerID": 502, "Title": "حسین کاظمی", "Remainder": 0},
		{"CustomerID": 503, "Title": "رضا حیدری", "Remainder": 18600000}, {"CustomerID": 504, "Title": "لوازم یدکی ستاره", "Remainder": 12000000}}); err != nil {
		return err
	}
	if err := cache("bankAccounts", []jsonx.M{{"BankAccountID": 9, "DlTitle": "حساب جاری بانک ملت", "CurrencyRef": 1}, {"BankAccountID": 10, "DlTitle": "حساب جاری بانک پاسارگاد", "CurrencyRef": 1}}); err != nil {
		return err
	}
	if err := cache("priceNotes", []jsonx.M{{"saleTypeRef": 1, "itemRef": 7, "code": "1001", "title": "روغن موتور ۵ لیتری", "fee": 1450000}, {"saleTypeRef": 1, "itemRef": 8, "code": "1002", "title": "فیلتر روغن پراید", "fee": 185000},
		{"saleTypeRef": 1, "itemRef": 9, "code": "1003", "title": "تسمه تایم سمند", "fee": 920000}, {"saleTypeRef": 1, "itemRef": 10, "code": "1004", "title": "لنت ترمز جلو پژو ۲۰۶", "fee": 1250000}}); err != nil {
		return err
	}
	for _, kv := range []struct {
		k string
		v any
	}{{"saleTypes", []jsonx.M{{"SaleTypeID": 1, "Title": "فروش نقدی"}}}, {"currencies", []jsonx.M{{"CurrencyID": 1, "Title": "ریال", "IsMain": true}}}} {
		if err := cache(kv.k, kv.v); err != nil {
			return err
		}
	}
	// management's monthly targets and the sales-process rules (the team page and «امروز من» show them)
	if err := exec(ctx, `INSERT INTO settings (key, data) VALUES ('crmTargets', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, jsonx.Encode(jsonx.M{"defaultTarget": 60000000, "perUser": jsonx.M{"demo-sales": 120000000}, "probabilities": jsonx.M{}})); err != nil {
		return err
	}
	if err := exec(ctx, `INSERT INTO settings (key, data) VALUES ('crmRules', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, jsonx.Encode(jsonx.M{"proposalNeedsProforma": false, "bigDealAdminOnly": 200000000, "kindDiscount": jsonx.M{"SHOP": 5}})); err != nil {
		return err
	}
	if err := exec(ctx, `INSERT INTO settings (key, data) VALUES ('sepidarConnector', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data`, jsonx.Encode(jsonx.M{"lastSeenAt": iso(now), "name": "سپیدار"})); err != nil {
		return err
	}
	for _, l := range [][]any{{"customer", "demo-c2", 501, nil}, {"customer", "demo-c1", 502, nil}, {"quotation", "demo-d2", 901, 311}, {"invoice", "demo-d2", 701, 1182}} {
		if err := exec(ctx, `INSERT INTO sepidar_links (kind, ref, sepidar_id, number) VALUES ($1, $2, $3, $4)`, l...); err != nil {
			return err
		}
	}
	if err := exec(ctx, `INSERT INTO sepidar_links (kind, ref, sepidar_id, data) VALUES ('receipt', 'demo-d2#sj-r1', 55, $1::jsonb)`, jsonx.Encode(jsonx.M{"amount": 90000000, "date": day(now.AddDate(0, 0, -2)), "dealId": "demo-d2"})); err != nil {
		return err
	}
	jobs := []struct {
		kind    string
		data    jsonx.M
		status  string
		message string
		user    string
		mins    int
	}{
		{"quotation.send", jsonx.M{"dealId": "demo-d2", "title": "نرگس موسوی"}, "done", "پیش‌فاکتور با شمارهٔ ۳۱۱ در سپیدار ثبت شد.", "demo-sales", 6 * 60},
		{"invoice.fromProforma", jsonx.M{"dealId": "demo-d2", "title": "نرگس موسوی"}, "done", "فاکتور فروش با شمارهٔ ۱۱۸۲ صادر شد.", "demo-staff", 4 * 60},
		{"receipt.add", jsonx.M{"dealId": "demo-d2", "title": "نرگس موسوی", "amount": 90000000}, "done", "دریافتی در سپیدار ثبت شد.", "demo-staff", 3 * 60},
		{"customer.send", jsonx.M{"customerId": "demo-c1", "title": "حسین کاظمی"}, "done", "مشتری در سپیدار ثبت شد.", "demo-sales", 2 * 60},
		{"quotation.send", jsonx.M{"dealId": "demo-d3", "title": "رضا حیدری"}, "failed", "کالایی با کد «۹۰۰۱» در سپیدار پیدا نشد.", "demo-sales", 90},
		{"refresh", jsonx.M{}, "done", "اطلاعات سپیدار بروز شد.", "demo-ceo", 30},
	}
	for i, j := range jobs {
		at := now.Add(-time.Duration(j.mins) * time.Minute)
		if err := exec(ctx, `INSERT INTO sepidar_jobs (id, kind, ref, data, status, created_by, created_by_name, created_at, finished_at, result) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $8, $9::jsonb)`,
			fmt.Sprintf("demo-sj%d", i+1), j.kind, fmt.Sprintf("demo-ref%d", i+1), jsonx.Encode(j.data), j.status, j.user, by[j.user].Name, at, jsonx.Encode(jsonx.M{"message": j.message})); err != nil {
			return err
		}
	}
	return nil
}

// keepSepidarAlive makes the demo's «Sepidar program» look connected all the time (the page calls it alive for three minutes after the last call).
func keepSepidarAlive(ctx context.Context) {
	t := time.NewTicker(time.Minute)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_ = exec(ctx, `UPDATE settings SET data = jsonb_set(data, '{lastSeenAt}', to_jsonb($1::text)) WHERE key = 'sepidarConnector'`, iso(time.Now()))
		}
	}
}

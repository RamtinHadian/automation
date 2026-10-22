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
	whs := []wh{{"wh-main", "انبار مرکزی", "A1", "دفتر مرکزی، طبقهٔ همکف"}, {"wh-shop", "انبار شعبهٔ فروش", "B1", "خیابان ولیعصر، شعبهٔ فروش"}}
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
		{"p-router", "1001", "روتر وای‌فای ax1800", "عدد", "شبکه", 10, []jsonx.M{pr("خرده‌فروشی", 3450000), pr("عمده", 3100000)}},
		{"p-switch", "1002", "سوئیچ ۲۴ پورت گیگابیت", "عدد", "شبکه", 6, []jsonx.M{pr("خرده‌فروشی", 5900000), pr("عمده", 5400000)}},
		{"p-toner", "1003", "کارتریج لیزری HP 85A", "عدد", "لوازم مصرفی", 20, []jsonx.M{pr("خرده‌فروشی", 1250000), pr("عمده", 1100000)}},
		{"p-ssd", "1004", "هارد SSD اینترنال ۵۱۲ گیگ", "عدد", "ذخیره‌سازی", 15, []jsonx.M{pr("خرده‌فروشی", 2350000), pr("عمده", 2100000)}},
		{"p-ups", "1005", "یو‌پی‌اس ۱۰۰۰ ولت آنلاین", "دستگاه", "برق و پشتیبان", 6, []jsonx.M{pr("خرده‌فروشی", 9800000), pr("نمایندگی", 9200000)}},
		{"p-av", "1006", "لایسنس آنتی‌ویروس سازمانی (یک‌ساله)", "لایسنس", "نرم‌افزار", 10, []jsonx.M{pr("خرده‌فروشی", 480000), pr("عمده", 420000)}},
	}
	byID := map[string]prod{}
	for _, p := range prods {
		byID[p.id] = p
		doc := jsonx.M{"id": p.id, "code": p.code, "title": p.title, "unit": p.unit, "group": p.group, "minQty": p.min, "barcode": "62" + p.code + "0001", "note": "", "active": true, "prices": p.prices, "cost": map[string]int{"p-router": 2700000, "p-switch": 4600000, "p-toner": 850000, "p-ssd": 1750000, "p-ups": 7500000, "p-av": 300000}[p.id]}
		if err := exec(ctx, `INSERT INTO wh_products (id, code, data) VALUES ($1, $2, $3::jsonb)`, p.id, p.code, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	// services have no stock: the warehouse keeps their names and prices so a proforma can offer them (kind = service)
	for _, sv := range []struct {
		id, code, title, unit string
		price                 int
	}{
		{"p-svc-install", "2001", "خدمات نصب و راه‌اندازی شبکه", "ساعت", 1200000},
		{"p-svc-support", "2002", "پشتیبانی ماهانهٔ شبکه و سرور", "ماه", 7500000},
		{"p-svc-train", "2003", "آموزش کاربران", "جلسه", 3000000},
	} {
		doc := jsonx.M{"id": sv.id, "code": sv.code, "title": sv.title, "unit": sv.unit, "group": "خدمات", "kind": "service", "minQty": 0, "note": "", "active": true, "prices": []jsonx.M{pr("تعرفه", sv.price)}}
		if err := exec(ctx, `INSERT INTO wh_products (id, code, data) VALUES ($1, $2, $3::jsonb)`, sv.id, sv.code, jsonx.Encode(doc)); err != nil {
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
		{"receipt", "wh-main", "", "تأمین‌کننده: شرکت پخش رایان‌سازه", "", 12, 1001, []line{{"p-router", 40}, {"p-switch", 20}, {"p-toner", 80}, {"p-ssd", 50}, {"p-ups", 12}, {"p-av", 100}}},
		{"transfer", "wh-main", "wh-shop", "", "", 9, 1001, []line{{"p-router", 12}, {"p-switch", 6}, {"p-toner", 30}, {"p-ssd", 15}}},
		{"issue", "wh-main", "", "فروش به نمایندگی اصفهان", "", 6, 1001, []line{{"p-router", 20}, {"p-ssd", 30}, {"p-ups", 8}}},
		{"issue", "wh-shop", "", "فروش خرده", "", 3, 1002, []line{{"p-router", 9}, {"p-toner", 22}}},
		{"adjust", "wh-main", "", "", "انبارگردانی پایان هفته", 1, 1001, []line{{"p-ssd", 4}}},
	}
	titleOf := map[string]string{"wh-main": "انبار مرکزی", "wh-shop": "انبار شعبهٔ فروش"}
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
	// customers Sepidar already has (the customer form says «this number is already in Sepidar under this name»); the third is not tied to anybody yet
	if err := cache("sepidarCustomers", []jsonx.M{
		{"id": 501, "code": "10501", "name": "نرگس موسوی", "phones": []string{"09351112233"}, "nationalId": ""},
		{"id": 502, "code": "10502", "name": "حسین کاظمی", "phones": []string{"09121234567"}, "nationalId": ""},
		{"id": 505, "code": "10505", "name": "داروسازی سلامت (آقای حیدری)", "phones": []string{"09124445566"}, "nationalId": ""}}); err != nil {
		return err
	}
	if err := cache("balances", []jsonx.M{{"CustomerID": 501, "Title": "نرگس موسوی", "Remainder": 36000000}, {"CustomerID": 502, "Title": "حسین کاظمی", "Remainder": 0},
		{"CustomerID": 503, "Title": "رضا حیدری", "Remainder": 18600000}, {"CustomerID": 504, "Title": "کامپیوتر آوا", "Remainder": 12000000}}); err != nil {
		return err
	}
	if err := cache("bankAccounts", []jsonx.M{{"BankAccountID": 9, "DlTitle": "حساب جاری بانک ملت", "CurrencyRef": 1}, {"BankAccountID": 10, "DlTitle": "حساب جاری بانک پاسارگاد", "CurrencyRef": 1}}); err != nil {
		return err
	}
	if err := cache("priceNotes", []jsonx.M{{"saleTypeRef": 1, "itemRef": 7, "code": "1001", "title": "روتر وای‌فای ax1800", "fee": 3450000}, {"saleTypeRef": 1, "itemRef": 8, "code": "1002", "title": "سوئیچ ۲۴ پورت گیگابیت", "fee": 5900000},
		{"saleTypeRef": 1, "itemRef": 9, "code": "1003", "title": "کارتریج لیزری HP 85A", "fee": 1250000}, {"saleTypeRef": 1, "itemRef": 10, "code": "1004", "title": "هارد SSD اینترنال ۵۱۲ گیگ", "fee": 2350000}}); err != nil {
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

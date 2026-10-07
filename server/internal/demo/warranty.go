package demo

import (
	"context"
	"fmt"
	"time"

	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
)

// addWarranty puts a few sample warranties and claims in the demo so the warranty menu is not empty:
// one active with a kilometre limit, one ending soon, one that ended, one void, and claims in different steps.
func addWarranty(ctx context.Context, now time.Time, by map[string]account) error {
	jy, _, _ := jalali.FromGregorian(now.Year(), int(now.Month()), now.Day())
	owner := "demo-sales"
	type w struct {
		id, cust, custName, phone, product, code, serial, invoice string
		soldDaysAgo, months, maxKm                                int
		void                                                      bool
	}
	list := []w{
		{"demo-w1", "demo-c1", "حسین کاظمی", "09121234567", "میل لنگ سانز", "SN-4410", "SZ-2026-0001", "F-1405-3321", 60, 12, 40000, false},
		{"demo-w2", "demo-c2", "نرگس موسوی", "09351112233", "دیسک ترمز جلو", "BR-7781", "DT-7781", "F-1405-3290", 335, 12, 0, false},
		{"demo-w3", "demo-c3", "رضا حیدری", "09124445566", "پمپ روغن", "OP-1290", "OP-1290-A", "F-1404-2210", 420, 12, 0, false},
		{"demo-w4", "demo-c1", "حسین کاظمی", "09121234567", "کیت تایمینگ کامل", "TK-300", "", "F-1405-3340", 20, 24, 60000, false},
		{"demo-w5", "demo-c4", "لیلا صادقی", "09370001122", "واشر سرسیلندر", "HG-55", "HG-55-9", "F-1405-3000", 90, 6, 0, true},
	}
	numOf := map[string]string{}
	for i, x := range list {
		start := now.AddDate(0, 0, -x.soldDaysAgo)
		end := start.AddDate(0, x.months, -1)
		seq := i + 1
		status := "ACTIVE"
		doc := jsonx.M{
			"id": x.id, "warrantyNo": fmt.Sprintf("G-%d-%04d", jy, seq), "year": jy, "seq": seq,
			"customerId": x.cust, "customerName": x.custName, "customerPhone": x.phone,
			"productName": x.product, "productCode": x.code, "serial": x.serial, "invoiceNumber": x.invoice,
			"saleDate": day(start), "startDate": day(start), "endDate": day(end), "months": x.months, "maxKm": x.maxKm,
			"notes": "", "status": status, "createdAt": iso(start), "createdById": owner, "createdByName": by[owner].Name,
		}
		numOf[x.id] = jsonx.Str(doc, "warrantyNo")
		if x.void {
			status = "VOID"
			doc["status"], doc["voidReason"], doc["voidedAt"], doc["voidedByName"] = status, "اشتباه ثبت شده بود؛ فاکتور برگشت خورد.", iso(now.Add(-24*time.Hour)), by["demo-ceo"].Name
		}
		if err := exec(ctx, `INSERT INTO warranties (id, customer_id, serial, status, year, seq, created_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
			x.id, x.cust, x.serial, status, jy, seq, start, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	type c struct {
		id, wid, status, desc, coverage, handler, resolution string
		daysAgo                                              int
		km                                                   int
		steps                                                []string
	}
	claims := []c{
		{"demo-wc1", "demo-w1", "REVIEW", "صدای تق‌تق از موتور هنگام گاز دادن؛ مشتری می‌گوید از هفتهٔ پیش شروع شده است.", "IN", "demo-staff", "", 3, 8200, []string{"REVIEW"}},
		{"demo-wc2", "demo-w3", "REJECTED", "نشتی روغن از پمپ.", "EXPIRED", "demo-sales", "", 6, 61000, []string{"REVIEW", "REJECTED"}},
		{"demo-wc3", "demo-w2", "RESOLVED", "لب‌پریدگی دیسک پس از چند هفته استفاده.", "IN", "demo-staff", "REPLACE", 12, 0, []string{"REVIEW", "APPROVED", "RESOLVED"}},
		{"demo-wc4", "demo-w4", "RECEIVED", "لرزش در دور بالا.", "IN", "", "", 0, 1500, nil},
	}
	for i, x := range claims {
		wr := list[0]
		for _, y := range list {
			if y.id == x.wid {
				wr = y
			}
		}
		created := now.Add(-time.Duration(x.daysAgo) * 24 * time.Hour)
		seq := i + 1
		doc := jsonx.M{
			"id": x.id, "claimNo": fmt.Sprintf("C-%d-%04d", jy, seq), "year": jy, "seq": seq, "warrantyId": x.wid, "warrantyNo": numOf[x.wid],
			"customerId": wr.cust, "customerName": wr.custName, "customerPhone": wr.phone, "productName": wr.product, "productCode": wr.code, "serial": wr.serial,
			"description": x.desc, "reportedAt": day(created), "vehicle": jsonx.M{"model": "پژو ۴۰۵", "plate": "۱۲ ب ۳۴۵ ایران ۵۶", "km": x.km},
			"coverage": x.coverage, "status": "RECEIVED", "handlerId": x.handler, "handlerName": nameOf(by, x.handler), "photos": []string{},
			"createdAt": iso(created), "createdById": owner, "createdByName": by[owner].Name,
		}
		log := []any{jsonx.M{"at": iso(created), "kind": "create", "byId": owner, "byName": by[owner].Name, "to": "RECEIVED", "note": "درخواست ثبت شد."}}
		prev := "RECEIVED"
		for k, st := range x.steps {
			e := jsonx.M{"at": iso(created.Add(time.Duration(k+1) * 6 * time.Hour)), "kind": "status", "byId": "demo-staff", "byName": by["demo-staff"].Name, "from": prev, "to": st}
			switch st {
			case "REVIEW":
				e["note"] = "کالا برای بررسی فنی دریافت شد."
			case "APPROVED":
				e["note"] = "عیب ساخت تأیید شد."
			case "REJECTED":
				e["note"] = "مدت گارانتی پایان یافته بود."
				doc["closedAt"] = e["at"]
			case "RESOLVED":
				e["resolution"] = x.resolution
				e["note"] = "کالای نو تحویل داده شد."
				doc["resolution"], doc["replacementSerial"], doc["cost"], doc["closedAt"] = x.resolution, "DT-7781-N", 1200000, e["at"]
			}
			log = append(log, e)
			doc["status"] = st
			prev = st
		}
		doc["log"] = log
		if err := exec(ctx, `INSERT INTO warranty_claims (id, warranty_id, status, year, seq, created_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
			x.id, x.wid, jsonx.Str(doc, "status"), jy, seq, created, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	return nil
}

func nameOf(by map[string]account, id string) string {
	if a, ok := by[id]; ok {
		return a.Name
	}
	return ""
}

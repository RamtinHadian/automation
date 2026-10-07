package demo

import (
	"context"
	"fmt"
	"time"

	"automation/server/internal/jalali"
	"automation/server/internal/jsonx"
)

// addSupport puts sample support plans, subscriptions and tickets in the demo: a running one, one ending soon, one that ended,
// and tickets in different steps (one of them already late to answer).
func addSupport(ctx context.Context, now time.Time, by map[string]account) error {
	jy, _, _ := jalali.FromGregorian(now.Year(), int(now.Month()), now.Day())
	owner := "demo-sales"
	plans := []jsonx.M{
		{"id": "plan-basic", "name": "پایه", "price": 3000000, "months": 12, "responseHours": 24, "resolveHours": 120, "visits": 0, "color": "slate", "active": true, "features": "پشتیبانی تلفنی در ساعت اداری\nپاسخ‌گویی ظرف ۲۴ ساعت"},
		{"id": "plan-pro", "name": "حرفه‌ای", "price": 8000000, "months": 12, "responseHours": 8, "resolveHours": 48, "visits": 4, "color": "teal", "active": true, "features": "پشتیبانی تلفنی و آنلاین\nپاسخ‌گویی ظرف ۸ ساعت\nچهار بازدید حضوری در سال"},
		{"id": "plan-vip", "name": "ویژه", "price": 18000000, "months": 12, "responseHours": 2, "resolveHours": 24, "visits": 12, "color": "amber", "active": true, "features": "پشتیبانی اولویت‌دار هر روز هفته\nپاسخ‌گویی ظرف ۲ ساعت\nدوازده بازدید حضوری در سال"},
	}
	for i, p := range plans {
		if err := exec(ctx, `INSERT INTO support_plans (id, sort, active, data) VALUES ($1, $2, true, $3::jsonb)`, jsonx.Str(p, "id"), i, jsonx.Encode(p)); err != nil {
			return err
		}
	}
	type s struct {
		id, cust, custName, phone, plan string
		startDaysAgo, months, price     int
	}
	subs := []s{
		{"demo-s1", "demo-c1", "حسین کاظمی", "09121234567", "plan-pro", 100, 12, 8000000},
		{"demo-s2", "demo-c2", "نرگس موسوی", "09351112233", "plan-vip", 340, 12, 18000000},
		{"demo-s3", "demo-c3", "رضا حیدری", "09124445566", "plan-basic", 400, 12, 3000000},
	}
	byPlan := map[string]jsonx.M{}
	for _, p := range plans {
		byPlan[jsonx.Str(p, "id")] = p
	}
	subNo := map[string]string{}
	for i, x := range subs {
		start := now.AddDate(0, 0, -x.startDaysAgo)
		end := start.AddDate(0, x.months, -1)
		p := byPlan[x.plan]
		seq := i + 1
		no := fmt.Sprintf("S-%d-%04d", jy, seq)
		subNo[x.id] = no
		doc := jsonx.M{
			"id": x.id, "subNo": no, "year": jy, "seq": seq, "customerId": x.cust, "customerName": x.custName, "customerPhone": x.phone,
			"planId": x.plan, "planName": p["name"], "planColor": p["color"], "responseHours": p["responseHours"], "resolveHours": p["resolveHours"], "visits": p["visits"],
			"startDate": day(start), "endDate": day(end), "months": x.months, "price": x.price, "notes": "", "status": "ACTIVE",
			"createdAt": iso(start), "createdById": owner, "createdByName": by[owner].Name,
		}
		if err := exec(ctx, `INSERT INTO support_subs (id, customer_id, status, year, seq, created_at, data) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6::jsonb)`, x.id, x.cust, jy, seq, start, jsonx.Encode(doc)); err != nil {
			return err
		}
	}

	type t struct {
		id, sub, status, subject, desc, prio, channel, handler string
		hoursAgo                                               int
		answeredAfterH                                         int // hours after opening that the first answer came (0 = not yet)
		steps                                                  []string
		visit                                                  bool
	}
	tickets := []t{
		{"demo-t1", "demo-s1", "IN_PROGRESS", "کندی سیستم هنگام صدور فاکتور", "از صبح صدور فاکتور حدود یک دقیقه طول می‌کشد.", "HIGH", "PHONE", "demo-staff", 5, 1, []string{"IN_PROGRESS"}, false},
		{"demo-t2", "demo-s2", "WAITING", "تنظیم چاپگر برچسب", "چاپگر جدید نصب شد و فرمت برچسب نیاز به تنظیم دارد.", "NORMAL", "CHAT", "demo-staff", 30, 2, []string{"IN_PROGRESS", "WAITING"}, false},
		{"demo-t3", "demo-s1", "OPEN", "درخواست آموزش گزارش‌ها", "همکار تازه‌وارد نیاز به آموزش گزارش‌گیری دارد.", "LOW", "EMAIL", "", 20, 0, nil, false},
		{"demo-t4", "demo-s3", "RESOLVED", "بازیابی پروندهٔ پاک‌شده", "یک پرونده به‌اشتباه پاک شد.", "URGENT", "PHONE", "demo-sales", 70, 1, []string{"IN_PROGRESS", "RESOLVED"}, true},
	}
	for i, x := range tickets {
		sub := subs[0]
		for _, y := range subs {
			if y.id == x.sub {
				sub = y
			}
		}
		p := byPlan[sub.plan]
		factor := map[string]float64{"LOW": 2, "NORMAL": 1, "HIGH": 0.5, "URGENT": 0.25}[x.prio]
		created := now.Add(-time.Duration(x.hoursAgo) * time.Hour)
		rh, _ := p["responseHours"].(int)
		vh, _ := p["resolveHours"].(int)
		seq := i + 1
		doc := jsonx.M{
			"id": x.id, "ticketNo": fmt.Sprintf("T-%d-%04d", jy, seq), "year": jy, "seq": seq,
			"customerId": sub.cust, "customerName": sub.custName, "customerPhone": sub.phone,
			"subId": x.sub, "subNo": subNo[x.sub], "planName": p["name"], "coverage": "IN",
			"subject": x.subject, "description": x.desc, "priority": x.prio, "channel": x.channel, "status": "OPEN",
			"handlerId": x.handler, "handlerName": nameOf(by, x.handler),
			"responseDue": iso(created.Add(time.Duration(float64(rh)*factor*60) * time.Minute)),
			"resolveDue":  iso(created.Add(time.Duration(float64(vh)*factor*60) * time.Minute)),
			"createdAt":   iso(created), "createdById": owner, "createdByName": by[owner].Name,
		}
		if x.answeredAfterH > 0 {
			doc["firstResponseAt"] = iso(created.Add(time.Duration(x.answeredAfterH) * time.Hour))
		}
		log := []any{jsonx.M{"at": iso(created), "kind": "create", "byId": owner, "byName": by[owner].Name, "to": "OPEN", "note": "درخواست ثبت شد."}}
		prev := "OPEN"
		for k, st := range x.steps {
			e := jsonx.M{"at": iso(created.Add(time.Duration(k+1) * time.Hour)), "kind": "status", "byId": "demo-staff", "byName": by["demo-staff"].Name, "from": prev, "to": st}
			switch st {
			case "WAITING":
				e["note"] = "منتظر ارسال فرمت برچسب از طرف مشتری."
			case "RESOLVED":
				e["note"] = "پرونده از پشتیبان‌گیری بازیابی شد."
				doc["resolution"], doc["minutes"], doc["visit"], doc["resolvedAt"] = e["note"], 40, x.visit, e["at"]
			}
			log = append(log, e)
			doc["status"] = st
			prev = st
		}
		doc["log"] = log
		if err := exec(ctx, `INSERT INTO support_tickets (id, sub_id, status, year, seq, created_at, data) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`, x.id, x.sub, jsonx.Str(doc, "status"), jy, seq, created, jsonx.Encode(doc)); err != nil {
			return err
		}
	}
	return nil
}

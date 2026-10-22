package demo

import (
	"context"
	"time"

	"automation/server/internal/jsonx"
)

// addMinutes puts a few complete meeting minutes in the demo («صورتجلسه» in «امور اداری»), so the form and the printed sheet can be seen filled in.
func addMinutes(ctx context.Context, now time.Time, by map[string]account) error {
	at := func(d int) string { return day(now.AddDate(0, 0, d)) }
	att := func(id, status string) jsonx.M {
		a := by[id]
		return jsonx.M{"userId": id, "name": a.Name, "position": a.Title, "status": status}
	}
	docs := []jsonx.M{
		{
			"id": "demo-mn-1", "number": "ص‌ج-۱۴۰۵-۰۰۱", "title": "بررسی برنامهٔ فروش فصل و تقسیم وظایف واحدها", "kind": "جلسهٔ هماهنگی",
			"date": at(-3), "startTime": "10:00", "endTime": "11:30", "place": "اتاق جلسات، طبقهٔ دوم", "chair": by["demo-ceo"].Name, "secretary": by["demo-secretary"].Name,
			"attendees": []jsonx.M{att("demo-ceo", "PRESENT"), att("demo-secretary", "PRESENT"), att("demo-sales", "PRESENT"), att("demo-staff", "EXCUSED"),
				{"name": "آقای مهندس رضایی", "position": "مشاور فنی (مهمان)", "status": "PRESENT"}},
			"agenda": []string{"گزارش عملکرد فروش ماه گذشته", "بررسی پیشنهادهای قیمت ارسال‌شده و پیگیری مشتریان", "تقسیم وظایف و تعیین مهلت اجرا"},
			"discussion": "در ابتدا گزارش فروش ماه گذشته ارائه شد. اعضا دربارهٔ تأخیر در پاسخ به مشتریان و لزوم پیگیری منظم پیشنهادهای قیمت گفتگو کردند. توافق شد پیگیری‌ها در سامانه ثبت و هر هفته مرور شود.",
			"decisions": []jsonx.M{
				{"text": "پیشنهادهای قیمت بدون پاسخ ظرف سه روز کاری پیگیری و نتیجه در پروندهٔ مشتری ثبت شود.", "owner": by["demo-sales"].Name, "ownerUserId": "demo-sales", "due": at(3)},
				{"text": "گزارش هفتگی فروش هر یکشنبه برای مدیریت ارسال شود.", "owner": by["demo-secretary"].Name, "ownerUserId": "demo-secretary", "due": at(7)},
				{"text": "فهرست قیمت جدید تجهیزات تا پایان ماه به‌روز و به همهٔ همکاران فروش ابلاغ شود.", "owner": "واحد مالی", "due": at(14)},
			},
			"nextDate": at(7), "nextTime": "10:00", "nextPlace": "اتاق جلسات، طبقهٔ دوم", "copies": "مدیریت، واحد فروش، واحد مالی",
			"status": "FINAL", "authorId": "demo-secretary", "authorName": by["demo-secretary"].Name,
		},
		{
			"id": "demo-mn-2", "number": "ص‌ج-۱۴۰۵-۰۰۲", "title": "تمدید قرارداد پشتیبانی شبکه و سرور", "kind": "جلسه با مشتری",
			"date": at(-1), "startTime": "14:00", "endTime": "15:00", "place": "دفتر مرکزی", "chair": by["demo-ceo"].Name, "secretary": by["demo-sales"].Name,
			"attendees": []jsonx.M{att("demo-ceo", "PRESENT"), att("demo-sales", "PRESENT"), {"name": "آقای کاظمی", "position": "مدیر فناوری اطلاعات مشتری", "status": "PRESENT"}},
			"agenda": []string{"بررسی کیفیت خدمات یک سال گذشته", "شرایط و مبلغ قرارداد جدید"},
			"discussion": "مشتری از سرعت پاسخگویی رضایت داشت و خواستار افزودن پشتیبانی آخر هفته شد.",
			"decisions": []jsonx.M{
				{"text": "پیش‌فاکتور تمدید قرارداد با گزینهٔ پشتیبانی آخر هفته تا پایان هفته ارسال شود.", "owner": by["demo-sales"].Name, "ownerUserId": "demo-sales", "due": at(4)},
			},
			"copies": "واحد فروش", "status": "DRAFT", "authorId": "demo-sales", "authorName": by["demo-sales"].Name,
		},
	}
	for _, d := range docs {
		d["createdAt"], d["updatedAt"] = iso(now.Add(-48*time.Hour)), iso(now.Add(-24*time.Hour))
		ids := []string{}
		for _, a := range d["attendees"].([]jsonx.M) {
			if u, _ := a["userId"].(string); u != "" {
				ids = append(ids, u)
			}
		}
		if err := exec(ctx, `INSERT INTO minutes (id, author_id, attendee_ids, data) VALUES ($1, $2, $3, $4::jsonb)`, jsonx.Str(d, "id"), jsonx.Str(d, "authorId"), ids, jsonx.Encode(d)); err != nil {
			return err
		}
	}
	return nil
}

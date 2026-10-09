package sms

import (
	"context"
	"fmt"
	"strings"
	"time"

	"automation/server/internal/store"
)

// Automatic messages to CUSTOMERS. The admin only switches each kind on or off (and can look at its text); the wording is
// fixed here, so nobody can send a customer something the company did not intend. The footer line of the settings
// (website or company name) is added under each of them by Send, like under every other message.

// Template is one kind of automatic message.
type Template struct {
	Key   string `json:"key"`
	Title string `json:"title"` // shown in the settings
	When  string `json:"when"`  // when it is sent
	Text  string `json:"-"`     // with {name} {company} {number} {product} {end}
	// what the preview shows in place of the real values
	Sample map[string]string `json:"-"`
}

var Templates = []Template{
	{Key: "customer_new", Title: "خوش‌آمدگویی به مشتری تازه", When: "وقتی مشتری تازه‌ای با شمارهٔ موبایل در سامانه ثبت شود.",
		Text:   "{name} عزیز، به {company} خوش آمدید. از آشنایی با شما خوشحالیم.",
		Sample: map[string]string{"name": "علی رضایی", "company": "شرکت نمونه"}},
	{Key: "deal_new", Title: "ثبت درخواست (فرصت فروش تازه)", When: "وقتی برای مشتری فرصت فروش تازه‌ای ثبت شود.",
		Text:   "{name} عزیز، درخواست شما در {company} ثبت شد و کارشناس ما به‌زودی با شما تماس می‌گیرد.",
		Sample: map[string]string{"name": "علی رضایی", "company": "شرکت نمونه"}},
	{Key: "proforma_issued", Title: "صدور پیش‌فاکتور", When: "وقتی پیش‌فاکتور مشتری صادر شود (اگر تأیید مدیرعامل لازم است، بعد از تأیید).",
		Text:   "{name} عزیز، پیش‌فاکتور شما به شمارهٔ {number} صادر شد.",
		Sample: map[string]string{"name": "علی رضایی", "number": "P-1405-0007"}},
	{Key: "deal_won", Title: "سپاس از خرید", When: "وقتی فرصت فروش مشتری با موفقیت بسته شود.",
		Text:   "{name} عزیز، از اعتماد و خرید شما از {company} سپاسگزاریم.",
		Sample: map[string]string{"name": "علی رضایی", "company": "شرکت نمونه"}},
	{Key: "warranty_issued", Title: "ثبت گارانتی", When: "وقتی برای مشتری گارانتی تازه‌ای ثبت شود.",
		Text:   "{name} عزیز، گارانتی کالای «{product}» شما به شمارهٔ {number} ثبت شد و تا {end} معتبر است.",
		Sample: map[string]string{"name": "علی رضایی", "product": "میل لنگ", "number": "G-1405-0012", "end": "1406/05/16"}},
	{Key: "birthday_eve", Title: "تبریک تولد (یک روز قبل)", When: "یک روز قبل از تولد مشتری (طبق تاریخ تولد ثبت‌شده در پرونده، با تقویم شمسی)، ساعت ۹ صبح؛ هر سال یک‌بار.",
		Text:   "{name} عزیز، فردا تولد شماست؛ پیشاپیش تولدتان مبارک! از همراهی شما در {company} سپاسگزاریم.",
		Sample: map[string]string{"name": "علی رضایی", "company": "شرکت نمونه"}},
	{Key: "ticket_resolved", Title: "حل شدن درخواست پشتیبانی", When: "وقتی درخواست پشتیبانی مشتری «حل شد» شود.",
		Text:   "{name} عزیز، درخواست پشتیبانی شما ({number}) انجام شد. اگر مشکل ادامه داشت، پاسخ بدهید تا دوباره بررسی شود.",
		Sample: map[string]string{"name": "علی رضایی", "number": "T-1405-0003"}},
}

var faDigit = strings.NewReplacer("0", "۰", "1", "۱", "2", "۲", "3", "۳", "4", "۴", "5", "۵", "6", "۶", "7", "۷", "8", "۸", "9", "۹")

// ToFa writes the digits of a value in Persian.
func ToFa(s string) string { return faDigit.Replace(s) }

// Company is the official company name of the settings (used as the default footer and in the texts).
func Company(ctx context.Context) string {
	if store.Pool == nil {
		return ""
	}
	var name string
	_ = store.Pool.QueryRow(ctx, `SELECT COALESCE(NULLIF(data->>'companyName', ''), NULLIF(data->>'proformaCompanyName', ''), '') FROM settings WHERE key = 'main'`).Scan(&name)
	return strings.TrimSpace(name)
}

func find(key string) (Template, bool) {
	for _, t := range Templates {
		if t.Key == key {
			return t, true
		}
	}
	return Template{}, false
}

// Render fills a template with values (digits in Persian).
func Render(t Template, vars map[string]string) string {
	out := t.Text
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{"+k+"}", ToFa(strings.TrimSpace(v)))
	}
	return strings.TrimSpace(out)
}

// SampleText is the message as the preview shows it (without the footer).
func SampleText(t Template) string { return Render(t, t.Sample) }

// Auto sends the automatic message of one kind to the first mobile number among `phones`, when the admin switched that
// kind on. The same text goes to the same number only once in ten minutes. Meant to be called in its own goroutine.
func Auto(ctx context.Context, event string, phones []string, vars map[string]string) {
	c := Load(ctx)
	if !c.Enabled || c.APIKey == "" {
		return
	}
	on := false
	for _, k := range c.Auto {
		if k == event {
			on = true
		}
	}
	t, ok := find(event)
	if !on || !ok {
		return
	}
	mobile := ""
	for _, p := range phones {
		if m, ok := Mobile(p); ok {
			mobile = m
			break
		}
	}
	if mobile == "" {
		return
	}
	if _, has := vars["company"]; !has {
		vars["company"] = Company(ctx)
	}
	text := Render(t, vars)
	var dup int
	_ = store.Pool.QueryRow(ctx, `SELECT count(*) FROM sms_log WHERE to_num = $1 AND text = $2 AND created_at > now() - interval '10 minutes'`, mobile, text).Scan(&dup)
	if dup > 0 {
		return
	}
	if err := SendAndLog(ctx, "system", []string{mobile}, text); err != nil {
		fmt.Printf("sms auto %s: %v\n", event, err)
	}
}

// AutoBackground runs Auto in its own goroutine with its own time limit.
func AutoBackground(event string, phones []string, vars map[string]string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		Auto(ctx, event, phones, vars)
	}()
}

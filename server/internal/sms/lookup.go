package sms

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// Messages to customers are sent through Kavenegar templates (verify/lookup): the text is registered once in the panel under a name
// and only the variables travel with each message, so nobody can send a customer a text the company did not approve.
// The list of templates is generated (kvtemplates_gen.go, see tools/kavenegar/gen_templates.py).

// KVTemplate is one template: its key in the app, its name in the Kavenegar panel and its text with {variables}.
type KVTemplate struct {
	Key  string
	Name string
	Text string
	Auto bool // an automatic message of the system (the others are the ready-made texts staff can choose)
}

// DefaultLibrary are the ready-made texts that are offered while the admin has not chosen any.
var DefaultLibrary = []string{"proforma-sent", "proforma-expiring", "thanks-trust", "meeting"}

// slot is the parameter of the panel that carries each variable. Only token10 and token20 accept spaces (company names have several words).
var slot = map[string]string{"name": "token", "number": "token2", "end": "token3", "company": "token20", "product": "token10"}

// KVFind returns the template with this key.
func KVFind(key string) (KVTemplate, bool) {
	for _, t := range KVTemplates {
		if t.Key == key {
			return t, true
		}
	}
	return KVTemplate{}, false
}

// RenderKV is the text as the customer reads it (digits in Persian); it is what the logs and the customer's history show.
func RenderKV(t KVTemplate, vars map[string]string) string {
	out := t.Text
	for k := range slot {
		out = strings.ReplaceAll(out, "{"+k+"}", ToFa(strings.TrimSpace(vars[k])))
	}
	return strings.TrimSpace(out)
}

// joiners are what takes the place of a space in the three short parameters (a half-space, an underscore or nothing): the first one the
// panel accepts is used. A refused message is never sent, so trying the next one is safe.
var joiners = []string{string(rune(0x200c)), "_", ""}

// tokenValue makes a value fit its parameter: no line breaks; the three short parameters take no spaces (joiner takes their place).
func tokenValue(name, v, joiner string) string {
	v = ToFa(strings.TrimSpace(v))
	v = strings.NewReplacer("\r", " ", "\n", " ", "\t", " ").Replace(v)
	if name == "token" || name == "token2" || name == "token3" {
		v = strings.Join(strings.Fields(v), joiner)
	} else if r := []rune(v); len(r) > 100 {
		v = string(r[:100])
	}
	return v
}

// SendTemplate sends one template to one mobile number and returns the text the customer got.
func SendTemplate(ctx context.Context, c Config, mobile, key string, vars map[string]string) (string, error) {
	if c.APIKey == "" {
		return "", errors.New("پنل پیامک هنوز تنظیم نشده است.")
	}
	t, ok := KVFind(key)
	if !ok {
		return "", fmt.Errorf("قالب پیامک «%s» وجود ندارد.", key)
	}
	m, ok := Mobile(mobile)
	if !ok {
		return "", fmt.Errorf("شمارهٔ موبایل معتبر نیست: %s", mobile)
	}
	if strings.TrimSpace(vars["name"]) == "" {
		vars = copyVars(vars)
		vars["name"] = "مشتری"
	}
	var last error
	for _, joiner := range joiners {
		q := url.Values{"receptor": {m}, "template": {t.Name}}
		for k, p := range slot {
			if !strings.Contains(t.Text, "{"+k+"}") {
				continue
			}
			v := tokenValue(p, vars[k], joiner)
			if v == "" {
				return "", fmt.Errorf("مقدار «%s» برای قالب پیامک خالی است.", k)
			}
			q.Set(p, v)
		}
		b, status, err := post(ctx, kavenegarBase+"/"+url.PathEscape(c.APIKey)+"/verify/lookup.json?"+q.Encode(), nil, nil)
		if err != nil {
			return "", err
		}
		var r struct {
			Return struct {
				Status  int    `json:"status"`
				Message string `json:"message"`
			} `json:"return"`
		}
		_ = json.Unmarshal(b, &r)
		if r.Return.Status == 200 {
			return RenderKV(t, vars), nil
		}
		switch r.Return.Status {
		case 424:
			return "", fmt.Errorf("قالب «%s» در کاوه‌نگار ساخته یا تأیید نشده است.", t.Name)
		case 0:
			return "", fmt.Errorf("کاوه‌نگار: پاسخ نامعتبر (%d)", status)
		}
		// the message says what was sent (no key, no number) so that a refusal can be understood
		last = fmt.Errorf("کاوه‌نگار: %s (کد %d؛ قالب %s؛ پارامترها: %s)", r.Return.Message, r.Return.Status, t.Name, describe(q))
		if r.Return.Status != 431 { // only «structure of the code» can depend on how the spaces were written
			break
		}
	}
	return "", last
}

// describe lists the parameters of a request without the receptor.
func describe(q url.Values) string {
	var parts []string
	for _, k := range []string{"token", "token2", "token3", "token10", "token20"} {
		if v := q.Get(k); v != "" {
			parts = append(parts, k+"="+strings.ReplaceAll(v, string(rune(0x200c)), "[نیم‌فاصله]"))
		}
	}
	return strings.Join(parts, " ")
}

func copyVars(v map[string]string) map[string]string {
	out := map[string]string{}
	for k, x := range v {
		out[k] = x
	}
	return out
}

// SendTemplateAndLog is SendTemplate with the saved settings and a line in the log.
func SendTemplateAndLog(ctx context.Context, by, mobile, key string, vars map[string]string) (string, error) {
	c := Load(ctx)
	text, err := SendTemplate(ctx, c, mobile, key, vars)
	st, detail := "ok", ""
	if err != nil {
		st, detail = "failed", err.Error()
		if t, ok := KVFind(key); ok {
			text = RenderKV(t, vars)
		}
	}
	Log(ctx, by, mobile, text, st, detail)
	return text, err
}

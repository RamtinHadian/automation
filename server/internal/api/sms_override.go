package api

import (
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/sms"
)

// The texts of the ready-made and automatic messages can be edited in the console. An edited text is sent as a free text (no template has to be
// registered in the SMS panel); «برگشت به متن اصلی» removes the edit and the message goes through the registered template again.

var placeholderRe = regexp.MustCompile(`\{([A-Za-z]+)\}`)

var allowedPlaceholders = map[string]bool{"name": true, "company": true, "number": true, "end": true, "product": true, "subject": true}

// GET /api/sms/kv (administrators): every ready-made text with the edit that replaces it, if any
func smsKV(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	over := sms.Load(r.Context()).Overrides
	out := []map[string]any{}
	for _, t := range sms.KVTemplates {
		out = append(out, map[string]any{"key": t.Key, "name": t.Name, "text": t.Text, "override": over[t.Key], "viaTemplate": sms.Load(r.Context()).ViaTemplate[t.Key], "auto": t.Auto, "staff": t.Staff})
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"templates": out})
}

// PUT /api/sms/override {key, text}: an empty text goes back to the original
func smsPutOverride(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	key := jsonx.Str(body, "key")
	if _, found := sms.KVFind(key); !found {
		httpx.Error(w, http.StatusBadRequest, "این قالب پیامک وجود ندارد.")
		return
	}
	text := strings.TrimSpace(jsonx.Str(body, "text"))
	if utf8.RuneCountInString(text) > 600 {
		httpx.Error(w, http.StatusBadRequest, "متن پیامک خیلی بلند است (حداکثر ۶۰۰ نویسه).")
		return
	}
	for _, m := range placeholderRe.FindAllStringSubmatch(text, -1) {
		if !allowedPlaceholders[m[1]] {
			httpx.Error(w, http.StatusBadRequest, "«{"+m[1]+"}» جایگزین شناخته‌شده نیست. فقط {name} {company} {number} {end} {product} {subject} را می‌توانید بنویسید.")
			return
		}
	}
	c := sms.Load(r.Context())
	over := map[string]string{}
	for k, v := range c.Overrides {
		over[k] = v
	}
	if text == "" {
		delete(over, key)
	} else {
		over[key] = text
	}
	c.Overrides = over
	via := map[string]bool{}
	for k, v := range c.ViaTemplate {
		via[k] = v
	}
	if v, ok := body["viaTemplate"].(bool); ok && text != "" {
		via[key] = v
	}
	if text == "" {
		delete(via, key)
	}
	c.ViaTemplate = via
	if err := sms.Save(r.Context(), c); err != nil {
		internalError(w)
		return
	}
	smsKV(w, r)
}

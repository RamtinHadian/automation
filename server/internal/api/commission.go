package api

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Commission («پورسانت و کمیسیون»): the rules say how much of what a salesperson sold (opportunities that reached «فروش موفق» in a Persian month) is his
// commission; the payments record what was really paid to him for a month. The calculation itself is done on the page from the opportunities the person
// may see, so everyone sees only what the CRM already shows him. What is protected here: the rules of other people and every payment are visible only to
// the managers (the administrator and those who may sign official letters, i.e. the CEO); a salesperson gets the default rule, his own rule and his own payments.
//
//	rules:    {defaultRule: {percent, tiers: [{from, percent}]}, perUser: {userId: {percent, tiers}}}
//	payments: {items: [{id, userId, userName, period: "1405-8", amount, note, at, byName}]}

func commissionManager(me auth.User) bool {
	return me.IsAdmin() || jsonx.Bool(me.M, "canSignOfficialLetters")
}

// one rule: a base percent and optional steps (when the month's sales reach «from», the whole month is paid with that step's percent)
func cleanRule(v any) jsonx.M {
	m, _ := v.(map[string]any)
	if m == nil {
		return jsonx.M{"percent": 0.0, "tiers": []any{}}
	}
	type tier struct{ from, percent float64 }
	var ts []tier
	if arr, ok := m["tiers"].([]any); ok {
		for _, x := range arr {
			t, ok := x.(map[string]any)
			if !ok {
				continue
			}
			from, pct := clubNum(t["from"], 0, 1e15), clubNum(t["percent"], 0, 100)
			if from > 0 {
				ts = append(ts, tier{from, pct})
			}
		}
	}
	sort.Slice(ts, func(i, j int) bool { return ts[i].from < ts[j].from })
	if len(ts) > 12 {
		ts = ts[:12]
	}
	out := make([]any, 0, len(ts))
	for _, t := range ts {
		out = append(out, jsonx.M{"from": t.from, "percent": t.percent})
	}
	return jsonx.M{"percent": clubNum(m["percent"], 0, 100), "tiers": out}
}

func commissionRules(r *http.Request) jsonx.M {
	d := settingDoc(r.Context(), "commissionRules")
	if d == nil {
		d = jsonx.M{}
	}
	if _, ok := d["defaultRule"]; !ok {
		d["defaultRule"] = cleanRule(nil)
	}
	if _, ok := d["perUser"].(map[string]any); !ok {
		d["perUser"] = map[string]any{}
	}
	return d
}

func commissionItems(r *http.Request) []any {
	d := settingDoc(r.Context(), "commissionPaid")
	if arr, ok := d["items"].([]any); ok {
		return arr
	}
	return []any{}
}

// GET /api/crm/commission
func commissionGet(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if crmDenied(w, me) {
		return
	}
	rules := commissionRules(r)
	items := commissionItems(r)
	manager := commissionManager(me)
	if !manager {
		own := map[string]any{}
		if per, ok := rules["perUser"].(map[string]any); ok {
			if v, has := per[me.ID()]; has {
				own[me.ID()] = v
			}
		}
		rules = jsonx.M{"defaultRule": rules["defaultRule"], "perUser": own}
		mine := []any{}
		for _, x := range items {
			if m, ok := x.(map[string]any); ok && jsonx.Str(m, "userId") == me.ID() {
				mine = append(mine, m)
			}
		}
		items = mine
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rules": rules, "payments": items, "manager": manager})
}

// PUT /api/crm/commission/rules {defaultRule, perUser}
func commissionRulesPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !commissionManager(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	per := map[string]any{}
	if m, ok := body["perUser"].(map[string]any); ok {
		for id, v := range m {
			if len(id) > 0 && len(id) < 80 {
				per[id] = cleanRule(v)
			}
		}
	}
	d := jsonx.M{"defaultRule": cleanRule(body["defaultRule"]), "perUser": per}
	if err := saveSettingDoc(r.Context(), "commissionRules", d); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "قانون پورسانت و کمیسیون تغییر کرد.")
	httpx.OK(w)
}

// POST /api/crm/commission/payments {userId, period, amount, note}
func commissionPay(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !commissionManager(me) {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	userID, period := strings.TrimSpace(jsonx.Str(body, "userId")), strings.TrimSpace(jsonx.Str(body, "period"))
	amount := clubNum(body["amount"], 0, 1e15)
	parts := strings.Split(period, "-")
	if userID == "" || amount <= 0 || len(parts) != 2 {
		httpx.Error(w, http.StatusBadRequest, "نفر، ماه و مبلغ پرداخت را بنویسید.")
		return
	}
	if y, e1 := strconv.Atoi(parts[0]); e1 != nil || y < 1300 || y > 1600 {
		httpx.Error(w, http.StatusBadRequest, "ماه درست نیست.")
		return
	}
	if m, e2 := strconv.Atoi(parts[1]); e2 != nil || m < 1 || m > 12 {
		httpx.Error(w, http.StatusBadRequest, "ماه درست نیست.")
		return
	}
	name := ""
	if raws, err := store.RawList(r.Context(), `SELECT data FROM users WHERE id = $1`, userID); err == nil && len(raws) > 0 {
		name = jsonx.Str(jsonx.Decode(raws[0]), "fullName")
	}
	if name == "" {
		httpx.Error(w, http.StatusBadRequest, "این نفر پیدا نشد.")
		return
	}
	item := jsonx.M{"id": "cp-" + strconv.FormatInt(time.Now().UnixNano(), 36), "userId": userID, "userName": name, "period": period, "amount": amount,
		"note": clip(jsonx.Str(body, "note"), 200), "at": time.Now().UTC().Format("2006-01-02T15:04:05.000Z"), "byName": me.Name()}
	items := append(commissionItems(r), item)
	if err := saveSettingDoc(r.Context(), "commissionPaid", jsonx.M{"items": items}); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "پرداخت پورسانت برای «"+name+"» ماه "+period+" ثبت شد.")
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true, "item": item})
}

// DELETE /api/crm/commission/payments/{id}
func commissionPayDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !commissionManager(me) {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	kept := []any{}
	for _, x := range commissionItems(r) {
		if m, ok := x.(map[string]any); ok && jsonx.Str(m, "id") == id {
			continue
		}
		kept = append(kept, x)
	}
	if err := saveSettingDoc(r.Context(), "commissionPaid", jsonx.M{"items": kept}); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "WARNING", "یک پرداخت پورسانت حذف شد.")
	httpx.OK(w)
}

func registerCommission(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/crm/commission", auth.Require(commissionGet))
	mux.HandleFunc("PUT /api/crm/commission/rules", auth.Require(commissionRulesPut))
	mux.HandleFunc("POST /api/crm/commission/payments", auth.Require(commissionPay))
	mux.HandleFunc("DELETE /api/crm/commission/payments/{id}", auth.Require(commissionPayDelete))
}

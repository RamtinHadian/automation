package api

import (
	"context"
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// What the management of the sales team decides: the monthly sales target of each person, how likely each stage is to end in a sale (for the
// forecast) and a few rules of the sales process. Everybody with the customer menu can read them (people see their own target); only
// administrators change them.

func registerCrmManage(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/crm/targets", auth.Require(crmTargetsGet))
	mux.HandleFunc("PUT /api/crm/targets", auth.Require(crmTargetsPut))
	mux.HandleFunc("GET /api/crm/rules", auth.Require(crmRulesGet))
	mux.HandleFunc("PUT /api/crm/rules", auth.Require(crmRulesPut))
}

func settingDoc(ctx context.Context, key string) jsonx.M {
	var raw []byte
	_ = store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = $1`, key).Scan(&raw)
	return jsonx.Decode(raw)
}

func saveSettingDoc(ctx context.Context, key string, d jsonx.M) error {
	_, err := store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET data = $2::jsonb`, key, jsonx.Encode(d))
	return err
}

func crmTargetsGet(w http.ResponseWriter, r *http.Request) {
	if crmDenied(w, auth.Current(r)) {
		return
	}
	httpx.JSON(w, http.StatusOK, settingDoc(r.Context(), "crmTargets"))
}

// PUT /api/crm/targets {defaultTarget, perUser:{id:toman}, probabilities:{STAGE:percent}}
func crmTargetsPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	per := jsonx.M{}
	if m, ok := body["perUser"].(map[string]any); ok {
		for id, v := range m {
			if n := clubNum(v, 0, 1e13); n > 0 {
				per[id] = n
			}
		}
	}
	prob := jsonx.M{}
	if m, ok := body["probabilities"].(map[string]any); ok {
		for _, st := range []string{"NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION"} {
			if v, has := m[st]; has {
				prob[st] = clubNum(v, 0, 100)
			}
		}
	}
	d := jsonx.M{"defaultTarget": clubNum(body["defaultTarget"], 0, 1e13), "perUser": per, "probabilities": prob}
	if err := saveSettingDoc(r.Context(), "crmTargets", d); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "هدف فروش یا احتمال مرحله‌های فروش تغییر کرد.")
	httpx.OK(w)
}

func crmRulesGet(w http.ResponseWriter, r *http.Request) {
	if crmDenied(w, auth.Current(r)) {
		return
	}
	httpx.JSON(w, http.StatusOK, settingDoc(r.Context(), "crmRules"))
}

// PUT /api/crm/rules {proposalNeedsProforma, bigDealAdminOnly, kindDiscount:{PERSON,COMPANY,SHOP}}
func crmRulesPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	disc := jsonx.M{}
	if m, ok := body["kindDiscount"].(map[string]any); ok {
		for _, k := range []string{"PERSON", "COMPANY", "SHOP"} {
			if v, has := m[k]; has {
				disc[k] = clubNum(v, 0, 100)
			}
		}
	}
	d := jsonx.M{"proposalNeedsProforma": jsonx.Bool(body, "proposalNeedsProforma"), "bigDealAdminOnly": clubNum(body["bigDealAdminOnly"], 0, 1e13), "kindDiscount": disc}
	if err := saveSettingDoc(r.Context(), "crmRules", d); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "قوانین فرایند فروش تغییر کرد.")
	httpx.OK(w)
}

// dealRuleViolation: the sales-process rules a stage change may break (empty when it is allowed). Programs coming in with an API key are not stopped.
func dealRuleViolation(r *http.Request, me auth.User, fromStage, toStage string, amount float64, proformaNumber string) string {
	if toStage == fromStage || (toStage != "NEGOTIATION" && toStage != "WON") || me.IsAdmin() || strings.HasPrefix(r.URL.Path, "/api/ext/") {
		return ""
	}
	rules := settingDoc(r.Context(), "crmRules")
	if jsonx.Bool(rules, "proposalNeedsProforma") && proformaNumber == "" {
		return "طبق قوانین فرایند فروش، این فرصت باید اول پیش‌فاکتور داشته باشد."
	}
	if limit, _ := rules["bigDealAdminOnly"].(float64); toStage == "WON" && limit > 0 && amount >= limit && !me.IsAdmin() {
		return "بستن فروش‌های بالای سقف تعیین‌شده را مدیر انجام می‌دهد."
	}
	return ""
}

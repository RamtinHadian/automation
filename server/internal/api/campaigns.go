package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Marketing campaigns («کمپین‌ها», in «مشتریان ← بازاریابی»): the same fields the well-known CRMs keep for a campaign — name, type, status,
// owner, start and end day, budget, expected and real revenue, expected and real cost, the audience (customers) and the goal. Anyone who
// may use the CRM sees the campaigns; only the person who made a campaign and the administrators can change or delete it.

const campaignNote = "کمپین‌ها فقط برای کاربران بازاریابی و مدیران قابل ویرایش است."

// GET /api/campaigns
func campaignList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	list, err := store.RawList(r.Context(), `SELECT data FROM campaigns ORDER BY COALESCE(data->>'startDate', '') DESC, created_at DESC LIMIT 1000`)
	if err != nil {
		internalError(w)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"campaigns": list})
}

// PUT /api/campaigns/{id}: create or change
func campaignPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	if id == "" || len(id) > 64 {
		httpx.Error(w, http.StatusBadRequest, "شناسه نادرست است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	data := jsonx.Copy(body)
	if strings.TrimSpace(jsonx.Str(data, "name")) == "" {
		httpx.Error(w, http.StatusBadRequest, "نام کمپین را بنویسید.")
		return
	}
	var creator string
	existed := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'createdById', '') FROM campaigns WHERE id = $1`, id).Scan(&creator) == nil
	if existed && creator != me.ID() && !me.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, campaignNote)
		return
	}
	data["id"] = id
	if !existed {
		data["createdById"], data["createdByName"], data["createdAt"] = me.ID(), me.Name(), now()
	} else {
		var raw []byte
		if store.Pool.QueryRow(r.Context(), `SELECT data FROM campaigns WHERE id = $1`, id).Scan(&raw) == nil {
			b := jsonx.Decode(raw)
			data["createdById"], data["createdByName"], data["createdAt"] = b["createdById"], b["createdByName"], b["createdAt"]
		}
	}
	data["updatedAt"] = now()
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO campaigns (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, updated_at = now()`,
		id, jsonx.Encode(data)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// DELETE /api/campaigns/{id}
func campaignDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	id := r.PathValue("id")
	var creator string
	if store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'createdById', '') FROM campaigns WHERE id = $1`, id).Scan(&creator) != nil {
		httpx.OK(w)
		return
	}
	if creator != me.ID() && !me.IsAdmin() {
		httpx.Error(w, http.StatusForbidden, campaignNote)
		return
	}
	if _, err := store.Pool.Exec(r.Context(), `DELETE FROM campaigns WHERE id = $1`, id); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

func registerCampaigns(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/campaigns", auth.Require(campaignList))
	mux.HandleFunc("PUT /api/campaigns/{id}", auth.Require(campaignPut))
	mux.HandleFunc("DELETE /api/campaigns/{id}", auth.Require(campaignDelete))
	mux.HandleFunc("POST /api/social-log", auth.Require(socialLogAdd))
	mux.HandleFunc("GET /api/social-log", auth.Require(socialLogList))
}

// ---- the log of messages sent through the messengers (Bale, Eitaa, WhatsApp…): who, when, to whom, on which platform ----

// POST /api/social-log {platform, platformName, account, text, customerId, customerName}
func socialLogAdd(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	cut := func(s string, n int) string {
		if len([]rune(s)) > n {
			return string([]rune(s)[:n])
		}
		return s
	}
	id := "sl_" + strconv.FormatInt(time.Now().UnixNano(), 36)
	if _, err := store.Pool.Exec(r.Context(),
		`INSERT INTO social_log (id, sent_by, platform, platform_name, account, text, customer_id, customer_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		id, me.ID(), cut(jsonx.Str(body, "platform"), 40), cut(jsonx.Str(body, "platformName"), 60), cut(jsonx.Str(body, "account"), 200), cut(jsonx.Str(body, "text"), 4000),
		cut(jsonx.Str(body, "customerId"), 80), cut(jsonx.Str(body, "customerName"), 200)); err != nil {
		internalError(w)
		return
	}
	httpx.OK(w)
}

// GET /api/social-log: administrators see everything, everybody else only what they sent themselves
func socialLogList(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() {
		httpx.Forbidden(w)
		return
	}
	q := `SELECT created_at, COALESCE((SELECT data->>'fullName' FROM users WHERE id = social_log.sent_by), sent_by), platform, platform_name, account, text, customer_id, customer_name
	      FROM social_log %s ORDER BY created_at DESC LIMIT 2000`
	args := []any{}
	if me.IsAdmin() {
		q = strings.Replace(q, "%s", "", 1)
	} else {
		q = strings.Replace(q, "%s", "WHERE sent_by = $1", 1)
		args = append(args, me.ID())
	}
	rows, err := store.Pool.Query(r.Context(), q, args...)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := []jsonx.M{}
	for rows.Next() {
		var at time.Time
		var by, pf, pn, acc, text, cid, cn string
		if rows.Scan(&at, &by, &pf, &pn, &acc, &text, &cid, &cn) == nil {
			out = append(out, jsonx.M{"at": at.UTC().Format("2006-01-02T15:04:05.000Z"), "by": by, "platform": pf, "platformName": pn, "account": acc, "text": text, "customerId": cid, "customerName": cn})
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"log": out, "all": me.IsAdmin()})
}

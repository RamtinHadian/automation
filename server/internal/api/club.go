package api

import (
	"net/http"
	"strings"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Customer club («باشگاه مشتریان»): the rules only (how many toman make one point, and the tiers). The points themselves are worked out on the
// page from each customer's won sales, so nothing about a customer is stored here.

func registerClub(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/crm/club", auth.Require(clubGet))
	mux.HandleFunc("PUT /api/crm/club", auth.Require(clubPut))
}

func clubGet(w http.ResponseWriter, r *http.Request) {
	var raw []byte
	_ = store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'crmClub'`).Scan(&raw)
	httpx.JSON(w, http.StatusOK, jsonx.Decode(raw))
}

// PUT /api/crm/club {enabled, tomanPerPoint, dormantDays, tiers:[{id,name,minPoints,discountPercent}]} (admins)
func clubPut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	tiers := []any{}
	if list, _ := body["tiers"].([]any); list != nil {
		for i, t := range list {
			m, _ := t.(jsonx.M)
			if m == nil {
				continue
			}
			name := strings.TrimSpace(jsonx.Str(m, "name"))
			if name == "" || len(tiers) >= 8 {
				continue
			}
			tiers = append(tiers, jsonx.M{"id": "t" + string(rune('a'+i)), "name": name, "minPoints": clubNum(m["minPoints"], 0, 1e9), "discountPercent": clubNum(m["discountPercent"], 0, 100)})
		}
	}
	d := jsonx.M{"enabled": body["enabled"] != false, "tomanPerPoint": clubNum(body["tomanPerPoint"], 1000, 1e10), "dormantDays": clubNum(body["dormantDays"], 7, 3650), "tiers": tiers}
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO settings (key, data) VALUES ('crmClub', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data = $1::jsonb`, jsonx.Encode(d)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "ذخیره نشد.")
		return
	}
	auditLine(r, me, "INFO", "قوانین باشگاه مشتریان تغییر کرد.")
	httpx.OK(w)
}

func clubNum(v any, lo, hi float64) float64 {
	f := jsonx.Num(v)
	if f < lo {
		return lo
	}
	if f > hi {
		return hi
	}
	return float64(int64(f))
}

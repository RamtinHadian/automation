package api

import (
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
	"automation/server/internal/voip"
)

var phone *voip.Client

// SetPhone gives the API the connection to the phone system.
func SetPhone(c *voip.Client) { phone = c }

var onlyDigits = regexp.MustCompile(`^[0-9*#+]{1,20}$`)

// voipStatus tells the page whether the phone integration is on and which extension the user has.
func voipStatus(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"enabled":   phone != nil && phone.Enabled(),
		"connected": phone != nil && phone.Connected(),
		"extension": jsonx.Str(me.M, "extension"),
	})
}

// voipCall rings the user's own extension and then dials the target (a number or a colleague's user id).
func voipCall(w http.ResponseWriter, r *http.Request) {
	if phone == nil || !phone.Enabled() {
		httpx.Error(w, http.StatusServiceUnavailable, "اتصال به تلفن سازمان تنظیم نشده است.")
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	me := auth.Current(r)
	from := jsonx.Str(me.M, "extension")
	if from == "" {
		httpx.Error(w, http.StatusBadRequest, "شمارهٔ داخلی شما در پنل مدیریت تعریف نشده است.")
		return
	}
	target := jsonx.Str(body, "to")
	if !onlyDigits.MatchString(target) { // not a number: treat it as a colleague's user id
		var ext string
		err := store.Pool.QueryRow(r.Context(), `SELECT COALESCE(data->>'extension', '') FROM users WHERE id = $1`, target).Scan(&ext)
		if err == pgx.ErrNoRows || ext == "" {
			httpx.Error(w, http.StatusBadRequest, "این همکار شمارهٔ داخلی ندارد.")
			return
		}
		if err != nil {
			internalError(w)
			return
		}
		target = ext
	}
	if err := phone.Call(from, target); err != nil {
		httpx.Error(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.OK(w)
}

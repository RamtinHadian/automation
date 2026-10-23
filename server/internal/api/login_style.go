package api

import (
	"net/http"

	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// GET /api/login/style (public): the pictures and the design (glass / simple / elegant / dark) the admin chose for the sign-in pages (no pictures = the built-in ones).
func loginStyle(w http.ResponseWriter, r *http.Request) {
	var raw []byte
	_ = store.Pool.QueryRow(r.Context(), `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw)
	imgs := []string{}
	for _, s := range jsonx.Strings(jsonx.Decode(raw), "loginImages") {
		if len(s) > 0 && len(s) < 2_500_000 && len(imgs) < 12 {
			imgs = append(imgs, s)
		}
	}
	design := jsonx.Str(jsonx.Decode(raw), "loginDesign")
	if design != "simple" && design != "dark" && design != "elegant" {
		design = "glass"
	}
	w.Header().Set("Cache-Control", "no-cache")
	httpx.JSON(w, http.StatusOK, map[string]any{"images": imgs, "design": design})
}

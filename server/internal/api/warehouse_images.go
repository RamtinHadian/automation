package api

import (
	"context"
	"io"
	"net/http"
	"strconv"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The photo of a product (one per product, kept in Hoormand whichever way the stock is kept; Sepidar has none). The browser shrinks it before sending, so it is small;
// it lives in a table of its own so the product lists stay light, and the lists only carry «imageAt» (when the photo was last changed) for the page to know it exists.

const whImageMax = 700 * 1024

func whEnsureImageTable(ctx context.Context) {
	_, _ = store.Pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS wh_product_images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
}

// whImageStamps: product id → the moment (unix seconds) its photo was last changed.
func whImageStamps(ctx context.Context) map[string]int64 {
	out := map[string]int64{}
	rows, err := store.Pool.Query(ctx, `SELECT id, extract(epoch from updated_at)::bigint FROM wh_product_images`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var at int64
		if rows.Scan(&id, &at) == nil {
			out[id] = at
		}
	}
	return out
}

// the product must exist and be one this person may work with
func whImageProduct(w http.ResponseWriter, r *http.Request, me auth.User) (string, bool) {
	id := r.PathValue("id")
	if !whID.MatchString(id) {
		httpx.Error(w, http.StatusBadRequest, "شناسه نامعتبر است.")
		return "", false
	}
	var raw []byte
	if store.Pool.QueryRow(r.Context(), `SELECT data FROM wh_products WHERE id = $1`, id).Scan(&raw) != nil {
		httpx.Error(w, http.StatusNotFound, "کالا پیدا نشد.")
		return "", false
	}
	if !whProductOK(me, id, jsonx.Str(jsonx.Decode(raw), "group")) {
		httpx.Forbidden(w)
		return "", false
	}
	return id, true
}

// GET /api/warehouse/products/{id}/image
func whImageGet(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.CanUseCrm() && !canUseWarehouse(me) {
		httpx.Forbidden(w)
		return
	}
	id, ok := whImageProduct(w, r, me)
	if !ok {
		return
	}
	var mime string
	var data []byte
	var at time.Time
	if store.Pool.QueryRow(r.Context(), `SELECT mime, data, updated_at FROM wh_product_images WHERE id = $1`, id).Scan(&mime, &data, &at) != nil {
		httpx.Error(w, http.StatusNotFound, "این کالا عکس ندارد.")
		return
	}
	etag := `"` + strconv.FormatInt(at.Unix(), 10) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("Content-Type", mime)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(data)
}

// PUT /api/warehouse/products/{id}/image   (the bytes of a JPEG, PNG or WebP picture)
func whImagePut(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	id, ok := whImageProduct(w, r, me)
	if !ok {
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, whImageMax+1))
	if err != nil || len(data) == 0 || len(data) > whImageMax {
		httpx.Error(w, http.StatusRequestEntityTooLarge, "عکس خیلی بزرگ است؛ حداکثر ۷۰۰ کیلوبایت (برنامه خودش کوچکش می‌کند).")
		return
	}
	mime := http.DetectContentType(data)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		httpx.Error(w, http.StatusBadRequest, "فقط عکس JPG، PNG یا WebP پذیرفته می‌شود.")
		return
	}
	whEnsureImageTable(r.Context())
	if _, err := store.Pool.Exec(r.Context(), `INSERT INTO wh_product_images (id, mime, data, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (id) DO UPDATE SET mime = $2, data = $3, updated_at = now()`, id, mime, data); err != nil {
		internalError(w)
		return
	}
	auditLine(r, me, "INFO", "عکس کالا گذاشته شد: "+id)
	httpx.OK(w)
}

// DELETE /api/warehouse/products/{id}/image
func whImageDelete(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if whDenied(w, me) {
		return
	}
	id, ok := whImageProduct(w, r, me)
	if !ok {
		return
	}
	_, _ = store.Pool.Exec(r.Context(), `DELETE FROM wh_product_images WHERE id = $1`, id)
	httpx.OK(w)
}

package api

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// File management for the system administrator. Files that were sent live on the server (see files.go). The admin can
// remove the file itself (the bytes) while the history stays: who sent it, when, to whom, whether and how often it was
// downloaded, plus the note that the file was deleted by the system administrator. A file can also be marked «keep
// forever», and a retention period (settings: fileRetentionDays) removes older files by itself.

// markers the clients must not be able to change or lose through an ordinary save of the transfer
var fileMarkers = []string{"fileDeletedAt", "fileDeletedBy", "fileDeletedByName", "fileDeletedReason", "keepForever"}

func keepMarkers(before, doc jsonx.M) {
	for _, k := range fileMarkers {
		if v, ok := before[k]; ok {
			doc[k] = v
		} else {
			delete(doc, k)
		}
	}
}

// purgeTransferFile removes the stored bytes of a transfer and records who did it and why. Letters are never purged.
func purgeTransferFile(ctx context.Context, id, byID, byName, reason string) bool {
	var raw []byte
	if err := store.Pool.QueryRow(ctx, `SELECT data FROM transfers WHERE id = $1`, id).Scan(&raw); err != nil {
		return false
	}
	doc := jsonx.Decode(raw)
	if jsonx.Bool(doc, "isOfficialLetter") || jsonx.Str(doc, "fileDeletedAt") != "" {
		return false
	}
	deleteStoredFiles(id)
	doc["fileDeletedAt"] = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	doc["fileDeletedBy"], doc["fileDeletedByName"], doc["fileDeletedReason"] = byID, byName, reason
	_, err := store.Pool.Exec(ctx, `UPDATE transfers SET data = $2::jsonb, updated_at = now() WHERE id = $1`, id, jsonx.Encode(doc))
	return err == nil
}

// POST /api/admin/files/{id}/purge
func adminFilePurge(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	if !purgeTransferFile(r.Context(), r.PathValue("id"), me.ID(), me.Name(), "manual") {
		httpx.Error(w, http.StatusBadRequest, "این فایل قابل حذف نیست (نامه است یا قبلاً حذف شده).")
		return
	}
	httpx.OK(w)
}

// POST /api/admin/files/{id}/keep  {keep: bool}
func adminFileKeep(w http.ResponseWriter, r *http.Request) {
	me := auth.Current(r)
	if !me.IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	body, ok := httpx.ReadBody(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	var raw []byte
	if err := store.Pool.QueryRow(r.Context(), `SELECT data FROM transfers WHERE id = $1`, id).Scan(&raw); err != nil {
		httpx.Error(w, http.StatusNotFound, "فایل پیدا نشد.")
		return
	}
	doc := jsonx.Decode(raw)
	if jsonx.Bool(body, "keep") {
		doc["keepForever"] = true
	} else {
		delete(doc, "keepForever")
	}
	_, _ = store.Pool.Exec(r.Context(), `UPDATE transfers SET data = $2::jsonb, updated_at = now() WHERE id = $1`, id, jsonx.Encode(doc))
	httpx.OK(w)
}

// GET /api/admin/files/info: which transfers still have their file on the server, and how big it is
func adminFileInfo(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT id FROM transfers WHERE COALESCE(data->>'isOfficialLetter', 'false') <> 'true'`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	out := map[string]int64{}
	var total int64
	for rows.Next() {
		var id string
		if rows.Scan(&id) != nil {
			continue
		}
		if p, _, ok := filePaths(id, "main"); ok {
			if st, err := os.Stat(p); err == nil {
				out[id] = st.Size()
				total += st.Size()
			}
		}
	}
	retention := 0
	_ = store.Pool.QueryRow(r.Context(), `SELECT COALESCE((data->>'fileRetentionDays')::int, 0) FROM settings WHERE key = 'main'`).Scan(&retention)
	httpx.JSON(w, http.StatusOK, map[string]any{"sizes": out, "totalBytes": total, "retentionDays": retention})
}

// RunFileRetention removes the files older than the retention period (once an hour). 0 days means «never».
func RunFileRetention(ctx context.Context) {
	tick := time.NewTicker(time.Hour)
	defer tick.Stop()
	for {
		sweepOldFiles(ctx)
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
		}
	}
}

func sweepOldFiles(ctx context.Context) {
	var days int
	if err := store.Pool.QueryRow(ctx, `SELECT COALESCE((data->>'fileRetentionDays')::int, 0) FROM settings WHERE key = 'main'`).Scan(&days); err != nil || days <= 0 {
		return
	}
	rows, err := store.Pool.Query(ctx,
		`SELECT id FROM transfers
		  WHERE created_at < now() - ($1 || ' days')::interval
		    AND COALESCE(data->>'isOfficialLetter', 'false') <> 'true'
		    AND COALESCE(data->>'keepForever', 'false') <> 'true'
		    AND COALESCE(data->>'fileDeletedAt', '') = ''`, days)
	if err != nil {
		return
	}
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	rows.Close()
	n := 0
	for _, id := range ids {
		if purgeTransferFile(ctx, id, "", "سیاست نگهداری خودکار", "retention") {
			n++
		}
	}
	if n > 0 {
		log.Printf("نگهداری فایل‌ها: %d فایل قدیمی‌تر از %d روز حذف شد", n, days)
	}
}

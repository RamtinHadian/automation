package auth

import (
	"context"
	"sync"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// «Only the quick-registration page» accounts: people the administrator ticked in the marketing menu (settings key fieldReg, list `only`).
// They may sign in only from /field-type pages and may call nothing but /api/field/* (and the sign-in / sign-out calls): the rest of the program is closed to them.

var (
	fieldOnlyMu  sync.Mutex
	fieldOnlySet map[string]bool
	fieldOnlyAt  time.Time
)

// ResetFieldOnly forgets the remembered list (the administrator just changed it).
func ResetFieldOnly() {
	fieldOnlyMu.Lock()
	fieldOnlyAt = time.Time{}
	fieldOnlyMu.Unlock()
}

// FieldOnly says whether this person is limited to the quick-registration page.
func FieldOnly(ctx context.Context, userID string) bool {
	fieldOnlyMu.Lock()
	defer fieldOnlyMu.Unlock()
	if fieldOnlySet == nil || time.Since(fieldOnlyAt) > 20*time.Second {
		set := map[string]bool{}
		var raw []byte
		if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'fieldReg'`).Scan(&raw) == nil {
			for _, id := range jsonx.Strings(jsonx.Decode(raw), "only") {
				set[id] = true
			}
		}
		fieldOnlySet, fieldOnlyAt = set, time.Now()
	}
	return fieldOnlySet[userID]
}

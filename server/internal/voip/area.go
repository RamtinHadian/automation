package voip

import (
	"context"
	"strings"
	"sync"
	"time"
	"unicode"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A city phone system (a PBX behind a landline of Isfahan, say) reports callers from the same city without the area code
// (33920123). The area code chosen in the console is put in front of such short numbers so that the call list, the pop-up,
// the customer match and «save as customer» all work with the full number (03133920123).
var (
	areaMu   sync.Mutex
	areaCode string
	areaAt   time.Time
)

// AreaCode is the area code chosen in the console («031»), empty when none.
func AreaCode() string {
	areaMu.Lock()
	defer areaMu.Unlock()
	if time.Since(areaAt) < 30*time.Second {
		return areaCode
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var raw []byte
	code := ""
	if store.Pool != nil && store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'voipArea'`).Scan(&raw) == nil {
		code = onlyDigits(jsonx.Str(jsonx.Decode(raw), "code"))
	}
	areaCode, areaAt = code, time.Now()
	return code
}

// ResetArea drops the remembered area code so that the next call reads the new setting.
func ResetArea() {
	areaMu.Lock()
	areaAt = time.Time{}
	areaMu.Unlock()
}

func onlyDigits(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// FullNumber puts the area code in front of a local landline number (7 or 8 digits that do not start with 0).
// Mobile numbers, numbers that already have a code, extensions and labels are returned unchanged.
func FullNumber(number string) string {
	d := onlyDigits(number)
	if d == "" || strings.IndexFunc(number, unicode.IsLetter) >= 0 { // labels like «ناشناس» or «anonymous»
		return number
	}
	if (len(d) == 7 || len(d) == 8) && d[0] != '0' {
		if code := AreaCode(); code != "" {
			return code + d
		}
	}
	return number
}

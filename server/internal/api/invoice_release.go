package api

import (
	"context"
	"regexp"
	"strconv"
	"strings"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// Numbers given back: when an invoice that never went to Sepidar is cancelled, its number is freed and the next invoice gets it (the smallest first).
// The cancelled invoice keeps showing its number, marked «numberReleased», and is left out of every «used number» count. A number that went to Sepidar
// is never given back: that invoice stays in Sepidar until it is deleted there.

func freedList(row jsonx.M) []string {
	out := []string{}
	if arr, ok := row["freed"].([]any); ok {
		for _, v := range arr {
			if s, ok := v.(string); ok && s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}

var trailingDigits = regexp.MustCompile(`(\d+)$`)

func numOfInvoiceNumber(s string) int64 {
	if m := trailingDigits.FindString(s); m != "" {
		v, _ := strconv.ParseInt(m, 10, 64)
		return v
	}
	return 0
}

func sortedFreed(list []string, keep func(string) bool) []string {
	out := []string{}
	for _, x := range list {
		if keep(x) {
			out = append(out, x)
		}
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && numOfInvoiceNumber(out[j]) < numOfInvoiceNumber(out[j-1]); j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// releaseInvoiceNumber gives a number back (the next invoice uses it).
func releaseInvoiceNumber(ctx context.Context, num string) {
	if strings.TrimSpace(num) == "" {
		return
	}
	row := invNumRow(ctx)
	for _, x := range freedList(row) {
		if x == num {
			return
		}
	}
	list := append(freedList(row), num)
	_, _ = store.Pool.Exec(ctx, `INSERT INTO settings (key, data) VALUES ('invoiceNumbering', jsonb_build_object('freed', $1::jsonb))
		ON CONFLICT (key) DO UPDATE SET data = jsonb_set(settings.data, '{freed}', $1::jsonb)`, jsonx.Encode(list))
}

func peekFreed(ctx context.Context, keep func(string) bool) string {
	list := sortedFreed(freedList(invNumRow(ctx)), keep)
	if len(list) == 0 {
		return ""
	}
	return list[0]
}

// takeFreed removes the smallest freed number that fits and returns it (one transaction: two people never get the same one).
func takeFreed(ctx context.Context, keep func(string) bool) string {
	tx, err := store.Pool.Begin(ctx)
	if err != nil {
		return ""
	}
	defer tx.Rollback(ctx)
	var raw []byte
	if tx.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'invoiceNumbering' FOR UPDATE`).Scan(&raw) != nil {
		return ""
	}
	list := freedList(jsonx.Decode(raw))
	pick := sortedFreed(list, keep)
	if len(pick) == 0 {
		return ""
	}
	take := pick[0]
	rest := []string{}
	for _, x := range list {
		if x != take {
			rest = append(rest, x)
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE settings SET data = jsonb_set(data, '{freed}', $1::jsonb) WHERE key = 'invoiceNumbering'`, jsonx.Encode(rest)); err != nil {
		return ""
	}
	if tx.Commit(ctx) != nil {
		return ""
	}
	return take
}

const notReleased = ` AND COALESCE(data->'invoice'->>'numberReleased', '') <> 'true'`

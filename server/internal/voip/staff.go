package voip

import (
	"context"
	"strings"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// A colleague who phones from their mobile (the mobile and the extra numbers written on their user card) is shown by name.

// StaffPhone is one phone number of one active colleague.
type StaffPhone struct {
	Name   string
	Digits string
}

// StaffPhones lists the mobile and extra numbers of every active colleague.
func StaffPhones(ctx context.Context) []StaffPhone {
	rows, err := store.Pool.Query(ctx, `SELECT data FROM users WHERE COALESCE((data->>'isActive')::boolean, true)`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []StaffPhone
	for rows.Next() {
		var raw []byte
		if rows.Scan(&raw) != nil {
			continue
		}
		m := jsonx.Decode(raw)
		name := jsonx.Str(m, "fullName")
		if name == "" {
			continue
		}
		for _, p := range append([]string{jsonx.Str(m, "mobile")}, jsonx.Strings(m, "mobiles")...) {
			if d := onlyDigits(p); len(d) >= 7 {
				out = append(out, StaffPhone{Name: name, Digits: d})
			}
		}
	}
	return out
}

// MatchStaff finds the colleague a number belongs to: the numbers end with the same digits (the last ten, at least seven).
func MatchStaff(list []StaffPhone, number string) (string, bool) {
	d := onlyDigits(number)
	if len(d) < 7 || strings.IndexFunc(number, func(r rune) bool { return r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' }) >= 0 {
		return "", false
	}
	for _, s := range list {
		n := len(d)
		if len(s.Digits) < n {
			n = len(s.Digits)
		}
		if n > 10 {
			n = 10
		}
		if n >= 7 && d[len(d)-n:] == s.Digits[len(s.Digits)-n:] {
			return s.Name, true
		}
	}
	return "", false
}

// StaffByPhone is MatchStaff for a single number.
func StaffByPhone(ctx context.Context, number string) (string, bool) {
	return MatchStaff(StaffPhones(ctx), number)
}

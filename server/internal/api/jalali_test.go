package api

import "testing"

func TestJalaliText(t *testing.T) {
	cases := map[string]string{
		"2026-10-26":           "4 آبان 1405",
		"2026-03-21T10:00:00Z": "1 فروردین 1405",
		"2025-03-20":           "30 اسفند 1403",
		"2024-03-19":           "29 اسفند 1402",
		"2026-01-01":           "11 دی 1404",
		"hello":                "hello",
	}
	for in, want := range cases {
		if got := jalaliText(in); got != want {
			t.Errorf("%s: got %q want %q", in, got, want)
		}
	}
}

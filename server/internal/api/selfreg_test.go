package api

import "testing"

func TestJalaliToISO(t *testing.T) {
	cases := map[string]string{
		"1405/09/01":  "2026-11-22",
		"۱۴۰۵/۰۹/۰۱": "2026-11-22",
		"1365-05-20":  "1986-08-11",
		"1399/12/30":  "2021-03-20",
		"1400/01/01":  "2021-03-21",
		"1405/13/01":  "",
		"1405/07/31":  "",
		"abc":         "",
	}
	for in, want := range cases {
		if got := jalaliToISO(in); got != want {
			t.Errorf("%s -> %q, want %q", in, got, want)
		}
	}
}

func TestSelfFieldsAreConsistent(t *testing.T) {
	seenKey, seenLabel := map[string]bool{}, map[string]bool{}
	for _, f := range selfFields {
		if seenKey[f.Key] || seenLabel[f.Label] {
			t.Errorf("duplicate field %s / %s", f.Key, f.Label)
		}
		seenKey[f.Key], seenLabel[f.Label] = true, true
	}
}

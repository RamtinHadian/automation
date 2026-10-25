package api

import "testing"

func TestParseLooseJSON(t *testing.T) {
	cases := map[string]bool{
		"```json\n{\"a\": \"x\", \"rank\": ۳}\n```":                                 true,
		"{\"a\": [{\"n\": \"x\", \"k\": 1}, {\"n\": \"y\", \"k\"":                    true,
		"{\"a\": \"hello\", \"b\": [\"one\", \"tw":                                 true,
		"متن بی‌جیسون":                                                              false,
		"{\"a\": 1, \"b\": {\"c\": \"d\"},}":                                       false,
	}
	for in, want := range cases {
		got := parseLooseJSON(in) != nil
		if got != want {
			t.Errorf("%q: got %v want %v", in, got, want)
		}
	}
	if m := parseLooseJSON("{\"rank\": ۳}"); m == nil || m["rank"].(float64) != 3 {
		t.Errorf("persian digit not read: %v", m)
	}
}

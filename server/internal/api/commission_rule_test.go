package api

import (
	"testing"

	"automation/server/internal/jsonx"
)

func TestCleanRuleKeepsFixedMode(t *testing.T) {
	r := cleanRule(map[string]any{
		"percent": 2.0, "mode": "both", "fixed": 5000000.0, "fixedPer": "deal",
		"fixedTiers": []any{map[string]any{"from": 900.0, "amount": 9.0}, map[string]any{"from": 500.0, "amount": 7.0}, map[string]any{"from": 0.0, "amount": 1.0}},
	})
	if jsonx.Str(r, "mode") != "both" || jsonx.Str(r, "fixedPer") != "deal" || jsonx.Num(r["fixed"]) != 5000000 {
		t.Fatalf("fixed part lost: %v", r)
	}
	ft := jsonx.Arr(r, "fixedTiers")
	if len(ft) != 2 || jsonx.Num(ft[0].(map[string]any)["from"]) != 500 {
		t.Fatalf("steps must be sorted and the zero step dropped: %v", ft)
	}
	if bad := cleanRule(map[string]any{"mode": "weird"}); jsonx.Str(bad, "mode") != "" {
		t.Fatal("an unknown mode must fall back to percent")
	}
}

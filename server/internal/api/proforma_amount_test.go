package api

import (
	"testing"

	"automation/server/internal/jsonx"
)

func TestEnforceProformaAmount(t *testing.T) {
	doc := jsonx.M{
		"proformaNumber":  "PF-1",
		"amount":          1, // a lie
		"discountPercent": 10,
		"taxPercent":      9,
		"items": []any{
			map[string]any{"title": "a", "qty": 2, "unitPrice": 1000, "discount": 100},
			map[string]any{"title": "b", "qty": -5, "unitPrice": 999}, // a negative quantity counts as zero
		},
	}
	enforceProformaAmount(doc)
	// rows: 2*1000-100 = 1900; 10% off -> 1710; 9% tax = 153.9 -> 154; total 1864
	if got := jsonx.Num(doc["amount"]); got != 1864 {
		t.Fatalf("amount = %v, want 1864", got)
	}
}

func TestEnforceProformaAmountClampsPercentages(t *testing.T) {
	doc := jsonx.M{"proformaNumber": "PF-2", "discountPercent": 250, "taxPercent": -3,
		"items": []any{map[string]any{"qty": 1, "unitPrice": 5000}}}
	enforceProformaAmount(doc)
	if jsonx.Num(doc["discountPercent"]) != 100 || jsonx.Num(doc["taxPercent"]) != 0 || jsonx.Num(doc["amount"]) != 0 {
		t.Fatalf("got discount %v tax %v amount %v", doc["discountPercent"], doc["taxPercent"], doc["amount"])
	}
}

func TestDealWithoutProformaKeepsTypedAmount(t *testing.T) {
	doc := jsonx.M{"amount": 777, "items": []any{map[string]any{"title": "x", "qty": 1, "unitPrice": 5}}}
	enforceProformaAmount(doc)
	if jsonx.Num(doc["amount"]) != 777 {
		t.Fatalf("amount changed to %v", doc["amount"])
	}
}

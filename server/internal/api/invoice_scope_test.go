package api

import (
	"context"
	"testing"

	"automation/server/internal/auth"
	"automation/server/internal/jsonx"
)

func TestInvoiceScopeRefusal(t *testing.T) {
	ctx := context.Background()
	mk := func(m jsonx.M) auth.User { m["id"], m["role"] = "u1", "EMPLOYEE"; return auth.User{M: m} }
	deal := func(owner string) jsonx.M { return jsonx.M{"id": "d1", "ownerId": owner} }
	if invoiceScopeRefusal(ctx, mk(jsonx.M{}), deal("x")) != "" {
		t.Fatal("default scope must allow every reachable deal")
	}
	if invoiceScopeRefusal(ctx, mk(jsonx.M{"invoiceScope": "own"}), deal("u1")) != "" {
		t.Fatal("own scope: own deal allowed")
	}
	if invoiceScopeRefusal(ctx, mk(jsonx.M{"invoiceScope": "own"}), deal("x")) == "" {
		t.Fatal("own scope: colleague's deal refused")
	}
	p := mk(jsonx.M{"invoiceScope": "people", "invoiceTeamIds": []any{"x"}})
	if invoiceScopeRefusal(ctx, p, deal("x")) != "" || invoiceScopeRefusal(ctx, p, deal("y")) == "" {
		t.Fatal("people scope: only the picked colleagues")
	}
	if !invoiceSub(mk(jsonx.M{}), "crm.invoice.official") || invoiceSub(mk(jsonx.M{"hiddenSub": []any{"crm.invoice.official"}}), "crm.invoice.official") {
		t.Fatal("sub rights follow hiddenSub")
	}
}

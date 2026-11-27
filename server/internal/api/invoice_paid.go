package api

import (
	"context"
	"strconv"

	"automation/server/internal/store"
)

// The Sepidar numbers of the invoices whose issuing in Hoormand said «paid» (a cash sale): the finance page does not call them unpaid.
func paidInvoiceNumbers(ctx context.Context) map[int64]bool {
	out := map[int64]bool{}
	rows, err := store.Pool.Query(ctx, `SELECT COALESCE(data->'invoice'->'sepidar'->>'number', '') FROM crm_deals WHERE data->'invoice'->>'paid' = 'true' AND data->'invoice'->'sepidar'->>'number' IS NOT NULL`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s string
		if rows.Scan(&s) == nil {
			if n, e := strconv.ParseInt(s, 10, 64); e == nil {
				out[n] = true
			}
		}
	}
	return out
}

// what Sepidar says is still unpaid on invoices, per Sepidar customer (invoices issued as «paid» in Hoormand are left out).
func unpaidBySepidarCustomer(ctx context.Context) map[int64]float64 {
	out := map[int64]float64{}
	paid := paidInvoiceNumbers(ctx)
	list, _ := cacheItems(ctx, "invoices")
	for _, i := range list {
		ref, _ := whNum(i, "CustomerRef")
		rm, ok := whNum(i, "RemainingAmount")
		num, _ := whNum(i, "Number")
		if ok && rm > 0 && !paid[int64(num)] {
			out[int64(ref)] += rm
		}
	}
	return out
}

// the way the invoice is settled, as Sepidar names it: «CREDIT» (نسیه, the default) or «CASH» (نقدی)
func settlementOf(inc map[string]any) string {
	if v, _ := inc["settlement"].(string); v == "CASH" {
		return "CASH"
	}
	return "CREDIT"
}

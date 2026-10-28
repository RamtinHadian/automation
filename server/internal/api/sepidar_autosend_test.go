package api

import (
	"testing"

	"automation/server/internal/jsonx"
)

func TestCustomerSepidarChanged(t *testing.T) {
	base := jsonx.M{"name": "علی رضایی", "phones": []any{"09121234567", "02133445566"}, "address": "تهران، ولیعصر", "notes": "یادداشت"}
	same := jsonx.Copy(base)
	same["notes"] = "یادداشت دیگر"
	same["tags"] = []any{"x"}
	if customerSepidarChanged(base, same) {
		t.Error("a note or a tag is not held by Sepidar")
	}
	same2 := jsonx.Copy(base)
	same2["phones"] = []any{"۰۹۱۲۱۲۳۴۵۶۷", "021-33445566"}
	if customerSepidarChanged(base, same2) {
		t.Error("the same numbers written differently are not a change")
	}
	for _, f := range []string{"name", "address", "city", "postalCode", "nationalCode"} {
		c := jsonx.Copy(base)
		c[f] = "عوض شد"
		if !customerSepidarChanged(base, c) {
			t.Errorf("%s changed but was not noticed", f)
		}
	}
	c := jsonx.Copy(base)
	c["phones"] = []any{"09121234568"}
	if !customerSepidarChanged(base, c) {
		t.Error("a changed number was not noticed")
	}
}

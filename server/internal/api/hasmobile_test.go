package api

import "testing"

func TestHasMobile(t *testing.T) {
	yes := [][]string{{"09121234567"}, {"+989121234567"}, {"00989121234567"}, {"989121234567"}, {"9121234567"}, {"۰۹۱۲۱۲۳۴۵۶۷"}, {"02133445566", "09351112233"}, {"0912 123 4567"}}
	no := [][]string{{}, {""}, {"02133445566"}, {"0912123456"}, {"091212345678"}, {"03136265771"}, {"1234"}}
	for _, p := range yes {
		if !hasMobile(p) {
			t.Errorf("%v should be a mobile", p)
		}
	}
	for _, p := range no {
		if hasMobile(p) {
			t.Errorf("%v should not be a mobile", p)
		}
	}
}

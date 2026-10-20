package voip

import "testing"

func TestArrivalContext(t *testing.T) {
	yes := []string{"ext-local", "ext-group", "ext-queues", "ext-findmefollow", "from-did-direct", "ivr-3", "app-announcement-2"}
	no := []string{"from-internal", "from-trunk", "macro-dial", "ext-local-extra", "", "default"}
	for _, c := range yes {
		if !arrivalContext.MatchString(c) {
			t.Errorf("%q must be an arrival", c)
		}
	}
	for _, c := range no {
		if arrivalContext.MatchString(c) {
			t.Errorf("%q must not be an arrival", c)
		}
	}
}

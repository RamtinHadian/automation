package api

import "testing"

func TestClassifyAI(t *testing.T) {
	cases := []struct {
		status int
		body   string
		kind   string
	}{
		{402, "", aiKindCredit},
		{429, `{"error":"You exceeded your current quota"}`, aiKindCredit},
		{400, `{"error":"insufficient balance"}`, aiKindCredit},
		{403, `اعتبار حساب شما کافی نیست`, aiKindCredit},
		{401, "", aiKindKey},
		{403, "forbidden", aiKindKey},
		{429, "slow down", aiKindRate},
		{503, "", aiKindService},
		{404, "not found", ""},
	}
	for _, c := range cases {
		e := classifyAI(c.status, c.body)
		got := ""
		if e != nil {
			got = e.Kind
		}
		if got != c.kind {
			t.Errorf("%d %q: got %q want %q", c.status, c.body, got, c.kind)
		}
	}
}

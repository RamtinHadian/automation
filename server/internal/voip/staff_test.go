package voip

import "testing"

func TestMatchStaff(t *testing.T) {
	list := []StaffPhone{{Name: "علی رضایی", Digits: "09121234567"}, {Name: "سارا محمدی", Digits: "03133920123"}}
	cases := map[string]string{
		"09121234567":   "علی رضایی",
		"+989121234567": "علی رضایی",
		"9121234567":    "علی رضایی",
		"33920123":      "سارا محمدی",
		"03133920123":   "سارا محمدی",
		"09129999999":   "",
		"500":           "",
		"anonymous":     "",
	}
	for in, want := range cases {
		got, ok := MatchStaff(list, in)
		if got != want || ok != (want != "") {
			t.Errorf("MatchStaff(%q) = %q,%v want %q", in, got, ok, want)
		}
	}
}

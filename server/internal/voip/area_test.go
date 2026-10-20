package voip

import (
	"testing"
	"time"
)

func TestFullNumber(t *testing.T) {
	areaMu.Lock()
	areaCode, areaAt = "031", time.Now()
	areaMu.Unlock()
	cases := map[string]string{
		"33920123":    "03133920123", // local landline without the code
		"3392012":     "0313392012",
		"03133920123": "03133920123", // already full
		"09131234567": "09131234567", // mobile
		"9131234567":  "9131234567",  // 10 digits: left alone
		"500":         "500",         // extension
		"ناشناس":      "ناشناس",
		"anonymous":   "anonymous",
		"":            "",
	}
	for in, want := range cases {
		if got := FullNumber(in); got != want {
			t.Errorf("FullNumber(%q) = %q, want %q", in, got, want)
		}
	}
	areaMu.Lock()
	areaCode = ""
	areaMu.Unlock()
	if got := FullNumber("33920123"); got != "33920123" {
		t.Errorf("without a code the number must stay: %q", got)
	}
}

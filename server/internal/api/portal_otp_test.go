package api

import (
	"testing"

	"automation/server/internal/auth"
)

func TestPortalOTP(t *testing.T) {
	auth.SetSecret("unit-test-secret-1234567890")
	code := portalOTPNew("c1")
	if len(code) != 5 {
		t.Fatalf("code %q is not 5 digits", code)
	}
	if portalOTPCheck("c1", "00000") && code != "00000" {
		t.Fatal("a wrong code was accepted")
	}
	if portalOTPCheck("c2", code) {
		t.Fatal("a code works for another customer")
	}
	code = portalOTPNew("c1")
	if !portalOTPCheck("c1", code) {
		t.Fatal("the right code was refused")
	}
	if portalOTPCheck("c1", code) {
		t.Fatal("a code worked twice")
	}
	code = portalOTPNew("c3")
	for i := 0; i < 5; i++ {
		portalOTPCheck("c3", "x")
	}
	if portalOTPCheck("c3", code) {
		t.Fatal("the code still worked after too many wrong tries")
	}
}

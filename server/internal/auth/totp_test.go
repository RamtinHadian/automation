package auth

import "testing"

// RFC 6238 appendix B (SHA-1, key "12345678901234567890"): the 8-digit codes are 94287082 at t=59 and 07081804 at t=1111111109;
// the 6-digit codes are their last six digits.
func TestHOTPMatchesRFC6238(t *testing.T) {
	key := []byte("12345678901234567890")
	cases := map[uint64]string{59 / 30: "287082", 1111111109 / 30: "081804", 1111111111 / 30: "050471", 1234567890 / 30: "005924"}
	for step, want := range cases {
		if got := hotp(key, step); got != want {
			t.Errorf("step %d: got %s want %s", step, got, want)
		}
	}
}

func TestSealRoundTrip(t *testing.T) {
	SetSecret("unit-test-secret-1234567890")
	s := newSecret()
	enc, err := seal(s)
	if err != nil {
		t.Fatal(err)
	}
	if enc == s {
		t.Fatal("secret was not encrypted")
	}
	dec, err := unseal(enc)
	if err != nil || dec != s {
		t.Fatalf("round trip failed: %v %q", err, dec)
	}
}

func TestCheckPassword(t *testing.T) {
	bad := []string{"short", "12345678", "aaaaaaaaaa", "Password", "ali-reza-1234"}
	for _, p := range bad {
		if CheckPassword(p, "ali-reza", "x@y.ir") == "" {
			t.Errorf("%q should be refused", p)
		}
	}
	if why := CheckPassword("Xk9#mQ2vLp", "ali", "x@y.ir"); why != "" {
		t.Errorf("a good password was refused: %s", why)
	}
}

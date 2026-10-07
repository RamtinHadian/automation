package voip

import "testing"

func TestIncomingExtForwarded(t *testing.T) {
	// an extension whose phone is off: the call reached 500 in the dialplan and was forwarded to a mobile that answered
	st := &callState{arrived: []string{"500"}, answered: true, answeredBy: "09121234567"}
	if got := incomingExt(st); got != "500" {
		t.Fatalf("want 500, got %q", got)
	}
	// answered by an extension: that one
	st = &callState{arrived: []string{"500"}, legExts: []string{"501"}, answered: true, answeredBy: "501"}
	if got := incomingExt(st); got != "501" {
		t.Fatalf("want 501, got %q", got)
	}
	if got := incomingExt(&callState{}); got != "" {
		t.Fatalf("want empty, got %q", got)
	}
}

func TestSamePopupWithin(t *testing.T) {
	if !samePopupWithin("500", "0911", 1e9) {
		t.Fatal("first must pass")
	}
	if samePopupWithin("500", "0911", 1e9) {
		t.Fatal("second within the window must be refused")
	}
}

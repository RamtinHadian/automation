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

func TestFollowMeLegIsTheExtension(t *testing.T) {
	// what a real Issabel sent: the call is offered to the follow-me primary leg of extension 500 and to the follow-me number list
	if got := ringingExt("Local/FMPR-500@from-internal-00000045;1"); got != "500" {
		t.Fatalf("want 500, got %q", got)
	}
	if got := ringingExt("Local/FMGL-09132019476#@from-internal-00000046;1"); got != "" {
		t.Fatalf("a follow-me number is not an extension, got %q", got)
	}
	if got := dialedExts("Local/FMPR-500@from-internal&Local/FMGL-09132019476#@from-internal,42,tr"); len(got) != 1 || got[0] != "500" {
		t.Fatalf("dialedExts: %v", got)
	}
	if !sameDigits("09132019476", "9132019476") {
		t.Fatal("same number written two ways")
	}
}

func TestFollowMeHelperChannelsAreNotCalls(t *testing.T) {
	jMu.Lock()
	active = map[string]*callState{}
	jMu.Unlock()
	journalEvent(Event{"Event": "DialBegin", "Channel": "Local/FMGL-09132019476#@from-internal-00000046;2", "DestChannel": "SIP/33920/09132019476", "CallerIDNum": "500", "Linkedid": "x1"})
	jMu.Lock()
	n := len(active)
	jMu.Unlock()
	if n != 0 {
		t.Fatalf("a follow-me helper channel must not start a call, have %d", n)
	}
	journalEvent(Event{"Event": "DialBegin", "Channel": "SIP/33920-0000003d", "DestChannel": "Local/FMPR-500@from-internal-00000045;1", "CallerIDNum": "9132019476", "Linkedid": "x2"})
	jMu.Lock()
	st := active["x2"]
	jMu.Unlock()
	if st == nil || len(st.legExts) != 1 || st.legExts[0] != "500" {
		t.Fatalf("the trunk's call must know extension 500 rang: %+v", st)
	}
}

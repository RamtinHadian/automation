package voip

import (
	"bufio"
	"context"
	"net"
	"strings"
	"testing"
	"time"
)

// A tiny fake Asterisk: says hello, accepts the login, answers Originate and rings extension 501 once.
func fakeAsterisk(t *testing.T) (addr string, originates chan string) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	originates = make(chan string, 4)
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		conn.Write([]byte("Asterisk Call Manager/9.0.0\r\n"))
		r := bufio.NewReader(conn)
		for {
			ev, err := readBlock(r)
			if err != nil {
				return
			}
			switch ev["Action"] {
			case "Login":
				ok := ev["Username"] == "appbridge" && ev["Secret"] == "pw"
				if ok {
					conn.Write([]byte("Response: Success\r\nActionID: " + ev["ActionID"] + "\r\nMessage: Authentication accepted\r\n\r\n"))
					conn.Write([]byte("Event: DialBegin\r\nChannel: PJSIP/502-0000001\r\nCallerIDNum: 502\r\nCallerIDName: x\r\nDestChannel: PJSIP/501-0000002\r\nDestUniqueID: 99.1\r\n\r\n"))
				} else {
					conn.Write([]byte("Response: Error\r\nActionID: " + ev["ActionID"] + "\r\nMessage: Authentication failed\r\n\r\n"))
				}
			case "Originate":
				originates <- ev["Channel"] + "|" + ev["Exten"]
				conn.Write([]byte("Response: Success\r\nActionID: " + ev["ActionID"] + "\r\nMessage: Originate successfully queued\r\n\r\n"))
			}
		}
	}()
	return ln.Addr().String(), originates
}

func TestLoginEventsAndCall(t *testing.T) {
	addr, originates := fakeAsterisk(t)
	host, port, _ := net.SplitHostPort(addr)
	c := NewClient(Config{Host: host, Port: port, User: "appbridge", Secret: "pw"})
	got := make(chan Event, 2)
	c.OnEvent = func(e Event) { got <- e }
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go c.Run(ctx)

	select {
	case e := <-got:
		if e["Event"] != "DialBegin" || channelExt.FindStringSubmatch(e["DestChannel"])[1] != "501" {
			t.Fatalf("unexpected event %v", e)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no event received")
	}
	for i := 0; i < 50 && !c.Connected(); i++ {
		time.Sleep(50 * time.Millisecond)
	}
	if !c.Connected() {
		t.Fatal("not connected")
	}
	if err := c.Call("502", "501"); err != nil {
		t.Fatal(err)
	}
	if v := <-originates; v != "Local/502@from-internal|501" {
		t.Fatalf("originate got %q", v)
	}
	if err := c.Call("502", "50a1"); err == nil {
		t.Fatal("bad number accepted")
	}
}

func TestChannelExt(t *testing.T) {
	cases := map[string]string{"PJSIP/501-0000001a": "501", "SIP/600-00000012": "600"}
	for ch, want := range cases {
		if m := channelExt.FindStringSubmatch(ch); m == nil || m[1] != want {
			t.Errorf("%s -> %v", ch, m)
		}
	}
	for _, ch := range []string{"Local/501@from-internal-0001;1", "PJSIP/trunk-out"} {
		if channelExt.MatchString(ch) && strings.HasPrefix(ch, "Local") {
			t.Errorf("%s should not match", ch)
		}
	}
}

func TestNormalizeEventAsterisk11(t *testing.T) {
	ev := Event{"Event": "Dial", "SubEvent": "Begin", "Channel": "SIP/trunk-0000001a", "Destination": "SIP/501-0000001b", "CallerIDNum": "09121234567", "UniqueID": "1759660000.5", "DestUniqueID": "1759660000.6"}
	normalizeEvent(ev)
	if ev["Event"] != "DialBegin" || ev["DestChannel"] != "SIP/501-0000001b" || ev["Linkedid"] != "1759660000.5" {
		t.Fatalf("not normalized: %v", ev)
	}
	if m := channelExt.FindStringSubmatch(ev["DestChannel"]); m == nil || m[1] != "501" {
		t.Fatalf("extension not found in %q", ev["DestChannel"])
	}
	end := Event{"Event": "Dial", "SubEvent": "End", "UniqueID": "1759660000.5", "DialStatus": "ANSWER"}
	normalizeEvent(end)
	if end["Event"] != "DialEnd" || end["Linkedid"] != "1759660000.5" {
		t.Fatalf("end not normalized: %v", end)
	}
	newer := Event{"Event": "DialBegin", "DestChannel": "PJSIP/502-00000001", "Linkedid": "X.1", "Uniqueid": "X.2"}
	normalizeEvent(newer)
	if newer["Linkedid"] != "X.1" || newer["DestChannel"] != "PJSIP/502-00000001" {
		t.Fatalf("newer events must stay untouched: %v", newer)
	}
}

func TestRingingExt(t *testing.T) {
	cases := map[string]string{
		"SIP/500-0000001b":                "500",
		"PJSIP/501-00000012":              "501",
		"Local/500@from-internal-0000;1":  "500",
		"Local/500@from-internal-0000;2":  "500",
		"SIP/mytrunk-00000003":            "mytrunk", // a trunk has a name, the caller of this function filters by user
		"Local/s@macro-dialout;1":         "",
		"DAHDI/1-1":                       "",
	}
	for ch, want := range cases {
		if got := ringingExt(ch); got != want {
			t.Errorf("%q -> %q, want %q", ch, got, want)
		}
	}
}

func TestCdrStatus(t *testing.T) {
	for in, want := range map[string]string{"ANSWERED": "answered", "NO ANSWER": "missed", "BUSY": "busy", "FAILED": "failed", "CONGESTION": "failed", "": "missed"} {
		if got := cdrStatus(in); got != want {
			t.Errorf("%q -> %q, want %q", in, got, want)
		}
	}
}

func TestDialedExts(t *testing.T) {
	cases := map[string][]string{
		"SIP/500,30,tT":                   {"500"},
		"SIP/500&SIP/501&SIP/trunk,30":    {"500", "501"},
		"PJSIP/502,15,HhTtrM(auto-blkvm)": {"502"},
		"Local/500@from-internal/n,30":    {"500"},
		"SIP/mytrunk/09121234567,300":     nil,
		"DAHDI/g0/0912":                   nil,
		"":                                nil,
	}
	for in, want := range cases {
		got := dialedExts(in)
		if len(got) != len(want) {
			t.Errorf("%q -> %v, want %v", in, got, want)
			continue
		}
		for i := range got {
			if got[i] != want[i] {
				t.Errorf("%q -> %v, want %v", in, got, want)
			}
		}
	}
}

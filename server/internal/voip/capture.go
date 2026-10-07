package voip

import (
	"strings"
	"sync"
	"time"
)

// A one-minute recording of what the phone system really sends, started by an admin from the console. It answers
// «does the pop-up not come because the phone system sends nothing, or because we do not understand what it sends?»
// without anybody reading Asterisk's logs: the admin presses the button, makes a test call, and sees the event names
// with their channels, applications and numbers.

const (
	captureFor = 60 * time.Second
	captureMax = 250
)

var (
	capMu    sync.Mutex
	capUntil time.Time
	capLines []string
)

// StartCapture begins a new recording (and forgets the previous one).
func StartCapture() {
	capMu.Lock()
	defer capMu.Unlock()
	capUntil = time.Now().Add(captureFor)
	capLines = nil
}

// captureEvent keeps one short line per event while a recording is running.
func captureEvent(ev Event) {
	capMu.Lock()
	defer capMu.Unlock()
	if time.Now().After(capUntil) || len(capLines) >= captureMax {
		return
	}
	if ev["Event"] == "VarSet" { // hundreds of lines per call that say nothing useful here
		return
	}
	var b strings.Builder
	b.WriteString(time.Now().Format("15:04:05") + "  " + ev["Event"])
	for _, k := range []string{"SubEvent", "Channel", "DestChannel", "Destination", "Application", "AppData", "Context", "Exten", "Extension", "CallerIDNum", "CallerIDName", "ConnectedLineNum", "Source", "Disposition", "DialStatus"} {
		if v := strings.TrimSpace(ev[k]); v != "" && v != "<unknown>" {
			if len(v) > 70 {
				v = v[:70] + "…"
			}
			b.WriteString("  " + k + "=" + v)
		}
	}
	capLines = append(capLines, b.String())
}

// CaptureState says whether a recording is running, how many seconds are left, and what was recorded so far.
func CaptureState() (running bool, secondsLeft int, lines []string) {
	capMu.Lock()
	defer capMu.Unlock()
	left := int(time.Until(capUntil).Seconds())
	if left < 0 {
		left = 0
	}
	return left > 0, left, append([]string{}, capLines...)
}

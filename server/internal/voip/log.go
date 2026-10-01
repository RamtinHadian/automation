package voip

import (
	"fmt"
	"log"
	"sync"
	"sync/atomic"
	"time"
)

// LogEntry is one line of the phone-system diary shown to admins (so a missing pop-up can be explained without reading server logs).
type LogEntry struct {
	At   time.Time `json:"at"`
	Text string    `json:"text"`
}

const maxEntries = 60

var (
	logMu      sync.Mutex
	entries    []LogEntry
	eventCount atomic.Int64
	lastEvent  atomic.Int64 // unix seconds of the last event received from Asterisk
)

// Logf writes to the server log and keeps the line in the diary (newest last).
func Logf(format string, a ...any) {
	text := fmt.Sprintf(format, a...)
	log.Print("voip: " + text)
	logMu.Lock()
	defer logMu.Unlock()
	entries = append(entries, LogEntry{At: time.Now(), Text: text})
	if len(entries) > maxEntries {
		entries = entries[len(entries)-maxEntries:]
	}
}

// Recent returns the diary, newest first.
func Recent() []LogEntry {
	logMu.Lock()
	defer logMu.Unlock()
	out := make([]LogEntry, len(entries))
	for i, e := range entries {
		out[len(entries)-1-i] = e
	}
	return out
}

func noteEvent() {
	eventCount.Add(1)
	lastEvent.Store(time.Now().Unix())
}

// Stats says how many events Asterisk has sent since the server started and when the last one came (zero time = none yet).
func Stats() (count int64, last time.Time) {
	n := lastEvent.Load()
	if n == 0 {
		return eventCount.Load(), time.Time{}
	}
	return eventCount.Load(), time.Unix(n, 0)
}

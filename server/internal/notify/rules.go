package notify

import (
	"context"
	"sync"
	"time"

	"automation/server/internal/jsonx"
	"automation/server/internal/store"
)

// The organisation's notification settings (an admin sets them in the console) live in the main settings document under
// "notifySettings". The browser applies the sound, pop-up and system-notification choices; the server only needs to know whether
// an event is switched off entirely or must not be pushed to phones.

var (
	rulesMu  sync.Mutex
	rulesAt  time.Time
	rulesDoc jsonx.M
)

func settingsDoc(ctx context.Context) jsonx.M {
	rulesMu.Lock()
	defer rulesMu.Unlock()
	if time.Since(rulesAt) < 10*time.Second {
		return rulesDoc
	}
	var raw []byte
	doc := jsonx.M{}
	if store.Pool.QueryRow(ctx, `SELECT data FROM settings WHERE key = 'main'`).Scan(&raw) == nil {
		doc = jsonx.Sub(jsonx.Decode(raw), "notifySettings")
	}
	rulesDoc, rulesAt = doc, time.Now()
	return doc
}

// ForgetRules makes the next notification read the settings again (used right after an admin saves them).
func ForgetRules() {
	rulesMu.Lock()
	rulesAt = time.Time{}
	rulesMu.Unlock()
}

// flag looks for a switch in the event's own rule first, then in the rule of its kind; missing means "on".
func flag(doc jsonx.M, kind, label, key string) bool {
	for _, group := range []string{"events", "kinds"} {
		name := label
		if group == "kinds" {
			name = kind
		}
		if rule := jsonx.Sub(jsonx.Sub(doc, group), name); rule != nil {
			if v, ok := rule[key]; ok {
				if b, isBool := v.(bool); isBool {
					return b
				}
			}
		}
	}
	return true
}

// AllowedPush says whether this event may be pushed to phones (not when the event is off or its push switch is off).
func AllowedPush(ctx context.Context, kind, label string) bool {
	doc := settingsDoc(ctx)
	if len(doc) == 0 {
		return true
	}
	if b, ok := doc["enabled"].(bool); ok && !b {
		return false
	}
	return flag(doc, kind, label, "enabled") && flag(doc, kind, label, "push")
}

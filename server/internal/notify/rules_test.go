package notify

import (
	"testing"

	"automation/server/internal/jsonx"
)

func TestFlagPrefersTheEventThenTheKind(t *testing.T) {
	doc := jsonx.Decode([]byte(`{"kinds":{"task":{"enabled":true,"push":false},"call":{"enabled":false}},"events":{"موعد گذشته":{"push":true},"گزارش روزانه":{"enabled":false}}}`))
	cases := []struct {
		kind, label, key string
		want             bool
	}{
		{"task", "وظیفه جدید", "push", false},      // the kind switched push off
		{"task", "موعد گذشته", "push", true},       // the event turns it back on
		{"task", "گزارش روزانه", "enabled", false}, // the event is off
		{"call", "تماس ورودی", "enabled", false},   // the whole kind is off
		{"file", "فایل جدید", "push", true},        // nothing said: on
	}
	for _, c := range cases {
		if got := flag(doc, c.kind, c.label, c.key); got != c.want {
			t.Errorf("flag(%s,%s,%s) = %v, want %v", c.kind, c.label, c.key, got, c.want)
		}
	}
}

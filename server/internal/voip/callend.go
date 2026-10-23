package voip

import (
	"context"
	"time"

	"automation/server/internal/notify"
)

// announceCallEnd tells the open pages of the people who were rung (and of those who watch every call) that the call is over, so the
// incoming-call pop-up that stays «until the call ends» can close. It carries no notification: only {"type":"call-end"}.
func announceCallEnd(st *callState) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	seen := map[string]bool{}
	send := func(uid string) {
		if uid == "" || seen[uid] {
			return
		}
		seen[uid] = true
		notify.Hub.Publish(uid, []byte(`{"type":"call-end"}`))
	}
	exts := append(append([]string{st.callerNum}, st.legExts...), st.arrived...)
	for _, e := range exts {
		if uid, _, ok := userByExtension(ctx, e); ok {
			send(uid)
		}
	}
	for _, uid := range callWatchers(ctx, "") {
		send(uid)
	}
}

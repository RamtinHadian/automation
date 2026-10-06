package api

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"sync"
	"time"

	"automation/server/internal/auth"
	"automation/server/internal/httpx"
	"automation/server/internal/store"
	"automation/server/internal/version"
)

// Connection and update monitor. The program writes a heartbeat every few seconds and checks the server's own internet
// every 15 seconds. From that it can tell, afterwards, WHY the system was not reachable:
//   - «update»   the program was stopped and started again with a newer version (the automatic update),
//   - «restart»  it started again without a new version (power cut, crash, manual restart),
//   - «stall»    the program itself froze for a while (the server was too busy: CPU or disk),
//   - «net-down» the server's internet connection was down while the program kept running.
// The admin sees the list in «آمار و مصرف حافظه».

const (
	beatEvery  = 5 * time.Second
	probeEvery = 15 * time.Second
)

var netWatch struct {
	mu        sync.Mutex
	startedAt time.Time
	downSince time.Time
	lastProbe time.Time
	tcpOK     bool
	dnsOK     bool
}

func recordNetEvent(ctx context.Context, kind string, seconds int, detail string) {
	if _, err := store.Pool.Exec(ctx, `INSERT INTO net_events (kind, seconds, version, detail) VALUES ($1, $2, $3, $4)`, kind, seconds, version.Current().Version, detail); err != nil {
		log.Printf("netwatch: %v", err)
	}
}

// probeInternet: can the server open a connection to the outside, and can it look up a name?
func probeInternet() (tcpOK, dnsOK bool) {
	for _, addr := range []string{"1.1.1.1:443", "8.8.8.8:443", "9.9.9.9:443"} {
		c, err := net.DialTimeout("tcp", addr, 3*time.Second)
		if err == nil {
			c.Close()
			tcpOK = true
			break
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := net.DefaultResolver.LookupHost(ctx, "github.com")
	return tcpOK, err == nil
}

// RunNetWatch runs for the whole life of the program.
func RunNetWatch(ctx context.Context) {
	netWatch.mu.Lock()
	netWatch.startedAt = time.Now()
	netWatch.tcpOK, netWatch.dnsOK = true, true
	netWatch.mu.Unlock()

	ver := version.Current().Version
	_, _ = store.Pool.Exec(ctx, `DELETE FROM net_events WHERE at < now() - interval '90 days'`)

	// what happened while the program was not running?
	var lastAt time.Time
	var lastVer string
	if err := store.Pool.QueryRow(ctx, `SELECT at, version FROM net_heartbeat WHERE id = 1`).Scan(&lastAt, &lastVer); err == nil {
		gap := int(time.Since(lastAt).Seconds())
		if gap > 20 {
			if lastVer != "" && lastVer != ver {
				recordNetEvent(ctx, "update", gap, fmt.Sprintf("به‌روزرسانی از نسخهٔ %s به %s؛ برنامه حدود %d ثانیه از دسترس خارج بود.", lastVer, ver, gap))
			} else {
				recordNetEvent(ctx, "restart", gap, fmt.Sprintf("برنامه بدون تغییر نسخه حدود %d ثانیه خاموش بود (قطع برق سرور، خرابی یا راه‌اندازی دستی).", gap))
			}
		}
	}

	t := time.NewTicker(beatEvery)
	defer t.Stop()
	last := time.Now()
	n := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		now := time.Now()
		if late := now.Sub(last) - beatEvery; late > 10*time.Second {
			recordNetEvent(ctx, "stall", int(late.Seconds()), fmt.Sprintf("برنامه حدود %d ثانیه کند یا بی‌پاسخ بود (فشار روی پردازنده یا دیسک سرور، مثلاً هنگام ساخت نسخهٔ جدید).", int(late.Seconds())))
		}
		last = now
		_, _ = store.Pool.Exec(ctx, `INSERT INTO net_heartbeat (id, at, version) VALUES (1, now(), $1) ON CONFLICT (id) DO UPDATE SET at = now(), version = EXCLUDED.version`, ver)

		n++
		if n%int(probeEvery/beatEvery) != 0 {
			continue
		}
		tcp, dns := probeInternet()
		netWatch.mu.Lock()
		netWatch.lastProbe, netWatch.tcpOK, netWatch.dnsOK = now, tcp, dns
		var recovered time.Duration
		if !tcp {
			if netWatch.downSince.IsZero() {
				netWatch.downSince = now
			}
		} else if !netWatch.downSince.IsZero() {
			recovered = now.Sub(netWatch.downSince)
			netWatch.downSince = time.Time{}
		}
		netWatch.mu.Unlock()
		if recovered >= 10*time.Second {
			recordNetEvent(ctx, "net-down", int(recovered.Seconds()), fmt.Sprintf("اینترنت سرور حدود %d ثانیه قطع بود (خود برنامه روشن مانده بود؛ مشکل از خط اینترنت، مودم یا روتر است).", int(recovered.Seconds())))
		}
	}
}

type netEvent struct {
	At      time.Time `json:"at"`
	Kind    string    `json:"kind"`
	Seconds int       `json:"seconds"`
	Version string    `json:"version"`
	Detail  string    `json:"detail"`
}

// GET /api/admin/netwatch
func netWatchInfo(w http.ResponseWriter, r *http.Request) {
	if !auth.Current(r).IsAdmin() {
		httpx.Forbidden(w)
		return
	}
	rows, err := store.Pool.Query(r.Context(), `SELECT at, kind, seconds, version, detail FROM net_events WHERE at > now() - interval '30 days' ORDER BY at DESC LIMIT 200`)
	if err != nil {
		internalError(w)
		return
	}
	defer rows.Close()
	events := []netEvent{}
	for rows.Next() {
		var e netEvent
		if err := rows.Scan(&e.At, &e.Kind, &e.Seconds, &e.Version, &e.Detail); err != nil {
			internalError(w)
			return
		}
		events = append(events, e)
	}

	// how many of the stalls and net outages happened within 5 minutes before / 2 minutes after an update?
	nearUpdate, others := 0, 0
	for _, e := range events {
		if e.Kind != "stall" && e.Kind != "net-down" {
			continue
		}
		near := false
		for _, u := range events {
			if u.Kind == "update" && e.At.After(u.At.Add(-5*time.Minute)) && e.At.Before(u.At.Add(2*time.Minute)) {
				near = true
				break
			}
		}
		if near {
			nearUpdate++
		} else {
			others++
		}
	}

	netWatch.mu.Lock()
	state := map[string]any{
		"startedAt": netWatch.startedAt,
		"tcpOK":     netWatch.tcpOK,
		"dnsOK":     netWatch.dnsOK,
		"lastProbe": netWatch.lastProbe,
		"downNow":   !netWatch.downSince.IsZero(),
	}
	netWatch.mu.Unlock()
	httpx.JSON(w, http.StatusOK, map[string]any{
		"now": time.Now(), "version": version.Current().Version, "state": state, "events": events,
		"stallsAndOutagesNearUpdates": nearUpdate, "stallsAndOutagesElsewhere": others,
	})
}

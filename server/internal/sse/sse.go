// Package sse keeps open server-sent-event connections per user and delivers messages to them.
package sse

import (
	"net/http"
	"sync"
	"time"
)

type conn struct{ ch chan []byte }

// Hub groups the open connections of each user.
type Hub struct {
	mu    sync.Mutex
	conns map[string]map[*conn]struct{}
}

func NewHub() *Hub { return &Hub{conns: map[string]map[*conn]struct{}{}} }

// Publish sends a message (already formatted as the data of one event) to every connection of the user.
// It returns how many connections received it.
func (h *Hub) Publish(userID string, data []byte) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	n := 0
	for c := range h.conns[userID] {
		select {
		case c.ch <- data:
			n++
		default: // a stalled client must not block everyone else
		}
	}
	return n
}

func (h *Hub) add(userID string) (*conn, func()) {
	c := &conn{ch: make(chan []byte, 64)}
	h.mu.Lock()
	if h.conns[userID] == nil {
		h.conns[userID] = map[*conn]struct{}{}
	}
	h.conns[userID][c] = struct{}{}
	h.mu.Unlock()
	return c, func() {
		h.mu.Lock()
		delete(h.conns[userID], c)
		if len(h.conns[userID]) == 0 {
			delete(h.conns, userID)
		}
		h.mu.Unlock()
	}
}

// Serve holds the HTTP response open as an event stream until the client goes away.
// `heartbeat` is written every `every` so proxies keep the connection and the client can see it is alive.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, userID, heartbeat string, every time.Duration) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	hd := w.Header()
	hd.Set("Content-Type", "text/event-stream")
	hd.Set("Cache-Control", "no-cache, no-transform")
	hd.Set("Connection", "keep-alive")
	hd.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	c, remove := h.add(userID)
	defer remove()
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case msg := <-c.ch:
			if _, err := w.Write(append(append([]byte("data: "), msg...), '\n', '\n')); err != nil {
				return
			}
			flusher.Flush()
		case <-tick.C:
			if _, err := w.Write([]byte(heartbeat)); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

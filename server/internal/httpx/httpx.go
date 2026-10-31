// Package httpx holds small HTTP helpers shared by the handlers.
package httpx

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"

	"automation/server/internal/jsonx"
)

// JSON writes v as a JSON response.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes {"error": message}.
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, map[string]string{"error": message})
}

func OK(w http.ResponseWriter)        { JSON(w, http.StatusOK, map[string]bool{"ok": true}) }
func Forbidden(w http.ResponseWriter) { Error(w, http.StatusForbidden, "forbidden") }

// ReadBody decodes the JSON request body (at most 60 MB) into an object.
func ReadBody(w http.ResponseWriter, r *http.Request) (jsonx.M, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 60<<20)
	m := jsonx.M{}
	dec := json.NewDecoder(r.Body)
	dec.UseNumber()
	if err := dec.Decode(&m); err != nil {
		Error(w, http.StatusBadRequest, "bad request")
		return nil, false
	}
	return m, true
}

// ClientIP is the caller's address. X-Forwarded-For is believed only when the request comes from a proxy on this machine or
// its private network (the HTTPS front, Caddy), and then the LAST entry is used: that is the one the proxy itself added, while
// the earlier ones can be written by the caller. A request that comes straight from the internet cannot choose its own address.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsPrivate()) {
			parts := strings.Split(xff, ",")
			if last := strings.TrimSpace(parts[len(parts)-1]); net.ParseIP(last) != nil {
				return last
			}
		}
	}
	return host
}

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

// ClientIP is the caller's address; behind a proxy the first X-Forwarded-For entry is used.
func ClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

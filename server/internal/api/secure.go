package api

import (
	"net/http"
	"os"
	"strings"
)

// contentSecurityPolicy lets the page load scripts only from this site (so an injected <script>, onerror="…" or javascript: link
// cannot run), forbids plug-ins and framing by other sites, and keeps every form on this site.
// Styles stay open to inline style attributes (the app sets colours that way); pictures may come from data:/blob:/https: (customer logos, letterheads).
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data: blob: https:; " +
	"media-src 'self' data: blob:; " +
	"font-src 'self' data:; " +
	"connect-src 'self' https://api.ipify.org https://icanhazip.com; " + // the two services that tell the browser its public address (network watch)
	"frame-src 'self' blob: data:; " +
	"worker-src 'self' blob:; " +
	"manifest-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"frame-ancestors 'none'"

// securityHeaders adds the protective headers to every answer. With FORCE_HTTPS=1 a request that reached the server over plain HTTP
// (behind the HTTPS proxy: X-Forwarded-Proto) is sent to the same address over HTTPS.
func securityHeaders(next http.Handler) http.Handler {
	force := os.Getenv("FORCE_HTTPS") == "1"
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		secure := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
		if force && !secure && !strings.HasPrefix(r.URL.Path, "/api/health") && !strings.HasPrefix(r.URL.Path, "/api/voip/recordings/") {
			http.Redirect(w, r, "https://"+r.Host+r.URL.RequestURI(), http.StatusPermanentRedirect)
			return
		}
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()")
		if secure {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store") // answers hold private data; no shared cache may keep them
		}
		next.ServeHTTP(w, r)
	})
}

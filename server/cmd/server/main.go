// Command server is the API of the office automation app; it also serves the built frontend.
package main

import (
	"context"
	"log"
	"mime"
	"net/http"

	"automation/server/internal/api"
	"automation/server/internal/auth"
	"automation/server/internal/config"
	"automation/server/internal/push"
	"automation/server/internal/store"
)

func main() {
	cfg := config.Load()
	auth.SetSecret(cfg.JWTSecret)

	// The server image has no system mime table; make sure the files of the web app get the right types.
	for ext, typ := range map[string]string{
		".webmanifest": "application/manifest+json",
		".woff2":       "font/woff2",
		".woff":        "font/woff",
		".ttf":         "font/ttf",
		".ico":         "image/x-icon",
		".svg":         "image/svg+xml",
		".js":          "text/javascript; charset=utf-8",
		".css":         "text/css; charset=utf-8",
		".map":         "application/json",
	} {
		_ = mime.AddExtensionType(ext, typ)
	}

	ctx := context.Background()
	if err := store.Init(ctx, cfg); err != nil {
		log.Fatalf("database: %v", err)
	}
	if err := push.Init(ctx, cfg); err != nil {
		log.Fatalf("push keys: %v", err)
	}

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: api.Router(cfg)}
	log.Printf("Server listening on :%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}

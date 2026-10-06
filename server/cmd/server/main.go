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
	"automation/server/internal/crm"
	"automation/server/internal/license"
	"automation/server/internal/push"
	"automation/server/internal/store"
	"automation/server/internal/demo"
	"automation/server/internal/msgr"
	"automation/server/internal/voip"
	"automation/server/internal/work"
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
	if err := license.Init(ctx, cfg.Demo); err != nil {
		log.Fatalf("licence: %v", err)
	}
	go license.Run(ctx)
	if err := push.Init(ctx, cfg); err != nil {
		log.Fatalf("push keys: %v", err)
	}

	phone := voip.NewClient(voip.Config{Host: cfg.AMIHost, Port: cfg.AMIPort, User: cfg.AMIUser, Secret: cfg.AMISecret})
	voip.WatchCalls(phone)
	go phone.Run(ctx)
	if cfg.Demo {
		go demo.Run(ctx, cfg.DemoResetHours)
	}
	go crm.RunReminders(ctx)
	go msgr.Run(ctx)
	go work.RunTaskReminders(ctx)
	go api.RunFileRetention(ctx)
	go api.RunNetWatch(ctx)
	api.SetPhone(phone)

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: api.Router(cfg)}
	log.Printf("Server listening on :%s", cfg.Port)
	log.Fatal(srv.ListenAndServe())
}

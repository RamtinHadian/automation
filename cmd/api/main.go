package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ladani/enterprise-automation/internal/config"
	deliveryHTTP "ladani/enterprise-automation/internal/delivery/http"
	"ladani/enterprise-automation/internal/delivery/http/handler"
	"ladani/enterprise-automation/internal/repository/postgres"
	"ladani/enterprise-automation/internal/service"

	"github.com/gin-gonic/gin"
)

func main() {
	// 1. Load configuration
	cfg := config.LoadConfig()

	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	log.Printf("Starting Enterprise Secretariat & CRM Automation Engine [%s]...", cfg.AppEnv)

	// 2. Initialize Database Connection
	db, err := postgres.InitDB(cfg)
	if err != nil {
		log.Fatalf("Fatal: Database initialization failed: %v", err)
	}

	// 3. Run GORM Database Auto-Migrations & Seed Relationships
	log.Println("Executing database schema migrations & constraint building...")
	if err := postgres.AutoMigrate(db); err != nil {
		log.Fatalf("Fatal: Database migration failed: %v", err)
	}

	if err := postgres.SeedInitialData(db); err != nil {
		log.Printf("Warning: Failed to seed initial database entities: %v", err)
	}
	log.Println("Database migration and initial seed data ready.")

	// Ensure upload directory exists
	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		log.Printf("Warning: Failed to create upload dir: %v", err)
	}

	// 4. Dependency Injection Layer
	// Repositories
	txManager := postgres.NewTxManager(db)
	letterRepo := postgres.NewLetterRepository(db)
	workflowRepo := postgres.NewWorkflowRepository(db)
	indicatorRepo := postgres.NewIndicatorRepository()
	crmRepo := postgres.NewCRMRepository(db)
	userRepo := postgres.NewUserRepository(db)

	// Services
	secretariatService := service.NewSecretariatService(txManager, letterRepo, workflowRepo, indicatorRepo)
	workflowService := service.NewWorkflowService(txManager, workflowRepo, letterRepo)

	// HTTP Handlers
	authHandler := handler.NewAuthHandler(userRepo, cfg.JWTSecret, cfg.JWTExpiryHours)
	letterHandler := handler.NewLetterHandler(secretariatService, cfg.UploadDir)
	workflowHandler := handler.NewWorkflowHandler(workflowService)
	crmHandler := handler.NewCRMHandler(crmRepo)
	systemHandler := handler.NewSystemHandler(db)

	// 5. Initialize Gin Engine & Routes
	router := gin.New()
	deliveryHTTP.SetupRoutes(router, deliveryHTTP.RouterConfig{
		AuthHandler:        authHandler,
		LetterHandler:      letterHandler,
		WorkflowHandler:    workflowHandler,
		CRMHandler:         crmHandler,
		SystemHandler:      systemHandler,
		JWTSecret:          cfg.JWTSecret,
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
	})

	// 6. HTTP Server Setup with Graceful Shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("🚀 HTTP Server listening on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Fatal HTTP server error: %v", err)
		}
	}()

	// 7. Wait for Interrupt Signal for Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server gracefully...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server gracefully stopped.")
}

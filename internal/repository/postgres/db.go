package postgres

import (
	"context"
	"fmt"
	"log"
	"time"

	"ladani/enterprise-automation/internal/config"
	"ladani/enterprise-automation/internal/domain"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type TxManager struct {
	db *gorm.DB
}

func NewTxManager(db *gorm.DB) *TxManager {
	return &TxManager{db: db}
}

func (tm *TxManager) ExecuteTx(ctx context.Context, fn func(tx *gorm.DB) error) error {
	return tm.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(tx)
	})
}

func (tm *TxManager) GetDB() *gorm.DB {
	return tm.db
}

// InitDB initializes PostgreSQL connection pool or falls back to SQLite for instant local execution.
func InitDB(cfg *config.Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=%s TimeZone=Asia/Tehran connect_timeout=2",
		cfg.DBHost, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBPort, cfg.DBSSLMode,
	)

	gormConfig := &gorm.Config{
		PrepareStmt: true,
	}

	if cfg.AppEnv == "development" {
		gormConfig.Logger = logger.Default.LogMode(logger.Warn)
	} else {
		gormConfig.Logger = logger.Default.LogMode(logger.Error)
	}

	// 1. Try PostgreSQL
	db, err := gorm.Open(postgres.Open(dsn), gormConfig)
	if err == nil {
		if sqlDB, err := db.DB(); err == nil {
			if pingErr := sqlDB.Ping(); pingErr == nil {
				sqlDB.SetMaxOpenConns(cfg.DBMaxOpenConns)
				sqlDB.SetMaxIdleConns(cfg.DBMaxIdleConns)
				sqlDB.SetConnMaxLifetime(time.Duration(cfg.DBConnMaxLifetimeMin) * time.Minute)
				log.Println("Connected to PostgreSQL database successfully.")
				return db, nil
			}
		}
	}

	// 2. Fallback to local SQLite for smooth zero-config startup
	log.Println("⚠️ PostgreSQL not reachable on port", cfg.DBPort, "-> Falling back to embedded SQLite (enterprise_dev.db)...")
	sqliteDB, err := gorm.Open(sqlite.Open("enterprise_dev.db"), gormConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database fallback: %w", err)
	}

	log.Println("Embedded SQLite database initialized.")
	return sqliteDB, nil
}

// AutoMigrate applies schema migrations for all domain entities.
func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&domain.Department{},
		&domain.User{},
		&domain.IndicatorSequence{},
		&domain.ArchiveFolder{},
		&domain.CRMAccount{},
		&domain.CRMContact{},
		&domain.CRMDeal{},
		&domain.Letter{},
		&domain.LetterReferral{},
		&domain.LetterAttachment{},
		&domain.LetterRevision{},
		&domain.LetterSignature{},
	)
}

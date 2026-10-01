// Package config reads the settings the server needs from environment variables.
package config

import (
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port          string
	JWTSecret     string
	DatabaseURL   string
	StaticDir     string
	AdminPassword string
	AdminEmail    string
	AdminName     string
	IceServers    string
	VapidSubject  string
	// Phone system (Issabel/Asterisk AMI). Leave AMIHost empty to switch the integration off.
	AMIHost   string
	AMIPort   string
	AMIUser   string
	AMISecret string
	// Public showcase: fills the database with sample data and resets it (see package demo). Use a separate server.
	Demo           bool
	DemoResetHours int
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load reads the environment and stops the program when a required secret is missing or too short.
func Load() Config {
	port := env("PORT", "8080")
	if _, err := strconv.Atoi(port); err != nil {
		port = "8080"
	}
	static := os.Getenv("STATIC_DIR")
	if static == "" {
		static, _ = filepath.Abs("public")
	}
	c := Config{
		Port:          port,
		JWTSecret:     os.Getenv("JWT_SECRET"),
		DatabaseURL:   os.Getenv("DATABASE_URL"),
		StaticDir:     static,
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		AdminEmail:    env("ADMIN_EMAIL", "admin@company.internal"),
		AdminName:     env("ADMIN_FULL_NAME", "مدیر کل سیستم"),
		IceServers:    os.Getenv("ICE_SERVERS"),
		VapidSubject:  env("VAPID_SUBJECT", "mailto:admin@company.internal"),
		AMIHost:       os.Getenv("AMI_HOST"),
		AMIPort:       env("AMI_PORT", "5038"),
		AMIUser:       os.Getenv("AMI_USER"),
		AMISecret:     os.Getenv("AMI_SECRET"),
		Demo:          os.Getenv("DEMO") == "1",
	}
	c.DemoResetHours = 6
	if h, err := strconv.Atoi(os.Getenv("DEMO_RESET_HOURS")); err == nil && h > 0 {
		c.DemoResetHours = h
	}
	if len(c.JWTSecret) < 16 {
		log.Fatal("JWT_SECRET must be set to a random string of at least 16 characters")
	}
	if c.DatabaseURL == "" {
		log.Fatal("DATABASE_URL must be set")
	}
	return c
}

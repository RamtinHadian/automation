package config

import (
	"log"
	"os"
	"strconv"
)

type Config struct {
	AppEnv                string
	Port                  string
	DBHost                string
	DBPort                string
	DBUser                string
	DBPassword            string
	DBName                string
	DBSSLMode             string
	DBMaxOpenConns        int
	DBMaxIdleConns        int
	DBConnMaxLifetimeMin  int
	JWTSecret             string
	UploadDir             string
}

func LoadConfig() *Config {
	return &Config{
		AppEnv:               getEnv("APP_ENV", "development"),
		Port:                 getEnv("PORT", "8090"),
		DBHost:               getEnv("DB_HOST", "localhost"),
		DBPort:               getEnv("DB_PORT", "5432"),
		DBUser:               getEnv("DB_USER", "postgres"),
		DBPassword:           getEnv("DB_PASSWORD", "postgres"),
		DBName:               getEnv("DB_NAME", "enterprise_automation_db"),
		DBSSLMode:            getEnv("DB_SSL_MODE", "disable"),
		DBMaxOpenConns:       getEnvAsInt("DB_MAX_OPEN_CONNS", 25),
		DBMaxIdleConns:       getEnvAsInt("DB_MAX_IDLE_CONNS", 10),
		DBConnMaxLifetimeMin: getEnvAsInt("DB_CONN_MAX_LIFETIME_MIN", 30),
		JWTSecret:            getEnv("JWT_SECRET", "super-secret-enterprise-jwt-key-32bytes!"),
		UploadDir:            getEnv("UPLOAD_DIR", "./uploads"),
	}
}

func getEnv(key, defaultVal string) string {
	if val, exists := os.LookupEnv(key); exists {
		return val
	}
	return defaultVal
}

func getEnvAsInt(key string, defaultVal int) int {
	valStr := getEnv(key, "")
	if val, err := strconv.Atoi(valStr); err == nil {
		return val
	}
	if valStr != "" {
		log.Printf("Warning: env %s is not valid int, using default %d", key, defaultVal)
	}
	return defaultVal
}

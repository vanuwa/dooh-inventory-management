package config

import "os"

type Config struct {
	ImproveAPIBaseURL   string
	ImproveClientID     string
	ImproveClientSecret string
	FrontendOrigin      string
	Port                string
}

func Load() *Config {
	return &Config{
		ImproveAPIBaseURL:   getEnv("IMPROVE_API_BASE_URL", "https://api.360yield.com"),
		ImproveClientID:     getEnv("IMPROVE_CLIENT_ID", ""),
		ImproveClientSecret: getEnv("IMPROVE_CLIENT_SECRET", ""),
		FrontendOrigin:      getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		Port:                getEnv("PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

package config

import "os"

const (
	EnvProduction = "production"
	EnvAcceptance = "acceptance"
)

// Environment is one upstream SSP instance: where it lives and which OAuth client
// speaks to it. The name is the key it is stored under in Config.Environments.
type Environment struct {
	BaseURL      string
	ClientID     string
	ClientSecret string
}

type Config struct {
	// Environments is keyed by environment name; EnvProduction is always present.
	Environments   map[string]Environment
	FrontendOrigin string
	Port           string
}

func Load() *Config {
	clientID := getEnv("IMPROVE_CLIENT_ID", "")
	clientSecret := getEnv("IMPROVE_CLIENT_SECRET", "")

	// production and acceptance share one OAuth client today; the per-environment
	// fields mean diverging later is a change here and nowhere else.
	production := Environment{
		BaseURL:      getEnv("IMPROVE_API_BASE_URL", "https://api.360yield.com"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}
	acceptance := Environment{
		BaseURL:      getEnv("IMPROVE_ACCEPTANCE_API_BASE_URL", "https://api.360yielddev.com"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
	}

	return &Config{
		Environments: map[string]Environment{
			EnvProduction: production,
			EnvAcceptance: acceptance,
		},
		FrontendOrigin: getEnv("FRONTEND_ORIGIN", "http://localhost:5173"),
		Port:           getEnv("PORT", "8080"),
	}
}

// Env returns the upstream instance for name. An empty name selects production.
// ok is false when name is not a configured environment.
func (c *Config) Env(name string) (Environment, bool) {
	if name == "" {
		name = EnvProduction
	}
	env, ok := c.Environments[name]
	return env, ok
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

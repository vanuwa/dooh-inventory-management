package config

import "testing"

func TestEnv(t *testing.T) {
	cfg := &Config{Environments: map[string]Environment{
		EnvProduction: {Name: EnvProduction, BaseURL: "https://prod.example", ClientID: "id", ClientSecret: "secret"},
		EnvAcceptance: {Name: EnvAcceptance, BaseURL: "https://acc.example", ClientID: "id", ClientSecret: "secret"},
	}}

	t.Run("empty name selects production", func(t *testing.T) {
		env, ok := cfg.Env("")
		if !ok {
			t.Fatal("want ok for empty name")
		}
		if env.Name != EnvProduction || env.BaseURL != "https://prod.example" {
			t.Errorf("want production entry, got %+v", env)
		}
	})

	t.Run("acceptance name selects acceptance", func(t *testing.T) {
		env, ok := cfg.Env(EnvAcceptance)
		if !ok {
			t.Fatal("want ok for acceptance")
		}
		if env.BaseURL != "https://acc.example" {
			t.Errorf("BaseURL: want %q, got %q", "https://acc.example", env.BaseURL)
		}
	})

	t.Run("unknown name is not ok", func(t *testing.T) {
		env, ok := cfg.Env("bogus")
		if ok {
			t.Fatalf("want ok == false, got %+v", env)
		}
		if env != (Environment{}) {
			t.Errorf("want zero Environment, got %+v", env)
		}
	})

	t.Run("missing production entry is not ok", func(t *testing.T) {
		empty := &Config{}
		if _, ok := empty.Env(""); ok {
			t.Error("want ok == false when no environments are configured")
		}
	})
}

func TestLoadDefaults(t *testing.T) {
	for _, k := range []string{"IMPROVE_API_BASE_URL", "IMPROVE_ACCEPTANCE_API_BASE_URL", "IMPROVE_CLIENT_ID", "IMPROVE_CLIENT_SECRET"} {
		t.Setenv(k, "")
	}

	cfg := Load()

	prod, ok := cfg.Env(EnvProduction)
	if !ok {
		t.Fatal("production environment missing")
	}
	if prod.BaseURL != "https://api.360yield.com" {
		t.Errorf("production BaseURL: want %q, got %q", "https://api.360yield.com", prod.BaseURL)
	}

	acc, ok := cfg.Env(EnvAcceptance)
	if !ok {
		t.Fatal("acceptance environment missing")
	}
	if acc.BaseURL != "https://api.360yielddev.com" {
		t.Errorf("acceptance BaseURL: want %q, got %q", "https://api.360yielddev.com", acc.BaseURL)
	}
}

func TestLoadExplicitEnvVars(t *testing.T) {
	t.Setenv("IMPROVE_API_BASE_URL", "https://prod.example")
	t.Setenv("IMPROVE_ACCEPTANCE_API_BASE_URL", "https://acc.example")
	t.Setenv("IMPROVE_CLIENT_ID", "cid")
	t.Setenv("IMPROVE_CLIENT_SECRET", "csecret")

	cfg := Load()

	prod, _ := cfg.Env(EnvProduction)
	want := Environment{Name: EnvProduction, BaseURL: "https://prod.example", ClientID: "cid", ClientSecret: "csecret"}
	if prod != want {
		t.Errorf("production: want %+v, got %+v", want, prod)
	}

	// acceptance reuses the production OAuth client.
	acc, _ := cfg.Env(EnvAcceptance)
	want = Environment{Name: EnvAcceptance, BaseURL: "https://acc.example", ClientID: "cid", ClientSecret: "csecret"}
	if acc != want {
		t.Errorf("acceptance: want %+v, got %+v", want, acc)
	}
}

func TestLoadLegacyFieldsMirrorProduction(t *testing.T) {
	t.Setenv("IMPROVE_API_BASE_URL", "https://prod.example")
	t.Setenv("IMPROVE_ACCEPTANCE_API_BASE_URL", "https://acc.example")
	t.Setenv("IMPROVE_CLIENT_ID", "cid")
	t.Setenv("IMPROVE_CLIENT_SECRET", "csecret")

	cfg := Load()

	if cfg.ImproveAPIBaseURL != "https://prod.example" {
		t.Errorf("ImproveAPIBaseURL: want %q, got %q", "https://prod.example", cfg.ImproveAPIBaseURL)
	}
	if cfg.ImproveClientID != "cid" {
		t.Errorf("ImproveClientID: want %q, got %q", "cid", cfg.ImproveClientID)
	}
	if cfg.ImproveClientSecret != "csecret" {
		t.Errorf("ImproveClientSecret: want %q, got %q", "csecret", cfg.ImproveClientSecret)
	}
}

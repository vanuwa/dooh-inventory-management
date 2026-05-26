package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"dooh-backend/config"
)

// Improve Digital token response shape (non-standard).
const (
	mockTokenBody    = `{"value":"mock-access-token","refreshToken":{"value":"mock-refresh-token"}}`
	mockNewTokenBody = `{"value":"new-access-token","refreshToken":{"value":"new-refresh-token"}}`
	mockUserBody     = `{"id":1,"username":"testuser","email":"test@example.com"}`
)

// mockUpstream starts a test server simulating the Improve Digital API.
func mockUpstream(t *testing.T, routes map[string]http.HandlerFunc) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	for path, h := range routes {
		mux.HandleFunc(path, h)
	}
	s := httptest.NewServer(mux)
	t.Cleanup(s.Close)
	return s
}

// appServer builds the full application handler pointed at the given upstream URL.
func appServer(t *testing.T, upstreamURL string) *httptest.Server {
	t.Helper()
	cfg := &config.Config{
		ImproveAPIBaseURL:   upstreamURL,
		ImproveClientID:     "test-client-id",
		ImproveClientSecret: "test-client-secret",
		FrontendOrigin:      "http://localhost:3000",
		Port:                "0",
	}
	s := httptest.NewServer(newHandler(cfg))
	t.Cleanup(s.Close)
	return s
}

// --- Auth ---

func TestLogin_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/oauth/token": func(w http.ResponseWriter, r *http.Request) {
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			if got := r.FormValue("grant_type"); got != "password" {
				t.Errorf("grant_type: want %q, got %q", "password", got)
			}
			if got := r.FormValue("client_id"); got != "test-client-id" {
				t.Errorf("client_id: want %q, got %q", "test-client-id", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	resp, err := http.Post(app.URL+"/api/auth/login", "application/json",
		strings.NewReader(`{"username":"user","password":"pass"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["access_token"] != "mock-access-token" {
		t.Errorf("access_token: want %q, got %q", "mock-access-token", body["access_token"])
	}
	if body["refresh_token"] != "mock-refresh-token" {
		t.Errorf("refresh_token: want %q, got %q", "mock-refresh-token", body["refresh_token"])
	}
}

func TestLogin_InvalidCredentials(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	resp, err := http.Post(app.URL+"/api/auth/login", "application/json",
		strings.NewReader(`{"username":"bad","password":"creds"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", resp.StatusCode)
	}
}

func TestLogin_MethodNotAllowed(t *testing.T) {
	app := appServer(t, "http://unused")

	resp, err := http.Get(app.URL + "/api/auth/login")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
	}
}

func TestLogin_EmptyBody(t *testing.T) {
	app := appServer(t, "http://unused")

	resp, err := http.Post(app.URL+"/api/auth/login", "application/json",
		strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

// --- Proxy / user details ---

func TestUserDetails_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/common/v1/user-details": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUserBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/user/details", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")
	req.Header.Set("X-Refresh-Token", "mock-refresh-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != mockUserBody {
		t.Errorf("body: want %q, got %q", mockUserBody, string(body))
	}
}

func TestUserDetails_TokenRefreshOnExpiry(t *testing.T) {
	userCallCount := 0

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/common/v1/user-details": func(w http.ResponseWriter, r *http.Request) {
			userCallCount++
			if userCallCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			if got := r.Header.Get("Authorization"); got != "Bearer new-access-token" {
				t.Errorf("retry Authorization: want %q, got %q", "Bearer new-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUserBody))
		},
		"/oauth/token": func(w http.ResponseWriter, r *http.Request) {
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			if got := r.FormValue("grant_type"); got != "refresh_token" {
				t.Errorf("grant_type: want %q, got %q", "refresh_token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/user/details", nil)
	req.Header.Set("X-Access-Token", "expired-token")
	req.Header.Set("X-Refresh-Token", "valid-refresh-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("X-New-Access-Token"); got != "new-access-token" {
		t.Errorf("X-New-Access-Token: want %q, got %q", "new-access-token", got)
	}
	if got := resp.Header.Get("X-New-Refresh-Token"); got != "new-refresh-token" {
		t.Errorf("X-New-Refresh-Token: want %q, got %q", "new-refresh-token", got)
	}
	if userCallCount != 2 {
		t.Errorf("upstream user-details calls: want 2, got %d", userCallCount)
	}
}

func TestUserDetails_RefreshFails_Returns401(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/common/v1/user-details": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/user/details", nil)
	req.Header.Set("X-Access-Token", "expired-token")
	req.Header.Set("X-Refresh-Token", "expired-refresh-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", resp.StatusCode)
	}
}

// --- Placements ---

const (
	mockPublishersBody = `{"publishers":[{"id":42,"name":"Pub One","active":true}],"totalNumberOfElemements":1}`
	mockPlacementsBody = `{"publisher_placements_v2":[{"id":101,"name":"Screen A","placement_status":true},{"id":102,"name":"Screen B","placement_status":false}]}`
)

func TestPlacements_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublishersBody))
		},
		"/publisher/v2/publishers/42/placements": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPlacementsBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/placements", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	var body struct {
		Rows            []map[string]any `json:"rows"`
		TotalPublishers int              `json:"total_publishers"`
		Page            int              `json:"page"`
		Limit           int              `json:"limit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Rows) != 2 {
		t.Errorf("rows: want 2, got %d", len(body.Rows))
	}
	if body.TotalPublishers != 1 {
		t.Errorf("total_publishers: want 1, got %d", body.TotalPublishers)
	}
	if body.Page != 1 {
		t.Errorf("page: want 1, got %d", body.Page)
	}
}

func TestPlacements_TokenRefreshOnExpiry(t *testing.T) {
	publisherCallCount := 0

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, r *http.Request) {
			publisherCallCount++
			if publisherCallCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublishersBody))
		},
		"/publisher/v2/publishers/42/placements": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPlacementsBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/placements", nil)
	req.Header.Set("X-Access-Token", "expired-token")
	req.Header.Set("X-Refresh-Token", "valid-refresh-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("X-New-Access-Token"); got != "new-access-token" {
		t.Errorf("X-New-Access-Token: want %q, got %q", "new-access-token", got)
	}
	if got := resp.Header.Get("X-New-Refresh-Token"); got != "new-refresh-token" {
		t.Errorf("X-New-Refresh-Token: want %q, got %q", "new-refresh-token", got)
	}
}

func TestPlacements_RefreshFails_Returns401(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/placements", nil)
	req.Header.Set("X-Access-Token", "expired-token")
	req.Header.Set("X-Refresh-Token", "expired-refresh-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", resp.StatusCode)
	}
}

// --- Read-only middleware ---

func TestReadOnly_BlocksPost(t *testing.T) {
	app := appServer(t, "http://unused")

	resp, err := http.Post(app.URL+"/api/user/details", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
	}
}

func TestReadOnly_BlocksPut(t *testing.T) {
	app := appServer(t, "http://unused")

	req, _ := http.NewRequest(http.MethodPut, app.URL+"/api/user/details", strings.NewReader("{}"))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
	}
}

func TestReadOnly_BlocksDelete(t *testing.T) {
	app := appServer(t, "http://unused")

	req, _ := http.NewRequest(http.MethodDelete, app.URL+"/api/user/details", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
	}
}

func TestReadOnly_AllowsGetOnProxy(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/common/v1/user-details": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUserBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/user/details", nil)
	req.Header.Set("X-Access-Token", "tok")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("status: want 200, got %d", resp.StatusCode)
	}
}

func TestReadOnly_AuthLoginExemptFromReadOnly(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	// POST to /api/auth/login must not be blocked by read-only middleware.
	resp, err := http.Post(app.URL+"/api/auth/login", "application/json",
		strings.NewReader(`{"username":"u","password":"p"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusMethodNotAllowed {
		t.Error("read-only middleware incorrectly blocked POST /api/auth/login")
	}
}

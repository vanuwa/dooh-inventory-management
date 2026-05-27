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

// --- Publishers ---

const (
	mockPublisherListBody    = `{"publishers":[{"id":42,"name":"Pub One","active":true,"business_unit_name":"Test BU","seller_type":"PUBLISHER","azerion_owned":false}],"totalNumberOfElemements":1}`
	mockPublisherItemBody    = `{"id":42,"name":"Pub One"}`
	mockPubPlacementsBody    = `{"publisher_placements_v2":[{"id":101,"name":"Screen A","placement_status":true,"type":"display"},{"id":102,"name":"Screen B","placement_status":false,"type":"video"}]}`
	mockDoohSettingsBody     = `{"dooh_settings":[{"id":1,"player_id":"PL-001","device_id":"DEV-001","orientation":"LANDSCAPE","resolution_width":1920,"resolution_height":1080,"country_code":"NL","city":"Amsterdam","cpm":5.0,"currency_code":"EUR"}],"totalNumberOfElemements":1}`
	mockReportPreviewBody    = `{"column_order":[{"id":"day","display":"Day"},{"id":"impressions","display":"Impressions"}],"rows":[{"day":"2026-05-20","impressions":"5000"}]}`
	mockGenerationStatusBody = `{"report_generation_id":"abc123","status_name":"FINISHED_OK","report_download_url":"https://cdn.example.com/report.csv"}`
)

func TestPublishers_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			if got := r.URL.Query().Get("sort"); got != "-id" {
				t.Errorf("sort: want %q, got %q", "-id", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublisherListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers", nil)
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
		Publishers []map[string]any `json:"publishers"`
		Total      int              `json:"total"`
		Page       int              `json:"page"`
		Limit      int              `json:"limit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Publishers) != 1 {
		t.Errorf("publishers: want 1, got %d", len(body.Publishers))
	}
	if body.Total != 1 {
		t.Errorf("total: want 1, got %d", body.Total)
	}
	if body.Page != 1 {
		t.Errorf("page: want 1, got %d", body.Page)
	}
}

func TestPublishers_SearchPassthrough(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("search"); got != "test pub" {
				t.Errorf("search: want %q, got %q", "test pub", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublisherListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers?search=test+pub", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
}

func TestPublishers_ActivePassthrough(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("active"); got != "false" {
				t.Errorf("active: want %q, got %q", "false", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublisherListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers?active=false", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
}

func TestPublishers_TokenRefresh(t *testing.T) {
	callCount := 0

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublisherListBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers", nil)
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

func TestPublishers_RefreshFails_Returns401(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers", nil)
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

func TestPublisherDetail_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers/42": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPublisherItemBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["name"] != "Pub One" {
		t.Errorf("name: want %q, got %v", "Pub One", body["name"])
	}
}

func TestPublisherPlacements_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v2/publishers/42/placements": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPubPlacementsBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements", nil)
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
		Placements []map[string]any `json:"placements"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Placements) != 2 {
		t.Errorf("placements: want 2, got %d", len(body.Placements))
	}
}

func TestPublisherPlacements_TokenRefresh(t *testing.T) {
	callCount := 0

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v2/publishers/42/placements": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockPubPlacementsBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements", nil)
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

// --- Placement dooh-settings ---

func TestPlacementDoohSettings_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v1/placements/101/dooh-settings": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockDoohSettingsBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements/101/dooh-settings", nil)
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
		DoohSettings []map[string]any `json:"dooh_settings"`
		Total        int64            `json:"total"`
		Page         int              `json:"page"`
		Limit        int              `json:"limit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.DoohSettings) != 1 {
		t.Errorf("dooh_settings: want 1, got %d", len(body.DoohSettings))
	}
	if body.Total != 1 {
		t.Errorf("total: want 1, got %d", body.Total)
	}
	if body.Page != 1 {
		t.Errorf("page: want 1, got %d", body.Page)
	}
}

func TestPlacementDoohSettings_SearchPassthrough(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v1/placements/101/dooh-settings": func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("search"); got != "Amsterdam" {
				t.Errorf("search: want %q, got %q", "Amsterdam", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockDoohSettingsBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements/101/dooh-settings?search=Amsterdam", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}
}

func TestPlacementDoohSettings_TokenRefresh(t *testing.T) {
	callCount := 0

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v1/placements/101/dooh-settings": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockDoohSettingsBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements/101/dooh-settings", nil)
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

func TestPublishers_ContentRangeFallback(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v1/publishers": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-360-Content-Range", "0 | 20 | 868")
			// totalNumberOfElemements is 0 — real total is only in the header
			w.Write([]byte(`{"publishers":[],"totalNumberOfElemements":0}`))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var body struct {
		Total int `json:"total"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Total != 868 {
		t.Errorf("total: want 868, got %d", body.Total)
	}
}

func TestPlacementDoohSettings_ContentRangeFallback(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/publisher/v1/placements/101/dooh-settings": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-360-Content-Range", "0 | 20 | 450")
			w.Write([]byte(`{"dooh_settings":[],"totalNumberOfElemements":0}`))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/placements/101/dooh-settings", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	var body struct {
		Total int64 `json:"total"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Total != 450 {
		t.Errorf("total: want 450, got %d", body.Total)
	}
}

// --- Placement report ---

func TestPlacementReport_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/preview": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockReportPreviewBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
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
		ColumnOrder []map[string]string `json:"column_order"`
		Rows        []map[string]string `json:"rows"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.ColumnOrder) != 2 {
		t.Errorf("column_order: want 2, got %d", len(body.ColumnOrder))
	}
	if len(body.Rows) != 1 {
		t.Errorf("rows: want 1, got %d", len(body.Rows))
	}
}

func TestPlacementReport_QuickRange(t *testing.T) {
	var capturedBody []byte
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/preview": func(w http.ResponseWriter, r *http.Request) {
			capturedBody, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockReportPreviewBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	var upstreamReq struct {
		Request struct {
			DateRange struct {
				Quick string `json:"quick"`
			} `json:"date_range"`
		} `json:"report_generation_request"`
	}
	if err := json.Unmarshal(capturedBody, &upstreamReq); err != nil {
		t.Fatal(err)
	}
	if upstreamReq.Request.DateRange.Quick != "LAST_7_DAYS" {
		t.Errorf("quick: want %q, got %q", "LAST_7_DAYS", upstreamReq.Request.DateRange.Quick)
	}
}

func TestPlacementReport_FixedRange(t *testing.T) {
	var capturedBody []byte
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/preview": func(w http.ResponseWriter, r *http.Request) {
			capturedBody, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockReportPreviewBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/placement/42/101",
		strings.NewReader(`{"date_range":{"fixed":{"start_date":"2026-05-01","end_date":"2026-05-20"}}}`))
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	var upstreamReq struct {
		Request struct {
			DateRange struct {
				Fixed *struct {
					StartDate string `json:"start_date"`
					EndDate   string `json:"end_date"`
				} `json:"fixed"`
			} `json:"date_range"`
		} `json:"report_generation_request"`
	}
	if err := json.Unmarshal(capturedBody, &upstreamReq); err != nil {
		t.Fatal(err)
	}
	if upstreamReq.Request.DateRange.Fixed == nil {
		t.Fatal("fixed: want non-nil")
	}
	if upstreamReq.Request.DateRange.Fixed.StartDate != "2026-05-01" {
		t.Errorf("start_date: want %q, got %q", "2026-05-01", upstreamReq.Request.DateRange.Fixed.StartDate)
	}
	if upstreamReq.Request.DateRange.Fixed.EndDate != "2026-05-20" {
		t.Errorf("end_date: want %q, got %q", "2026-05-20", upstreamReq.Request.DateRange.Fixed.EndDate)
	}
}

func TestPlacementReport_PlacementFilter(t *testing.T) {
	var capturedBody []byte
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/preview": func(w http.ResponseWriter, r *http.Request) {
			capturedBody, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockReportPreviewBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	var upstreamReq struct {
		Request struct {
			Filters []struct {
				Column string `json:"column"`
				Value  string `json:"value"`
			} `json:"filters"`
		} `json:"report_generation_request"`
	}
	if err := json.Unmarshal(capturedBody, &upstreamReq); err != nil {
		t.Fatal(err)
	}
	if len(upstreamReq.Request.Filters) == 0 {
		t.Fatal("filters: want at least 1")
	}
	if upstreamReq.Request.Filters[0].Column != "placement_id" {
		t.Errorf("filter column: want %q, got %q", "placement_id", upstreamReq.Request.Filters[0].Column)
	}
	if upstreamReq.Request.Filters[0].Value != "101" {
		t.Errorf("filter value: want %q, got %q", "101", upstreamReq.Request.Filters[0].Value)
	}
}

func TestPlacementReport_TokenRefresh(t *testing.T) {
	callCount := 0
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/preview": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockReportPreviewBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
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

// --- Placement report generation ---

func TestGeneratePlacementReport_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/generation": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockGenerationStatusBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/generate/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["report_generation_id"] != "abc123" {
		t.Errorf("report_generation_id: want %q, got %v", "abc123", body["report_generation_id"])
	}
}

func TestGeneratePlacementReport_ReportFormatIsCSV(t *testing.T) {
	var capturedBody []byte
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/generation": func(w http.ResponseWriter, r *http.Request) {
			capturedBody, _ = io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockGenerationStatusBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/generate/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()

	var upstreamReq struct {
		ReportFormat string `json:"report_format"`
	}
	if err := json.Unmarshal(capturedBody, &upstreamReq); err != nil {
		t.Fatal(err)
	}
	if upstreamReq.ReportFormat != "CSV" {
		t.Errorf("report_format: want %q, got %q", "CSV", upstreamReq.ReportFormat)
	}
}

func TestGeneratePlacementReport_TokenRefresh(t *testing.T) {
	callCount := 0
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/generation": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockGenerationStatusBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodPost, app.URL+"/api/report/generate/placement/42/101",
		strings.NewReader(`{"date_range":{"quick":"LAST_7_DAYS"}}`))
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

func TestPlacementReportStatus_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/generation-status/abc123": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockGenerationStatusBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/report/status/abc123", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status_name"] != "FINISHED_OK" {
		t.Errorf("status_name: want %q, got %v", "FINISHED_OK", body["status_name"])
	}
	if body["report_download_url"] == "" {
		t.Error("report_download_url: want non-empty")
	}
}

func TestPlacementReportStatus_TokenRefresh(t *testing.T) {
	callCount := 0
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/report/generation-status/abc123": func(w http.ResponseWriter, _ *http.Request) {
			callCount++
			if callCount == 1 {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockGenerationStatusBody))
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/report/status/abc123", nil)
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

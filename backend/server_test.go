package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
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

func TestRefresh_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/oauth/token": func(w http.ResponseWriter, r *http.Request) {
			if err := r.ParseForm(); err != nil {
				t.Fatalf("parse form: %v", err)
			}
			if got := r.FormValue("grant_type"); got != "refresh_token" {
				t.Errorf("grant_type: want %q, got %q", "refresh_token", got)
			}
			if got := r.FormValue("refresh_token"); got != "mock-refresh-token" {
				t.Errorf("refresh_token: want %q, got %q", "mock-refresh-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockNewTokenBody))
		},
	})

	app := appServer(t, upstream.URL)

	resp, err := http.Post(app.URL+"/api/auth/refresh", "application/json",
		strings.NewReader(`{"refresh_token":"mock-refresh-token"}`))
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
	if body["access_token"] != "new-access-token" {
		t.Errorf("access_token: want %q, got %q", "new-access-token", body["access_token"])
	}
	if body["refresh_token"] != "new-refresh-token" {
		t.Errorf("refresh_token: want %q, got %q", "new-refresh-token", body["refresh_token"])
	}
}

func TestRefresh_MissingToken(t *testing.T) {
	app := appServer(t, "http://unused")

	resp, err := http.Post(app.URL+"/api/auth/refresh", "application/json",
		strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("status: want 400, got %d", resp.StatusCode)
	}
}

func TestRefresh_UpstreamRejects_Returns401(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	resp, err := http.Post(app.URL+"/api/auth/refresh", "application/json",
		strings.NewReader(`{"refresh_token":"expired-refresh-token"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", resp.StatusCode)
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

// Refresh is client-driven: the backend passes upstream 401s through untouched
// so the frontend can refresh via POST /api/auth/refresh and retry.
func TestUserDetails_Upstream401PassesThrough(t *testing.T) {
	refreshCalled := false

	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/common/v1/user-details": func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusUnauthorized)
		},
		"/oauth/token": func(w http.ResponseWriter, _ *http.Request) {
			refreshCalled = true
			w.WriteHeader(http.StatusUnauthorized)
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/user/details", nil)
	req.Header.Set("X-Access-Token", "expired-token")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("status: want 401, got %d", resp.StatusCode)
	}
	if refreshCalled {
		t.Error("backend must not call /oauth/token; refresh is client-driven")
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

// --- Publisher users ---

const mockUsersListBody = `{"users":[{"id":101,"first_name":"Ivan","last_name":"Test","email":"ivan@test.com","user_type":"Publisher","user_access":"Console","active":true,"lastLoginTime":"2026-06-01T09:00:00Z"}],"totalNumberOfElemements":1}`

func TestPublisherUsers_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			if got := r.URL.Query().Get("sort"); got != "-id" {
				t.Errorf("sort: want %q, got %q", "-id", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUsersListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/users", nil)
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
		Users []map[string]any `json:"users"`
		Total int64            `json:"total"`
		Page  int              `json:"page"`
		Limit int              `json:"limit"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Users) != 1 {
		t.Errorf("users: want 1, got %d", len(body.Users))
	}
	if body.Total != 1 {
		t.Errorf("total: want 1, got %d", body.Total)
	}
	if body.Page != 1 {
		t.Errorf("page: want 1, got %d", body.Page)
	}
	if u := body.Users[0]; u["last_login"] != "2026-06-01T09:00:00Z" {
		t.Errorf("last_login: want %q, got %v", "2026-06-01T09:00:00Z", u["last_login"])
	}
}

func TestPublisherUsers_EntityParam(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("entity"); got != "99" {
				t.Errorf("entity: want %q, got %q", "99", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUsersListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/99/users", nil)
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

func TestPublisherUsers_FiltersPassthrough(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("search"); got != "Ivan" {
				t.Errorf("search: want %q, got %q", "Ivan", got)
			}
			if got := r.URL.Query().Get("user_access"); got != "Console" {
				t.Errorf("user_access: want %q, got %q", "Console", got)
			}
			if got := r.URL.Query().Get("active"); got != "true" {
				t.Errorf("active: want %q, got %q", "true", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUsersListBody))
		},
	})

	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/users?search=Ivan&user_access=Console&active=true", nil)
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

// --- Create publisher user ---

func validCreateUserBody() map[string]any {
	return map[string]any{
		"user_access": "CONSOLE",
		"first_name":  "Jane",
		"last_name":   "Doe",
		"email":       "jane@pub.com",
		"publishers":  []map[string]any{{"id": 42, "name": "Test Pub"}},
		"accesses": map[string]string{
			"reports":    "Show",
			"operations": "Hide",
			"settings":   "Hide",
			"invoices":   "Hide",
			"inventory":  "Hide",
			"clients":    "Hide",
		},
	}
}

func postCreateUser(t *testing.T, appURL string, body map[string]any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest(http.MethodPost, appURL+"/api/publishers/42/users", bytes.NewReader(raw))
	req.Header.Set("X-Access-Token", "mock-access-token")
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func roleNames(payload map[string]any) map[string]bool {
	names := map[string]bool{}
	roles, _ := payload["roles"].([]any)
	for _, r := range roles {
		role := r.(map[string]any)
		names[role["name"].(string)] = true
		if rt := role["role_type"]; rt != "PUBLISHER" {
			names["BAD_ROLE_TYPE:"+role["name"].(string)] = true
		}
	}
	return names
}

func TestCreatePublisherUser_ConsoleSuccess(t *testing.T) {
	var upstreamPayload map[string]any
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost {
				t.Errorf("method: want POST, got %s", r.Method)
			}
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			if err := json.NewDecoder(r.Body).Decode(&upstreamPayload); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"id":555,"first_name":"Jane"}`))
		},
	})
	app := appServer(t, upstream.URL)

	body := validCreateUserBody()
	body["accesses"].(map[string]string)["settings"] = "Read Only"
	resp := postCreateUser(t, app.URL, body)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status: want 201, got %d", resp.StatusCode)
	}

	if got := upstreamPayload["user_type"]; got != "PUBLISHER" {
		t.Errorf("user_type: want PUBLISHER, got %v", got)
	}
	if got := upstreamPayload["user_access"]; got != "CONSOLE" {
		t.Errorf("user_access: want CONSOLE, got %v", got)
	}
	if got := upstreamPayload["status"]; got != "Regular" {
		t.Errorf("status: want Regular, got %v", got)
	}
	if got := upstreamPayload["active"]; got != true {
		t.Errorf("active: want true, got %v", got)
	}
	if got := upstreamPayload["exempt_remote_address_rule"]; got != true {
		t.Errorf("exempt_remote_address_rule: want true, got %v", got)
	}
	if _, present := upstreamPayload["destination_email"]; present {
		t.Error("destination_email must be omitted for CONSOLE users")
	}

	wantRoles := map[string]bool{
		"REPORTS_READ_ONLY_PUBLISHER":  true,
		"CHARTS_READ_ONLY_PUBLISHER":   true,
		"SETTINGS_READ_ONLY_PUBLISHER": true,
	}
	if got := roleNames(upstreamPayload); !reflect.DeepEqual(got, wantRoles) {
		t.Errorf("roles: want %v, got %v", wantRoles, got)
	}

	pubs, _ := upstreamPayload["publishers"].([]any)
	if len(pubs) != 1 {
		t.Fatalf("publishers: want 1, got %d", len(pubs))
	}
	if pub := pubs[0].(map[string]any); pub["id"] != float64(42) || pub["name"] != "Test Pub" {
		t.Errorf("publisher: want {42 Test Pub}, got %v", pub)
	}

	var created map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	if created["id"] != float64(555) {
		t.Errorf("created id: want 555, got %v", created["id"])
	}
}

func TestCreatePublisherUser_APISuccess(t *testing.T) {
	var upstreamPayload map[string]any
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if err := json.NewDecoder(r.Body).Decode(&upstreamPayload); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte(`{"id":556,"clientId":"abc"}`))
		},
	})
	app := appServer(t, upstream.URL)

	body := validCreateUserBody()
	body["user_access"] = "API"
	body["destination_email"] = "ops@improvedigital.com"
	body["accesses"] = map[string]string{
		"reports":    "Show",
		"operations": "Hide",
		"settings":   "Create",
		"invoices":   "Show",
		"inventory":  "Create",
		"clients":    "Hide",
	}
	resp := postCreateUser(t, app.URL, body)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status: want 201, got %d", resp.StatusCode)
	}
	if got := upstreamPayload["user_access"]; got != "API" {
		t.Errorf("user_access: want API, got %v", got)
	}
	if got := upstreamPayload["destination_email"]; got != "ops@improvedigital.com" {
		t.Errorf("destination_email: want ops@improvedigital.com, got %v", got)
	}

	wantRoles := map[string]bool{
		"REPORTS_READ_ONLY_PUBLISHER":   true,
		"CHARTS_READ_ONLY_PUBLISHER":    true,
		"SETTINGS_PUBLISHER":            true,
		"SETTINGS_READ_ONLY_PUBLISHER":  true,
		"INVOICES_READ_ONLY_PUBLISHER":  true,
		"INVENTORY_PUBLISHER":           true,
		"INVENTORY_READ_ONLY_PUBLISHER": true,
	}
	if got := roleNames(upstreamPayload); !reflect.DeepEqual(got, wantRoles) {
		t.Errorf("roles: want %v, got %v", wantRoles, got)
	}
}

func TestCreatePublisherUser_ValidationErrors(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users": func(_ http.ResponseWriter, _ *http.Request) {
			t.Error("upstream must not be called for invalid requests")
		},
	})
	app := appServer(t, upstream.URL)

	cases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"bad user_access", func(b map[string]any) { b["user_access"] = "Publisher" }},
		{"missing first_name", func(b map[string]any) { b["first_name"] = " " }},
		{"missing email", func(b map[string]any) { b["email"] = "" }},
		{"missing destination_email for API", func(b map[string]any) { b["user_access"] = "API" }},
		{"no publishers", func(b map[string]any) { b["publishers"] = []map[string]any{} }},
		{"all accesses Hide", func(b map[string]any) { b["accesses"].(map[string]string)["reports"] = "Hide" }},
		{"invalid access value", func(b map[string]any) { b["accesses"].(map[string]string)["invoices"] = "Create" }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := validCreateUserBody()
			tc.mutate(body)
			resp := postCreateUser(t, app.URL, body)
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("status: want 400, got %d", resp.StatusCode)
			}
			var errBody struct {
				Message string `json:"message"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&errBody); err != nil {
				t.Fatal(err)
			}
			if errBody.Message == "" {
				t.Error("error message must not be empty")
			}
		})
	}
}

func TestCreatePublisherUser_DeleteStillBlocked(t *testing.T) {
	upstream := mockUpstream(t, nil)
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodDelete, app.URL+"/api/publishers/42/users", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
	}
}

// --- Get / update publisher user ---

// Upstream UserV2Dto for user 77: mapped roles (reports Show, settings Create,
// inventory Read Only) plus PUBLISHER_DEFAULT and an unmanaged custom role.
const mockUserDetailBody = `{
	"id": 77,
	"first_name": "Old",
	"last_name": "Name",
	"email": "old@pub.com",
	"user_type": "PUBLISHER",
	"user_access": "CONSOLE",
	"status": "Regular",
	"active": true,
	"exempt_remote_address_rule": true,
	"business_unit": {"id": 3, "name": "Test BU"},
	"roles": [
		{"name": "PUBLISHER_DEFAULT", "role_type": "PUBLISHER"},
		{"name": "REPORTS_READ_ONLY_PUBLISHER", "role_type": "PUBLISHER"},
		{"name": "CHARTS_READ_ONLY_PUBLISHER", "role_type": "PUBLISHER"},
		{"name": "SETTINGS_PUBLISHER", "role_type": "PUBLISHER"},
		{"name": "SETTINGS_READ_ONLY_PUBLISHER", "role_type": "PUBLISHER"},
		{"name": "INVENTORY_READ_ONLY_PUBLISHER", "role_type": "PUBLISHER"},
		{"name": "SOME_CUSTOM_ROLE", "role_type": "PUBLISHER"}
	],
	"publishers": [{"id": 42, "name": "Test Pub"}]
}`

func validUpdateUserBody() map[string]any {
	return map[string]any{
		"first_name": "New",
		"last_name":  "Name",
		"email":      "new@pub.com",
		"active":     false,
		"publishers": []map[string]any{{"id": 43, "name": "Other Pub"}},
		"accesses": map[string]string{
			"reports":    "Show",
			"operations": "Hide",
			"settings":   "Hide",
			"invoices":   "Show",
			"inventory":  "Hide",
			"clients":    "Hide",
		},
	}
}

func putUpdateUser(t *testing.T, appURL string, body map[string]any) *http.Response {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest(http.MethodPut, appURL+"/api/publishers/42/users/77", bytes.NewReader(raw))
	req.Header.Set("X-Access-Token", "mock-access-token")
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestGetPublisherUser_Success(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users/77": func(w http.ResponseWriter, r *http.Request) {
			if got := r.Header.Get("Authorization"); got != "Bearer mock-access-token" {
				t.Errorf("Authorization: want %q, got %q", "Bearer mock-access-token", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUserDetailBody))
		},
	})
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodGet, app.URL+"/api/publishers/42/users/77", nil)
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
	if body["id"] != float64(77) {
		t.Errorf("id: want 77, got %v", body["id"])
	}
	if body["user_type"] != "PUBLISHER" || body["user_access"] != "CONSOLE" {
		t.Errorf("type/access: want PUBLISHER/CONSOLE, got %v/%v", body["user_type"], body["user_access"])
	}
	if body["active"] != true {
		t.Errorf("active: want true, got %v", body["active"])
	}

	wantAccesses := map[string]any{
		"reports":    "Show",
		"operations": "Hide",
		"settings":   "Create",
		"invoices":   "Hide",
		"inventory":  "Read Only",
		"clients":    "Hide",
	}
	if got := body["accesses"]; !reflect.DeepEqual(got, wantAccesses) {
		t.Errorf("accesses: want %v, got %v", wantAccesses, got)
	}

	pubs, _ := body["publishers"].([]any)
	if len(pubs) != 1 {
		t.Fatalf("publishers: want 1, got %d", len(pubs))
	}
	if pub := pubs[0].(map[string]any); pub["id"] != float64(42) || pub["name"] != "Test Pub" {
		t.Errorf("publisher: want {42 Test Pub}, got %v", pub)
	}
}

func TestUpdatePublisherUser_Success(t *testing.T) {
	var upstreamPayload map[string]any
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users/77": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(mockUserDetailBody))
		},
		"/admin/v2/users": func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPut {
				t.Errorf("method: want PUT, got %s", r.Method)
			}
			if err := json.NewDecoder(r.Body).Decode(&upstreamPayload); err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"id":77,"first_name":"New"}`))
		},
	})
	app := appServer(t, upstream.URL)

	resp := putUpdateUser(t, app.URL, validUpdateUserBody())
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: want 200, got %d", resp.StatusCode)
	}

	// Editable fields overridden.
	if upstreamPayload["first_name"] != "New" || upstreamPayload["last_name"] != "Name" || upstreamPayload["email"] != "new@pub.com" {
		t.Errorf("profile: got %v %v %v", upstreamPayload["first_name"], upstreamPayload["last_name"], upstreamPayload["email"])
	}
	if upstreamPayload["active"] != false {
		t.Errorf("active: want false, got %v", upstreamPayload["active"])
	}

	// Untouched fields echoed from the fetched user.
	if upstreamPayload["id"] != float64(77) {
		t.Errorf("id: want 77, got %v", upstreamPayload["id"])
	}
	if upstreamPayload["user_type"] != "PUBLISHER" || upstreamPayload["user_access"] != "CONSOLE" {
		t.Errorf("type/access: want PUBLISHER/CONSOLE, got %v/%v", upstreamPayload["user_type"], upstreamPayload["user_access"])
	}
	if upstreamPayload["status"] != "Regular" {
		t.Errorf("status: want Regular, got %v", upstreamPayload["status"])
	}
	if upstreamPayload["exempt_remote_address_rule"] != true {
		t.Errorf("exempt_remote_address_rule: want true, got %v", upstreamPayload["exempt_remote_address_rule"])
	}
	if bu, _ := upstreamPayload["business_unit"].(map[string]any); bu == nil || bu["id"] != float64(3) {
		t.Errorf("business_unit must be echoed, got %v", upstreamPayload["business_unit"])
	}

	// Roles rebuilt from accesses; unmanaged role preserved; PUBLISHER_DEFAULT
	// and the previous settings/inventory roles gone.
	wantRoles := map[string]bool{
		"REPORTS_READ_ONLY_PUBLISHER":  true,
		"CHARTS_READ_ONLY_PUBLISHER":   true,
		"INVOICES_READ_ONLY_PUBLISHER": true,
		"SOME_CUSTOM_ROLE":             true,
	}
	if got := roleNames(upstreamPayload); !reflect.DeepEqual(got, wantRoles) {
		t.Errorf("roles: want %v, got %v", wantRoles, got)
	}

	// Publishers replaced wholesale.
	pubs, _ := upstreamPayload["publishers"].([]any)
	if len(pubs) != 1 {
		t.Fatalf("publishers: want 1, got %d", len(pubs))
	}
	if pub := pubs[0].(map[string]any); pub["id"] != float64(43) || pub["name"] != "Other Pub" {
		t.Errorf("publisher: want {43 Other Pub}, got %v", pub)
	}
}

func TestUpdatePublisherUser_RejectsNonPublisher(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users/77": func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"id":77,"user_type":"ADMIN","roles":[],"publishers":[]}`))
		},
		"/admin/v2/users": func(_ http.ResponseWriter, _ *http.Request) {
			t.Error("upstream PUT must not be called for non-Publisher users")
		},
	})
	app := appServer(t, upstream.URL)

	resp := putUpdateUser(t, app.URL, validUpdateUserBody())
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", resp.StatusCode)
	}
	var errBody struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&errBody); err != nil {
		t.Fatal(err)
	}
	if errBody.Message == "" {
		t.Error("error message must not be empty")
	}
}

func TestUpdatePublisherUser_ValidationErrors(t *testing.T) {
	upstream := mockUpstream(t, map[string]http.HandlerFunc{
		"/admin/v2/users/77": func(_ http.ResponseWriter, _ *http.Request) {
			t.Error("upstream must not be called for invalid requests")
		},
		"/admin/v2/users": func(_ http.ResponseWriter, _ *http.Request) {
			t.Error("upstream must not be called for invalid requests")
		},
	})
	app := appServer(t, upstream.URL)

	cases := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"missing first_name", func(b map[string]any) { b["first_name"] = " " }},
		{"missing email", func(b map[string]any) { b["email"] = "" }},
		{"no publishers", func(b map[string]any) { b["publishers"] = []map[string]any{} }},
		{"all accesses Hide", func(b map[string]any) {
			b["accesses"].(map[string]string)["reports"] = "Hide"
			b["accesses"].(map[string]string)["invoices"] = "Hide"
		}},
		{"invalid access value", func(b map[string]any) { b["accesses"].(map[string]string)["reports"] = "Create" }},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := validUpdateUserBody()
			tc.mutate(body)
			resp := putUpdateUser(t, app.URL, body)
			defer resp.Body.Close()

			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("status: want 400, got %d", resp.StatusCode)
			}
			var errBody struct {
				Message string `json:"message"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&errBody); err != nil {
				t.Fatal(err)
			}
			if errBody.Message == "" {
				t.Error("error message must not be empty")
			}
		})
	}
}

func TestUpdatePublisherUser_DeleteStillBlocked(t *testing.T) {
	upstream := mockUpstream(t, nil)
	app := appServer(t, upstream.URL)

	req, _ := http.NewRequest(http.MethodDelete, app.URL+"/api/publishers/42/users/77", nil)
	req.Header.Set("X-Access-Token", "mock-access-token")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusMethodNotAllowed {
		t.Errorf("status: want 405, got %d", resp.StatusCode)
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

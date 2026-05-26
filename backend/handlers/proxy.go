package handlers

import (
	"io"
	"net/http"
	"net/url"

	"dooh-backend/config"
)

// ProxyHandler proxies requests to the Improve Digital API with transparent token refresh.
type ProxyHandler struct {
	cfg *config.Config
}

func NewProxyHandler(cfg *config.Config) *ProxyHandler {
	return &ProxyHandler{cfg: cfg}
}

// UserDetails handles GET /api/user/details.
func (h *ProxyHandler) UserDetails(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.proxy(w, r, http.MethodGet, "/common/v1/user-details")
}

// proxy forwards a request to the Improve API and handles 401 with token refresh + retry.
func (h *ProxyHandler) proxy(w http.ResponseWriter, r *http.Request, method, upstreamPath string) {
	accessToken := r.Header.Get("X-Access-Token")
	refreshToken := r.Header.Get("X-Refresh-Token")

	body, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, method, upstreamPath, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, headers, _, ok = refreshAndRetry(h.cfg, w, method, upstreamPath, refreshToken)
		if !ok {
			return
		}
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(body)
}

// refreshAndRetry refreshes the OAuth token and retries the request.
// Sets X-New-Access-Token / X-New-Refresh-Token on w if successful.
// Returns (body, status, contentType, newAccessToken, ok); ok=false means a response was already written.
func refreshAndRetry(cfg *config.Config, w http.ResponseWriter, method, path, refreshToken string) ([]byte, int, http.Header, string, bool) {
	params := url.Values{}
	params.Set("grant_type", "refresh_token")
	params.Set("refresh_token", refreshToken)

	newTokens, err := fetchToken(cfg.ImproveAPIBaseURL, cfg.ImproveClientID, cfg.ImproveClientSecret, params)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, 0, nil, "", false
	}

	body, status, headers, err := doRequest(cfg.ImproveAPIBaseURL, method, path, newTokens.AccessToken)
	if err != nil {
		http.Error(w, "upstream request failed after token refresh", http.StatusBadGateway)
		return nil, 0, nil, "", false
	}

	w.Header().Set("X-New-Access-Token", newTokens.AccessToken)
	w.Header().Set("X-New-Refresh-Token", newTokens.RefreshToken)
	return body, status, headers, newTokens.AccessToken, true
}

func doRequest(baseURL, method, path, accessToken string) ([]byte, int, http.Header, error) {
	req, err := http.NewRequest(method, baseURL+path, nil)
	if err != nil {
		return nil, 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, nil, err
	}

	return body, resp.StatusCode, resp.Header, nil
}

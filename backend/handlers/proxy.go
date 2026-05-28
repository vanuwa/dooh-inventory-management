package handlers

import (
	"bytes"
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

	body, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, method, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, headers, _, ok = refreshAndRetry(h.cfg, w, method, upstreamPath, refreshToken, nil, "")
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

// doRequest makes an HTTP request to the upstream API.
// Pass nil body and empty contentType for bodyless requests (GET).
func doRequest(baseURL, method, path, accessToken string, body []byte, contentType string) ([]byte, int, http.Header, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, baseURL+path, bodyReader)
	if err != nil {
		return nil, 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, nil, err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, resp.Header, err
}

// refreshAndRetry refreshes the OAuth token and retries the request.
// Pass nil body and empty contentType for bodyless requests (GET).
// Sets X-New-Access-Token / X-New-Refresh-Token on w if successful.
// Returns ok=false when a response has already been written to w.
func refreshAndRetry(cfg *config.Config, w http.ResponseWriter, method, path, refreshToken string, body []byte, contentType string) ([]byte, int, http.Header, string, bool) {
	params := url.Values{}
	params.Set("grant_type", "refresh_token")
	params.Set("refresh_token", refreshToken)

	newTokens, err := fetchToken(cfg.ImproveAPIBaseURL, cfg.ImproveClientID, cfg.ImproveClientSecret, params)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return nil, 0, nil, "", false
	}

	respBody, status, headers, err := doRequest(cfg.ImproveAPIBaseURL, method, path, newTokens.AccessToken, body, contentType)
	if err != nil {
		http.Error(w, "upstream request failed after token refresh", http.StatusBadGateway)
		return nil, 0, nil, "", false
	}

	w.Header().Set("X-New-Access-Token", newTokens.AccessToken)
	w.Header().Set("X-New-Refresh-Token", newTokens.RefreshToken)
	return respBody, status, headers, newTokens.AccessToken, true
}

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

	body, status, contentType, err := h.doRequest(method, upstreamPath, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		params := url.Values{}
		params.Set("grant_type", "refresh_token")
		params.Set("refresh_token", refreshToken)

		newTokens, err := fetchToken(h.cfg.ImproveAPIBaseURL, h.cfg.ImproveClientID, h.cfg.ImproveClientSecret, params)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		body, status, contentType, err = h.doRequest(method, upstreamPath, newTokens.AccessToken)
		if err != nil {
			http.Error(w, "upstream request failed after token refresh", http.StatusBadGateway)
			return
		}

		w.Header().Set("X-New-Access-Token", newTokens.AccessToken)
		w.Header().Set("X-New-Refresh-Token", newTokens.RefreshToken)
	}

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(status)
	w.Write(body)
}

func (h *ProxyHandler) doRequest(method, path, accessToken string) ([]byte, int, string, error) {
	req, err := http.NewRequest(method, h.cfg.ImproveAPIBaseURL+path, nil)
	if err != nil {
		return nil, 0, "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, "", err
	}

	return body, resp.StatusCode, resp.Header.Get("Content-Type"), nil
}

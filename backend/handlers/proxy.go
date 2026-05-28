package handlers

import (
	"bytes"
	"io"
	"net/http"

	"dooh-backend/config"
)

// ProxyHandler proxies requests to the Improve Digital API.
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

// proxy forwards a request to the Improve API.
func (h *ProxyHandler) proxy(w http.ResponseWriter, r *http.Request, method, upstreamPath string) {
	accessToken := r.Header.Get("X-Access-Token")

	body, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, method, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
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

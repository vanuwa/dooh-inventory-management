package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"dooh-backend/config"
)

// EnvHeader names the upstream environment a request is addressed to.
// An absent header means production.
const EnvHeader = "X-Api-Env"

// upstreamEnv resolves the upstream instance for this request. An absent header
// selects production; apiEnvMiddleware rejects unknown names before routing, so
// the not-ok case cannot be reached with a configured Config.
func upstreamEnv(cfg *config.Config, r *http.Request) config.Environment {
	env, _ := cfg.Env(r.Header.Get(EnvHeader))
	return env
}

// upstreamBaseURL is the base URL of the environment this request selected.
func upstreamBaseURL(cfg *config.Config, r *http.Request) string {
	return upstreamEnv(cfg, r).BaseURL
}

// ProxyHandler proxies requests to the Improve Digital API.
type ProxyHandler struct {
	cfg *config.Config
}

func NewProxyHandler(cfg *config.Config) *ProxyHandler {
	return &ProxyHandler{cfg: cfg}
}

// UserDetails handles GET /api/user/details.
func (h *ProxyHandler) UserDetails(w http.ResponseWriter, r *http.Request) {
	h.proxy(w, r, http.MethodGet, "/common/v1/user-details")
}

// proxy forwards a request to the Improve API.
func (h *ProxyHandler) proxy(w http.ResponseWriter, r *http.Request, method, upstreamPath string) {
	accessToken := r.Header.Get("X-Access-Token")

	body, status, headers, err := doRequest(upstreamBaseURL(h.cfg, r), method, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	writeProxyResponse(w, status, body, headers)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeProxyResponse(w http.ResponseWriter, status int, body []byte, headers http.Header) {
	// The same URL returns different data per environment, so no cache may reuse a
	// response across a switch.
	w.Header().Set("Vary", EnvHeader)
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

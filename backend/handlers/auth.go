package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"

	"dooh-backend/config"
)

// tokenResponse is the normalized token shape returned to the frontend.
type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// improveTokenResponse matches the non-standard 360Yield token response shape.
type improveTokenResponse struct {
	Value        string `json:"value"`
	RefreshToken struct {
		Value string `json:"value"`
	} `json:"refreshToken"`
}

// fetchToken calls /oauth/token and normalizes the response.
// params must contain grant_type and any grant-specific fields (username/password or refresh_token).
func fetchToken(baseURL, clientID, clientSecret string, params url.Values) (*tokenResponse, error) {
	params.Set("client_id", clientID)
	params.Set("client_secret", clientSecret)

	resp, err := http.PostForm(baseURL+"/oauth/token", params)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token request returned status %d", resp.StatusCode)
	}

	var raw improveTokenResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("failed to parse token response")
	}

	return &tokenResponse{
		AccessToken:  raw.Value,
		RefreshToken: raw.RefreshToken.Value,
	}, nil
}

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login handles POST /api/auth/login.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	params := url.Values{}
	params.Set("grant_type", "password")
	params.Set("username", req.Username)
	params.Set("password", req.Password)

	tokens, err := fetchToken(h.cfg.ImproveAPIBaseURL, h.cfg.ImproveClientID, h.cfg.ImproveClientSecret, params)
	if err != nil {
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}

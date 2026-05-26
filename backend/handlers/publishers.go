package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"

	"dooh-backend/config"
)

type PublisherItem struct {
	ID                 int64  `json:"id"`
	Name               string `json:"name"`
	Active             bool   `json:"active"`
	BusinessUnitName   string `json:"business_unit_name"`
	SellerType         string `json:"seller_type"`
	AzerionOwned       bool   `json:"azerion_owned"`
	SupplyProviderName string `json:"supply_provider_name"`
}

type publishersListWrapper struct {
	Publishers              []PublisherItem `json:"publishers"`
	TotalNumberOfElemements int             `json:"totalNumberOfElemements"` // upstream API has this typo
}

type publishersListResponse struct {
	Publishers []PublisherItem `json:"publishers"`
	Total      int             `json:"total"`
	Page       int             `json:"page"`
	Limit      int             `json:"limit"`
}

type PublisherPlacement struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	PlacementStatus bool   `json:"placement_status"`
	CreativeType    string `json:"type"`
}

type publisherPlacementsWrapper struct {
	Placements []PublisherPlacement `json:"publisher_placements_v2"`
}

type publisherPlacementsResponse struct {
	Placements []PublisherPlacement `json:"placements"`
}

type PublishersHandler struct {
	cfg *config.Config
}

func NewPublishersHandler(cfg *config.Config) *PublishersHandler {
	return &PublishersHandler{cfg: cfg}
}

func (h *PublishersHandler) Publishers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	accessToken := r.Header.Get("X-Access-Token")
	refreshToken := r.Header.Get("X-Refresh-Token")

	page, limit := 1, 20
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 100 {
		limit = 100
	}
	offset := (page - 1) * limit

	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	params.Set("offset", strconv.Itoa(offset))
	params.Set("sort", "-id")

	if active := r.URL.Query().Get("active"); active != "" {
		params.Set("active", active)
	}
	if search := r.URL.Query().Get("search"); search != "" {
		params.Set("search", search)
	}

	upstreamPath := "/admin/v1/publishers?" + params.Encode()

	body, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, upstreamPath, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, _, _, ok = refreshAndRetry(h.cfg, w, http.MethodGet, upstreamPath, refreshToken)
		if !ok {
			return
		}
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var wrapper publishersListWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse publishers response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(publishersListResponse{
		Publishers: wrapper.Publishers,
		Total:      wrapper.TotalNumberOfElemements,
		Page:       page,
		Limit:      limit,
	})
}

func (h *PublishersHandler) Publisher(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	accessToken := r.Header.Get("X-Access-Token")
	refreshToken := r.Header.Get("X-Refresh-Token")

	path := "/admin/v1/publishers/" + id

	body, status, contentType, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, contentType, _, ok = refreshAndRetry(h.cfg, w, http.MethodGet, path, refreshToken)
		if !ok {
			return
		}
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.Write(body)
}

func (h *PublishersHandler) PublisherPlacements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := r.PathValue("id")
	accessToken := r.Header.Get("X-Access-Token")
	refreshToken := r.Header.Get("X-Refresh-Token")

	path := fmt.Sprintf("/publisher/v2/publishers/%s/placements", id)

	body, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, _, _, ok = refreshAndRetry(h.cfg, w, http.MethodGet, path, refreshToken)
		if !ok {
			return
		}
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var wrapper publisherPlacementsWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse placements response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(publisherPlacementsResponse{
		Placements: wrapper.Placements,
	})
}

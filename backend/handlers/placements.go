package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"

	"dooh-backend/config"
)

type PlacementRow struct {
	PublisherID     int64  `json:"publisher_id"`
	PublisherName   string `json:"publisher_name"`
	PublisherStatus bool   `json:"publisher_status"`
	PlacementID     int64  `json:"placement_id"`
	PlacementName   string `json:"placement_name"`
	PlacementStatus bool   `json:"placement_status"`
}

type publisher struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

type publishersWrapper struct {
	Publishers              []publisher `json:"publishers"`
	TotalNumberOfElemements int         `json:"totalNumberOfElemements"` // upstream API has this typo
}

type placementItem struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	PlacementStatus bool   `json:"placement_status"`
}

type placementsWrapper struct {
	Placements []placementItem `json:"publisher_placements_v2"`
}

type placementsResponse struct {
	Rows            []PlacementRow `json:"rows"`
	TotalPublishers int            `json:"total_publishers"`
	Page            int            `json:"page"`
	Limit           int            `json:"limit"`
}

type PlacementsHandler struct {
	cfg *config.Config
}

func NewPlacementsHandler(cfg *config.Config) *PlacementsHandler {
	return &PlacementsHandler{cfg: cfg}
}

func (h *PlacementsHandler) Placements(w http.ResponseWriter, r *http.Request) {
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

	publishersPath := fmt.Sprintf("/admin/v1/publishers?limit=%d&offset=%d", limit, offset)

	body, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, publishersPath, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		body, status, _, accessToken, ok = refreshAndRetry(h.cfg, w, http.MethodGet, publishersPath, refreshToken)
		if !ok {
			return
		}
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var pubs publishersWrapper
	if err := json.Unmarshal(body, &pubs); err != nil {
		http.Error(w, "failed to parse publishers response", http.StatusInternalServerError)
		return
	}

	rowsByPub := make([][]PlacementRow, len(pubs.Publishers))
	var wg sync.WaitGroup
	for i, pub := range pubs.Publishers {
		wg.Add(1)
		go func(i int, pub publisher) {
			defer wg.Done()
			path := fmt.Sprintf("/publisher/v2/publishers/%d/placements", pub.ID)
			body, _, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken)
			if err != nil {
				return
			}
			var plResp placementsWrapper
			if err := json.Unmarshal(body, &plResp); err != nil {
				return
			}
			rows := make([]PlacementRow, len(plResp.Placements))
			for j, pl := range plResp.Placements {
				rows[j] = PlacementRow{
					PublisherID:     pub.ID,
					PublisherName:   pub.Name,
					PublisherStatus: pub.Active,
					PlacementID:     pl.ID,
					PlacementName:   pl.Name,
					PlacementStatus: pl.PlacementStatus,
				}
			}
			rowsByPub[i] = rows
		}(i, pub)
	}
	wg.Wait()

	rows := make([]PlacementRow, 0)
	for _, r := range rowsByPub {
		rows = append(rows, r...)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(placementsResponse{
		Rows:            rows,
		TotalPublishers: pubs.TotalNumberOfElemements,
		Page:            page,
		Limit:           limit,
	})
}

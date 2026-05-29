package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

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
	ID                        int64  `json:"id"`
	Name                      string `json:"name"`
	PlacementStatus           bool   `json:"placement_status"`
	PlacementType             string `json:"placement_type"`
	InventoryID               int64  `json:"inventory_id"`
	InventoryName             string `json:"inventory_name"`
	InventoryPlatformTypeName string `json:"inventory_platform_type_name"`
}

type publisherPlacementsWrapper struct {
	Placements []PublisherPlacement `json:"publisher_placements_v2"`
}

type publisherPlacementsResponse struct {
	Placements []PublisherPlacement `json:"placements"`
}

type PlacementDoohItem struct {
	ID                int64    `json:"id"`
	PublisherID       int64    `json:"publisher_id"`
	PlacementID       int64    `json:"placement_id"`
	PlayerID          string   `json:"player_id"`
	DeviceID          string   `json:"device_id"`
	ScreenImgURL      string   `json:"screen_img_url"`
	Orientation       string   `json:"orientation"`
	ResolutionWidth   int32    `json:"resolution_width"`
	ResolutionHeight  int32    `json:"resolution_height"`
	VenueTypeID       int32    `json:"venue_type_id"`
	VenueTypeTax      string   `json:"venue_type_tax"`
	Lat               float64  `json:"lat"`
	Lon               float64  `json:"lon"`
	CountryCode       string   `json:"country_code"`
	Region            string   `json:"region"`
	City              string   `json:"city"`
	Zip               string   `json:"zip"`
	Address           string   `json:"address"`
	Width             *int32   `json:"width"`
	Height            *int32   `json:"height"`
	MinDuration       *int32   `json:"min_duration"`
	MaxDuration       *int32   `json:"max_duration"`
	AvgWeeklyAudience *float64 `json:"avg_weekly_audience"`
	CPM               *float64 `json:"cpm"`
	CurrencyCode      string   `json:"currency_code"`
	AllowedContent    string   `json:"allowed_content"`
}

type placementDoohsWrapper struct {
	DoohSettings            []PlacementDoohItem `json:"dooh_settings"`
	TotalNumberOfElemements int64               `json:"totalNumberOfElemements"`
}

type placementDoohsResponse struct {
	DoohSettings []PlacementDoohItem `json:"dooh_settings"`
	Total        int64               `json:"total"`
	Page         int                 `json:"page"`
	Limit        int                 `json:"limit"`
}

type PublishersHandler struct {
	cfg *config.Config
}

func NewPublishersHandler(cfg *config.Config) *PublishersHandler {
	return &PublishersHandler{cfg: cfg}
}

// parseX360ContentRange extracts the total count from the x-360-content-range header
// value like "0 | 10 | 868" (offset | returned | total). Returns 0 if absent or malformed.
func parseX360ContentRange(cr string) int64 {
	parts := strings.Split(cr, "|")
	if len(parts) != 3 {
		return 0
	}
	n, err := strconv.ParseInt(strings.TrimSpace(parts[2]), 10, 64)
	if err != nil {
		return 0
	}
	return n
}

func parsePage(q url.Values) (page, limit, offset int) {
	page, limit = 1, 20
	if n, err := strconv.Atoi(q.Get("page")); err == nil && n > 0 {
		page = n
	}
	if n, err := strconv.Atoi(q.Get("limit")); err == nil && n > 0 {
		limit = n
	}
	if limit > 100 {
		limit = 100
	}
	return page, limit, (page - 1) * limit
}

func (h *PublishersHandler) Publishers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	accessToken := r.Header.Get("X-Access-Token")

	page, limit, offset := parsePage(r.URL.Query())

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

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
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

	total := wrapper.TotalNumberOfElemements
	if total == 0 {
		total = int(parseX360ContentRange(upHeaders.Get("X-360-Content-Range")))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(publishersListResponse{
		Publishers: wrapper.Publishers,
		Total:      total,
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

	path := "/admin/v1/publishers/" + id

	body, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
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

	path := fmt.Sprintf("/publisher/v2/publishers/%s/placements", id)

	body, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
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

func (h *PublishersHandler) PlacementDoohSettings(w http.ResponseWriter, r *http.Request) {
	placementID := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")
	upstreamPath := fmt.Sprintf("/publisher/v1/placements/%s/dooh-settings", placementID)

	if r.Method == http.MethodPut {
		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "failed to read request body", http.StatusBadRequest)
			return
		}
		respBody, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPut, upstreamPath, accessToken, bodyBytes, "application/json")
		if err != nil {
			http.Error(w, "upstream request failed", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		w.Write(respBody)
		return
	}

	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	page, limit, offset := parsePage(r.URL.Query())

	params := url.Values{}
	params.Set("offset", strconv.Itoa(offset))
	params.Set("limit", strconv.Itoa(limit))
	if search := r.URL.Query().Get("search"); search != "" {
		params.Set("search", search)
	}
	if sort := r.URL.Query().Get("sort"); sort != "" {
		params.Set("sort", sort)
	}

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, upstreamPath+"?"+params.Encode(), accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var wrapper placementDoohsWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse dooh-settings response", http.StatusInternalServerError)
		return
	}

	total := wrapper.TotalNumberOfElemements
	if total == 0 {
		total = parseX360ContentRange(upHeaders.Get("X-360-Content-Range"))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(placementDoohsResponse{
		DoohSettings: wrapper.DoohSettings,
		Total:        total,
		Page:         page,
		Limit:        limit,
	})
}

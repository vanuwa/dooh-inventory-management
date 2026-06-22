package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"

	"dooh-backend/config"
)

type doohMultiplierDto struct {
	Day        string  `json:"day"`
	StartHour  int     `json:"start_hour"`
	EndHour    int     `json:"end_hour"`
	Multiplier float64 `json:"multiplier"`
}

type doohMetadataItem struct {
	ScreenID                   string              `json:"screen_id"`
	VenueTypeID                *int32              `json:"venue_type_id"`
	Lat                        *float64            `json:"lat"`
	Lon                        *float64            `json:"lon"`
	Region                     *string             `json:"region"`
	CountryCode                string              `json:"country_code"`
	City                       string              `json:"city"`
	Zip                        *string             `json:"zip"`
	Width                      *int32              `json:"width"`
	Height                     *int32              `json:"height"`
	ResolutionWidth            int32               `json:"resolution_width"`
	ResolutionHeight           int32               `json:"resolution_height"`
	MinDuration                *int32              `json:"min_duration"`
	MaxDuration                *int32              `json:"max_duration"`
	MultiplierSourceTypeID     *int64              `json:"multiplier_source_type_id"`
	MultiplierVendor           *string             `json:"multiplier_vendor"`
	VenueTypeTaxID             *int64              `json:"venue_type_tax_id"`
	PublisherID                *int64              `json:"publisher_id"`
	PublisherName              *string             `json:"publisher_name"`
	DoohMultipliers            []doohMultiplierDto `json:"dooh_multipliers"`
	AllowedContent             []string            `json:"allowed_content"`
	EstimatedWeeklyImpressions *float64            `json:"estimated_weekly_impressions"`
	CurrencyCode               *string             `json:"currency_code"`
	CPM                        *float64            `json:"cpm"`
	ScreenImageURL             *string             `json:"screen_image_url"`
}

type doohMetadataListWrapper struct {
	Items []doohMetadataItem `json:"dooh_metadata_list"`
}

type doohMetadataResponse struct {
	Items   []doohMetadataItem `json:"items"`
	Page    int                `json:"page"`
	Limit   int                `json:"limit"`
	HasMore bool               `json:"has_more"`
}

type DoohMetadataHandler struct {
	cfg *config.Config
}

func NewDoohMetadataHandler(cfg *config.Config) *DoohMetadataHandler {
	return &DoohMetadataHandler{cfg: cfg}
}

func (h *DoohMetadataHandler) DoohMetadata(w http.ResponseWriter, r *http.Request) {
	accessToken := r.Header.Get("X-Access-Token")
	page, limit := 1, 20
	if n, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && n > 0 {
		page = n
	}
	if n, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && n > 0 {
		limit = n
	}
	if limit > 10000 {
		limit = 10000
	}
	offset := (page - 1) * limit

	// Fix #3: validate publisherId is an integer before forwarding to upstream.
	if raw := r.URL.Query().Get("publisherId"); raw != "" {
		if _, err := strconv.ParseInt(raw, 10, 64); err != nil {
			http.Error(w, "publisherId must be an integer", http.StatusBadRequest)
			return
		}
	}

	params := url.Values{}
	params.Set("offset", strconv.Itoa(offset))
	// Fix #1: request one extra item to detect whether a next page exists without
	// a false positive when the dataset size is an exact multiple of limit.
	params.Set("limit", strconv.Itoa(limit+1))

	if country := r.URL.Query().Get("country"); country != "" {
		params.Set("country", country)
	}
	if publisherID := r.URL.Query().Get("publisherId"); publisherID != "" {
		params.Set("publisherId", publisherID)
	}
	if sort := r.URL.Query().Get("sort"); sort != "" {
		params.Set("sort", sort)
	}

	// Fix #2: capture upHeaders so we can forward the upstream body on non-200.
	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/admin/v1/dooh-metadata?"+params.Encode(), accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if status != http.StatusOK {
		writeProxyResponse(w, status, body, upHeaders)
		return
	}

	var wrapper doohMetadataListWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse dooh-metadata response", http.StatusInternalServerError)
		return
	}

	// Fix #1 (continued): trim the sentinel item and derive has_more from its presence.
	items := wrapper.Items
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	if items == nil {
		items = []doohMetadataItem{}
	}

	writeJSON(w, doohMetadataResponse{
		Items:   items,
		Page:    page,
		Limit:   limit,
		HasMore: hasMore,
	})
}

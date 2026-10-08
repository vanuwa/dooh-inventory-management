package handlers

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"

	"dooh-backend/config"
)

// Items are passed through raw: the handler never reads an item field, it only trims the
// limit+1 sentinel, so a typed struct would add nothing but drop every field it does not name.
type doohMetadataListWrapper struct {
	Items []json.RawMessage `json:"dooh_metadata_list"`
}

type doohMetadataResponse struct {
	Items   []json.RawMessage `json:"items"`
	Page    int               `json:"page"`
	Limit   int               `json:"limit"`
	HasMore bool              `json:"has_more"`
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
	// Upstream caps limit at 10000 and we ask for limit+1 below, so 9999 keeps the sentinel within it.
	if limit > 9999 {
		limit = 9999
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

	// Our query contract (country, publisherId) is translated here: upstream takes only the
	// snake_case names and silently ignores any other parameter, so a wrong name filters nothing.
	if country := r.URL.Query().Get("country"); country != "" {
		params.Set("country_code", country)
	}
	if publisherID := r.URL.Query().Get("publisherId"); publisherID != "" {
		params.Set("publisher_id", publisherID)
	}
	if sort := r.URL.Query().Get("sort"); sort != "" {
		params.Set("sort", sort)
	}

	// Fix #2: capture upHeaders so we can forward the upstream body on non-200.
	body, status, upHeaders, err := doRequest(upstreamBaseURL(h.cfg, r), http.MethodGet, "/demand-partner/v1/dooh-metadata?"+params.Encode(), accessToken, nil, "")
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
		items = []json.RawMessage{}
	}

	writeJSON(w, doohMetadataResponse{
		Items:   items,
		Page:    page,
		Limit:   limit,
		HasMore: hasMore,
	})
}

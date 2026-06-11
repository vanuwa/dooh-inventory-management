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
	TotalNumberOfElemements int64           `json:"totalNumberOfElemements"` // upstream API has this typo
}

type publishersListResponse struct {
	Publishers []PublisherItem `json:"publishers"`
	Total      int64           `json:"total"`
	Page       int             `json:"page"`
	Limit      int             `json:"limit"`
}

type PublisherPlacement struct {
	ID                        int64  `json:"id"`
	Name                      string `json:"name"`
	PlacementStatus           bool   `json:"placement_status"`
	PlacementType             string `json:"placement_type"`
	Position                  string `json:"position"`
	PrimarySize               string `json:"primary_size"`
	InventoryID               int64  `json:"inventory_id"`
	InventoryName             string `json:"inventory_name"`
	InventoryPlatformTypeName string `json:"inventory_platform_type_name"`
	ZoneID                    int64  `json:"zone_id"`
	ZoneName                  string `json:"zone_name"`
}

type publisherPlacementsWrapper struct {
	Placements              []PublisherPlacement `json:"publisher_placements_v2"`
	TotalNumberOfElemements int64                `json:"totalNumberOfElemements"`
}

type publisherPlacementsResponse struct {
	Placements []PublisherPlacement `json:"placements"`
	Total      int64                `json:"total"`
	Page       int                  `json:"page"`
	Limit      int                  `json:"limit"`
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

type upstreamUserItem struct {
	ID            int64  `json:"id"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	Email         string `json:"email"`
	UserType      string `json:"user_type"`
	UserAccess    string `json:"user_access"`
	Active        bool   `json:"active"`
	LastLoginTime string `json:"lastLoginTime"`
}

type usersListWrapper struct {
	Users                   []upstreamUserItem `json:"users"`
	TotalNumberOfElemements int64              `json:"totalNumberOfElemements"`
}

type UserItem struct {
	ID         int64  `json:"id"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Email      string `json:"email"`
	UserType   string `json:"user_type"`
	UserAccess string `json:"user_access"`
	Active     bool   `json:"active"`
	LastLogin  string `json:"last_login"`
}

type usersListResponse struct {
	Users []UserItem `json:"users"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
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

func resolveTotal(n int64, contentRange string) int64 {
	if n == 0 {
		return parseX360ContentRange(contentRange)
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

	total := resolveTotal(wrapper.TotalNumberOfElemements, upHeaders.Get("X-360-Content-Range"))

	writeJSON(w, publishersListResponse{
		Publishers: wrapper.Publishers,
		Total:      total,
		Page:       page,
		Limit:      limit,
	})
}

func (h *PublishersHandler) Publisher(w http.ResponseWriter, r *http.Request) {
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
	id := r.PathValue("id")
	accessToken := r.Header.Get("X-Access-Token")

	page, limit, offset := parsePage(r.URL.Query())

	params := url.Values{}
	params.Set("limit", strconv.Itoa(limit))
	params.Set("offset", strconv.Itoa(offset))
	if search := r.URL.Query().Get("search"); search != "" {
		params.Set("search", search)
	}
	if active := r.URL.Query().Get("active"); active != "" {
		params.Set("placement_status", active)
	}

	path := fmt.Sprintf("/publisher/v2/publishers/%s/placements?%s", id, params.Encode())

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, path, accessToken, nil, "")
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

	total := resolveTotal(wrapper.TotalNumberOfElemements, upHeaders.Get("X-360-Content-Range"))

	writeJSON(w, publisherPlacementsResponse{
		Placements: wrapper.Placements,
		Total:      total,
		Page:       page,
		Limit:      limit,
	})
}

func (h *PublishersHandler) GetPlacementDoohSettings(w http.ResponseWriter, r *http.Request) {
	placementID := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")
	upstreamPath := fmt.Sprintf("/publisher/v1/placements/%s/dooh-settings", placementID)

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

	total := resolveTotal(wrapper.TotalNumberOfElemements, upHeaders.Get("X-360-Content-Range"))

	writeJSON(w, placementDoohsResponse{
		DoohSettings: wrapper.DoohSettings,
		Total:        total,
		Page:         page,
		Limit:        limit,
	})
}

func (h *PublishersHandler) PublisherUsers(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	accessToken := r.Header.Get("X-Access-Token")

	page, limit, offset := parsePage(r.URL.Query())

	params := url.Values{}
	params.Set("entity", id)
	params.Set("sort", "-id")
	params.Set("offset", strconv.Itoa(offset))
	params.Set("limit", strconv.Itoa(limit))

	if search := r.URL.Query().Get("search"); search != "" {
		params.Set("search", search)
	}
	if userAccess := r.URL.Query().Get("user_access"); userAccess != "" {
		params.Set("user_access", userAccess)
	}
	if active := r.URL.Query().Get("active"); active != "" {
		params.Set("active", active)
	}

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/admin/v2/users?"+params.Encode(), accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var wrapper usersListWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse users response", http.StatusInternalServerError)
		return
	}

	total := resolveTotal(wrapper.TotalNumberOfElemements, upHeaders.Get("X-360-Content-Range"))

	users := make([]UserItem, len(wrapper.Users))
	for i, u := range wrapper.Users {
		users[i] = UserItem{
			ID:         u.ID,
			FirstName:  u.FirstName,
			LastName:   u.LastName,
			Email:      u.Email,
			UserType:   u.UserType,
			UserAccess: u.UserAccess,
			Active:     u.Active,
			LastLogin:  u.LastLoginTime,
		}
	}

	writeJSON(w, usersListResponse{
		Users: users,
		Total: total,
		Page:  page,
		Limit: limit,
	})
}

func (h *PublishersHandler) GetPlacementDoohSettingItem(w http.ResponseWriter, r *http.Request) {
	placementID := r.PathValue("placementId")
	screenID := r.PathValue("screenId")
	accessToken := r.Header.Get("X-Access-Token")
	// url.PathEscape prevents path traversal via percent-encoded segments (e.g. "789%2F..")
	upstreamPath := fmt.Sprintf("/publisher/v1/placements/%s/dooh-settings/%s",
		url.PathEscape(placementID), url.PathEscape(screenID))

	body, status, _, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	// The upstream may return the item directly or wrapped in {"dooh_setting": {...}}.
	// Try the wrapped form first (consistent with the list endpoint convention), then fall back.
	var wrapper struct {
		DoohSetting PlacementDoohItem `json:"dooh_setting"`
	}
	if err := json.Unmarshal(body, &wrapper); err == nil && wrapper.DoohSetting.ID != 0 {
		writeJSON(w, map[string]any{"dooh_setting": wrapper.DoohSetting})
		return
	}

	var item PlacementDoohItem
	if err := json.Unmarshal(body, &item); err != nil {
		http.Error(w, "failed to parse dooh-setting response", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"dooh_setting": item})
}

type createUserRequest struct {
	UserAccess       string            `json:"user_access"`
	FirstName        string            `json:"first_name"`
	LastName         string            `json:"last_name"`
	Email            string            `json:"email"`
	DestinationEmail string            `json:"destination_email"`
	Publishers       []IdName          `json:"publishers"`
	Accesses         map[string]string `json:"accesses"`
}

type IdName struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type upstreamRole struct {
	Name     string `json:"name"`
	RoleType string `json:"role_type"`
}

// accessRoleMap maps each permission area and chosen level to the upstream
// 360Yield publisher role names ("Create" implies the read-only role too).
var accessRoleMap = map[string]map[string][]string{
	"reports": {
		"Show": {"REPORTS_READ_ONLY_PUBLISHER", "CHARTS_READ_ONLY_PUBLISHER"},
		"Hide": {},
	},
	"operations": {
		"Create":    {"OPERATIONS_PUBLISHER", "OPERATIONS_READ_ONLY_PUBLISHER"},
		"Read Only": {"OPERATIONS_READ_ONLY_PUBLISHER"},
		"Hide":      {},
	},
	"settings": {
		"Create":    {"SETTINGS_PUBLISHER", "SETTINGS_READ_ONLY_PUBLISHER"},
		"Read Only": {"SETTINGS_READ_ONLY_PUBLISHER"},
		"Hide":      {},
	},
	"invoices": {
		"Show": {"INVOICES_READ_ONLY_PUBLISHER"},
		"Hide": {},
	},
	"inventory": {
		"Create":    {"INVENTORY_PUBLISHER", "INVENTORY_READ_ONLY_PUBLISHER"},
		"Read Only": {"INVENTORY_READ_ONLY_PUBLISHER"},
		"Hide":      {},
	},
	"clients": {
		"Create":    {"CLIENTS_PUBLISHER", "CLIENTS_READ_ONLY_PUBLISHER"},
		"Read Only": {"CLIENTS_READ_ONLY_PUBLISHER"},
		"Hide":      {},
	},
}

func writeErrorJSON(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"message": message})
}

// CreatePublisherUser handles POST /api/publishers/{id}/users. It accepts a
// narrow request shape and builds the upstream UserV2Dto itself, so only
// PUBLISHER users with whitelisted roles can ever be created through this portal.
func (h *PublishersHandler) CreatePublisherUser(w http.ResponseWriter, r *http.Request) {
	accessToken := r.Header.Get("X-Access-Token")

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.UserAccess != "CONSOLE" && req.UserAccess != "API" {
		writeErrorJSON(w, http.StatusBadRequest, `user_access must be "CONSOLE" or "API"`)
		return
	}
	if strings.TrimSpace(req.FirstName) == "" || strings.TrimSpace(req.LastName) == "" || strings.TrimSpace(req.Email) == "" {
		writeErrorJSON(w, http.StatusBadRequest, "first_name, last_name and email are required")
		return
	}
	if req.UserAccess == "API" && strings.TrimSpace(req.DestinationEmail) == "" {
		writeErrorJSON(w, http.StatusBadRequest, "destination_email is required for API users")
		return
	}
	if len(req.Publishers) == 0 {
		writeErrorJSON(w, http.StatusBadRequest, "at least one publisher is required")
		return
	}

	roles := []upstreamRole{}
	for area, levels := range accessRoleMap {
		level := req.Accesses[area]
		if level == "" {
			level = "Hide"
		}
		names, ok := levels[level]
		if !ok {
			writeErrorJSON(w, http.StatusBadRequest, fmt.Sprintf("invalid value %q for access %q", level, area))
			return
		}
		for _, name := range names {
			roles = append(roles, upstreamRole{Name: name, RoleType: "PUBLISHER"})
		}
	}
	if len(roles) == 0 {
		writeErrorJSON(w, http.StatusBadRequest, "at least one access must not be Hide")
		return
	}

	payload := map[string]any{
		"first_name":                 req.FirstName,
		"last_name":                  req.LastName,
		"email":                      req.Email,
		"user_type":                  "PUBLISHER",
		"user_access":                req.UserAccess,
		"status":                     "Regular",
		"active":                     true,
		"exempt_remote_address_rule": true,
		"roles":                      roles,
		"publishers":                 req.Publishers,
	}
	if req.UserAccess == "API" {
		payload["destination_email"] = req.DestinationEmail
	}

	body, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "failed to build upstream payload", http.StatusInternalServerError)
		return
	}

	respBody, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/admin/v2/users", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	writeProxyResponse(w, status, respBody, upHeaders)
}

func (h *PublishersHandler) PutPlacementDoohSettings(w http.ResponseWriter, r *http.Request) {
	placementID := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")
	upstreamPath := fmt.Sprintf("/publisher/v1/placements/%s/dooh-settings", placementID)

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
}

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

type PlacementDetailResponse struct {
	PublisherPlacement
	InventoryURL string `json:"inventory_url,omitempty"`
	MaxDefaults  int32  `json:"max_defaults,omitempty"`
}

type inventoryDetailUpstream struct {
	URL         string `json:"url"`
	MaxDefaults int32  `json:"max_defaults"`
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
	params.Set("sort", "-id")
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

func (h *PublishersHandler) GetPublisherPlacement(w http.ResponseWriter, r *http.Request) {
	publisherID := r.PathValue("id")
	placementID := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")

	// Call 1: search the v2 placements list by placement ID — returns full placement data
	// including inventory_name, inventory_id, inventory_platform_type_name.
	params := url.Values{}
	params.Set("search", placementID)
	params.Set("limit", "100")
	path := fmt.Sprintf("/publisher/v2/publishers/%s/placements?%s",
		url.PathEscape(publisherID), params.Encode())

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

	// Find exact match by ID (search may return partial name matches).
	var found *PublisherPlacement
	for i := range wrapper.Placements {
		if fmt.Sprintf("%d", wrapper.Placements[i].ID) == placementID {
			found = &wrapper.Placements[i]
			break
		}
	}
	if found == nil {
		http.NotFound(w, r)
		return
	}

	resp := PlacementDetailResponse{PublisherPlacement: *found}

	// Call 2: fetch inventory for url + max_defaults. Soft failure — return placement
	// data even if the inventory call fails.
	if found.InventoryID != 0 {
		invPath := fmt.Sprintf("/publisher/v1/publishers/%s/inventories/%d",
			url.PathEscape(publisherID), found.InventoryID)
		invBody, invStatus, _, invErr := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, invPath, accessToken, nil, "")
		if invErr == nil && invStatus == http.StatusOK {
			var inv inventoryDetailUpstream
			if json.Unmarshal(invBody, &inv) == nil {
				resp.InventoryURL = inv.URL
				resp.MaxDefaults = inv.MaxDefaults
			}
		}
	}

	writeJSON(w, resp)
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

// rolesFromAccesses converts an accesses map into upstream roles using
// accessRoleMap. A missing area defaults to "Hide". Returns a non-empty
// error message when a value is invalid or every area is Hide.
func rolesFromAccesses(accesses map[string]string) ([]upstreamRole, string) {
	roles := []upstreamRole{}
	for area, levels := range accessRoleMap {
		level := accesses[area]
		if level == "" {
			level = "Hide"
		}
		names, ok := levels[level]
		if !ok {
			return nil, fmt.Sprintf("invalid value %q for access %q", level, area)
		}
		for _, name := range names {
			roles = append(roles, upstreamRole{Name: name, RoleType: "PUBLISHER"})
		}
	}
	if len(roles) == 0 {
		return nil, "at least one access must not be Hide"
	}
	return roles, ""
}

// accessesFromRoles reverse-maps upstream role names to the accesses shape
// used by the UI. For each area the most specific level whose roles are all
// present wins; otherwise "Hide".
func accessesFromRoles(roleNames map[string]bool) map[string]string {
	accesses := map[string]string{}
	for area, levels := range accessRoleMap {
		accesses[area] = "Hide"
		for _, level := range []string{"Create", "Read Only", "Show"} {
			names, ok := levels[level]
			if !ok || len(names) == 0 {
				continue
			}
			all := true
			for _, name := range names {
				if !roleNames[name] {
					all = false
					break
				}
			}
			if all {
				accesses[area] = level
				break
			}
		}
	}
	return accesses
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

	roles, errMsg := rolesFromAccesses(req.Accesses)
	if errMsg != "" {
		writeErrorJSON(w, http.StatusBadRequest, errMsg)
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

type upstreamUserDetail struct {
	ID         int64          `json:"id"`
	FirstName  string         `json:"first_name"`
	LastName   string         `json:"last_name"`
	Email      string         `json:"email"`
	UserType   string         `json:"user_type"`
	UserAccess string         `json:"user_access"`
	Active     bool           `json:"active"`
	Roles      []upstreamRole `json:"roles"`
	Publishers []IdName       `json:"publishers"`
}

// GetPublisherUser handles GET /api/publishers/{id}/users/{userId}. It returns
// the user's details with roles reverse-mapped to the UI accesses shape.
func (h *PublishersHandler) GetPublisherUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("userId")
	accessToken := r.Header.Get("X-Access-Token")

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/admin/v2/users/"+userID, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if status < 200 || status >= 300 {
		writeProxyResponse(w, status, body, upHeaders)
		return
	}

	var u upstreamUserDetail
	if err := json.Unmarshal(body, &u); err != nil {
		http.Error(w, "failed to parse user response", http.StatusInternalServerError)
		return
	}

	roleNames := map[string]bool{}
	for _, role := range u.Roles {
		roleNames[role.Name] = true
	}

	writeJSON(w, map[string]any{
		"id":          u.ID,
		"first_name":  u.FirstName,
		"last_name":   u.LastName,
		"email":       u.Email,
		"user_type":   u.UserType,
		"user_access": u.UserAccess,
		"active":      u.Active,
		"publishers":  u.Publishers,
		"accesses":    accessesFromRoles(roleNames),
	})
}

type updateUserRequest struct {
	FirstName  string            `json:"first_name"`
	LastName   string            `json:"last_name"`
	Email      string            `json:"email"`
	Active     bool              `json:"active"`
	Publishers []IdName          `json:"publishers"`
	Accesses   map[string]string `json:"accesses"`
}

// UpdatePublisherUser handles PUT /api/publishers/{id}/users/{userId}.
// The upstream PUT /admin/v2/users requires the full UserV2Dto (collections
// are replaced wholesale), so the current user is fetched first and only the
// editable fields are overridden. Non-PUBLISHER users are rejected.
func (h *PublishersHandler) UpdatePublisherUser(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("userId")
	accessToken := r.Header.Get("X-Access-Token")

	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.FirstName) == "" || strings.TrimSpace(req.LastName) == "" || strings.TrimSpace(req.Email) == "" {
		writeErrorJSON(w, http.StatusBadRequest, "first_name, last_name and email are required")
		return
	}
	if len(req.Publishers) == 0 {
		writeErrorJSON(w, http.StatusBadRequest, "at least one publisher is required")
		return
	}
	roles, errMsg := rolesFromAccesses(req.Accesses)
	if errMsg != "" {
		writeErrorJSON(w, http.StatusBadRequest, errMsg)
		return
	}

	fetched, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/admin/v2/users/"+userID, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if status < 200 || status >= 300 {
		writeProxyResponse(w, status, fetched, upHeaders)
		return
	}

	var current map[string]any
	if err := json.Unmarshal(fetched, &current); err != nil {
		http.Error(w, "failed to parse user response", http.StatusInternalServerError)
		return
	}
	if current["user_type"] != "PUBLISHER" {
		writeErrorJSON(w, http.StatusBadRequest, "only Publisher users can be edited")
		return
	}

	// Preserve roles outside our whitelist so saving never silently strips
	// them. PUBLISHER_DEFAULT is excluded — upstream auto-manages it.
	managed := map[string]bool{"PUBLISHER_DEFAULT": true}
	for _, levels := range accessRoleMap {
		for _, names := range levels {
			for _, name := range names {
				managed[name] = true
			}
		}
	}
	if rawRoles, ok := current["roles"].([]any); ok {
		for _, raw := range rawRoles {
			role, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			name, _ := role["name"].(string)
			if name == "" || managed[name] {
				continue
			}
			roleType, _ := role["role_type"].(string)
			roles = append(roles, upstreamRole{Name: name, RoleType: roleType})
		}
	}

	current["first_name"] = req.FirstName
	current["last_name"] = req.LastName
	current["email"] = req.Email
	current["active"] = req.Active
	current["publishers"] = req.Publishers
	current["roles"] = roles

	body, err := json.Marshal(current)
	if err != nil {
		http.Error(w, "failed to build upstream payload", http.StatusInternalServerError)
		return
	}

	respBody, putStatus, putHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPut, "/admin/v2/users", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	writeProxyResponse(w, putStatus, respBody, putHeaders)
}

type createPlacementRequest struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	MaxDefaults int    `json:"max_defaults"`
}

// CreatePublisherPlacement handles POST /api/publishers/{id}/placements.
// It orchestrates three sequential upstream calls:
//  1. Create inventory (site)
//  2. Create zone under that inventory
//  3. Create placement under that zone
//
// On failure at step 2 or 3, the already-created inventory is deleted as a
// best-effort rollback before the error is returned.
func (h *PublishersHandler) CreatePublisherPlacement(w http.ResponseWriter, r *http.Request) {
	publisherID := r.PathValue("id")
	accessToken := r.Header.Get("X-Access-Token")

	var req createPlacementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorJSON(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeErrorJSON(w, http.StatusBadRequest, "name is required")
		return
	}
	if strings.TrimSpace(req.URL) == "" {
		writeErrorJSON(w, http.StatusBadRequest, "url is required")
		return
	}
	if req.MaxDefaults < 1 {
		req.MaxDefaults = 1
	}

	// Step 1: Create inventory
	invPayload := map[string]any{
		"name":                 req.Name,
		"expose_name":          true,
		"country":              "International",
		"inventory_status":     true,
		"url":                  req.URL,
		"expose_domain":        true,
		"backup":               false,
		"tiling":               false,
		"coppa":                false,
		"platform_id":          9,
		"max_defaults":         req.MaxDefaults,
		"enable_tag_variables": []string{},
		"iab_categories":       []int{},
	}
	invBody, err := json.Marshal(invPayload)
	if err != nil {
		http.Error(w, "failed to build inventory payload", http.StatusInternalServerError)
		return
	}
	invPath := fmt.Sprintf("/publisher/v1/publishers/%s/inventories", url.PathEscape(publisherID))
	invResp, invStatus, invHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, invPath, accessToken, invBody, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if invStatus < 200 || invStatus >= 300 {
		writeProxyResponse(w, invStatus, invResp, invHeaders)
		return
	}
	var invResult struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(invResp, &invResult); err != nil || invResult.ID == 0 {
		http.Error(w, "failed to parse inventory response", http.StatusInternalServerError)
		return
	}
	inventoryID := invResult.ID
	safePub := url.PathEscape(publisherID)

	// zoneID is declared here so the cleanup closure captures it by reference;
	// once step 2 succeeds and sets it, cleanup will delete the zone too.
	var zoneID int64

	cleanup := func() {
		if zoneID != 0 {
			delZone := fmt.Sprintf("/publisher/v1/publishers/%s/inventories/%d/zones/%d", safePub, inventoryID, zoneID)
			doRequest(h.cfg.ImproveAPIBaseURL, http.MethodDelete, delZone, accessToken, nil, "") //nolint:errcheck
		}
		delInv := fmt.Sprintf("/publisher/v1/publishers/%s/inventories/%d", safePub, inventoryID)
		doRequest(h.cfg.ImproveAPIBaseURL, http.MethodDelete, delInv, accessToken, nil, "") //nolint:errcheck
	}

	// Step 2: Create zone
	zonePayload := map[string]any{"name": "DOOH", "zone_status": true}
	zoneBody, err := json.Marshal(zonePayload)
	if err != nil {
		cleanup()
		http.Error(w, "failed to build zone payload", http.StatusInternalServerError)
		return
	}
	zonePath := fmt.Sprintf("/publisher/v1/publishers/%s/inventories/%d/zones", safePub, inventoryID)
	zoneResp, zoneStatus, zoneHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, zonePath, accessToken, zoneBody, "application/json")
	if err != nil {
		cleanup()
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if zoneStatus < 200 || zoneStatus >= 300 {
		cleanup()
		writeProxyResponse(w, zoneStatus, zoneResp, zoneHeaders)
		return
	}
	var zoneResult struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(zoneResp, &zoneResult); err != nil || zoneResult.ID == 0 {
		cleanup()
		http.Error(w, "failed to parse zone response", http.StatusInternalServerError)
		return
	}
	zoneID = zoneResult.ID

	// Step 3: Create placement
	plPayload := map[string]any{
		"name":               req.Name,
		"placement_status":   true,
		"placement_type":     "multiformat",
		"appnexus":           true,
		"pub_click_tracking": false,
	}
	plBody, err := json.Marshal(plPayload)
	if err != nil {
		cleanup()
		http.Error(w, "failed to build placement payload", http.StatusInternalServerError)
		return
	}
	plPath := fmt.Sprintf("/publisher/v1/publishers/%s/inventories/%d/zones/%d/placements", safePub, inventoryID, zoneID)
	plResp, plStatus, plHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, plPath, accessToken, plBody, "application/json")
	if err != nil {
		cleanup()
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}
	if plStatus < 200 || plStatus >= 300 {
		cleanup()
		writeProxyResponse(w, plStatus, plResp, plHeaders)
		return
	}
	writeProxyResponse(w, plStatus, plResp, plHeaders)
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

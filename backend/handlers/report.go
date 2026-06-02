package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"dooh-backend/config"
)

type ReportHandler struct {
	cfg *config.Config
}

func NewReportHandler(cfg *config.Config) *ReportHandler {
	return &ReportHandler{cfg: cfg}
}

type reportDateRange struct {
	Quick string       `json:"quick,omitempty"`
	Fixed *reportFixed `json:"fixed,omitempty"`
}

type reportFixed struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

type reportFilter struct {
	Column    string `json:"column"`
	Operation string `json:"operation"`
	Value     string `json:"value"`
}

type reportOrderBy struct {
	Name  string `json:"name"`
	Order string `json:"order"`
}

type reportGenRequest struct {
	ReportType   string          `json:"report_type"`
	DateRange    reportDateRange `json:"date_range"`
	PublisherIds []int64         `json:"publisher_id,omitempty"`
	Dimensions   []string        `json:"dimensions"`
	Metrics      []string        `json:"metrics"`
	Filters      []reportFilter  `json:"filters,omitempty"`
	ColumnOrder  []string        `json:"column_order"`
	OrderBy      reportOrderBy   `json:"order_by"`
}

type reportPreviewReq struct {
	Rows    int              `json:"rows"`
	Request reportGenRequest `json:"report_generation_request"`
}

type reportColumn struct {
	ID      string `json:"id"`
	Display string `json:"display"`
}

type placementReportReq struct {
	DateRange reportDateRange `json:"date_range"`
	GroupBy   string          `json:"group_by"`
}

var doohDimensions = []string{"day", "publisher_id", "publisher_name", "placement_id", "placement_name", "player_id", "venue_type_id", "venue_type_name", "country", "creative_type"}
var doohMetrics = []string{"ads_served", "impressions", "multiplied_impressions", "revenue"}

var pubBaseDimensions = []string{"publisher_id", "publisher_name", "venue_type_id", "venue_type_name", "country"}

// The 360Yield API uses snake_case globally (Jackson config); swagger shows Java field names (camelCase) but those are not the wire names.
type genDateRange struct {
	Quick string    `json:"quick,omitempty"`
	Fixed *genFixed `json:"fixed,omitempty"`
}

type genFixed struct {
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

type genFilter struct {
	Column    string `json:"column"`
	Operation string `json:"operation"`
	Value     string `json:"value"`
}

type reportGenBody struct {
	ReportType   string        `json:"report_type"`
	ReportFormat string        `json:"report_format"`
	DateRange    genDateRange  `json:"date_range"`
	PublisherIds []int64       `json:"publisher_id,omitempty"`
	Dimensions   []string      `json:"dimensions"`
	Metrics      []string      `json:"metrics"`
	Filters      []genFilter   `json:"filters,omitempty"`
	ColumnOrder  []string      `json:"column_order"`
	OrderBy      reportOrderBy `json:"order_by"`
}

func resolveGroupBy(s string) string {
	if s == "week" || s == "month" {
		return s
	}
	return "day"
}

func (h *ReportHandler) PlacementReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	placementId := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	timeDim := resolveGroupBy(req.GroupBy)
	dims := append([]string{timeDim}, doohDimensions[1:]...)
	colOrder := append(append([]string{}, dims...), doohMetrics...)

	upstream := reportPreviewReq{
		Rows: 1000,
		Request: reportGenRequest{
			ReportType:  "DOOH",
			DateRange:   req.DateRange,
			Dimensions:  dims,
			Metrics:     doohMetrics,
			Filters:     []reportFilter{{Column: "placement_id", Operation: "EQUAL", Value: placementId}},
			ColumnOrder: colOrder,
			OrderBy:     reportOrderBy{Name: timeDim, Order: "desc"},
		},
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/preview", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

func (h *ReportHandler) GeneratePlacementReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	placementId := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	timeDim := resolveGroupBy(req.GroupBy)
	dims := append([]string{timeDim}, doohDimensions[1:]...)
	colOrder := append(append([]string{}, dims...), doohMetrics...)

	dr := genDateRange{Quick: req.DateRange.Quick}
	if req.DateRange.Fixed != nil {
		dr.Fixed = &genFixed{
			StartDate: req.DateRange.Fixed.StartDate,
			EndDate:   req.DateRange.Fixed.EndDate,
		}
	}

	upstream := reportGenBody{
		ReportType:   "DOOH",
		ReportFormat: "CSV",
		DateRange:    dr,
		Dimensions:   dims,
		Metrics:      doohMetrics,
		Filters:      []genFilter{{Column: "placement_id", Operation: "EQUAL", Value: placementId}},
		ColumnOrder:  colOrder,
		OrderBy:      reportOrderBy{Name: timeDim, Order: "desc"},
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/generation", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

func (h *ReportHandler) PublisherReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	publisherIdStr := r.PathValue("publisherId")
	publisherIdInt, err := strconv.ParseInt(publisherIdStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid publisher id", http.StatusBadRequest)
		return
	}
	accessToken := r.Header.Get("X-Access-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	timeDim := resolveGroupBy(req.GroupBy)
	dims := append([]string{timeDim}, pubBaseDimensions...)
	colOrder := append(append([]string{}, dims...), doohMetrics...)

	upstream := reportPreviewReq{
		Rows: 1000,
		Request: reportGenRequest{
			ReportType:   "DOOH",
			DateRange:    req.DateRange,
			PublisherIds: []int64{publisherIdInt},
			Dimensions:   dims,
			Metrics:      doohMetrics,
			ColumnOrder:  colOrder,
			OrderBy:      reportOrderBy{Name: timeDim, Order: "desc"},
		},
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/preview", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

func (h *ReportHandler) GeneratePublisherReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	publisherIdStr := r.PathValue("publisherId")
	publisherIdInt, err := strconv.ParseInt(publisherIdStr, 10, 64)
	if err != nil {
		http.Error(w, "invalid publisher id", http.StatusBadRequest)
		return
	}
	accessToken := r.Header.Get("X-Access-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	timeDim := resolveGroupBy(req.GroupBy)
	dims := append([]string{timeDim}, pubBaseDimensions...)
	colOrder := append(append([]string{}, dims...), doohMetrics...)

	dr := genDateRange{Quick: req.DateRange.Quick}
	if req.DateRange.Fixed != nil {
		dr.Fixed = &genFixed{
			StartDate: req.DateRange.Fixed.StartDate,
			EndDate:   req.DateRange.Fixed.EndDate,
		}
	}

	upstream := reportGenBody{
		ReportType:   "DOOH",
		ReportFormat: "CSV",
		DateRange:    dr,
		PublisherIds: []int64{publisherIdInt},
		Dimensions:   dims,
		Metrics:      doohMetrics,
		ColumnOrder:  colOrder,
		OrderBy:      reportOrderBy{Name: timeDim, Order: "desc"},
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/generation", accessToken, body, "application/json")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

func (h *ReportHandler) PlacementReportStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	reportGenerationId := r.PathValue("reportGenerationId")
	accessToken := r.Header.Get("X-Access-Token")

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/report/generation-status/"+reportGenerationId, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

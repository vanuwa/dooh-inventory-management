package handlers

import (
	"encoding/json"
	"net/http"

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

type reportGenRequest struct {
	ReportType  string          `json:"report_type"`
	DateRange   reportDateRange `json:"date_range"`
	Dimensions  []string        `json:"dimensions"`
	Metrics     []string        `json:"metrics"`
	Filters     []reportFilter  `json:"filters"`
	ColumnOrder []string        `json:"column_order"`
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
}

var doohDimensions = []string{"day", "publisher_id", "publisher_name", "placement_id", "placement_name", "player_id", "venue_type_id", "venue_type_name", "country", "creative_type"}
var doohMetrics = []string{"ads_served", "impressions", "multiplied_impressions", "revenue"}
var doohColumnOrder = func() []string {
	cols := make([]string, 0, len(doohDimensions)+len(doohMetrics))
	return append(append(cols, doohDimensions...), doohMetrics...)
}()

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
	ReportType   string       `json:"report_type"`
	ReportFormat string       `json:"report_format"`
	DateRange    genDateRange `json:"date_range"`
	Dimensions   []string     `json:"dimensions"`
	Metrics      []string     `json:"metrics"`
	Filters      []genFilter  `json:"filters"`
	ColumnOrder  []string     `json:"column_order"`
}

func (h *ReportHandler) PlacementReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	placementId := r.PathValue("placementId")
	accessToken := r.Header.Get("X-Access-Token")
	refreshToken := r.Header.Get("X-Refresh-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	upstream := reportPreviewReq{
		Rows: 1000,
		Request: reportGenRequest{
			ReportType:  "DOOH",
			DateRange:   req.DateRange,
			Dimensions:  doohDimensions,
			Metrics:     doohMetrics,
			Filters:     []reportFilter{{Column: "placement_id", Operation: "EQUAL", Value: placementId}},
			ColumnOrder: doohColumnOrder,
		},
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequestBody(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/preview", accessToken, body)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		respBody, status, headers, _, ok = refreshAndRetryBody(h.cfg, w, http.MethodPost, "/report/preview", refreshToken, body)
		if !ok {
			return
		}
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
	refreshToken := r.Header.Get("X-Refresh-Token")

	var req placementReportReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

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
		Dimensions:   doohDimensions,
		Metrics:      doohMetrics,
		Filters:      []genFilter{{Column: "placement_id", Operation: "EQUAL", Value: placementId}},
		ColumnOrder:  doohColumnOrder,
	}

	body, err := json.Marshal(upstream)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	respBody, status, headers, err := doRequestBody(h.cfg.ImproveAPIBaseURL, http.MethodPost, "/report/generation", accessToken, body)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		respBody, status, headers, _, ok = refreshAndRetryBody(h.cfg, w, http.MethodPost, "/report/generation", refreshToken, body)
		if !ok {
			return
		}
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
	refreshToken := r.Header.Get("X-Refresh-Token")

	respBody, status, headers, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, "/report/generation-status/"+reportGenerationId, accessToken)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status == http.StatusUnauthorized && refreshToken != "" {
		var ok bool
		respBody, status, headers, _, ok = refreshAndRetry(h.cfg, w, http.MethodGet, "/report/generation-status/"+reportGenerationId, refreshToken)
		if !ok {
			return
		}
	}

	if ct := headers.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"

	"dooh-backend/config"
)

const maxUploadBytes = 50 << 20 // 50 MB

type bulkUploadJobDto struct {
	ID                 int64    `json:"id"`
	JobType            string   `json:"job_type"`
	FileName           string   `json:"file_name"`
	MimeType           string   `json:"mime_type"`
	JobStatus          string   `json:"job_status"`
	PercentageDone     float64  `json:"percentage_done"`
	ExecutedBy         string   `json:"executed_by"`
	OwnerObjectID      int64    `json:"owner_object_id"`
	ExecutionStartedAt string   `json:"execution_started_at"`
	ExecutionEndedAt   string   `json:"execution_ended_at"`
	ErrorMessages      []string `json:"error_messages"`
	JobCompleted       bool     `json:"job_completed"`
}

type bulkUploadJobsWrapper struct {
	BulkUploadJobs          []bulkUploadJobDto `json:"bulk_upload_jobs"`
	TotalNumberOfElemements int                `json:"totalNumberOfElemements"`
}

type bulkUploadJobsResponse struct {
	Jobs  []bulkUploadJobDto `json:"jobs"`
	Total int                `json:"total"`
	Page  int                `json:"page"`
	Limit int                `json:"limit"`
}

type BulkUploadJobsHandler struct {
	cfg *config.Config
}

func NewBulkUploadJobsHandler(cfg *config.Config) *BulkUploadJobsHandler {
	return &BulkUploadJobsHandler{cfg: cfg}
}

func (h *BulkUploadJobsHandler) Jobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listJobs(w, r)
	case http.MethodPost:
		h.createJob(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *BulkUploadJobsHandler) listJobs(w http.ResponseWriter, r *http.Request) {
	publisherID := r.PathValue("publisherId")
	accessToken := r.Header.Get("X-Access-Token")

	page, limit, offset := parsePage(r.URL.Query())

	params := url.Values{}
	params.Set("sort", "-id")
	params.Set("offset", strconv.Itoa(offset))
	params.Set("limit", strconv.Itoa(limit))
	params.Set("job_type", "PLACEMENT_DOOH")

	upstreamPath := fmt.Sprintf("/publisher/v1/publishers/%s/bulk-upload-jobs?%s", publisherID, params.Encode())

	body, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodGet, upstreamPath, accessToken, nil, "")
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if status != http.StatusOK {
		w.WriteHeader(status)
		return
	}

	var wrapper bulkUploadJobsWrapper
	if err := json.Unmarshal(body, &wrapper); err != nil {
		http.Error(w, "failed to parse bulk-upload-jobs response", http.StatusInternalServerError)
		return
	}

	total := wrapper.TotalNumberOfElemements
	if total == 0 {
		total = int(parseX360ContentRange(upHeaders.Get("X-360-Content-Range")))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bulkUploadJobsResponse{
		Jobs:  wrapper.BulkUploadJobs,
		Total: total,
		Page:  page,
		Limit: limit,
	})
}

func (h *BulkUploadJobsHandler) createJob(w http.ResponseWriter, r *http.Request) {
	publisherID := r.PathValue("publisherId")
	accessToken := r.Header.Get("X-Access-Token")

	contentType := r.Header.Get("Content-Type")

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes)
	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "request body too large or unreadable", http.StatusBadRequest)
		return
	}

	upstreamPath := fmt.Sprintf("/publisher/v1/publishers/%s/bulk-upload-jobs", publisherID)

	respBody, status, upHeaders, err := doRequest(h.cfg.ImproveAPIBaseURL, http.MethodPost, upstreamPath, accessToken, rawBody, contentType)
	if err != nil {
		http.Error(w, "upstream request failed", http.StatusBadGateway)
		return
	}

	if ct := upHeaders.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(status)
	w.Write(respBody)
}

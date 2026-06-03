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

type taskDto struct {
	ID                 int64    `json:"id"`
	TaskDescription    string   `json:"task_description"`
	Status             string   `json:"status"`
	ExecutionStartedAt string   `json:"execution_started_at"`
	ExecutionEndedAt   string   `json:"execution_ended_at"`
	ErrorMessages      []string `json:"error_messages"`
	UploadedEntityID   *int64   `json:"uploaded_entity_id"`
}

type bulkUploadJobDto struct {
	ID                 int64     `json:"id"`
	JobType            string    `json:"job_type"`
	FileName           string    `json:"file_name"`
	MimeType           string    `json:"mime_type"`
	JobStatus          string    `json:"job_status"`
	PercentageDone     float64   `json:"percentage_done"`
	ExecutedBy         string    `json:"executed_by"`
	OwnerObjectID      int64     `json:"owner_object_id"`
	ExecutionStartedAt string    `json:"execution_started_at"`
	ExecutionEndedAt   string    `json:"execution_ended_at"`
	ErrorMessages      []string  `json:"error_messages"`
	JobCompleted       bool      `json:"job_completed"`
	Tasks              []taskDto `json:"tasks"`
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

func (h *BulkUploadJobsHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
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

	total := int(resolveTotal(int64(wrapper.TotalNumberOfElemements), upHeaders.Get("X-360-Content-Range")))

	writeJSON(w, bulkUploadJobsResponse{
		Jobs:  wrapper.BulkUploadJobs,
		Total: total,
		Page:  page,
		Limit: limit,
	})
}

func (h *BulkUploadJobsHandler) CreateJob(w http.ResponseWriter, r *http.Request) {
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

	writeProxyResponse(w, status, respBody, upHeaders)
}

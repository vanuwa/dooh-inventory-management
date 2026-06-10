package main

import (
	"log"
	"net/http"
	"strings"

	"dooh-backend/config"
	"dooh-backend/handlers"
)

func main() {
	cfg := config.Load()
	log.Printf("server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, newHandler(cfg)); err != nil {
		log.Fatal(err)
	}
}

func newHandler(cfg *config.Config) http.Handler {
	authHandler := handlers.NewAuthHandler(cfg)
	proxyHandler := handlers.NewProxyHandler(cfg)
	publishersHandler := handlers.NewPublishersHandler(cfg)
	reportHandler := handlers.NewReportHandler(cfg)
	bulkUploadJobsHandler := handlers.NewBulkUploadJobsHandler(cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/auth/refresh", authHandler.Refresh)
	mux.HandleFunc("GET /api/user/details", proxyHandler.UserDetails)
	mux.HandleFunc("GET /api/publishers", publishersHandler.Publishers)
	mux.HandleFunc("GET /api/publishers/{id}", publishersHandler.Publisher)
	mux.HandleFunc("GET /api/publishers/{id}/placements", publishersHandler.PublisherPlacements)
	mux.HandleFunc("GET /api/publishers/{id}/users", publishersHandler.PublisherUsers)
	mux.HandleFunc("GET /api/publishers/{publisherId}/placements/{placementId}/dooh-settings/{screenId}", publishersHandler.GetPlacementDoohSettingItem)
	mux.HandleFunc("GET /api/publishers/{publisherId}/placements/{placementId}/dooh-settings", publishersHandler.GetPlacementDoohSettings)
	mux.HandleFunc("PUT /api/publishers/{publisherId}/placements/{placementId}/dooh-settings", publishersHandler.PutPlacementDoohSettings)
	mux.HandleFunc("POST /api/report/placement/{publisherId}/{placementId}", reportHandler.PlacementReport)
	mux.HandleFunc("POST /api/report/generate/placement/{publisherId}/{placementId}", reportHandler.GeneratePlacementReport)
	mux.HandleFunc("GET /api/report/status/{reportGenerationId}", reportHandler.PlacementReportStatus)
	mux.HandleFunc("POST /api/report/publisher/{publisherId}", reportHandler.PublisherReport)
	mux.HandleFunc("POST /api/report/generate/publisher/{publisherId}", reportHandler.GeneratePublisherReport)
	mux.HandleFunc("GET /api/publishers/{publisherId}/bulk-upload-jobs", bulkUploadJobsHandler.ListJobs)
	mux.HandleFunc("POST /api/publishers/{publisherId}/bulk-upload-jobs", bulkUploadJobsHandler.CreateJob)

	return corsMiddleware(cfg.FrontendOrigin, readOnlyMiddleware(mux))
}

// readOnlyMiddleware blocks all non-GET methods except on the paths listed in writeAllowed.
func readOnlyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if writeAllowed(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodOptions {
			http.Error(w, "read-only: only GET requests are allowed", http.StatusMethodNotAllowed)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// writeAllowed lists the path prefixes that accept non-GET requests.
// Add new entries here explicitly when registering write-capable routes.
func writeAllowed(path string) bool {
	switch path {
	case "/api/auth/login", "/api/auth/refresh":
		return true
	}
	for _, pfx := range []string{
		"/api/report/placement/",
		"/api/report/generate/placement/",
		"/api/report/publisher/",
		"/api/report/generate/publisher/",
		"/api/report/status/",
	} {
		if strings.HasPrefix(path, pfx) {
			return true
		}
	}
	if strings.HasPrefix(path, "/api/publishers/") {
		return strings.HasSuffix(path, "/bulk-upload-jobs") ||
			strings.HasSuffix(path, "/dooh-settings")
	}
	return false
}

func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Token")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

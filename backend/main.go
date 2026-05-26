package main

import (
	"log"
	"net/http"

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

	mux := http.NewServeMux()
	mux.HandleFunc("/api/auth/login", authHandler.Login)
	mux.HandleFunc("/api/user/details", proxyHandler.UserDetails)
	mux.HandleFunc("/api/publishers", publishersHandler.Publishers)
	mux.HandleFunc("/api/publishers/{id}", publishersHandler.Publisher)
	mux.HandleFunc("/api/publishers/{id}/placements", publishersHandler.PublisherPlacements)
	mux.HandleFunc("/api/publishers/{publisherId}/placements/{placementId}/dooh-settings", publishersHandler.PlacementDoohSettings)

	return corsMiddleware(cfg.FrontendOrigin, readOnlyMiddleware(mux))
}

// readOnlyMiddleware blocks all non-GET methods on proxy endpoints.
// The auth login endpoint is exempt since it requires POST.
func readOnlyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/auth/login" {
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

func corsMiddleware(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Access-Token, X-Refresh-Token")
		w.Header().Set("Access-Control-Expose-Headers", "X-New-Access-Token, X-New-Refresh-Token")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

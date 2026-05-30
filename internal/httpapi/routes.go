package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func NewRouter(cfg *config.Config, db *store.DB, h *hub.Hub, ing Ingestor) http.Handler {
	mux := http.NewServeMux()
	extensionRoutes(mux, db, cfg, h, ing)
	syncHistoryRoutes(mux, db, cfg)
	wsRoutes(mux, db, cfg, h, ing)
	claudeRoutes(mux, db, cfg, h, ing)
	claudeSkipRoutes(mux, db, cfg, h)
	debugRoutes(mux, db, cfg, h)
	draftsRoutes(mux, db, cfg, h)
	sentRoutes(mux, db, cfg)
	safetyRoutes(mux, db, cfg)
	spaceFactsRoutes(mux, db, cfg)
	messagesRoutes(mux, db, cfg)
	reactionsRoutes(mux, db, cfg, h)
	reactionsDirectRoutes(mux, db, cfg, h)
	spacesHistoryRoutes(mux, db, cfg, h)
	sendMessageRoutes(mux, db, cfg, h)
	spaceDirectoryRoutes(mux, db, cfg, h)
	// webRoutes must be registered last — it registers the catch-all "/" handler
	// that serves the React SPA for all unmatched paths.
	webRoutes(mux)

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	return logMiddleware(corsMiddleware(mux))
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		slog.Info("http", "method", r.Method, "path", r.URL.Path, "remote", r.RemoteAddr)
		next.ServeHTTP(w, r)
	})
}

// corsMiddleware answers preflight + attaches permissive CORS headers.
// Localhost-only dev server: wildcard origin is safe here.
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "600")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

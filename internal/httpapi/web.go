package httpapi

import (
	_ "embed"
	"net/http"
)

//go:embed web/app.html
var appHTML []byte

func webRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /app", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/app/", http.StatusFound)
	})
	mux.HandleFunc("GET /app/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(appHTML)
	})
}

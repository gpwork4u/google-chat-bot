package httpapi

import (
	_ "embed"
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

// app.html — 舊版單頁 HTML，保留在 /legacy 一個 sprint 供 fallback。
//
//go:embed web/app.html
var appHTML []byte

// distFS — Vite build 產物（web/dist/）。Vite 的 outDir 設定指向此目錄。
// 在沒有跑過 npm run build 時，dist/index.html 佔位檔確保 embed 可以編譯通過。
//
//go:embed all:web/dist
var distFS embed.FS

func webRoutes(mux *http.ServeMux) {
	// Legacy route: 舊版 app.html，保留一個 sprint 供比對。
	mux.HandleFunc("GET /legacy", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(appHTML)
	})
	mux.HandleFunc("GET /legacy/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(appHTML)
	})

	// SPA handler: 所有非 /api/* /ws/* /healthz /oauth/* /legacy/* 的路徑
	// 都交給 React Router 處理（fallback to index.html）。
	mux.Handle("/", newSPAHandler())
}

// newSPAHandler returns an http.Handler that serves the Vite SPA from distFS.
//
// Routing rules:
//  1. Path starts with /api/, /ws/, /healthz, /oauth/, /legacy → skip (caller handles)
//  2. Path matches a real file in dist/ → serve the file (assets, favicon…)
//  3. Everything else → return dist/index.html for client-side routing (React Router)
func newSPAHandler() http.Handler {
	sub, err := fs.Sub(distFS, "web/dist")
	if err != nil {
		panic("spa: cannot sub distFS: " + err.Error())
	}
	fileServer := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Hand off to their own registered handlers.
		for _, prefix := range []string{"/api/", "/ws/", "/healthz", "/oauth/", "/legacy"} {
			if strings.HasPrefix(path, prefix) {
				http.NotFound(w, r)
				return
			}
		}

		// Resolve the fs path (strip leading slash).
		fsPath := strings.TrimPrefix(path, "/")
		if fsPath == "" {
			fsPath = "index.html"
		}

		if _, err := fs.Stat(sub, fsPath); err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		// SPA fallback: client-side routing.
		indexHTML, err := fs.ReadFile(sub, "index.html")
		if err != nil {
			http.Error(w, "UI not built — run: make web-build", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexHTML)
	})
}

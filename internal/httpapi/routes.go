package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/oauth"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func NewRouter(cfg *config.Config, db *store.DB, oauthSvc *oauth.Service, h *hub.Hub, ing Ingestor) http.Handler {
	mux := http.NewServeMux()
	extensionRoutes(mux, db, cfg, h, ing)
	wsRoutes(mux, db, cfg, h, ing)
	debugRoutes(mux, db, cfg, h)
	webRoutes(mux)

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		body := `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><title>Google Chat Agent</title></head>
<body style="font-family:system-ui;max-width:640px;margin:4rem auto;line-height:1.6">
<h1>Google Chat AI Agent</h1>
<p>這個服務會接收 extension 傳回的 Google Chat 訊號並管理 draft。</p>
<p><a href="/app/">前往收件匣</a></p>`
		if oauthSvc != nil {
			body += `
<p><a href="/oauth/start">用 Google 帳號授權</a></p>`
		}
		body += `
</body></html>`
		_, _ = fmt.Fprint(w, body)
	})

	if oauthSvc != nil {
		mux.HandleFunc("GET /oauth/start", oauthSvc.Start)
		mux.HandleFunc("GET /oauth/callback", func(w http.ResponseWriter, r *http.Request) {
			email, err := oauthSvc.Callback(w, r)
			if err != nil {
				http.Error(w, "授權失敗: "+err.Error(), http.StatusBadRequest)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="zh-Hant"><body style="font-family:system-ui;max-width:640px;margin:4rem auto;line-height:1.6">
<h1>授權完成</h1>
<p>已以 <code>%s</code> 的身分授權成功，token 已加密寫入資料庫。</p>
<p><a href="/app/">前往收件匣</a></p>
</body></html>`, email)
		})
	}

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

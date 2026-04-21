package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/httpapi"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/oauth"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
	"github.com/ailabs-tw/google-chat-bot/internal/worker"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	db, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db open failed", "err", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := store.Migrate(ctx, db); err != nil {
		slog.Error("migration failed", "err", err)
		os.Exit(1)
	}
	slog.Info("migrations applied")

	var oauthSvc *oauth.Service
	if strings.TrimSpace(cfg.GoogleClientID) != "" &&
		strings.TrimSpace(cfg.GoogleClientSecret) != "" &&
		strings.TrimSpace(cfg.GoogleRedirectURL) != "" &&
		len(cfg.TokenEncryptionKey) == 32 &&
		len(cfg.StateSigningKey) > 0 {
		oauthSvc = oauth.New(cfg, db)
	} else {
		slog.Info("oauth disabled; extension-only mode")
	}
	h := hub.New()
	chatProc := worker.NewChatProcessor(db, h, cfg.LocalUserEmail, cfg.LocalUserName)
	router := httpapi.NewRouter(cfg, db, oauthSvc, h, chatProc)

	go chatProc.Run(ctx)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		slog.Info("server starting", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			cancel()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
}

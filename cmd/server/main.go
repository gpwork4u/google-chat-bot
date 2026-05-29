package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/httpapi"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/memstore"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
	"github.com/ailabs-tw/google-chat-bot/internal/worker"
)

func main() {
	// Local timezone: all log timestamps and time.Now() calls display in
	// UTC+8 so the ops output matches what the user sees on the clock.
	// Falls back to whatever the OS reports if the tz database entry is
	// missing (e.g. a stripped container image).
	if loc, err := time.LoadLocation("Asia/Taipei"); err == nil {
		time.Local = loc
	}
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

	h := hub.New()
	// In-memory raw_events store — 50k event ring buffer. Replaces the DB
	// raw_events table; we explicitly trade durability for zero-dependency.
	rawEvents := memstore.NewRawEventStore(50000)
	chatProc := worker.NewChatProcessor(db, h, cfg.LocalUserEmail, cfg.LocalUserName)
	chatProc.SetRawEvents(rawEvents)
	chatProc.SetChatSessionFile(cfg.ChatSessionFile)
	router := httpapi.NewRouter(cfg, db, h, chatProc)
	httpapi.SetRawEventsStore(rawEvents)

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

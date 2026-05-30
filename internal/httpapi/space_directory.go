package httpapi

// space_directory.go — GET /api/space-directory + POST /api/space-directory/refresh
//
// Surfaces the space_key → display_name mapping we accumulate from observed
// XHRs (and now, on demand, from a backend-driven batchexecute jfcZG call).
// Useful when the user wants to look up "which space is AAQ...?" without
// digging through Chat itself.

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/parser"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func spaceDirectoryRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("GET /api/space-directory", func(w http.ResponseWriter, r *http.Request) {
		handleListSpaceDirectory(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/space-directory/refresh", func(w http.ResponseWriter, r *http.Request) {
		handleRefreshSpaceDirectory(w, r, db, cfg, h)
	})
}

func handleListSpaceDirectory(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	rows, err := db.ListSpaceDirectory(ctx, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []store.SpaceDirectoryRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"count": len(rows),
		"rows":  rows,
	})
}

func handleRefreshSpaceDirectory(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if h == nil {
		writeErr(w, http.StatusInternalServerError, "hub unavailable")
		return
	}
	// Fire jfcZG (list spaces) via the proxy and parse on the way back. The
	// extension's normal XHR hook ALSO captures and the worker would
	// eventually ingest, but driving it from here gives the caller a
	// synchronous "yes the mapping just refreshed" signal.
	innerReq := []any{} // jfcZG takes an empty inner request
	respText, err := batchexecuteCall(ctx, h, "jfcZG", innerReq, "")
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}
	spaces, err := parser.ParseBatchExecuteJfcZG([]byte(respText))
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok":    false,
			"error": "parse jfcZG: " + err.Error(),
		})
		return
	}
	upserted := 0
	for _, s := range spaces {
		if s.SpaceKey == "" || s.SpaceName == "" {
			continue
		}
		if err := db.UpsertSpaceName(ctx, user.ID, s.SpaceKey, s.SpaceName); err != nil {
			slog.Warn("upsert space name (jfcZG refresh)", "err", err, "space", s.SpaceKey)
			continue
		}
		upserted++
	}
	rows, _ := db.ListSpaceDirectory(ctx, user.ID)
	if rows == nil {
		rows = []store.SpaceDirectoryRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"refreshed_at":  time.Now().UTC().Format(time.RFC3339),
		"upserted":      upserted,
		"total_in_resp": len(spaces),
		"count":         len(rows),
		"rows":          rows,
	})
}

// silence unused import when context import isn't otherwise needed
var _ = context.Canceled

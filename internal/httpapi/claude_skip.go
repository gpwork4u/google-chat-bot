package httpapi

// claude_skip.go — D-skip mark endpoints (CR-001 / F-011 / Sprint 5)
//
// POST /api/claude/skip    — mark a message as intentionally no-draft (idempotent)
// GET  /api/claude/skipped — list skip-marked messages
// POST /api/claude/unskip  — clear skip mark, return message to pending pool

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// allowedSkippedBy matches the CHECK constraint in migration 0018.
var allowedSkippedBy = map[string]bool{
	"skill":        true,
	"backend_auto": true,
	"manual":       true,
	"backfill":     true,
}

func claudeSkipRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /api/claude/skip", func(w http.ResponseWriter, r *http.Request) {
		handleSkip(w, r, db, cfg, h)
	})
	mux.HandleFunc("GET /api/claude/skipped", func(w http.ResponseWriter, r *http.Request) {
		handleListSkipped(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/claude/unskip", func(w http.ResponseWriter, r *http.Request) {
		handleUnskip(w, r, db, cfg, h)
	})
}

// skipReq is the body for POST /api/claude/skip.
type skipReq struct {
	MessageID string `json:"message_id"`
	Reason    string `json:"reason"`
	By        string `json:"by"`
}

// skipResp is the response for POST /api/claude/skip.
type skipResp struct {
	MessageID  string    `json:"message_id"`
	SkippedAt  time.Time `json:"skipped_at"`
	SkipReason string    `json:"skip_reason"`
	SkippedBy  string    `json:"skipped_by"`
}

// unskipReq is the body for POST /api/claude/unskip.
type unskipReq struct {
	MessageID string `json:"message_id"`
}

// unskipResp is the response for POST /api/claude/unskip.
type unskipResp struct {
	MessageID  string  `json:"message_id"`
	SkippedAt  *string `json:"skipped_at"`
	SkipReason *string `json:"skip_reason"`
	SkippedBy  *string `json:"skipped_by"`
}

func handleSkip(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	var req skipReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON body: "+err.Error())
		return
	}

	req.MessageID = strings.TrimSpace(req.MessageID)
	if req.MessageID == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "message_id is required")
		return
	}

	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "reason is required")
		return
	}
	if len(req.Reason) > 200 {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "reason must be at most 200 characters")
		return
	}

	if req.By == "" {
		req.By = "skill"
	}
	if !allowedSkippedBy[req.By] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "by must be one of: skill, backend_auto, manual, backfill")
		return
	}

	result, err := db.SkipMessage(ctx, user.ID, req.MessageID, req.Reason, req.By)
	if errors.Is(err, store.ErrNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "message not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// AC-11: broadcast pending_changed reason=skipped
	if h != nil {
		h.PendingChanged("skipped", result.MessageID)
	}

	writeJSON(w, http.StatusOK, skipResp{
		MessageID:  result.MessageID,
		SkippedAt:  result.SkippedAt,
		SkipReason: result.SkipReason,
		SkippedBy:  result.SkippedBy,
	})
}

func handleListSkipped(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	q := r.URL.Query()

	// limit: default 50, max 200
	limit := 50
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be a positive integer")
			return
		}
		if n > 200 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be at most 200")
			return
		}
		limit = n
	}

	// offset: default 0
	offset := 0
	if s := q.Get("offset"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 0 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "offset must be >= 0")
			return
		}
		offset = n
	}

	// since: optional RFC3339
	var since time.Time
	if s := q.Get("since"); s != "" {
		t, err := time.Parse(time.RFC3339, s)
		if err != nil {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "since must be RFC3339 format")
			return
		}
		since = t
	}

	by := strings.TrimSpace(q.Get("by"))
	spaceKey := strings.TrimSpace(q.Get("space_key"))
	senderContains := strings.TrimSpace(q.Get("sender_contains"))
	bodyContains := strings.TrimSpace(q.Get("body_contains"))

	opts := store.ListSkippedOptions{
		Limit:          limit,
		Offset:         offset,
		Since:          since,
		By:             by,
		SpaceKey:       spaceKey,
		SenderContains: senderContains,
		BodyContains:   bodyContains,
	}

	items, err := db.ListSkipped(ctx, user.ID, opts)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if items == nil {
		items = []store.SkippedItem{}
	}

	total, err := db.CountSkipped(ctx, user.ID, opts)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	nextOffset := offset + len(items)
	if nextOffset >= total {
		nextOffset = 0 // no more pages
	}

	// next_since: the skipped_at of the last (oldest) item, for cursor-based pagination.
	var nextSince *string
	if len(items) > 0 {
		last := items[len(items)-1].SkippedAt.UTC().Format(time.RFC3339Nano)
		nextSince = &last
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":       items,
		"next_since":  nextSince,
		"total":       total,
		"next_offset": nextOffset,
	})
}

func handleUnskip(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	var req unskipReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON body: "+err.Error())
		return
	}
	req.MessageID = strings.TrimSpace(req.MessageID)
	if req.MessageID == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "message_id is required")
		return
	}

	if err := db.UnskipMessage(ctx, user.ID, req.MessageID); errors.Is(err, store.ErrNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "message not found")
		return
	} else if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// AC-12: broadcast pending_changed reason=unskipped
	if h != nil {
		h.PendingChanged("unskipped", req.MessageID)
	}

	writeJSON(w, http.StatusOK, unskipResp{
		MessageID:  req.MessageID,
		SkippedAt:  nil,
		SkipReason: nil,
		SkippedBy:  nil,
	})
}

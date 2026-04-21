package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// claudeRoutes registers endpoints for an external agent (e.g. a Claude Code
// skill) to fetch messages that currently need a reply and post replies back.
//
// The filter is *not* parameterized on this API surface — the same knobs the
// user sets in the UI (Channel 設定 whitelist, 只回 @ 我) drive what shows
// up here. The agent only consumes.
func claudeRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("GET /api/claude/pending", func(w http.ResponseWriter, r *http.Request) {
		handleClaudePending(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/claude/reply", func(w http.ResponseWriter, r *http.Request) {
		handleClaudeReply(w, r, db, cfg, h)
	})
	mux.HandleFunc("GET /api/claude/style-profile", func(w http.ResponseWriter, r *http.Request) {
		handleStyleProfile(w, r, db, cfg)
	})
}

func handleClaudePending(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	debug := false
	if s := strings.ToLower(r.URL.Query().Get("debug")); s == "1" || s == "true" || s == "yes" {
		debug = true
	}
	pending, err := db.ListClaudePending(ctx, user.ID, limit, debug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pending == nil {
		pending = []store.ClaudePending{}
	}
	// Surface the filter + send-mode state so the agent knows which
	// conditions are on and whether to auto-send its reply.
	settings, _ := db.GetUserSettings(ctx, user.ID)
	var mentionOnly, autoMode bool
	var blocked string
	if settings != nil {
		mentionOnly = settings.ReplyOnlyWhenMentioned
		autoMode = settings.AutoMode
		blocked = settings.BlockedKeywords
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pending":                   pending,
		"reply_only_when_mentioned": mentionOnly,
		"auto_mode":                 autoMode,
		"blocked_keywords":          blocked,
		"local_user_name":           user.Name,
		"local_user_email":          user.Email,
		"debug":                     debug,
	})
}

type claudeReplyReq struct {
	MessageID int64  `json:"message_id"`
	Body      string `json:"body"`
	SendMode  string `json:"send_mode"` // "reply_thread" (default) | "new_topic"
	Model     string `json:"model"`     // optional label
	Reasoning string `json:"reasoning"` // optional, stored for audit
}

// handleClaudeReply is idempotent per message. The skill just posts the
// chosen reply; backend decides whether to send now (auto_mode=ON →
// approved, extension sends it) or park it for the user to approve in
// the UI (auto_mode=OFF). Re-posting for the same message updates the
// existing draft rather than stacking duplicates.
func handleClaudeReply(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req claudeReplyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MessageID <= 0 {
		writeErr(w, http.StatusBadRequest, "message_id required")
		return
	}
	if strings.TrimSpace(req.Body) == "" {
		writeErr(w, http.StatusBadRequest, "body required")
		return
	}
	sendMode := strings.TrimSpace(req.SendMode)
	if sendMode == "" {
		sendMode = "reply_thread"
	}
	if sendMode != "reply_thread" && sendMode != "new_topic" {
		writeErr(w, http.StatusBadRequest, "bad send_mode")
		return
	}
	model := req.Model
	if model == "" {
		model = "claude-code"
	}
	reasoning := req.Reasoning
	if reasoning == "" {
		reasoning = "posted by /api/claude/reply"
	}

	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	msg, err := db.GetMessage(ctx, user.ID, req.MessageID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if msg == nil {
		writeErr(w, http.StatusNotFound, "message not found")
		return
	}

	settings, _ := db.GetUserSettings(ctx, user.ID)
	autoSend := settings != nil && settings.AutoMode

	draftID, status, err := db.UpsertDraftForMessage(ctx, msg.ID, req.Body, model, sendMode, reasoning, autoSend)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.InboxChanged()
		if status == "approved" {
			pushPendingForClaude(ctx, db, h, user.ID)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"draft_id":  draftID,
		"status":    status,
		"auto_sent": autoSend,
	})
}

func handleStyleProfile(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	limit := 80
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	minLength := 2
	if s := r.URL.Query().Get("min_length"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n >= 0 && n <= 200 {
			minLength = n
		}
	}
	spaceKey := strings.TrimSpace(r.URL.Query().Get("space_key"))

	profile, err := db.BuildStyleProfile(ctx, user.ID, spaceKey, minLength, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	profile.LocalUserName = user.Name
	writeJSON(w, http.StatusOK, profile)
}

// pushPendingForClaude is a thin wrapper that broadcasts the current
// approved-pending queue to extensions, so the draft the agent just
// submitted hits the wire immediately.
func pushPendingForClaude(ctx context.Context, db *store.DB, h *hub.Hub, userID int64) {
	pending, err := db.ListApprovedPending(ctx, userID, 20)
	if err != nil {
		return
	}
	for _, item := range pending {
		h.Pending(item)
	}
}

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
	pending, err := db.ListClaudePending(ctx, user.ID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if pending == nil {
		pending = []store.ClaudePending{}
	}
	// Surface the filter state so the agent knows which conditions are on.
	settings, _ := db.GetUserSettings(ctx, user.ID)
	var mentionOnly bool
	if settings != nil {
		mentionOnly = settings.ReplyOnlyWhenMentioned
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"pending":                    pending,
		"reply_only_when_mentioned":  mentionOnly,
		"local_user_name":            user.Name,
	})
}

type claudeReplyReq struct {
	MessageID int64  `json:"message_id"`
	Body      string `json:"body"`
	SendMode  string `json:"send_mode"` // "reply_thread" (default) | "new_topic"
	Model     string `json:"model"`     // optional label
	Reasoning string `json:"reasoning"` // optional, stored for audit
	// AutoSend defaults to true for this endpoint: Claude Code is an
	// autonomous agent and the whole point is to bypass the approval queue.
	// Set to false to leave the draft in "pending" for human review.
	AutoSend *bool `json:"auto_send"`
}

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

	autoSend := true
	if req.AutoSend != nil {
		autoSend = *req.AutoSend
	}
	status := "pending"
	if autoSend {
		status = "approved"
	}

	draft := &store.Draft{
		MessageID: msg.ID,
		Body:      req.Body,
		Model:     model,
		SendMode:  sendMode,
		Status:    status,
		AutoSent:  autoSend,
		Reasoning: reasoning,
	}
	if err := db.InsertDraft(ctx, draft); err != nil {
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
		"ok":       true,
		"draft_id": draft.ID,
		"status":   status,
	})
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

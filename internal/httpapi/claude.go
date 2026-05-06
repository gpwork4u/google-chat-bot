package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/safety"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// claudeRoutes registers endpoints for an external agent (e.g. a Claude Code
// skill) to fetch messages that currently need a reply and post replies back.
//
// The filter is *not* parameterized on this API surface — the same knobs the
// user sets in the UI (Channel 設定 whitelist, 只回 @ 我) drive what shows
// up here. The agent only consumes.
func claudeRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub, ing Ingestor) {
	mux.HandleFunc("GET /api/claude/pending", func(w http.ResponseWriter, r *http.Request) {
		handleClaudePending(w, r, db, cfg, ing)
	})
	mux.HandleFunc("POST /api/claude/reply", func(w http.ResponseWriter, r *http.Request) {
		handleClaudeReply(w, r, db, cfg, h)
	})
	mux.HandleFunc("GET /api/claude/style-profile", func(w http.ResponseWriter, r *http.Request) {
		handleStyleProfile(w, r, db, cfg)
	})
	mux.HandleFunc("GET /api/claude/profile", func(w http.ResponseWriter, r *http.Request) {
		handleProfileGet(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/claude/profile", func(w http.ResponseWriter, r *http.Request) {
		handleProfileCreate(w, r, db, cfg)
	})
	mux.HandleFunc("PUT /api/claude/profile", func(w http.ResponseWriter, r *http.Request) {
		handleProfilePut(w, r, db, cfg)
	})
	mux.HandleFunc("PATCH /api/claude/profile/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleProfilePatchByID(w, r, db, cfg)
	})
	mux.HandleFunc("DELETE /api/claude/profile/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleProfileDeleteByID(w, r, db, cfg)
	})
	mux.HandleFunc("DELETE /api/claude/profile", func(w http.ResponseWriter, r *http.Request) {
		handleProfileDelete(w, r, db, cfg)
	})
}

func handleClaudePending(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, ing Ingestor) {
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
	var since time.Time
	if ing != nil {
		since = ing.SessionStart()
	}
	pending, err := db.ListClaudePending(ctx, user.ID, since, limit, debug)
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

	// --- F-008 安全護欄攔截 ---
	// 在寫入 DB 前執行 safety.Check；若命中則強制轉為 draft 模式。
	var safetyResult safety.Result
	if settings != nil {
		rules := settings.SafetyRules
		if rules == nil {
			rules = map[string]bool{"money": true}
		}
		globalSettings := safety.Settings{
			Enabled: settings.SafetyRailsEnabled,
			Rules:   rules,
		}
		spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "inherit"}
		if msg.SpaceKey != "" {
			override, _ := db.GetSpaceSafetyOverride(ctx, user.ID, msg.SpaceKey)
			spaceSettings.SafetyRailsOverride = override
		}
		safetyResult, _ = safety.Check(ctx, req.Body, msg.SpaceKey, globalSettings, spaceSettings, &safety.StubClaudeClient{})
		if safetyResult.Flagged {
			// 強制 draft 模式，覆蓋 auto_send。
			autoSend = false
		}
	}

	draftID, status, err := db.UpsertDraftForMessage(ctx, msg.ID, req.Body, model, sendMode, reasoning, autoSend)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// 若安全護欄命中，寫入 safety_flags / safety_trigger_reason。
	if safetyResult.Flagged && len(safetyResult.Flags) > 0 {
		_ = db.SetDraftSafetyFlags(ctx, draftID, safetyResult.Flags, safetyResult.Reason)
	}

	if h != nil {
		// If the skill re-POSTs to update an already-dispatched draft,
		// clear the single-dispatch claim so the updated body gets pushed.
		h.ReleaseDraft(draftID)
		h.InboxChanged()
		if status == "approved" {
			pushPendingForClaude(ctx, db, h, user.ID)
		}
	}
	safetyFlags := safetyResult.Flags
	if safetyFlags == nil {
		safetyFlags = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":             true,
		"draft_id":       draftID,
		"status":         status,
		"auto_sent":      autoSend,
		"safety_flagged": safetyResult.Flagged,
		"safety_flags":   safetyFlags,
		"safety_reason":  safetyResult.Reason,
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

// handleProfileGet returns the user's curated personal facts. By default
// `secret` facts are filtered out — the skill must not see them. Pass
// `?include_secret=1` (only served locally anyway) to dump everything for
// user-side management tooling.
//
// Optional `?key=<k>` returns a single fact, or 404.
func handleProfileGet(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key != "" {
		fact, err := db.GetProfileFact(ctx, user.ID, key)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		if fact == nil || fact.Visibility == "secret" {
			writeErr(w, http.StatusNotFound, "fact not found")
			return
		}
		writeJSON(w, http.StatusOK, fact)
		return
	}
	includeSecret := false
	if s := strings.ToLower(r.URL.Query().Get("include_secret")); s == "1" || s == "true" {
		includeSecret = true
	}
	facts, err := db.ListProfileFacts(ctx, user.ID, includeSecret)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"facts": facts,
	})
}

type profilePutReq struct {
	Key        string `json:"key"`
	Value      string `json:"value"`
	Visibility string `json:"visibility"`
	Note       string `json:"note"`
}

func handleProfilePut(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req profilePutReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	req.Value = strings.TrimSpace(req.Value)
	req.Visibility = strings.ToLower(strings.TrimSpace(req.Visibility))
	if req.Key == "" {
		writeErr(w, http.StatusBadRequest, "key required")
		return
	}
	if req.Value == "" {
		writeErr(w, http.StatusBadRequest, "value required")
		return
	}
	switch req.Visibility {
	case "public", "private", "secret":
	default:
		writeErr(w, http.StatusBadRequest, "visibility must be public|private|secret")
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.UpsertProfileFact(ctx, user.ID, store.ProfileFact{
		Key:        req.Key,
		Value:      req.Value,
		Visibility: req.Visibility,
		Note:       req.Note,
	}); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "key": req.Key})
}

func handleProfileDelete(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	key := strings.TrimSpace(r.URL.Query().Get("key"))
	if key == "" {
		writeErr(w, http.StatusBadRequest, "key required")
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.DeleteProfileFact(ctx, user.ID, key); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleProfileCreate creates a new profile fact and returns the new ID.
func handleProfileCreate(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req profilePutReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Key = strings.TrimSpace(req.Key)
	req.Value = strings.TrimSpace(req.Value)
	req.Visibility = strings.ToLower(strings.TrimSpace(req.Visibility))
	if req.Key == "" {
		writeErr(w, http.StatusBadRequest, "key required")
		return
	}
	if req.Value == "" {
		writeErr(w, http.StatusBadRequest, "value required")
		return
	}
	switch req.Visibility {
	case "public", "private", "secret":
	default:
		req.Visibility = "private"
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	id, err := db.CreateProfileFact(ctx, user.ID, store.ProfileFact{
		Key:        req.Key,
		Value:      req.Value,
		Visibility: req.Visibility,
		Note:       req.Note,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"ok": true, "id": id, "key": req.Key,
		"value": req.Value, "visibility": req.Visibility, "note": req.Note,
	})
}

// handleProfilePatchByID updates a profile fact by numeric ID.
func handleProfilePatchByID(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	raw := make(map[string]json.RawMessage)
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	patchReq := store.PatchProfileFactRequest{}
	if v, ok := raw["key"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			patchReq.Key = &s
		}
	}
	if v, ok := raw["value"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			patchReq.Value = &s
		}
	}
	if v, ok := raw["visibility"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			patchReq.Visibility = &s
		}
	}
	if v, ok := raw["note"]; ok {
		var s string
		if err := json.Unmarshal(v, &s); err == nil {
			patchReq.Note = &s
		}
	}
	if err := db.PatchProfileFact(ctx, user.ID, id, patchReq); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

// handleProfileDeleteByID removes a profile fact by numeric ID.
func handleProfileDeleteByID(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.DeleteProfileFactByID(ctx, user.ID, id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
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
		if !h.ClaimDraft(item.DraftID) {
			continue
		}
		h.Pending(item)
	}
}

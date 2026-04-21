package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// extensionRoutes registers the endpoints consumed by the Chrome extension
// and the inbox UI. These are localhost-only and intentionally unauthenticated
// for the single-user MVP.
//
// WS-era note: /api/ext/raw /api/ext/debug /api/ext/pending /api/ext/sent are
// preserved as HTTP fallbacks. The primary path is now /ws/ext (see ws.go).
func extensionRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub, ing Ingestor) {
	mux.HandleFunc("POST /api/ext/events", func(w http.ResponseWriter, r *http.Request) {
		handleExtEvent(w, r, db, cfg, h)
	})
	mux.HandleFunc("GET /api/ext/pending", func(w http.ResponseWriter, r *http.Request) {
		handleExtPending(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/ext/sent", func(w http.ResponseWriter, r *http.Request) {
		handleExtSent(w, r, db, h)
	})
	mux.HandleFunc("POST /api/ext/raw", func(w http.ResponseWriter, r *http.Request) {
		handleExtRaw(w, r, db, cfg, ing)
	})
	mux.HandleFunc("POST /api/ext/debug", func(w http.ResponseWriter, r *http.Request) {
		handleExtDebug(w, r, db, cfg)
	})

	mux.HandleFunc("GET /api/inbox", func(w http.ResponseWriter, r *http.Request) {
		handleInbox(w, r, db, cfg)
	})
	mux.HandleFunc("GET /api/messages/{id}/context", func(w http.ResponseWriter, r *http.Request) {
		handleMessageContext(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/drafts/{id}/approve", func(w http.ResponseWriter, r *http.Request) {
		handleDraftAction(w, r, db, "approved", h)
	})
	mux.HandleFunc("POST /api/drafts/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
		handleDraftAction(w, r, db, "rejected", h)
	})

	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		handleGetSettings(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/settings/auto-mode", func(w http.ResponseWriter, r *http.Request) {
		handleSetAutoMode(w, r, db, cfg, h)
	})
	mux.HandleFunc("POST /api/settings/mention-only", func(w http.ResponseWriter, r *http.Request) {
		handleSetMentionOnly(w, r, db, cfg, h)
	})

	mux.HandleFunc("GET /api/drafts/pending", func(w http.ResponseWriter, r *http.Request) {
		handlePendingDrafts(w, r, db, cfg)
	})
	mux.HandleFunc("PATCH /api/drafts/{id}", func(w http.ResponseWriter, r *http.Request) {
		handlePatchDraft(w, r, db, h)
	})

	mux.HandleFunc("GET /api/spaces", func(w http.ResponseWriter, r *http.Request) {
		handleListSpaces(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/spaces/toggle", func(w http.ResponseWriter, r *http.Request) {
		handleToggleSpace(w, r, db, cfg, h)
	})
}

func handlePendingDrafts(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	limit := 5
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, _ := strconv.Atoi(s); n > 0 && n <= 20 {
			limit = n
		}
	}
	drafts, err := db.GetPendingDraftsNeedingGeneration(ctx, user.ID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if drafts == nil {
		drafts = []store.PendingDraftView{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"drafts": drafts})
}

type patchDraftReq struct {
	Body       string   `json:"body"`
	Reasoning  string   `json:"reasoning"`
	Confidence *float32 `json:"confidence"`
	Model      string   `json:"model"`
}

func handlePatchDraft(w http.ResponseWriter, r *http.Request, db *store.DB, h *hub.Hub) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	var req patchDraftReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Body == "" {
		writeErr(w, http.StatusBadRequest, "body required")
		return
	}
	status, autoSent, err := db.PatchDraftGeneration(r.Context(), id, store.PatchDraftRequest{
		Body: req.Body, Reasoning: req.Reasoning, Confidence: req.Confidence, Model: req.Model,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.InboxChanged()
		if status == "approved" {
			pushPendingForUser(r.Context(), db, h)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok": true, "draft_id": id, "status": status, "auto_sent": autoSent,
	})
}

// pushPendingForUser broadcasts the currently-approved pending drafts to any
// connected extension WebSockets. Best-effort; over-sending is fine because
// content.js dedupes by draft_id.
func pushPendingForUser(ctx context.Context, db *store.DB, h *hub.Hub) {
	user, err := db.EnsureLocalUser(ctx, "", "")
	if err != nil || user == nil {
		return
	}
	pending, err := db.ListApprovedPending(ctx, user.ID, 20)
	if err != nil {
		return
	}
	for _, item := range pending {
		h.Pending(item)
	}
}

func handleListSpaces(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	spaces, err := db.ListSpaces(ctx, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if spaces == nil {
		spaces = []store.SpaceRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"spaces": spaces})
}

type toggleSpaceReq struct {
	SpaceKey *string `json:"space_key"`
	Disabled bool    `json:"disabled"`
}

func handleToggleSpace(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	var req toggleSpaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SpaceKey == nil {
		writeErr(w, http.StatusBadRequest, "space_key required")
		return
	}
	spaceKey := *req.SpaceKey
	if err := db.UpsertSpaceDisabled(ctx, user.ID, spaceKey, req.Disabled); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.SpacesChanged()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "space_key": spaceKey, "disabled": req.Disabled})
}

// --- handlers ---

type extEventReq struct {
	SpaceKey   string `json:"space_key"`
	SpaceName  string `json:"space_name"`
	ThreadKey  string `json:"thread_key"`
	MessageKey string `json:"message_key"`
	SenderName string `json:"sender_name"`
	SenderIsMe bool   `json:"sender_is_me"`
	Body       string `json:"body"`
	ObservedAt string `json:"observed_at"` // ISO 8601
}

func handleExtEvent(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req extEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SpaceKey == "" || req.MessageKey == "" {
		writeErr(w, http.StatusBadRequest, "space_key and message_key are required")
		return
	}
	observedAt, err := time.Parse(time.RFC3339, req.ObservedAt)
	if err != nil {
		observedAt = time.Now()
	}

	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	msg := &store.Message{
		UserID: user.ID, SpaceKey: req.SpaceKey, SpaceName: req.SpaceName,
		ThreadKey: req.ThreadKey, MessageKey: req.MessageKey,
		SenderName: req.SenderName, SenderIsMe: req.SenderIsMe,
		Body: req.Body, ObservedAt: observedAt,
	}
	inserted, err := db.InsertOrGetMessage(ctx, msg)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Only draft when the message is new AND from someone else.
	draftCreated := false
	if inserted && !msg.SenderIsMe {
		settings, err := db.GetUserSettings(ctx, user.ID)
		if err != nil {
			slog.Error("get settings", "err", err)
			settings = &store.UserSettings{UserID: user.ID}
		}

		// Placeholder draft until Claude is wired in.
		draft := &store.Draft{
			MessageID: msg.ID,
			Body:      "[stub draft] 收到你說：" + truncate(msg.Body, 40),
			Model:     "stub",
			SendMode:  "new_topic",
			Status:    "pending",
			Reasoning: "stub — Claude 尚未接上",
		}

		blocked := matchesBlockedKeyword(msg.Body, settings.BlockedKeywords)
		if settings.AutoMode && !blocked {
			draft.Status = "approved"
			draft.AutoSent = true
			draft.Reasoning = "auto-mode approved (stub)"
		} else if settings.AutoMode && blocked {
			draft.Reasoning = "auto-mode but blocked keyword hit — held for approval"
		}
		if err := db.InsertDraft(ctx, draft); err != nil {
			writeErr(w, http.StatusInternalServerError, "insert draft: "+err.Error())
			return
		}
		draftCreated = true
	}

	if h != nil && (inserted || draftCreated) {
		h.InboxChanged()
		if draftCreated {
			pushPendingForUser(ctx, db, h)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"message_id":    msg.ID,
		"inserted":      inserted,
		"draft_created": draftCreated,
	})
}

type rawEventReq struct {
	Kind string          `json:"kind"`
	URL  string          `json:"url"`
	Data json.RawMessage `json:"data"` // pass-through payload from inject-main.js
}

type debugEventReq struct {
	Stage string         `json:"stage"`
	Data  map[string]any `json:"data"`
}

func handleExtRaw(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, ing Ingestor) {
	// Body may be large (response bodies can be tens of KB). Cap at 256KB.
	r.Body = http.MaxBytesReader(w, r.Body, 256*1024)
	var req rawEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	u, _ := requireLocalUser(ctx, db, cfg)
	var uid int64
	if u != nil {
		uid = u.ID
	}
	if len(req.Data) == 0 {
		req.Data = []byte("null")
	}
	if err := db.InsertRawEvent(ctx, uid, req.Kind, req.URL, req.Data); err != nil {
		slog.Error("insert raw event", "err", err)
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ing != nil {
		if err := ing.Ingest(ctx, req.Kind, req.URL, req.Data); err != nil {
			slog.Warn("ingest raw", "err", err, "url", req.URL)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleExtDebug(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	r.Body = http.MaxBytesReader(w, r.Body, 64*1024)
	var req debugEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Stage == "" {
		writeErr(w, http.StatusBadRequest, "stage required")
		return
	}
	payload, err := json.Marshal(map[string]any{
		"stage": req.Stage,
		"data":  req.Data,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx := r.Context()
	u, _ := requireLocalUser(ctx, db, cfg)
	var uid int64
	if u != nil {
		uid = u.ID
	}
	if err := db.InsertRawEvent(ctx, uid, "ext-debug", "/api/ext/debug", payload); err != nil {
		slog.Error("insert ext debug", "err", err)
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleExtPending(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	pending, err := db.ListApprovedPending(ctx, user.ID, 20)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"pending": pending})
}

type extSentReq struct {
	DraftID int64  `json:"draft_id"`
	Success bool   `json:"success"`
	Error   string `json:"error"`
}

func handleExtSent(w http.ResponseWriter, r *http.Request, db *store.DB, h *hub.Hub) {
	var req extSentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	status := "sent"
	if !req.Success {
		status = "failed"
	}
	if err := db.UpdateDraftStatus(r.Context(), req.DraftID, status, req.Error); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.InboxChanged()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func handleMessageContext(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
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
	window := 30 * time.Minute
	if s := r.URL.Query().Get("window_minutes"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 7*24*60 {
			window = time.Duration(n) * time.Minute
		}
	}
	limit := 20
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	ctxBundle, err := db.MessageContext(ctx, user.ID, id, window, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ctxBundle == nil {
		writeErr(w, http.StatusNotFound, "message not found")
		return
	}
	writeJSON(w, http.StatusOK, ctxBundle)
}

func handleInbox(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	limit := 50
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, _ := strconv.Atoi(s); n > 0 && n <= 500 {
			limit = n
		}
	}
	rows, err := db.RecentInbox(ctx, user.ID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": rows})
}

func handleDraftAction(w http.ResponseWriter, r *http.Request, db *store.DB, newStatus string, h *hub.Hub) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "bad id")
		return
	}
	if newStatus == "approved" {
		var req struct {
			SendMode string `json:"send_mode"`
		}
		if r.Body != nil && r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeErr(w, http.StatusBadRequest, err.Error())
				return
			}
		}
		if req.SendMode != "" {
			if req.SendMode != "new_topic" && req.SendMode != "reply_thread" {
				writeErr(w, http.StatusBadRequest, "bad send_mode")
				return
			}
			if err := db.UpdateDraftSendMode(r.Context(), id, req.SendMode); err != nil {
				writeErr(w, http.StatusInternalServerError, err.Error())
				return
			}
		}
	}
	if err := db.UpdateDraftStatus(r.Context(), id, newStatus, ""); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.InboxChanged()
		if newStatus == "approved" {
			pushPendingForUser(r.Context(), db, h)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func handleGetSettings(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	s, err := db.GetUserSettings(ctx, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, s)
}

type setAutoModeReq struct {
	AutoMode bool `json:"auto_mode"`
}

type setMentionOnlyReq struct {
	MentionOnly bool `json:"mention_only"`
}

func handleSetMentionOnly(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req setMentionOnlyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.SetReplyOnlyWhenMentioned(ctx, user.ID, req.MentionOnly); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.SettingsChanged()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "mention_only": req.MentionOnly})
}

func handleSetAutoMode(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req setAutoModeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.SetAutoMode(ctx, user.ID, req.AutoMode); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if h != nil {
		h.SettingsChanged()
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "auto_mode": req.AutoMode})
}

// --- helpers ---

func requireLocalUser(ctx context.Context, db *store.DB, cfg *config.Config) (*store.User, error) {
	if cfg == nil {
		return db.EnsureLocalUser(ctx, "", "")
	}
	return db.EnsureLocalUser(ctx, cfg.LocalUserEmail, cfg.LocalUserName)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func matchesBlockedKeyword(body, csv string) bool {
	body = strings.ToLower(body)
	for _, k := range strings.Split(csv, ",") {
		k = strings.TrimSpace(strings.ToLower(k))
		if k == "" {
			continue
		}
		if strings.Contains(body, k) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

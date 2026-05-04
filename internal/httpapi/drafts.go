package httpapi

// drafts.go provides the /api/drafts endpoint consumed by the React approval UI.
//
// This is distinct from /api/ext/* (extension) and /api/claude/* (LLM skill)
// — it shapes data specifically for what ApprovalsPage needs.

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func draftsRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	// GET /api/drafts?status=pending&limit=N
	// Returns pending drafts shaped for the React approval UI.
	mux.HandleFunc("GET /api/drafts", func(w http.ResponseWriter, r *http.Request) {
		handleListDraftsUI(w, r, db, cfg)
	})

	// NOTE: POST /api/drafts/{id}/approve, POST /api/drafts/{id}/reject, and
	// PATCH /api/drafts/{id} are registered in extension.go (handleDraftAction /
	// handlePatchDraft). Those handlers now also accept the UI payload
	// {"content":"..."} for approve, so no duplicate routes are needed here.

	// POST /api/debug/inject-draft — dev-only endpoint for QA e2e tests.
	// Creates a fake pending draft so tests can exercise the approval flow
	// without needing a live Chat session.
	if os.Getenv("NODE_ENV") == "development" || os.Getenv("INJECT_DRAFT_ENABLED") == "1" {
		mux.HandleFunc("POST /api/debug/inject-draft", func(w http.ResponseWriter, r *http.Request) {
			handleDebugInjectDraft(w, r, db, cfg, h)
		})
	}
}

func handleListDraftsUI(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	limit := 100
	if s := r.URL.Query().Get("limit"); s != "" {
		if n, _ := strconv.Atoi(s); n > 0 && n <= 500 {
			limit = n
		}
	}
	drafts, err := db.ListPendingDraftsForUI(ctx, user.ID, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if drafts == nil {
		drafts = []store.DraftForUI{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"drafts": drafts})
}

// handleDebugInjectDraft creates a synthetic pending draft for e2e testing.
// Only enabled when NODE_ENV=development or INJECT_DRAFT_ENABLED=1.
type debugInjectDraftReq struct {
	SpaceKey    string `json:"space_key"`
	SpaceName   string `json:"space_name"`
	SenderName  string `json:"sender_name"`
	Body        string `json:"body"`
	DraftBody   string `json:"draft_body"`
}

func handleDebugInjectDraft(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	var req debugInjectDraftReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Body == "" {
		req.Body = "test message"
	}
	if req.DraftBody == "" {
		req.DraftBody = "test draft reply"
	}
	if req.SpaceKey == "" {
		req.SpaceKey = "debug-space"
	}
	if req.SpaceName == "" {
		req.SpaceName = "Debug Space"
	}
	if req.SenderName == "" {
		req.SenderName = "Debug User"
	}

	// Insert a fake message.
	msg := &store.Message{
		UserID:     user.ID,
		SpaceKey:   req.SpaceKey,
		SpaceName:  req.SpaceName,
		ThreadKey:  "debug-thread-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		MessageKey: "debug-msg-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		SenderName: req.SenderName,
		SenderIsMe: false,
		Body:       req.Body,
		ObservedAt: time.Now(),
	}
	if _, err := db.InsertOrGetMessage(ctx, msg); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Insert a pending draft for it.
	d := &store.Draft{
		MessageID: msg.ID,
		Body:      req.DraftBody,
		Model:     "debug",
		Status:    "pending",
	}
	if err := db.InsertDraft(ctx, d); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	if h != nil {
		h.InboxChanged()
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"ok":         true,
		"draft_id":   d.ID,
		"message_id": msg.ID,
	})
}

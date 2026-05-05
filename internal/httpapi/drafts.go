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
			handleDebugInjectDraft(w, r, nil, cfg, h)
		})
		registerSeedDraftsRoute(mux, db, cfg, h)
		// Generic WS-event injection — used by QA BDD scenarios to push
		// draft_created / draft_removed / settings_updated without a live Chat session.
		registerInjectWsEventRoute(mux, h)
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

// debugInjectDraftReq is the request body for POST /api/debug/inject-draft.
//
// Sprint 2 redesign: this endpoint no longer writes to the DB.  It broadcasts
// a draft_created WebSocket event directly so that BDD scenarios can use
// symbolic IDs (e.g. "A", "draft-ws-new") instead of DB-assigned numerics.
// The legacy inbox_changed event is still emitted for backward compat.
type debugInjectDraftReq struct {
	// Draft is the full draft object that will be forwarded verbatim to UI
	// WebSocket clients as the draft_created payload.
	//
	// If Draft.ID is absent or empty a unique ID is generated from the
	// current timestamp so the caller always gets a usable draft_id back.
	Draft map[string]any `json:"draft"`

	// ---- deprecated flat fields (kept for backward compat) ----
	// If Draft is not provided these are used to build a minimal object.
	SpaceKey   string `json:"space_key"`
	SpaceName  string `json:"space_name"`
	SenderName string `json:"sender_name"`
	Body       string `json:"body"`
	DraftBody  string `json:"draft_body"`
}

func handleDebugInjectDraft(w http.ResponseWriter, r *http.Request, _ *store.DB, _ *config.Config, h *hub.Hub) {
	// NOTE: Auth is intentionally omitted here. This endpoint is only
	// reachable when NODE_ENV=development or INJECT_DRAFT_ENABLED=1 (see
	// draftsRoutes), so it is never exposed in production. Adding a DB-backed
	// auth check would force tests to bring up a real DB; the dev restriction
	// at the routing layer is sufficient guard.
	_ = r.Context()

	var req debugInjectDraftReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}

	// Build draft payload — prefer the nested "draft" object; fall back to
	// legacy flat fields for backward-compat callers.
	draftPayload := req.Draft
	if draftPayload == nil {
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
		if req.Body == "" {
			req.Body = "test message"
		}
		draftPayload = map[string]any{
			"space_id":         req.SpaceKey,
			"space_name":       req.SpaceName,
			"sender_name":      req.SenderName,
			"original_message": req.Body,
			"draft_content":    req.DraftBody,
			"status":           "pending",
		}
	}

	// Ensure the draft has an id; generate one if absent.
	draftID := ""
	if v, ok := draftPayload["id"]; ok {
		switch s := v.(type) {
		case string:
			draftID = s
		case float64:
			draftID = strconv.FormatInt(int64(s), 10)
		}
	}
	if draftID == "" {
		draftID = "inject-" + strconv.FormatInt(time.Now().UnixNano(), 10)
		draftPayload["id"] = draftID
	}

	// Broadcast payload-bearing event. Also fire legacy inbox_changed for
	// any clients that haven't migrated to draft_created yet.
	if h != nil {
		h.DraftCreated(draftPayload)
		h.InboxChanged()
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"ok":       true,
		"draft_id": draftID,
	})
}

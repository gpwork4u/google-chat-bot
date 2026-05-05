package httpapi

// debug_inject_ws.go — POST /api/debug/inject-ws-event
//
// Generic WebSocket event injection endpoint for BDD e2e tests.
// Accepts a JSON body with a "type" field and dispatches the appropriate
// hub.Hub method so QA scenarios can exercise the full WS push path
// without needing a live Google Chat session.
//
// Only available when NODE_ENV=development or INJECT_DRAFT_ENABLED=1
// (registered in draftsRoutes, same guard as inject-draft and seed-drafts).
//
// Supported event types:
//   - draft_created:    { type, draft: { id, ... } }
//   - draft_removed:    { type, draft_id: "X" }
//   - settings_updated: { type, settings: { ... } }
//
// Successful response: 200 { "ok": true, "type": "<type>" }
// Error responses:     400 (bad JSON / unknown type), 422 (missing required field)

import (
	"encoding/json"
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/hub"
)

// injectWsEventReq is the polymorphic request body.
type injectWsEventReq struct {
	// Type is required. One of "draft_created", "draft_removed", "settings_updated".
	Type string `json:"type"`

	// Draft holds the full draft object for draft_created events.
	// Any JSON-serialisable map is accepted; the field is forwarded verbatim.
	Draft map[string]any `json:"draft,omitempty"`

	// DraftID is the symbolic/numeric draft identifier for draft_removed events.
	DraftID string `json:"draft_id,omitempty"`

	// Settings holds the full settings object for settings_updated events.
	Settings map[string]any `json:"settings,omitempty"`
}

// registerInjectWsEventRoute registers POST /api/debug/inject-ws-event.
// Must be called from draftsRoutes (or debugRoutes) after the dev-only guard.
func registerInjectWsEventRoute(mux *http.ServeMux, h *hub.Hub) {
	mux.HandleFunc("POST /api/debug/inject-ws-event", func(w http.ResponseWriter, r *http.Request) {
		handleDebugInjectWsEvent(w, r, h)
	})
}

func handleDebugInjectWsEvent(w http.ResponseWriter, r *http.Request, h *hub.Hub) {
	var req injectWsEventReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}

	if h == nil {
		// Hub not available (e.g. running without WS support) — just ack.
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "type": req.Type, "hub": "nil"})
		return
	}

	switch req.Type {
	case "draft_created":
		if req.Draft == nil {
			writeErr(w, http.StatusUnprocessableEntity, `"draft" field is required for type "draft_created"`)
			return
		}
		h.DraftCreated(req.Draft)

	case "draft_removed":
		if req.DraftID == "" {
			writeErr(w, http.StatusUnprocessableEntity, `"draft_id" field is required for type "draft_removed"`)
			return
		}
		h.DraftRemoved(req.DraftID)

	case "settings_updated":
		if req.Settings == nil {
			writeErr(w, http.StatusUnprocessableEntity, `"settings" field is required for type "settings_updated"`)
			return
		}
		h.SettingsUpdated(req.Settings)

	default:
		writeErr(w, http.StatusBadRequest, `unknown type "`+req.Type+`"; expected one of: draft_created, draft_removed, settings_updated`)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "type": req.Type})
}

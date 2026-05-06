// safety.go implements the /api/safety/* endpoints for F-008 safety rails.
package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/safety"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func safetyRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	// GET /api/safety/rules — return global enabled + rules from user_settings.
	mux.HandleFunc("GET /api/safety/rules", func(w http.ResponseWriter, r *http.Request) {
		handleGetSafetyRules(w, r, db, cfg)
	})

	// PATCH /api/safety/rules — partial update enabled and/or rules.
	mux.HandleFunc("PATCH /api/safety/rules", func(w http.ResponseWriter, r *http.Request) {
		handlePatchSafetyRules(w, r, db, cfg)
	})

	// POST /api/safety/check — internal endpoint; QA scenarios 5/6 use this.
	mux.HandleFunc("POST /api/safety/check", func(w http.ResponseWriter, r *http.Request) {
		handleSafetyCheck(w, r, db, cfg)
	})
}

// handleGetSafetyRules returns the current global safety configuration.
func handleGetSafetyRules(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
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
	rules := s.SafetyRules
	if rules == nil {
		rules = map[string]bool{"money": true}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled": s.SafetyRailsEnabled,
		"rules":   rules,
	})
}

// handlePatchSafetyRules performs a partial update of global safety settings.
func handlePatchSafetyRules(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	raw := make(map[string]json.RawMessage)
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	patchReq := store.PatchSettingsRequest{}
	if v, ok := raw["enabled"]; ok {
		var b bool
		if err := json.Unmarshal(v, &b); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid enabled")
			return
		}
		patchReq.SafetyRailsEnabled = &b
	}
	if v, ok := raw["rules"]; ok {
		patchReq.HasSafetyRules = true
		if err := json.Unmarshal(v, &patchReq.SafetyRules); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid rules")
			return
		}
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}
	if err := db.PatchUserSettings(ctx, user.ID, patchReq); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Return updated state (same structure as GET /api/safety/rules).
	s, err := db.GetUserSettings(ctx, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rules := s.SafetyRules
	if rules == nil {
		rules = map[string]bool{"money": true}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled": s.SafetyRailsEnabled,
		"rules":   rules,
	})
}

// safetyCheckReq is the request body for POST /api/safety/check.
type safetyCheckReq struct {
	DraftText string `json:"draft_text"`
	SpaceKey  string `json:"space_key"`
}

// handleSafetyCheck runs safety.Check for a given draft text + space, and
// returns the result. Used internally by the draft-write flow and by QA tests.
func handleSafetyCheck(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req safetyCheckReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.DraftText == "" {
		writeErr(w, http.StatusBadRequest, "draft_text required")
		return
	}
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Load global settings.
	s, err := db.GetUserSettings(ctx, user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rules := s.SafetyRules
	if rules == nil {
		rules = map[string]bool{"money": true}
	}
	globalSettings := safety.Settings{
		Enabled: s.SafetyRailsEnabled,
		Rules:   rules,
	}

	// Load per-space override (best-effort; missing row = inherit).
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "inherit"}
	if req.SpaceKey != "" {
		override, err := db.GetSpaceSafetyOverride(ctx, user.ID, req.SpaceKey)
		if err == nil {
			spaceSettings.SafetyRailsOverride = override
		}
	}

	result, err := safety.Check(ctx, req.DraftText, req.SpaceKey, globalSettings, spaceSettings, &safety.StubClaudeClient{})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	flags := result.Flags
	if flags == nil {
		flags = []string{}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"flagged": result.Flagged,
		"flags":   flags,
		"reason":  result.Reason,
	})
}

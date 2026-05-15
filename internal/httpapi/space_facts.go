package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// spaceFactsRoutes registers all /api/space-facts/* and /api/space-facts/mining-queue/* routes.
//
// Route order matters with net/http ServeMux: more specific patterns must be
// registered before the catch-all patterns. The "mining-queue" sub-resources
// must come before the generic "/{id}" paths to avoid mismatch.
func spaceFactsRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	// Mining-queue endpoints (registered before /{id} patterns).
	mux.HandleFunc("POST /api/space-facts/mining-queue", func(w http.ResponseWriter, r *http.Request) {
		handleMiningQueueEnqueue(w, r, db, cfg)
	})
	mux.HandleFunc("GET /api/space-facts/mining-queue", func(w http.ResponseWriter, r *http.Request) {
		handleMiningQueueList(w, r, db, cfg)
	})
	// Use {space_key...} to capture multi-segment space keys like "spaces/AAA".
	mux.HandleFunc("PATCH /api/space-facts/mining-queue/{space_key...}", func(w http.ResponseWriter, r *http.Request) {
		handleMiningQueuePatch(w, r, db, cfg)
	})

	// Candidates convenience endpoint.
	mux.HandleFunc("GET /api/space-facts/candidates", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsCandidates(w, r, db, cfg)
	})

	// Core CRUD.
	mux.HandleFunc("GET /api/space-facts", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsList(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/space-facts", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsCreate(w, r, db, cfg)
	})
	mux.HandleFunc("PATCH /api/space-facts/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsPatch(w, r, db, cfg)
	})
	mux.HandleFunc("DELETE /api/space-facts/{id}", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsDelete(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/space-facts/{id}/approve", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsApprove(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/space-facts/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceFactsReject(w, r, db, cfg)
	})
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func parseSpaceFactID(r *http.Request) (int64, bool) {
	s := r.PathValue("id")
	id, err := strconv.ParseInt(s, 10, 64)
	return id, err == nil && id > 0
}

// validateSpaceKey checks that the space_key exists in the spaces_directory
// for the local user. Returns false + writes 404 if not found.
func validateSpaceKey(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, spaceKey string) bool {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return false
	}
	exists, err := db.SpaceExistsInDirectory(ctx, user.ID, spaceKey)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return false
	}
	if !exists {
		writeErrCode(w, http.StatusNotFound, "SPACE_NOT_FOUND", "space_key not found in directory")
		return false
	}
	return true
}

// ─── GET /api/space-facts ────────────────────────────────────────────────────

func handleSpaceFactsList(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	q := r.URL.Query()
	filter := store.SpaceFactFilter{
		SpaceKey:   strings.TrimSpace(q.Get("space_key")),
		Category:   strings.TrimSpace(q.Get("category")),
		Status:     strings.TrimSpace(q.Get("status")),
		Visibility: strings.TrimSpace(q.Get("visibility")),
	}

	includeSecret := strings.ToLower(q.Get("include_secret"))
	filter.IncludeSecret = includeSecret == "1" || includeSecret == "true"

	facts, err := db.ListSpaceFacts(r.Context(), filter)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"facts": facts})
}

// ─── GET /api/space-facts/candidates ─────────────────────────────────────────

func handleSpaceFactsCandidates(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	q := r.URL.Query()
	limit := 50
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > 200 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "limit must be 1..200")
			return
		}
		limit = n
	}
	filter := store.SpaceFactFilter{
		SpaceKey:      strings.TrimSpace(q.Get("space_key")),
		Category:      strings.TrimSpace(q.Get("category")),
		Status:        "candidate",
		IncludeSecret: true, // candidates can have any visibility
		Limit:         limit,
	}
	facts, err := db.ListSpaceFacts(r.Context(), filter)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"facts": facts})
}

// ─── POST /api/space-facts ────────────────────────────────────────────────────

type createSpaceFactReq struct {
	SpaceKey         string  `json:"space_key"`
	Category         string  `json:"category"`
	Content          string  `json:"content"`
	Visibility       string  `json:"visibility"`
	SourceMessageIDs []int64 `json:"source_message_ids"`
	Note             string  `json:"note"`
	CreatedBy        string  `json:"created_by"`
}

func handleSpaceFactsCreate(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req createSpaceFactReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON: "+err.Error())
		return
	}

	// Validate content.
	content := strings.TrimSpace(req.Content)
	if content == "" || len(req.Content) > 1000 {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "content must be 1..1000 characters")
		return
	}

	// Validate category.
	if !store.ValidCategories[req.Category] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "category must be one of: product, my-role, glossary, pinned-decision, relation")
		return
	}

	// Validate visibility (if provided).
	if req.Visibility != "" && !store.ValidVisibilities[req.Visibility] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "visibility must be one of: public, private, secret")
		return
	}

	// Validate created_by (if provided).
	if req.CreatedBy != "" && req.CreatedBy != "mining-skill" && req.CreatedBy != "manual" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "created_by must be mining-skill or manual")
		return
	}

	// Validate space_key exists in directory.
	if !validateSpaceKey(w, r, db, cfg, req.SpaceKey) {
		return
	}

	fact, err := db.CreateSpaceFact(r.Context(), store.CreateSpaceFactParams{
		SpaceKey:         req.SpaceKey,
		Category:         req.Category,
		Content:          req.Content,
		Visibility:       req.Visibility,
		SourceMessageIDs: req.SourceMessageIDs,
		Note:             req.Note,
		CreatedBy:        req.CreatedBy,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, fact)
}

// ─── PATCH /api/space-facts/{id} ─────────────────────────────────────────────

type patchSpaceFactReq struct {
	Content    *string `json:"content"`
	Visibility *string `json:"visibility"`
	Status     *string `json:"status"`
	Note       *string `json:"note"`
	Category   *string `json:"category"`
}

func handleSpaceFactsPatch(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	id, ok := parseSpaceFactID(r)
	if !ok {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid id")
		return
	}

	var req patchSpaceFactReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON: "+err.Error())
		return
	}

	// Validate fields if provided.
	if req.Content != nil && (len(*req.Content) == 0 || len(*req.Content) > 1000) {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "content must be 1..1000 characters")
		return
	}
	if req.Visibility != nil && !store.ValidVisibilities[*req.Visibility] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid visibility")
		return
	}
	if req.Status != nil && !store.ValidStatuses[*req.Status] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid status")
		return
	}
	if req.Category != nil && !store.ValidCategories[*req.Category] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid category")
		return
	}

	fact, err := db.PatchSpaceFact(r.Context(), id, store.PatchSpaceFactParams{
		Content:    req.Content,
		Visibility: req.Visibility,
		Status:     req.Status,
		Note:       req.Note,
		Category:   req.Category,
	})
	if errors.Is(err, store.ErrFactNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "space fact not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, fact)
}

// ─── DELETE /api/space-facts/{id} ────────────────────────────────────────────

func handleSpaceFactsDelete(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	id, ok := parseSpaceFactID(r)
	if !ok {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid id")
		return
	}
	err := db.DeleteSpaceFact(r.Context(), id)
	if errors.Is(err, store.ErrFactNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "space fact not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ─── POST /api/space-facts/{id}/approve ──────────────────────────────────────

func handleSpaceFactsApprove(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	id, ok := parseSpaceFactID(r)
	if !ok {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid id")
		return
	}
	approved := "approved"
	fact, err := db.PatchSpaceFact(r.Context(), id, store.PatchSpaceFactParams{Status: &approved})
	if errors.Is(err, store.ErrFactNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "space fact not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, fact)
}

// ─── POST /api/space-facts/{id}/reject ───────────────────────────────────────

func handleSpaceFactsReject(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	id, ok := parseSpaceFactID(r)
	if !ok {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid id")
		return
	}
	rejected := "rejected"
	fact, err := db.PatchSpaceFact(r.Context(), id, store.PatchSpaceFactParams{Status: &rejected})
	if errors.Is(err, store.ErrFactNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "space fact not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, fact)
}

// ─── POST /api/space-facts/mining-queue ──────────────────────────────────────

type miningQueueEnqueueReq struct {
	SpaceKey string `json:"space_key"`
}

func handleMiningQueueEnqueue(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req miningQueueEnqueueReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON: "+err.Error())
		return
	}
	if req.SpaceKey == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "space_key required")
		return
	}

	job, isNew, err := db.EnqueueMiningJob(r.Context(), req.SpaceKey)
	if errors.Is(err, store.ErrMiningJobRunning) {
		writeErrCode(w, http.StatusConflict, "JOB_RUNNING", "a mining job for this space is already running")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	status := http.StatusOK
	if isNew {
		status = http.StatusCreated
	}
	writeJSON(w, status, job)
}

// ─── GET /api/space-facts/mining-queue ───────────────────────────────────────

func handleMiningQueueList(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	q := r.URL.Query()
	status := strings.TrimSpace(q.Get("status"))
	if status == "" {
		status = "pending"
	}
	limit := 50
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "limit must be >= 1")
			return
		}
		limit = n
	}

	jobs, err := db.ListMiningJobs(r.Context(), status, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

// ─── PATCH /api/space-facts/mining-queue/{space_key} ─────────────────────────

type patchMiningJobReq struct {
	Status              *string `json:"status"`
	LastMinedMessageID  *int64  `json:"last_mined_message_id"`
	CandidatesGenerated *int    `json:"candidates_generated"`
	ErrorMessage        *string `json:"error_message"`
}

func handleMiningQueuePatch(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	// The {space_key...} wildcard captures the remainder including slashes.
	spaceKey := r.PathValue("space_key")
	if spaceKey == "" {
		// Fallback: extract manually from path.
		spaceKey = extractSpaceKeyFromPath(r, "/api/space-facts/mining-queue/")
	}
	if spaceKey == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "space_key required in path")
		return
	}

	var req patchMiningJobReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON: "+err.Error())
		return
	}

	job, err := db.PatchMiningJob(r.Context(), spaceKey, store.PatchMiningJobParams{
		Status:              req.Status,
		LastMinedMessageID:  req.LastMinedMessageID,
		CandidatesGenerated: req.CandidatesGenerated,
		ErrorMessage:        req.ErrorMessage,
	})
	if errors.Is(err, store.ErrMiningJobNotFound) {
		writeErrCode(w, http.StatusNotFound, "NOT_FOUND", "mining job not found")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, job)
}

// extractSpaceKeyFromPath extracts the space_key portion of the URL path after
// the given prefix. This handles space_keys that contain slashes (e.g. "spaces/AAA").
func extractSpaceKeyFromPath(r *http.Request, prefix string) string {
	path := r.URL.Path
	if !strings.HasPrefix(path, prefix) {
		return ""
	}
	return strings.TrimPrefix(path, prefix)
}

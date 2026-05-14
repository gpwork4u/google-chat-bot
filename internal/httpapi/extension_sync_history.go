package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// syncHistoryRoutes registers the 4 sync-history endpoints consumed by the
// Chrome extension. All endpoints are localhost-only and intentionally
// unauthenticated (same pattern as the existing /api/ext/* routes).
func syncHistoryRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("POST /api/extension/sync-history/start", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryStart(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/extension/sync-history/batch", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryBatch(w, r, db, cfg)
	})
	// The spec also defines POST /api/extension/sync-history (without /batch suffix)
	// for backward compatibility with extension builds that use the old path.
	mux.HandleFunc("POST /api/extension/sync-history", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryBatch(w, r, db, cfg)
	})
	mux.HandleFunc("POST /api/extension/sync-history/complete", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryComplete(w, r, db, cfg)
	})
	mux.HandleFunc("GET /api/extension/sync-history/status", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryStatus(w, r, db, cfg)
	})
	// Alias: GET /api/extension/sync-history/progress (as mentioned in the issue brief)
	mux.HandleFunc("GET /api/extension/sync-history/progress", func(w http.ResponseWriter, r *http.Request) {
		handleSyncHistoryStatus(w, r, db, cfg)
	})
}

// uuidV4Re matches a canonical UUID v4 string (case-insensitive).
var uuidV4Re = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func isValidUUIDv4(s string) bool {
	return uuidV4Re.MatchString(s)
}

// ── POST /api/extension/sync-history/start ───────────────────────────────────

type syncStartReq struct {
	JobID    string  `json:"job_id"`
	SpaceKey *string `json:"space_key"`
}

type syncStartResp struct {
	JobID     string  `json:"job_id"`
	Status    string  `json:"status"`
	SpaceKey  *string `json:"space_key"`
	StartedAt string  `json:"started_at"`
}

func handleSyncHistoryStart(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req syncStartReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if !isValidUUIDv4(req.JobID) {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "job_id must be a UUID v4")
		return
	}

	ctx := r.Context()
	// Normalise empty space_key to nil.
	spaceKey := req.SpaceKey
	if spaceKey != nil && *spaceKey == "" {
		spaceKey = nil
	}

	if err := db.CreateSyncJob(ctx, req.JobID, spaceKey); err != nil {
		if errors.Is(err, store.ErrJobExists) {
			writeErrCode(w, http.StatusConflict, "JOB_EXISTS", "a job with this job_id already exists")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Fetch the freshly created row so we return the DB-authoritative started_at.
	job, err := db.GetSyncJob(ctx, req.JobID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, syncStartResp{
		JobID:     job.JobID,
		Status:    job.Status,
		SpaceKey:  job.SpaceKey,
		StartedAt: job.StartedAt.UTC().Format(time.RFC3339),
	})
}

// ── POST /api/extension/sync-history/batch ───────────────────────────────────
// (also handles POST /api/extension/sync-history for backward compat)

type syncMessage struct {
	MessageID  string `json:"message_id"`
	SpaceKey   string `json:"space_key"`
	SpaceName  string `json:"space_name"`
	ThreadKey  string `json:"thread_key"`
	SenderID   string `json:"sender_id"`
	SenderName string `json:"sender_name"`
	Body       string `json:"body"`
	ObservedAt string `json:"observed_at"` // ISO 8601
	Mentioned  bool   `json:"mentioned"`
}

type syncBatchReq struct {
	JobID    string        `json:"job_id"`
	Messages []syncMessage `json:"messages"`
}

type syncBatchResp struct {
	Inserted      int `json:"inserted"`
	Duplicates    int `json:"duplicates"`
	Failed        int `json:"failed"`
	JobTotalSoFar int `json:"job_total_so_far"`
}

func handleSyncHistoryBatch(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	// Cap body at 32 MB to prevent oversized payloads.
	r.Body = http.MaxBytesReader(w, r.Body, 32*1024*1024)

	var req syncBatchReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}

	if len(req.Messages) == 0 {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "messages array must not be empty")
		return
	}
	if len(req.Messages) > 500 {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
			fmt.Sprintf("batch size %d exceeds maximum of 500", len(req.Messages)))
		return
	}

	ctx := r.Context()

	// Verify job exists and is running before starting any inserts.
	job, err := db.GetSyncJob(ctx, req.JobID)
	if err != nil {
		if errors.Is(err, store.ErrJobNotFound) {
			writeErrCode(w, http.StatusNotFound, "JOB_NOT_FOUND", "no running job found for the given job_id")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if job.Status != "running" {
		writeErrCode(w, http.StatusNotFound, "JOB_NOT_FOUND", "job is not in running state")
		return
	}

	// Resolve the local user so messages are stored under the correct user_id.
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil || user == nil {
		writeErr(w, http.StatusInternalServerError, "failed to resolve local user")
		return
	}

	var inserted, duplicates, failed int
	for _, m := range req.Messages {
		// Validate required fields per AC-13 / AC-14.
		if m.SenderName == "" || m.SpaceKey == "" || m.Body == "" || m.MessageID == "" {
			failed++
			continue
		}

		observedAt, parseErr := time.Parse(time.RFC3339, m.ObservedAt)
		if parseErr != nil {
			// Try without 'Z' suffix.
			observedAt = time.Now()
		}

		msg := &store.Message{
			UserID:     user.ID,
			SpaceKey:   m.SpaceKey,
			SpaceName:  m.SpaceName,
			ThreadKey:  m.ThreadKey,
			MessageKey: m.MessageID,
			SenderID:   m.SenderID,
			SenderName: m.SenderName,
			SenderIsMe: false,
			Body:       m.Body,
			ObservedAt: observedAt,
		}

		wasInserted, insertErr := db.InsertOrGetMessage(ctx, msg)
		if insertErr != nil {
			failed++
			continue
		}
		if wasInserted {
			inserted++
		} else {
			duplicates++
		}
	}

	// Update job running totals atomically.
	if recordErr := db.RecordBatch(ctx, req.JobID, inserted, duplicates, failed); recordErr != nil {
		// Non-fatal for the caller — counts are returned regardless.
		_ = recordErr
	}

	// Fetch fresh total to return accurate job_total_so_far.
	updatedJob, err := db.GetSyncJob(ctx, req.JobID)
	jobTotal := 0
	if err == nil {
		jobTotal = updatedJob.TotalMessages
	}

	writeJSON(w, http.StatusOK, syncBatchResp{
		Inserted:      inserted,
		Duplicates:    duplicates,
		Failed:        failed,
		JobTotalSoFar: jobTotal,
	})
}

// ── POST /api/extension/sync-history/complete ────────────────────────────────

type syncCompleteReq struct {
	JobID        string  `json:"job_id"`
	Status       string  `json:"status"`
	ErrorMessage *string `json:"error_message"`
}

func handleSyncHistoryComplete(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req syncCompleteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", err.Error())
		return
	}
	if req.JobID == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "job_id is required")
		return
	}
	if req.Status != "completed" && req.Status != "failed" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "status must be 'completed' or 'failed'")
		return
	}

	ctx := r.Context()
	if err := db.MarkJobComplete(ctx, req.JobID, req.Status, req.ErrorMessage); err != nil {
		if errors.Is(err, store.ErrJobNotFound) {
			writeErrCode(w, http.StatusNotFound, "JOB_NOT_FOUND", "no job found for the given job_id")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── GET /api/extension/sync-history/status ───────────────────────────────────
// (also handles GET /api/extension/sync-history/progress)

type syncStatusResp struct {
	JobID             string  `json:"job_id"`
	Status            string  `json:"status"`
	SpaceKey          *string `json:"space_key"`
	TotalMessages     int     `json:"total_messages"`
	InsertedMessages  int     `json:"inserted_messages"`
	DuplicateMessages int     `json:"duplicate_messages"`
	FailedMessages    int     `json:"failed_messages"`
	StartedAt         string  `json:"started_at"`
	CompletedAt       *string `json:"completed_at"`
	ErrorMessage      *string `json:"error_message"`
}

func handleSyncHistoryStatus(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "job_id query parameter is required")
		return
	}

	ctx := r.Context()
	job, err := db.GetSyncJob(ctx, jobID)
	if err != nil {
		if errors.Is(err, store.ErrJobNotFound) {
			writeErrCode(w, http.StatusNotFound, "JOB_NOT_FOUND", "no job found for the given job_id")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	resp := syncStatusResp{
		JobID:             job.JobID,
		Status:            job.Status,
		SpaceKey:          job.SpaceKey,
		TotalMessages:     job.TotalMessages,
		InsertedMessages:  job.InsertedMessages,
		DuplicateMessages: job.DuplicateMessages,
		FailedMessages:    job.FailedMessages,
		StartedAt:         job.StartedAt.UTC().Format(time.RFC3339),
		ErrorMessage:      job.ErrorMessage,
	}
	if job.CompletedAt.Valid {
		s := job.CompletedAt.Time.UTC().Format(time.RFC3339)
		resp.CompletedAt = &s
	}

	writeJSON(w, http.StatusOK, resp)
}


package httpapi

// spaces_history.go — POST /api/spaces/sync-history
//
// Backend drives the multi-RPC scan loop:
//   list_topics(spaceKey, pageToken) → topics
//   for each topic: get_topic_messages(spaceKey, topicID) → messages
//   insert into DB via existing job-tracked path
// Extension is just the proxy used to fire each individual batchexecute.

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

type spaceHistoryRequest struct {
	SpaceKey       string `json:"space_key"`
	Limit          int    `json:"limit"`
	Wait           *bool  `json:"wait"`            // default true
	TimeoutSeconds int    `json:"timeout_seconds"` // default 60
}

func spacesHistoryRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /api/spaces/sync-history", func(w http.ResponseWriter, r *http.Request) {
		handleSpaceSyncHistory(w, r, db, cfg, h)
	})
}

func handleSpaceSyncHistory(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req spaceHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.SpaceKey = strings.TrimSpace(req.SpaceKey)
	if req.SpaceKey == "" {
		writeErr(w, http.StatusBadRequest, "space_key required")
		return
	}
	if !strings.HasPrefix(req.SpaceKey, "space:") {
		req.SpaceKey = "space:" + req.SpaceKey
	}
	if req.Limit < 1 || req.Limit > 500 {
		req.Limit = 200
	}
	wait := true
	if req.Wait != nil {
		wait = *req.Wait
	}
	timeoutSec := req.TimeoutSeconds
	if timeoutSec <= 0 || timeoutSec > 300 {
		timeoutSec = 60
	}

	ctx := r.Context()
	jobID, err := newSyncJobUUID()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	spaceKey := req.SpaceKey
	if err := db.CreateSyncJob(ctx, jobID, &spaceKey); err != nil {
		if errors.Is(err, store.ErrJobExists) {
			writeErr(w, http.StatusConflict, "job collision")
			return
		}
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil || user == nil {
		writeErr(w, http.StatusInternalServerError, "failed to resolve local user")
		return
	}

	// Background goroutine runs the actual scan. Use a fresh context detached
	// from the HTTP request so we can keep going if the caller is async.
	scanCtx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	go func() {
		defer cancel()
		runSyncHistoryScan(scanCtx, db, h, user.ID, jobID, spaceKey)
	}()

	if !wait {
		writeJSON(w, http.StatusAccepted, map[string]any{
			"job_id":    jobID,
			"space_key": spaceKey,
			"status":    "running",
		})
		return
	}

	// Synchronous mode: poll the DB job until it finishes or we time out.
	deadline := time.Now().Add(time.Duration(timeoutSec) * time.Second)
	for {
		job, err := db.GetSyncJob(ctx, jobID)
		if err == nil && job != nil {
			if job.Status == "completed" || job.Status == "failed" {
				finalizeSyncResponse(w, ctx, db, cfg, jobID, spaceKey, req.Limit, job)
				return
			}
		}
		if time.Now().After(deadline) {
			writeJSON(w, http.StatusGatewayTimeout, map[string]any{
				"job_id":    jobID,
				"space_key": spaceKey,
				"status":    "timeout",
				"error":     "scan did not finish within timeout (extension live? boq params present?)",
			})
			return
		}
		select {
		case <-ctx.Done():
			writeErr(w, http.StatusRequestTimeout, "client disconnected")
			return
		case <-time.After(500 * time.Millisecond):
		}
	}
}

// runSyncHistoryScan walks every topic in the given space via batchexecute
// RPCs (routed through the extension proxy) and writes the messages into the
// local DB.
func runSyncHistoryScan(ctx context.Context, db *store.DB, h *hub.Hub, userID int64, jobID, spaceKey string) {
	failJob := func(reason string) {
		s := reason
		_ = db.MarkJobComplete(ctx, jobID, "failed", &s)
		slog.Warn("sync-history scan failed", "job_id", jobID, "space_key", spaceKey, "reason", reason)
	}

	var pageToken string
	totalInserted, totalDuplicates, totalFailed := 0, 0, 0
	for {
		topics, next, err := listTopics(ctx, h, spaceKey, pageToken)
		if err != nil {
			failJob("list_topics: " + err.Error())
			return
		}
		for _, t := range topics {
			messages, err := getTopicMessages(ctx, h, t.SpaceKey, t.TopicID, "")
			if err != nil {
				slog.Warn("get_topic_messages failed", "topic", t.TopicID, "err", err)
				continue
			}
			ins, dup, fail := insertSyncMessagesGo(ctx, db, userID, messages)
			totalInserted += ins
			totalDuplicates += dup
			totalFailed += fail
			if err := db.RecordBatch(ctx, jobID, ins, dup, fail); err != nil {
				slog.Warn("record batch", "err", err)
			}
			if ctx.Err() != nil {
				failJob("context cancelled mid-scan")
				return
			}
		}
		if next == "" {
			break
		}
		pageToken = next
	}
	if err := db.MarkJobComplete(ctx, jobID, "completed", nil); err != nil {
		slog.Warn("mark complete", "err", err)
	}
	slog.Info("sync-history scan completed",
		"job_id", jobID, "space_key", spaceKey,
		"inserted", totalInserted, "duplicates", totalDuplicates, "failed", totalFailed)
}

func insertSyncMessagesGo(ctx context.Context, db *store.DB, userID int64, messages []syncMessageGo) (inserted, duplicates, failed int) {
	for _, m := range messages {
		ts, err := time.Parse(time.RFC3339, m.ObservedAt)
		if err != nil {
			ts = time.Now()
		}
		row := &store.Message{
			UserID:     userID,
			MessageKey: m.MessageID,
			SpaceKey:   m.SpaceKey,
			SpaceName:  m.SpaceName,
			ThreadKey:  m.ThreadKey,
			SenderID:   m.SenderID,
			SenderName: m.SenderName,
			Body:       m.Body,
			ObservedAt: ts,
			Mentioned:  m.Mentioned,
		}
		newRow, err := db.InsertOrGetMessage(ctx, row)
		if err != nil {
			failed++
			continue
		}
		if newRow {
			inserted++
		} else {
			duplicates++
		}
	}
	return
}

func finalizeSyncResponse(w http.ResponseWriter, ctx context.Context, db *store.DB, cfg *config.Config, jobID, spaceKey string, limit int, job *store.SyncJob) {
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil || user == nil {
		writeErr(w, http.StatusInternalServerError, "failed to resolve local user")
		return
	}
	messages, _, err := db.ListMessagesBySpace(ctx, user.ID, spaceKey, store.ListMessagesOpts{Limit: limit})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "list messages: "+err.Error())
		return
	}
	if messages == nil {
		messages = []store.MessageForAPI{}
	}
	status := job.Status
	resp := map[string]any{
		"job_id":    jobID,
		"space_key": spaceKey,
		"status":    status,
		"messages":  messages,
		"count":     len(messages),
		"scanned":   job.TotalMessages,
	}
	if job.ErrorMessage != nil && *job.ErrorMessage != "" {
		resp["error"] = *job.ErrorMessage
	}
	httpStatus := http.StatusOK
	if status == "failed" {
		httpStatus = http.StatusBadGateway
	}
	writeJSON(w, httpStatus, resp)
}

func newSyncJobUUID() (string, error) {
	return newProxyReqID() // re-use the random-id helper; both just need uniqueness
}

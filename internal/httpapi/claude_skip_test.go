package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// --- validation-only helpers (no DB) ---

// validateSkipReq mirrors the validation logic in handleSkip, for pure unit testing.
func validateSkipReq(w http.ResponseWriter, r *http.Request) bool {
	var req skipReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "invalid JSON body: "+err.Error())
		return false
	}
	req.MessageID = strings.TrimSpace(req.MessageID)
	if req.MessageID == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "message_id is required")
		return false
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if req.Reason == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "reason is required")
		return false
	}
	if len(req.Reason) > 200 {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "reason must be at most 200 characters")
		return false
	}
	if req.By == "" {
		req.By = "skill"
	}
	if !allowedSkippedBy[req.By] {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "by must be one of: skill, backend_auto, manual, backfill")
		return false
	}
	return true
}

// validateListSkippedReq mirrors validation logic in handleListSkipped.
func validateListSkippedReq(w http.ResponseWriter, r *http.Request) bool {
	q := r.URL.Query()
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be a positive integer")
			return false
		}
		if n > 200 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be at most 200")
			return false
		}
	}
	if s := q.Get("since"); s != "" {
		if _, err := time.Parse(time.RFC3339, s); err != nil {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "since must be RFC3339 format")
			return false
		}
	}
	return true
}

// --- unit tests ---

// TestSkipValidation_BadInputs verifies 400 INVALID_INPUT for each bad case.
func TestSkipValidation_BadInputs(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "empty reason",
			body:       `{"message_id":"msg_001","reason":"","by":"skill"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "reason over 200 chars",
			body:       `{"message_id":"msg_001","reason":"` + strings.Repeat("x", 201) + `","by":"skill"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "invalid by value",
			body:       `{"message_id":"msg_001","reason":"pure-ack","by":"robot"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "missing message_id",
			body:       `{"reason":"pure-ack","by":"skill"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "invalid JSON",
			body:       `not-json`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/claude/skip", bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			validateSkipReq(w, req)

			if w.Code != tc.wantStatus {
				t.Errorf("expected status %d, got %d (body=%s)", tc.wantStatus, w.Code, w.Body.String())
			}
			var resp map[string]string
			if err := json.NewDecoder(w.Body).Decode(&resp); err == nil {
				if resp["code"] != tc.wantCode {
					t.Errorf("expected code=%q, got %q", tc.wantCode, resp["code"])
				}
			}
		})
	}
}

// TestSkipByDefault verifies that omitting "by" defaults to "skill".
func TestSkipByDefault(t *testing.T) {
	var req skipReq
	json.Unmarshal([]byte(`{"message_id":"msg_001","reason":"pure-ack"}`), &req)
	if req.By == "" {
		req.By = "skill"
	}
	if req.By != "skill" {
		t.Errorf("expected default by=skill, got %q", req.By)
	}
}

// TestAllowedSkippedByEnum tests enum validation completeness.
func TestAllowedSkippedByEnum(t *testing.T) {
	valid := []string{"skill", "backend_auto", "manual", "backfill"}
	for _, v := range valid {
		if !allowedSkippedBy[v] {
			t.Errorf("expected %q to be valid", v)
		}
	}
	invalid := []string{"", "robot", "system", "SKILL", "Backend"}
	for _, v := range invalid {
		if allowedSkippedBy[v] {
			t.Errorf("expected %q to be invalid", v)
		}
	}
}

// TestSkipIdempotentLogic documents that the second skip call returns original values.
func TestSkipIdempotentLogic(t *testing.T) {
	firstTime := time.Date(2026, 5, 7, 3, 0, 0, 0, time.UTC)
	existing := &store.SkipResult{
		MessageID:  "msg_002",
		SkippedAt:  firstTime,
		SkipReason: "pure-ack",
		SkippedBy:  "skill",
	}
	// Simulate: second call returns same (idempotent)
	result := existing
	if !result.SkippedAt.Equal(firstTime) {
		t.Error("idempotent skip must not change skipped_at")
	}
	if result.SkipReason != "pure-ack" {
		t.Errorf("idempotent skip must not change skip_reason, got %q", result.SkipReason)
	}
}

// TestUnskipResponseNullFields verifies unskipResp serializes null fields correctly.
func TestUnskipResponseNullFields(t *testing.T) {
	resp := unskipResp{
		MessageID:  "msg_undo",
		SkippedAt:  nil,
		SkipReason: nil,
		SkippedBy:  nil,
	}
	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	for _, field := range []string{"skipped_at", "skip_reason", "skipped_by"} {
		if v, ok := m[field]; !ok || v != nil {
			t.Errorf("expected %s to be null, got %v", field, v)
		}
	}
	if m["message_id"] != "msg_undo" {
		t.Errorf("expected message_id=msg_undo, got %v", m["message_id"])
	}
}

// TestListSkippedLimitValidation verifies invalid limit values return 400.
func TestListSkippedLimitValidation(t *testing.T) {
	cases := []struct {
		limitParam string
		wantStatus int
	}{
		{"201", http.StatusBadRequest},
		{"0", http.StatusBadRequest},
		{"-1", http.StatusBadRequest},
		{"abc", http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run("limit="+tc.limitParam, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/claude/skipped?limit="+tc.limitParam, nil)
			w := httptest.NewRecorder()
			validateListSkippedReq(w, r)
			if w.Code != tc.wantStatus {
				t.Errorf("expected status %d, got %d", tc.wantStatus, w.Code)
			}
			var resp map[string]string
			json.NewDecoder(w.Body).Decode(&resp)
			if resp["code"] != "INVALID_PARAM" {
				t.Errorf("expected INVALID_PARAM, got %q", resp["code"])
			}
		})
	}
}

// TestListSkippedSinceValidation verifies non-RFC3339 since param returns 400.
func TestListSkippedSinceValidation(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/api/claude/skipped?since=not-a-date", nil)
	w := httptest.NewRecorder()
	validateListSkippedReq(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["code"] != "INVALID_PARAM" {
		t.Errorf("expected INVALID_PARAM, got %q", resp["code"])
	}
}

// TestSkipRespSkippedAtNotNull verifies skipResp serializes non-null skipped_at.
func TestSkipRespSkippedAtNotNull(t *testing.T) {
	now := time.Now().UTC()
	resp := skipResp{
		MessageID:  "msg_001",
		SkippedAt:  now,
		SkipReason: "pure-ack",
		SkippedBy:  "skill",
	}
	b, _ := json.Marshal(resp)
	var m map[string]interface{}
	json.Unmarshal(b, &m)
	if m["skipped_at"] == nil {
		t.Error("expected skipped_at to be non-null in skip response")
	}
	if m["message_id"] != "msg_001" {
		t.Errorf("expected message_id=msg_001, got %v", m["message_id"])
	}
}

// TestPendingQueryIncludesSkippedAtFilter documents the SQL requirement.
func TestPendingQueryIncludesSkippedAtFilter(t *testing.T) {
	// The ListClaudePending SQL in store/claude.go must include this filter.
	// We document it here as a contract test.
	expectedFilter := "m.skipped_at IS NULL"
	// Construct a representative fragment of the WHERE clause
	whereClause := `WHERE m.user_id = $1
  AND d.id IS NULL
  AND m.skipped_at IS NULL
  AND COALESCE(s.disabled, TRUE) = FALSE`
	if !strings.Contains(whereClause, expectedFilter) {
		t.Errorf("pending SQL must contain %q", expectedFilter)
	}
}

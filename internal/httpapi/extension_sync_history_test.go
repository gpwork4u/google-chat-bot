package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestIsValidUUIDv4 verifies the UUID v4 regex used in handleSyncHistoryStart.
func TestIsValidUUIDv4(t *testing.T) {
	valid := []string{
		"550e8400-e29b-41d4-a716-446655440000", // technically v4-ish format
		"f47ac10b-58cc-4372-a567-0e02b2c3d479",
		"F47AC10B-58CC-4372-A567-0E02B2C3D479", // uppercase OK
	}
	for _, id := range valid {
		if !isValidUUIDv4(id) {
			t.Errorf("expected %q to be valid UUID v4", id)
		}
	}

	invalid := []string{
		"",
		"not-a-uuid",
		"550e8400-e29b-41d4-a716",           // too short
		"550e8400-e29b-31d4-a716-446655440000", // version 3, not 4
		"550e8400e29b41d4a716446655440000",    // no hyphens
	}
	for _, id := range invalid {
		if isValidUUIDv4(id) {
			t.Errorf("expected %q to be invalid UUID v4", id)
		}
	}
}

// TestWriteErrCode checks that writeErrCode serialises both fields correctly.
// The shared writeErrCode (in sent.go) uses keys "code" and "error".
func TestWriteErrCode(t *testing.T) {
	w := httptest.NewRecorder()
	writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT", "bad value")
	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want %d", w.Code, http.StatusBadRequest)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if body["code"] != "INVALID_INPUT" {
		t.Errorf("code field: got %q, want INVALID_INPUT", body["code"])
	}
	if body["error"] != "bad value" {
		t.Errorf("error field: got %q, want 'bad value'", body["error"])
	}
}

// TestSyncStartValidation tests the request-validation logic in handleSyncHistoryStart
// using a nil DB so we exercise only the validation path.
func TestSyncStartValidation(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "bad json",
			body:       `{bad}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "missing job_id",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "non-uuid job_id",
			body:       `{"job_id": "not-a-uuid"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "uuid v3 rejected",
			body:       `{"job_id": "550e8400-e29b-31d4-a716-446655440000"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/extension/sync-history/start",
				bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			// Pass nil DB — we only want to test early-exit validation paths.
			handleSyncHistoryStart(w, req, nil, nil)

			if w.Code != tc.wantStatus {
				t.Errorf("status: got %d, want %d", w.Code, tc.wantStatus)
			}
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if body["code"] != tc.wantCode {
				t.Errorf("error code: got %q, want %q", body["code"], tc.wantCode)
			}
		})
	}
}

// TestSyncBatchValidation tests request-level validation in handleSyncHistoryBatch.
func TestSyncBatchValidation(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "bad json",
			body:       `{bad}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "empty messages",
			body:       `{"job_id": "abc", "messages": []}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "null messages",
			body:       `{"job_id": "abc"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/extension/sync-history/batch",
				bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handleSyncHistoryBatch(w, req, nil, nil)

			if w.Code != tc.wantStatus {
				t.Errorf("status: got %d, want %d", w.Code, tc.wantStatus)
			}
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if body["code"] != tc.wantCode {
				t.Errorf("error code: got %q, want %q", body["code"], tc.wantCode)
			}
		})
	}
}

// TestSyncBatchTooLarge verifies that a batch of >500 messages is rejected.
func TestSyncBatchTooLarge(t *testing.T) {
	// Build a batch with 501 messages.
	msgs := make([]map[string]any, 501)
	for i := range msgs {
		msgs[i] = map[string]any{
			"message_id":  "spaces/A/messages/B",
			"space_key":   "spaces/A",
			"sender_name": "Alice",
			"body":        "hello",
			"observed_at": "2026-01-01T00:00:00Z",
		}
	}
	payload := map[string]any{
		"job_id":   "some-job",
		"messages": msgs,
	}
	b, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/api/extension/sync-history/batch", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handleSyncHistoryBatch(w, req, nil, nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want 400", w.Code)
	}
	var body map[string]string
	_ = json.NewDecoder(w.Body).Decode(&body)
	if body["code"] != "INVALID_INPUT" {
		t.Errorf("error code: got %q, want INVALID_INPUT", body["code"])
	}
}

// TestSyncCompleteValidation tests validation in handleSyncHistoryComplete.
func TestSyncCompleteValidation(t *testing.T) {
	cases := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "bad json",
			body:       `{bad}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "missing job_id",
			body:       `{"status": "completed"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "invalid status",
			body:       `{"job_id": "abc", "status": "cancelled"}`,
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/extension/sync-history/complete",
				bytes.NewBufferString(tc.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handleSyncHistoryComplete(w, req, nil, nil)

			if w.Code != tc.wantStatus {
				t.Errorf("status: got %d, want %d", w.Code, tc.wantStatus)
			}
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if body["code"] != tc.wantCode {
				t.Errorf("error code: got %q, want %q", body["code"], tc.wantCode)
			}
		})
	}
}

// TestSyncStatusMissingJobID checks that a missing job_id query param returns 400.
func TestSyncStatusMissingJobID(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/extension/sync-history/status", nil)
	w := httptest.NewRecorder()

	handleSyncHistoryStatus(w, req, nil, nil)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status: got %d, want 400", w.Code)
	}
	var body map[string]string
	_ = json.NewDecoder(w.Body).Decode(&body)
	if body["code"] != "INVALID_INPUT" {
		t.Errorf("error code: got %q, want INVALID_INPUT", body["code"])
	}
}

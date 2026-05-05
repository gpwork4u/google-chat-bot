package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/hub"
)

func init() {
	// Enable debug endpoints for tests.
	os.Setenv("INJECT_DRAFT_ENABLED", "1")
}

// TestInjectDraftNoDB verifies that POST /api/debug/inject-draft does NOT
// write to the database and instead broadcasts a draft_created WebSocket event.
func TestInjectDraftNoDB(t *testing.T) {
	h := hub.New()
	uiCh, unsub := h.SubscribeUI()
	defer unsub()

	// Build request with the new "draft" object style.
	body := map[string]any{
		"draft": map[string]any{
			"id":             "draft-ws-new",
			"space_id":       "SPACE001",
			"space_name":     "Team General",
			"sender_name":    "Alice",
			"draft_content":  "hello world",
			"status":         "pending",
		},
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/debug/inject-draft", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	// Call handler directly; pass nil for db — the new handler must not use it.
	handleDebugInjectDraft(rec, req, nil, nil, h)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201; body: %s", rec.Code, rec.Body.String())
	}

	// Verify response body.
	var resp map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal("invalid response JSON:", err)
	}
	if resp["ok"] != true {
		t.Errorf("ok = %v, want true", resp["ok"])
	}
	if resp["draft_id"] != "draft-ws-new" {
		t.Errorf("draft_id = %v, want draft-ws-new", resp["draft_id"])
	}
	// Crucially: no message_id / db row in response.
	if _, ok := resp["message_id"]; ok {
		t.Errorf("response must not contain message_id (no DB write)")
	}

	// Collect hub events (expect draft_created + inbox_changed).
	var events []hub.UIEvent
	deadline := time.After(500 * time.Millisecond)
loop:
	for {
		select {
		case ev := <-uiCh:
			events = append(events, ev)
			if len(events) >= 2 {
				break loop
			}
		case <-deadline:
			break loop
		}
	}

	if len(events) == 0 {
		t.Fatal("no events received; expected at least draft_created")
	}

	// The first event must be draft_created.
	found := false
	for _, ev := range events {
		if ev.Type != "draft_created" {
			continue
		}
		found = true
		var d map[string]any
		if err := json.Unmarshal(ev.Draft, &d); err != nil {
			t.Fatal("Draft payload is not valid JSON:", err)
		}
		if d["id"] != "draft-ws-new" {
			t.Errorf("draft.id = %v, want draft-ws-new", d["id"])
		}
	}
	if !found {
		t.Errorf("draft_created event not received; got: %v", eventTypes(events))
	}

	// inbox_changed must also be present for backward compat.
	foundInbox := false
	for _, ev := range events {
		if ev.Type == "inbox_changed" {
			foundInbox = true
		}
	}
	if !foundInbox {
		t.Errorf("inbox_changed event not received (backward compat); got: %v", eventTypes(events))
	}
}

// TestInjectDraftSymbolicIDPreserved verifies that a symbolic string ID like
// "A" is forwarded verbatim and not coerced to a number.
func TestInjectDraftSymbolicIDPreserved(t *testing.T) {
	h := hub.New()
	uiCh, unsub := h.SubscribeUI()
	defer unsub()

	body := map[string]any{
		"draft": map[string]any{
			"id":            "A",
			"draft_content": "test content A",
		},
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/debug/inject-draft", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handleDebugInjectDraft(rec, req, nil, nil, h)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rec.Code)
	}

	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["draft_id"] != "A" {
		t.Errorf("draft_id = %v, want A (symbolic)", resp["draft_id"])
	}

	// Check draft_created payload.
	deadline := time.After(500 * time.Millisecond)
	for {
		select {
		case ev := <-uiCh:
			if ev.Type == "draft_created" {
				var d map[string]any
				_ = json.Unmarshal(ev.Draft, &d)
				if d["id"] != "A" {
					t.Errorf("draft_created.draft.id = %v, want A", d["id"])
				}
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for draft_created")
		}
	}
}

// TestInjectDraftLegacyFlatFields verifies backward compat with callers that
// send the old flat-field format (no "draft" wrapper object).
func TestInjectDraftLegacyFlatFields(t *testing.T) {
	h := hub.New()
	uiCh, unsub := h.SubscribeUI()
	defer unsub()

	body := map[string]any{
		"space_key":   "debug-space",
		"space_name":  "Debug Space",
		"sender_name": "Debug User",
		"body":        "hello",
		"draft_body":  "world",
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/debug/inject-draft", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handleDebugInjectDraft(rec, req, nil, nil, h)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201", rec.Code)
	}

	// Should still emit draft_created.
	deadline := time.After(500 * time.Millisecond)
	for {
		select {
		case ev := <-uiCh:
			if ev.Type == "draft_created" {
				return // success
			}
		case <-deadline:
			t.Fatal("timed out waiting for draft_created (legacy flat fields)")
		}
	}
}

// TestInjectDraftAutoGeneratesID verifies that when no id is provided, a
// unique id is generated and returned.
func TestInjectDraftAutoGeneratesID(t *testing.T) {
	h := hub.New()
	_, unsub := h.SubscribeUI()
	defer unsub()

	body := map[string]any{
		"draft": map[string]any{
			"draft_content": "no id provided",
		},
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/debug/inject-draft", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handleDebugInjectDraft(rec, req, nil, nil, h)

	var resp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	id, ok := resp["draft_id"].(string)
	if !ok || id == "" {
		t.Errorf("expected non-empty string draft_id, got %v", resp["draft_id"])
	}
}

// eventTypes is a helper for readable error messages.
func eventTypes(evs []hub.UIEvent) []string {
	out := make([]string, len(evs))
	for i, ev := range evs {
		out[i] = ev.Type
	}
	return out
}

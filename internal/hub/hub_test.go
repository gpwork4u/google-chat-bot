package hub_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/hub"
)

// TestUIEventJSONMarshal verifies that UIEvent marshals correctly for every
// event type.
func TestUIEventJSONMarshal(t *testing.T) {
	t.Run("inbox_changed has no extra fields", func(t *testing.T) {
		ev := hub.UIEvent{Type: "inbox_changed"}
		b, err := json.Marshal(ev)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		if m["type"] != "inbox_changed" {
			t.Errorf("type = %q, want inbox_changed", m["type"])
		}
		// omitempty fields must not be present
		for _, key := range []string{"draft", "draft_id", "settings"} {
			if _, ok := m[key]; ok {
				t.Errorf("unexpected field %q in inbox_changed event", key)
			}
		}
	})

	t.Run("draft_created carries Draft payload", func(t *testing.T) {
		raw, _ := json.Marshal(map[string]any{"id": "draft-ws-new", "status": "pending"})
		ev := hub.UIEvent{Type: "draft_created", Draft: raw}
		b, err := json.Marshal(ev)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		if m["type"] != "draft_created" {
			t.Errorf("type = %q, want draft_created", m["type"])
		}
		draft, ok := m["draft"].(map[string]any)
		if !ok {
			t.Fatalf("draft field missing or wrong type: %T", m["draft"])
		}
		if draft["id"] != "draft-ws-new" {
			t.Errorf("draft.id = %v, want draft-ws-new", draft["id"])
		}
		// draft_id and settings must not appear
		for _, key := range []string{"draft_id", "settings"} {
			if _, ok := m[key]; ok {
				t.Errorf("unexpected field %q in draft_created event", key)
			}
		}
	})

	t.Run("draft_removed carries DraftID string", func(t *testing.T) {
		ev := hub.UIEvent{Type: "draft_removed", DraftID: "A"}
		b, err := json.Marshal(ev)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		if m["type"] != "draft_removed" {
			t.Errorf("type = %q, want draft_removed", m["type"])
		}
		if m["draft_id"] != "A" {
			t.Errorf("draft_id = %v, want A", m["draft_id"])
		}
		for _, key := range []string{"draft", "settings"} {
			if _, ok := m[key]; ok {
				t.Errorf("unexpected field %q in draft_removed event", key)
			}
		}
	})

	t.Run("settings_updated carries Settings payload", func(t *testing.T) {
		raw, _ := json.Marshal(map[string]any{"auto_mode": true})
		ev := hub.UIEvent{Type: "settings_updated", Settings: raw}
		b, err := json.Marshal(ev)
		if err != nil {
			t.Fatal(err)
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatal(err)
		}
		if m["type"] != "settings_updated" {
			t.Errorf("type = %q, want settings_updated", m["type"])
		}
		settings, ok := m["settings"].(map[string]any)
		if !ok {
			t.Fatalf("settings field missing or wrong type: %T", m["settings"])
		}
		if settings["auto_mode"] != true {
			t.Errorf("settings.auto_mode = %v, want true", settings["auto_mode"])
		}
	})
}

// TestHubDraftCreated verifies that DraftCreated publishes a correct UIEvent.
func TestHubDraftCreated(t *testing.T) {
	h := hub.New()
	ch, unsub := h.SubscribeUI()
	defer unsub()

	draft := map[string]any{"id": "draft-ws-new", "status": "pending", "draft_content": "hello"}
	h.DraftCreated(draft)

	select {
	case ev := <-ch:
		if ev.Type != "draft_created" {
			t.Fatalf("type = %q, want draft_created", ev.Type)
		}
		var got map[string]any
		if err := json.Unmarshal(ev.Draft, &got); err != nil {
			t.Fatal("Draft field is not valid JSON:", err)
		}
		if got["id"] != "draft-ws-new" {
			t.Errorf("draft.id = %v, want draft-ws-new", got["id"])
		}
		if ev.DraftID != "" {
			t.Errorf("DraftID should be empty for draft_created, got %q", ev.DraftID)
		}
		if ev.Settings != nil {
			t.Errorf("Settings should be nil for draft_created")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for draft_created event")
	}
}

// TestHubDraftRemoved verifies that DraftRemoved publishes a correct UIEvent.
func TestHubDraftRemoved(t *testing.T) {
	h := hub.New()
	ch, unsub := h.SubscribeUI()
	defer unsub()

	h.DraftRemoved("42")

	select {
	case ev := <-ch:
		if ev.Type != "draft_removed" {
			t.Fatalf("type = %q, want draft_removed", ev.Type)
		}
		if ev.DraftID != "42" {
			t.Errorf("DraftID = %q, want 42", ev.DraftID)
		}
		if ev.Draft != nil {
			t.Errorf("Draft should be nil for draft_removed")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for draft_removed event")
	}
}

// TestHubDraftRemovedSymbolicID verifies that symbolic IDs like "A" are
// forwarded verbatim (not coerced to numeric).
func TestHubDraftRemovedSymbolicID(t *testing.T) {
	h := hub.New()
	ch, unsub := h.SubscribeUI()
	defer unsub()

	h.DraftRemoved("A")

	select {
	case ev := <-ch:
		if ev.DraftID != "A" {
			t.Errorf("DraftID = %q, want A (symbolic)", ev.DraftID)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out")
	}
}

// TestHubDraftRemovedEmpty verifies that DraftRemoved with an empty ID
// does NOT publish an event (would be a no-op).
func TestHubDraftRemovedEmpty(t *testing.T) {
	h := hub.New()
	ch, unsub := h.SubscribeUI()
	defer unsub()

	h.DraftRemoved("") // should be a no-op

	select {
	case ev := <-ch:
		t.Errorf("expected no event for empty DraftRemoved, got type=%q", ev.Type)
	case <-time.After(50 * time.Millisecond):
		// expected: no event published
	}
}

// TestHubSettingsUpdated verifies that SettingsUpdated publishes a correct UIEvent.
func TestHubSettingsUpdated(t *testing.T) {
	h := hub.New()
	ch, unsub := h.SubscribeUI()
	defer unsub()

	h.SettingsUpdated(map[string]any{"auto_mode": false, "mention_only": true})

	select {
	case ev := <-ch:
		if ev.Type != "settings_updated" {
			t.Fatalf("type = %q, want settings_updated", ev.Type)
		}
		var got map[string]any
		if err := json.Unmarshal(ev.Settings, &got); err != nil {
			t.Fatal("Settings field is not valid JSON:", err)
		}
		if got["auto_mode"] != false {
			t.Errorf("settings.auto_mode = %v, want false", got["auto_mode"])
		}
		if got["mention_only"] != true {
			t.Errorf("settings.mention_only = %v, want true", got["mention_only"])
		}
		if ev.Draft != nil {
			t.Errorf("Draft should be nil for settings_updated")
		}
		if ev.DraftID != "" {
			t.Errorf("DraftID should be empty for settings_updated")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for settings_updated event")
	}
}

// TestHubLegacyHelpers verifies that backward-compat helpers still emit
// the old notification-only types.
func TestHubLegacyHelpers(t *testing.T) {
	cases := []struct {
		name    string
		publish func(*hub.Hub)
		want    string
	}{
		{"InboxChanged", func(h *hub.Hub) { h.InboxChanged() }, "inbox_changed"},
		{"SettingsChanged", func(h *hub.Hub) { h.SettingsChanged() }, "settings_changed"},
		{"SpacesChanged", func(h *hub.Hub) { h.SpacesChanged() }, "spaces_changed"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := hub.New()
			ch, unsub := h.SubscribeUI()
			defer unsub()
			tc.publish(h)
			select {
			case ev := <-ch:
				if ev.Type != tc.want {
					t.Errorf("type = %q, want %q", ev.Type, tc.want)
				}
				if ev.Draft != nil || ev.DraftID != "" || ev.Settings != nil {
					t.Errorf("legacy event should carry no payload fields")
				}
			case <-time.After(time.Second):
				t.Fatal("timed out")
			}
		})
	}
}

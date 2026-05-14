// Package hub is an in-memory pub-sub used to push updates from the backend
// to live WebSocket clients (UI + extension). Single-user, single-process MVP
// so we don't need a broker; a map of channels with a mutex is enough.
package hub

import (
	"encoding/json"
	"sync"
)

// UIEvent is delivered to web-UI WebSocket clients.
//
// Type values:
//   - Legacy (notification-only): "inbox_changed" | "settings_changed" | "spaces_changed"
//   - New (payload-bearing):      "draft_created" | "draft_removed" | "settings_updated"
//   - F-013:                      "pending_changed"
//
// Sprint 3 will remove the legacy types; during Sprint 2 both coexist for
// backward-compat (ApprovalsPage still uses inbox_changed via SWR refetch).
type UIEvent struct {
	Type      string          `json:"type"`
	Draft     json.RawMessage `json:"draft,omitempty"`      // for draft_created: full draft object
	DraftID   string          `json:"draft_id,omitempty"`   // for draft_removed: string to allow symbolic IDs
	Settings  json.RawMessage `json:"settings,omitempty"`   // for settings_updated
	Reason    string          `json:"reason,omitempty"`     // for pending_changed: new_message|skipped|unskipped|drafted
	MessageID string          `json:"message_id,omitempty"` // for pending_changed: identifies the affected message
}

// ExtEvent is delivered to extension WebSocket clients.
type ExtEvent struct {
	Type     string   `json:"type"`                // "pending" | "refresh_spaces" | "batchexecute_sender_search"
	Pending  any      `json:"pending,omitempty"`   // approved draft row (same shape as /api/ext/pending)
	SpaceIDs []string `json:"space_ids,omitempty"` // for refresh_spaces: raw space ids to look up via get_group

	// batchexecute_sender_search: tells the extension to call Chat's
	// SBNmJb RPC from the browser (where cookies are valid) so the
	// response flows back through the normal XHR hook → raw path.
	Ldap     string `json:"ldap,omitempty"`
	BeforeMs int64  `json:"before_ms,omitempty"`
	PageSize int    `json:"page_size,omitempty"`
}

type Hub struct {
	mu  sync.RWMutex
	ui  map[chan UIEvent]struct{}
	ext map[chan ExtEvent]struct{}

	// dispatchedDrafts tracks draft IDs that have already been pushed to
	// some extension WS client. Guards against double-send when the user
	// has multiple Chat tabs open (each tab's content.js connects its own
	// WS and would otherwise each dispatch the same draft to create_message).
	// Cleared in ReleaseDraft once the extension reports success/failure.
	// In-memory only; cleared on restart (which is fine — new approved
	// drafts will be re-pushed after a reconnect).
	dispatchedMu sync.Mutex
	dispatched   map[int64]struct{}
}

func New() *Hub {
	return &Hub{
		ui:         make(map[chan UIEvent]struct{}),
		ext:        make(map[chan ExtEvent]struct{}),
		dispatched: make(map[int64]struct{}),
	}
}

// ClaimDraft returns true if this is the first caller to claim the given
// draftID since the last ReleaseDraft. Use this to guard pending-broadcast
// so the draft gets pushed to exactly one extension tab even when the user
// has multiple Chat windows open sharing the same backend.
func (h *Hub) ClaimDraft(draftID int64) bool {
	if draftID <= 0 {
		return true
	}
	h.dispatchedMu.Lock()
	defer h.dispatchedMu.Unlock()
	if _, ok := h.dispatched[draftID]; ok {
		return false
	}
	h.dispatched[draftID] = struct{}{}
	return true
}

// ReleaseDraft lets a draft be pushed again. Call when the extension reports
// a terminal state (sent / failed) so retries after failures can still work.
func (h *Hub) ReleaseDraft(draftID int64) {
	if draftID <= 0 {
		return
	}
	h.dispatchedMu.Lock()
	delete(h.dispatched, draftID)
	h.dispatchedMu.Unlock()
}

// SubscribeUI returns a buffered channel and an unsubscribe func. The channel
// must be drained by the caller; events are dropped (non-blocking send) if the
// buffer is full, so a slow client can never stall a publisher.
func (h *Hub) SubscribeUI() (<-chan UIEvent, func()) {
	ch := make(chan UIEvent, 16)
	h.mu.Lock()
	h.ui[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.ui, ch)
		h.mu.Unlock()
		close(ch)
	}
}

func (h *Hub) SubscribeExt() (<-chan ExtEvent, func()) {
	ch := make(chan ExtEvent, 32)
	h.mu.Lock()
	h.ext[ch] = struct{}{}
	h.mu.Unlock()
	return ch, func() {
		h.mu.Lock()
		delete(h.ext, ch)
		h.mu.Unlock()
		close(ch)
	}
}

func (h *Hub) PublishUI(ev UIEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.ui {
		select {
		case ch <- ev:
		default:
		}
	}
}

func (h *Hub) PublishExt(ev ExtEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.ext {
		select {
		case ch <- ev:
		default:
		}
	}
}

// convenience helpers — keep the shape consistent at call sites.

// --- Legacy notification-only helpers (backward compat; Sprint 3 will clean up) ---

func (h *Hub) InboxChanged()    { h.PublishUI(UIEvent{Type: "inbox_changed"}) }
func (h *Hub) SettingsChanged() { h.PublishUI(UIEvent{Type: "settings_changed"}) }
func (h *Hub) SpacesChanged()   { h.PublishUI(UIEvent{Type: "spaces_changed"}) }

// --- New payload-bearing helpers ---

// DraftCreated broadcasts a draft_created event containing the full draft
// object as JSON. d must be JSON-serialisable.
func (h *Hub) DraftCreated(d any) {
	raw, err := json.Marshal(d)
	if err != nil {
		return
	}
	h.PublishUI(UIEvent{Type: "draft_created", Draft: raw})
}

// DraftRemoved broadcasts a draft_removed event. id is kept as a string so
// it can carry either a numeric DB id or a symbolic test id like "draft-ws-new".
func (h *Hub) DraftRemoved(id string) {
	if id == "" {
		return
	}
	h.PublishUI(UIEvent{Type: "draft_removed", DraftID: id})
}

// SettingsUpdated broadcasts a settings_updated event containing the full
// settings object as JSON. s must be JSON-serialisable.
func (h *Hub) SettingsUpdated(s any) {
	raw, err := json.Marshal(s)
	if err != nil {
		return
	}
	h.PublishUI(UIEvent{Type: "settings_updated", Settings: raw})
}

// ActivityBump is shorthand for "a new message just arrived" — the inbox
// obviously needs to refresh, and so does the Channel 設定 list (a
// previously-silent space may have just re-entered the 30-minute window).
func (h *Hub) ActivityBump() {
	h.InboxChanged()
	h.SpacesChanged()
}

func (h *Hub) Pending(item any) { h.PublishExt(ExtEvent{Type: "pending", Pending: item}) }

// PendingChanged broadcasts a pending_changed event to UI clients.
// reason is one of: new_message, skipped, unskipped, drafted.
// messageID is the message_key of the affected message.
func (h *Hub) PendingChanged(reason, messageID string) {
	h.PublishUI(UIEvent{Type: "pending_changed", Reason: reason, MessageID: messageID})
}

func (h *Hub) RefreshSpaces(spaceIDs []string) {
	if len(spaceIDs) == 0 {
		return
	}
	h.PublishExt(ExtEvent{Type: "refresh_spaces", SpaceIDs: spaceIDs})
}

func (h *Hub) RequestSenderSearch(ldap string, beforeMs int64, pageSize int) {
	if ldap == "" {
		return
	}
	h.PublishExt(ExtEvent{
		Type:     "batchexecute_sender_search",
		Ldap:     ldap,
		BeforeMs: beforeMs,
		PageSize: pageSize,
	})
}

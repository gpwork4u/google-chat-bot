// Package hub is an in-memory pub-sub used to push updates from the backend
// to live WebSocket clients (UI + extension). Single-user, single-process MVP
// so we don't need a broker; a map of channels with a mutex is enough.
package hub

import "sync"

// UIEvent is delivered to web-UI WebSocket clients.
type UIEvent struct {
	Type string `json:"type"` // "inbox_changed" | "settings_changed" | "spaces_changed"
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
}

func New() *Hub {
	return &Hub{
		ui:  make(map[chan UIEvent]struct{}),
		ext: make(map[chan ExtEvent]struct{}),
	}
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

func (h *Hub) InboxChanged()    { h.PublishUI(UIEvent{Type: "inbox_changed"}) }
func (h *Hub) SettingsChanged() { h.PublishUI(UIEvent{Type: "settings_changed"}) }
func (h *Hub) SpacesChanged()   { h.PublishUI(UIEvent{Type: "spaces_changed"}) }

// ActivityBump is shorthand for "a new message just arrived" — the inbox
// obviously needs to refresh, and so does the Channel 設定 list (a
// previously-silent space may have just re-entered the 30-minute window).
func (h *Hub) ActivityBump() {
	h.InboxChanged()
	h.SpacesChanged()
}

func (h *Hub) Pending(item any) { h.PublishExt(ExtEvent{Type: "pending", Pending: item}) }

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

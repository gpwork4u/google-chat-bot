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
	Type    string `json:"type"`              // "pending"
	Pending any    `json:"pending,omitempty"` // the approved draft row (same shape as /api/ext/pending)
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

func (h *Hub) Pending(item any) { h.PublishExt(ExtEvent{Type: "pending", Pending: item}) }

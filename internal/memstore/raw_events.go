// Package memstore holds in-memory state that we explicitly choose not to
// persist (raw_events, messages cache). The store package handles disk-backed
// data; this package handles ephemeral data that survives only within a single
// process lifetime.
package memstore

import (
	"encoding/json"
	"strings"
	"sync"
	"time"
)

// RawEvent mirrors the raw_events row shape but lives only in memory.
type RawEvent struct {
	ID        int64           `json:"id"`
	UserID    int64           `json:"user_id"`
	Kind      string          `json:"kind"`
	URL       string          `json:"url"`
	Payload   json.RawMessage `json:"payload"`
	CreatedAt time.Time       `json:"created_at"`
}

// RawEventStore is a bounded ring buffer keyed by monotonic id. Old events
// are dropped when the buffer is full. Single-process MVP — no replication.
type RawEventStore struct {
	mu       sync.RWMutex
	capacity int
	// events is kept sorted by ID ascending; we pop from the front when full.
	events []RawEvent
	nextID int64
}

func NewRawEventStore(capacity int) *RawEventStore {
	if capacity <= 0 {
		capacity = 50000
	}
	return &RawEventStore{
		capacity: capacity,
		events:   make([]RawEvent, 0, capacity),
	}
}

// Insert appends a raw event and returns its assigned id. If the buffer is at
// capacity the oldest event is dropped.
func (s *RawEventStore) Insert(userID int64, kind, url string, payload json.RawMessage) int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	ev := RawEvent{
		ID:        s.nextID,
		UserID:    userID,
		Kind:      kind,
		URL:       url,
		Payload:   payload,
		CreatedAt: time.Now(),
	}
	if len(s.events) >= s.capacity {
		// drop oldest
		s.events = s.events[1:]
	}
	s.events = append(s.events, ev)
	return ev.ID
}

// Since returns up to `limit` events with id > lastID whose url matches the
// SQL-style LIKE pattern (only `%` wildcards supported, no escaping). Events
// are returned in ascending id order.
func (s *RawEventStore) Since(lastID int64, urlLike string, limit int) []RawEvent {
	if limit <= 0 {
		limit = 100
	}
	matcher := compileLikePattern(urlLike)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]RawEvent, 0, limit)
	for _, ev := range s.events {
		if ev.ID <= lastID {
			continue
		}
		if !matcher(ev.URL) {
			continue
		}
		out = append(out, ev)
		if len(out) >= limit {
			break
		}
	}
	return out
}

// PeekNewest returns the most-recent matching events in descending id order.
func (s *RawEventStore) PeekNewest(urlLike string, limit int) []RawEvent {
	if limit <= 0 {
		limit = 3
	}
	matcher := compileLikePattern(urlLike)
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]RawEvent, 0, limit)
	for i := len(s.events) - 1; i >= 0; i-- {
		ev := s.events[i]
		if !matcher(ev.URL) {
			continue
		}
		out = append(out, ev)
		if len(out) >= limit {
			break
		}
	}
	return out
}

// MaxID returns the largest assigned id (0 if empty).
func (s *RawEventStore) MaxID() int64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.nextID
}

// Len returns the number of events currently held.
func (s *RawEventStore) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.events)
}

// compileLikePattern converts a SQL-LIKE pattern to a Go matcher. Only `%` is
// supported (no `_`, no escaping); empty pattern matches everything.
func compileLikePattern(pat string) func(string) bool {
	if pat == "" || pat == "%" {
		return func(string) bool { return true }
	}
	// split on % — each part must appear in order
	parts := strings.Split(pat, "%")
	if !strings.HasPrefix(pat, "%") {
		// anchored at start
		prefix := parts[0]
		rest := parts[1:]
		return func(s string) bool {
			if !strings.HasPrefix(s, prefix) {
				return false
			}
			s = s[len(prefix):]
			return matchParts(s, rest, strings.HasSuffix(pat, "%"))
		}
	}
	// not anchored at start
	rest := parts[1:]
	return func(s string) bool {
		return matchParts(s, rest, strings.HasSuffix(pat, "%"))
	}
}

func matchParts(s string, parts []string, trailingPercent bool) bool {
	for i, p := range parts {
		if p == "" {
			continue
		}
		idx := strings.Index(s, p)
		if idx < 0 {
			return false
		}
		s = s[idx+len(p):]
		// last non-empty part: if pattern doesn't end with %, the remainder
		// must be empty
		if !trailingPercent && i == len(parts)-1 && s != "" {
			return false
		}
	}
	return true
}

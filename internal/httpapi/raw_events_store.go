package httpapi

// raw_events_store.go — process-wide handle to the in-memory raw_events ring
// buffer. main wires the same instance into both the worker and httpapi; all
// callers in this package use SetRawEventsStore + getRawEventsStore.

import (
	"context"
	"encoding/json"

	"github.com/ailabs-tw/google-chat-bot/internal/memstore"
)

var rawEventsStore *memstore.RawEventStore

// SetRawEventsStore installs the shared raw-events ring buffer. Called once at
// startup from cmd/server. If nil, raw_events writes fall back to the legacy
// DB path (for now; that path will be removed when the DB raw_events table is
// dropped).
func SetRawEventsStore(s *memstore.RawEventStore) {
	rawEventsStore = s
}

func getRawEventsStore() *memstore.RawEventStore {
	return rawEventsStore
}

// insertRawEvent appends to the in-memory store if configured. Falls back to a
// no-op when the store isn't wired (tests). Returns a best-effort assigned id.
func insertRawEvent(_ context.Context, userID int64, kind, url string, payload json.RawMessage) int64 {
	s := getRawEventsStore()
	if s == nil {
		return 0
	}
	return s.Insert(userID, kind, url, payload)
}

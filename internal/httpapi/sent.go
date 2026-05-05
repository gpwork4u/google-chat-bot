package httpapi

// sent.go provides GET /api/sent — the Sent Log endpoint consumed by the
// React /sent page. Returns sent drafts with cursor-based pagination.

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func sentRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("GET /api/sent", func(w http.ResponseWriter, r *http.Request) {
		handleListSent(w, r, db, cfg)
	})
}

func handleListSent(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	q := r.URL.Query()

	// --- Validate query params first (before auth) so 400 fires fast ---

	// limit: must be 1–100.
	limit := 50
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > 100 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "limit must be between 1 and 100")
			return
		}
		limit = n
	}

	// Date range.
	var from, to time.Time
	if s := q.Get("from"); s != "" {
		t, err := parseDateTime(s)
		if err != nil {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "invalid from date")
			return
		}
		from = t
	}
	if s := q.Get("to"); s != "" {
		t, err := parseDateTimeEnd(s)
		if err != nil {
			writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "invalid to date")
			return
		}
		to = t
	}
	if !from.IsZero() && !to.IsZero() && from.After(to) {
		writeErrCode(w, http.StatusBadRequest, "INVALID_PARAM", "from must not be after to")
		return
	}

	// --- Auth ---
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Space IDs (multi-value: both ?space_ids=X and ?space_ids[]=X patterns).
	spaceIDs := q["space_ids"]
	if len(spaceIDs) == 0 {
		spaceIDs = q["space_ids[]"]
	}

	filter := store.SentFilter{
		Mode:     strings.ToLower(q.Get("mode")),
		SpaceIDs: spaceIDs,
		From:     from,
		To:       to,
		Q:        q.Get("q"),
		Cursor:   q.Get("cursor"),
	}

	rows, nextCursor, err := db.ListSentLog(ctx, user.ID, filter, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if rows == nil {
		rows = []store.SentLogRow{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":       rows,
		"next_cursor": nextCursor,
	})
}

// parseDateTime parses RFC3339 or date-only "2006-01-02" as UTC start-of-day.
func parseDateTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, err
	}
	return t.UTC(), nil
}

// parseDateTimeEnd parses RFC3339 or date-only. Date-only is treated as end-of-day UTC.
func parseDateTimeEnd(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, err
	}
	return time.Date(t.Year(), t.Month(), t.Day(), 23, 59, 59, 0, time.UTC), nil
}

func writeErrCode(w http.ResponseWriter, code int, errCode, msg string) {
	writeJSON(w, code, map[string]string{"code": errCode, "error": msg})
}

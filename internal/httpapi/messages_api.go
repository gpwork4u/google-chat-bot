package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// messagesRoutes registers the GET /api/messages endpoint.
// This is consumed by:
//   - space-facts-mining skill (pull space history: ?space_key=...&limit=200)
//   - F-015 source toggle (batch lookup: ?id_in=100,101,102)
func messagesRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("GET /api/messages", func(w http.ResponseWriter, r *http.Request) {
		handleGetMessages(w, r, db, cfg)
	})
}

func handleGetMessages(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	ctx := r.Context()
	q := r.URL.Query()

	spaceKey := q.Get("space_key")
	idInRaw := q.Get("id_in")

	// AC-6: space_key and id_in are mutually exclusive.
	if spaceKey != "" && idInRaw != "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
			"space_key and id_in are mutually exclusive")
		return
	}
	// AC-7: at least one of space_key / id_in is required.
	if spaceKey == "" && idInRaw == "" {
		writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
			"space_key or id_in is required")
		return
	}

	// Parse limit (AC-5: 1..500, default 50).
	limit := 50
	if lStr := q.Get("limit"); lStr != "" {
		n, err := strconv.Atoi(lStr)
		if err != nil || n < 1 || n > 500 {
			writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
				"limit must be an integer between 1 and 500")
			return
		}
		limit = n
	}

	// ── id_in path: validate early before DB access ─────────────────────────
	var parsedIDs []int64
	if idInRaw != "" {
		ids, parseErr := parseIDList(idInRaw)
		if parseErr != nil {
			writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
				"id_in must be a comma-separated list of integers: "+parseErr.Error())
			return
		}
		parsedIDs = ids
	}

	// ── space_key path: parse optional params early ─────────────────────────
	var opts store.ListMessagesOpts
	if spaceKey != "" {
		opts = store.ListMessagesOpts{Limit: limit}

		// Parse before_id (pagination cursor).
		if bidStr := q.Get("before_id"); bidStr != "" {
			bid, err := strconv.ParseInt(bidStr, 10, 64)
			if err != nil || bid < 1 {
				writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
					"before_id must be a positive integer")
				return
			}
			opts.BeforeID = bid
		}

		// Parse since (observed_at >= since).
		if sinceStr := q.Get("since"); sinceStr != "" {
			t, err := time.Parse(time.RFC3339, sinceStr)
			if err != nil {
				writeErrCode(w, http.StatusBadRequest, "INVALID_INPUT",
					"since must be an RFC3339 timestamp (e.g. 2026-01-01T00:00:00Z)")
				return
			}
			opts.Since = t
		}
	}

	// Resolve local user — messages are scoped per user.
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil || user == nil {
		writeErr(w, http.StatusInternalServerError, "failed to resolve local user")
		return
	}

	if idInRaw != "" {
		msgs, storeErr := db.ListMessagesByIDs(ctx, user.ID, parsedIDs)
		if storeErr != nil {
			writeErr(w, http.StatusInternalServerError, storeErr.Error())
			return
		}
		if msgs == nil {
			msgs = []store.MessageForAPI{}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"messages":       msgs,
			"next_before_id": nil,
		})
		return
	}

	msgs, nextBeforeID, storeErr := db.ListMessagesBySpace(ctx, user.ID, spaceKey, opts)
	if storeErr != nil {
		writeErr(w, http.StatusInternalServerError, storeErr.Error())
		return
	}
	if msgs == nil {
		msgs = []store.MessageForAPI{}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"messages":       msgs,
		"next_before_id": nextBeforeID,
	})
}

// parseIDList splits a comma-separated string of integer IDs and returns them
// as []int64. Returns an error on any invalid token.
func parseIDList(raw string) ([]int64, error) {
	parts := strings.Split(raw, ",")
	out := make([]int64, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		v, err := strconv.ParseInt(p, 10, 64)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

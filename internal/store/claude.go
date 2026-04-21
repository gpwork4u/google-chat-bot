package store

import (
	"context"
	"time"
)

// ClaudePending is what /api/claude/pending returns per row: enough to let
// an LLM decide whether to reply and compose one, without pulling the full
// message / draft struct. Caller gets the context separately via
// /api/messages/{id}/context if it wants the surrounding thread.
type ClaudePending struct {
	MessageID  int64     `json:"message_id"`
	SpaceKey   string    `json:"space_key"`
	SpaceName  string    `json:"space_name"`
	ThreadKey  string    `json:"thread_key"`
	MessageKey string    `json:"message_key"`
	SenderName string    `json:"sender_name"`
	Body       string    `json:"body"`
	ObservedAt time.Time `json:"observed_at"`
	Mentioned  bool      `json:"mentioned"` // whether this row contains an "@<local user>" mention
}

// ListClaudePending returns the messages that match the user's current
// answer-filtering preferences:
//   - sender is not me
//   - no draft exists yet for the message
//   - space_settings.disabled = FALSE (explicit whitelist — anything the
//     user hasn't toggled on in the Channel 設定 list is excluded)
//   - if user_settings.reply_only_when_mentioned is TRUE, the body must
//     contain a literal "@<local user name>" substring (case-insensitive)
//
// Returned in time-descending order (newest first); cap with limit.
func (db *DB) ListClaudePending(ctx context.Context, userID int64, limit int) ([]ClaudePending, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	const q = `
SELECT
  m.id, m.space_key, m.space_name, m.thread_key, m.message_key,
  m.sender_name, m.body, m.observed_at,
  CASE
    WHEN COALESCE(u.name, '') = '' THEN FALSE
    ELSE position(lower('@' || u.name) in lower(m.body)) > 0
  END AS mentioned
FROM messages m
LEFT JOIN drafts d
  ON d.message_id = m.id
LEFT JOIN space_settings s
  ON s.user_id = m.user_id AND s.space_key = m.space_key
LEFT JOIN user_settings us
  ON us.user_id = m.user_id
LEFT JOIN users u
  ON u.id = m.user_id
WHERE m.user_id = $1
  AND m.sender_is_me = FALSE
  -- belt-and-braces: historical rows may still be mis-flagged, so also
  -- reject anything whose sender_name matches the local user's name.
  AND (COALESCE(u.name, '') = '' OR m.sender_name IS NULL OR m.sender_name = '' OR lower(m.sender_name) <> lower(u.name))
  AND d.id IS NULL
  AND COALESCE(s.disabled, TRUE) = FALSE
  AND (
    COALESCE(us.reply_only_when_mentioned, FALSE) = FALSE
    OR (COALESCE(u.name, '') <> '' AND position(lower('@' || u.name) in lower(m.body)) > 0)
  )
ORDER BY m.observed_at DESC
LIMIT $2`
	rows, err := db.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ClaudePending
	for rows.Next() {
		var p ClaudePending
		if err := rows.Scan(
			&p.MessageID, &p.SpaceKey, &p.SpaceName, &p.ThreadKey, &p.MessageKey,
			&p.SenderName, &p.Body, &p.ObservedAt, &p.Mentioned,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

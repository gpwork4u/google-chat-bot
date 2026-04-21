package store

import (
	"context"
	"time"
)

// StyleSample is one thing the local user actually wrote — used as a
// style reference for draft generation. Pulled from messages where
// sender_is_me=TRUE. No draft/reply content, just raw bodies.
type StyleSample struct {
	Body       string    `json:"body"`
	SpaceKey   string    `json:"space_key"`
	SpaceName  string    `json:"space_name"`
	ObservedAt time.Time `json:"observed_at"`
}

// StyleProfile is the payload for /api/claude/style-profile.
type StyleProfile struct {
	LocalUserName string         `json:"local_user_name"`
	CorpusSize    int            `json:"corpus_size"`
	AvgLength     int            `json:"avg_length"`
	MedianLength  int            `json:"median_length"`
	BySpace       map[string]int `json:"by_space"`
	Samples       []StyleSample  `json:"samples"`
}

// BuildStyleProfile returns a compact profile of how this user talks in
// Chat: summary stats + a sample of their recent messages. spaceKey
// narrows samples (and only samples) to one space; pass empty string for
// cross-space mix. minLength filters out pure ack / emoji that add noise
// but little style signal. limit caps the sample array.
func (db *DB) BuildStyleProfile(ctx context.Context, userID int64, spaceKey string, minLength, limit int) (*StyleProfile, error) {
	if minLength < 0 {
		minLength = 0
	}
	if limit <= 0 || limit > 500 {
		limit = 80
	}

	out := &StyleProfile{BySpace: map[string]int{}}

	// 1. Corpus-wide stats (ignore spaceKey filter for these so the agent
	//    sees the full picture even if a specific space is requested).
	const qStats = `
SELECT
  count(*) AS n,
  COALESCE(ROUND(AVG(length(body)))::int, 0) AS avg_len,
  COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY length(body))::int, 0) AS med_len
FROM messages
WHERE user_id = $1 AND sender_is_me = TRUE AND body <> ''`
	if err := db.QueryRow(ctx, qStats, userID).Scan(&out.CorpusSize, &out.AvgLength, &out.MedianLength); err != nil {
		return nil, err
	}

	// 2. by_space counts (top 20 only to keep response bounded).
	const qBySpace = `
SELECT COALESCE(space_name, space_key) AS label, count(*) AS n
FROM messages
WHERE user_id = $1 AND sender_is_me = TRUE AND body <> ''
GROUP BY label
ORDER BY n DESC
LIMIT 20`
	rows, err := db.Query(ctx, qBySpace, userID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var label string
		var n int
		if err := rows.Scan(&label, &n); err != nil {
			rows.Close()
			return nil, err
		}
		out.BySpace[label] = n
	}
	rows.Close()

	// 3. Recent samples — optionally scoped to a space, always filtered by
	//    minimum length.
	var q string
	args := []any{userID, minLength, limit}
	if spaceKey != "" {
		q = `
SELECT body, space_key, COALESCE(space_name, space_key), observed_at
FROM messages
WHERE user_id = $1 AND sender_is_me = TRUE AND body <> ''
  AND length(body) >= $2
  AND space_key = $4
ORDER BY observed_at DESC
LIMIT $3`
		args = append(args, spaceKey)
	} else {
		q = `
SELECT body, space_key, COALESCE(space_name, space_key), observed_at
FROM messages
WHERE user_id = $1 AND sender_is_me = TRUE AND body <> ''
  AND length(body) >= $2
ORDER BY observed_at DESC
LIMIT $3`
	}
	rows, err = db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s StyleSample
		if err := rows.Scan(&s.Body, &s.SpaceKey, &s.SpaceName, &s.ObservedAt); err != nil {
			return nil, err
		}
		out.Samples = append(out.Samples, s)
	}
	return out, rows.Err()
}

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
//   - sender is not me (relaxed when debug=true)
//   - no draft exists yet for the message
//   - space_settings.disabled = FALSE (explicit whitelist — anything the
//     user hasn't toggled on in the Channel 設定 list is excluded)
//   - if user_settings.reply_only_when_mentioned is TRUE, the body must
//     contain a literal "@<local user name>" substring (case-insensitive,
//     also relaxed when debug=true)
//
// debug=true includes messages sent by the local user and bypasses the
// mention gate so you can end-to-end test the skill pipeline from your
// own Chat session without needing a second account.
//
// Returned in time-descending order (newest first); cap with limit.
func (db *DB) ListClaudePending(ctx context.Context, userID int64, limit int, debug bool) ([]ClaudePending, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	selfFilter := `
  AND m.sender_is_me = FALSE
  AND (COALESCE(u.name, '') = '' OR m.sender_name IS NULL OR m.sender_name = '' OR lower(m.sender_name) <> lower(u.name))`
	mentionFilter := `
  AND (
    COALESCE(us.reply_only_when_mentioned, FALSE) = FALSE
    OR (COALESCE(u.name, '') <> '' AND position(lower('@' || u.name) in lower(m.body)) > 0)
  )`
	if debug {
		selfFilter = ""
		mentionFilter = ""
	}
	q := `
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
  AND d.id IS NULL
  AND COALESCE(s.disabled, TRUE) = FALSE` + selfFilter + mentionFilter + `
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

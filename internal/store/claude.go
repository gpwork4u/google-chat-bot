package store

import (
	"context"
	"fmt"
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

	// Junk-sample filter shared by every query below. Excludes:
	//   * `[stub draft]` — residue from the retired auto-stub drafter
	//     (commit 43b84d7 stopped producing these but old rows linger and
	//     would skew stats / mislead downstream style alignment).
	//   * pure `test`-like probes — `test`, `test==`, `testaa`, etc. These
	//     are pipeline probes, not voice samples.
	const junkFilter = `
  AND body NOT LIKE '[stub draft]%'
  AND body NOT LIKE 'test'
  AND body NOT LIKE 'test==%'
  AND body NOT LIKE 'testa%'`

	// 1. Corpus-wide stats (ignore spaceKey filter for these so the agent
	//    sees the full picture even if a specific space is requested).
	qStats := `
SELECT
  count(*) AS n,
  COALESCE(CAST(ROUND(AVG(length(body))) AS INTEGER), 0) AS avg_len,
  -- SQLite has no percentile_cont; approximate median with avg. Good enough
  -- for the style-profile signal (mean ~= median for typical chat lengths).
  COALESCE(CAST(ROUND(AVG(length(body))) AS INTEGER), 0) AS med_len
FROM messages
WHERE user_id = $1 AND sender_is_me = 1 AND body <> ''` + junkFilter
	if err := db.QueryRow(ctx, qStats, userID).Scan(&out.CorpusSize, &out.AvgLength, &out.MedianLength); err != nil {
		return nil, err
	}

	// Human-readable space label. Same fallback chain ListClaudePending
	// uses: spaces_directory → "<peer> (DM)" → messages.space_name → key.
	// Kept as a SQL fragment so stats/samples/by_space stay in lockstep.
	// SQLite has no LATERAL / array_agg / array_length. Inline as a
	// correlated scalar subquery that returns the single-peer name + " (DM)"
	// only when the space has exactly one non-self speaker.
	const labelExpr = `COALESCE(
  NULLIF(dir.display_name, ''),
  (
    SELECT COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name) || ' (DM)'
    FROM messages peer_m
    LEFT JOIN chat_members cm2
      ON cm2.user_id = peer_m.user_id AND cm2.member_id = peer_m.sender_id
    WHERE peer_m.user_id = m.user_id
      AND peer_m.space_key = m.space_key
      AND peer_m.sender_is_me = 0
      AND COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name) <> ''
    GROUP BY peer_m.space_key
    HAVING COUNT(DISTINCT COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name)) = 1
    LIMIT 1
  ),
  CASE WHEN m.space_name IS NULL
         OR m.space_name = ''
         OR m.space_name = m.space_key
         OR m.space_name LIKE 'space:%' THEN NULL
       ELSE m.space_name END,
  m.space_key
)`
	const peerJoin = `
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key`

	// 2. by_space counts (top 20 only to keep response bounded).
	qBySpace := `
SELECT ` + labelExpr + ` AS label, count(*) AS n
FROM messages m` + peerJoin + `
WHERE m.user_id = $1 AND m.sender_is_me = 1 AND m.body <> ''` + junkFilter + `
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
SELECT m.body, m.space_key, ` + labelExpr + `, m.observed_at
FROM messages m` + peerJoin + `
WHERE m.user_id = $1 AND m.sender_is_me = 1 AND m.body <> ''
  AND length(m.body) >= $2
  AND m.space_key = $4` + junkFilter + `
ORDER BY m.observed_at DESC
LIMIT $3`
		args = append(args, spaceKey)
	} else {
		q = `
SELECT m.body, m.space_key, ` + labelExpr + `, m.observed_at
FROM messages m` + peerJoin + `
WHERE m.user_id = $1 AND m.sender_is_me = 1 AND m.body <> ''
  AND length(m.body) >= $2` + junkFilter + `
ORDER BY m.observed_at DESC
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

// ClaudePendingFilter carries optional filter params for ListClaudePending / CountClaudePending.
// Zero value applies no additional filters.
type ClaudePendingFilter struct {
	SpaceKey       string // exact match on space_key; empty = all
	SenderContains string // ILIKE %value% on sender_name; empty = all
	BodyContains   string // ILIKE %value% on body; empty = all
	MentionedOnly  bool   // only messages where mentioned=true
	Offset         int    // pagination offset >= 0
}

// ListClaudePending returns the messages that match the user's current
// answer-filtering preferences:
//   - sender is not me (relaxed when debug=true)
//   - no draft exists yet for the message
//   - space_settings.disabled = 0 (explicit whitelist — anything the
//     user hasn't toggled on in the Channel 設定 list is excluded)
//   - if user_settings.reply_only_when_mentioned is TRUE, the body must
//     contain a literal "@<local user name>" substring (case-insensitive,
//     also relaxed when debug=true)
//
// debug=true includes messages sent by the local user and bypasses the
// mention gate so you can end-to-end test the skill pipeline from your
// own Chat session without needing a second account.
//
// Space-name fallback chain for the returned space_name field:
//  1. spaces_directory.display_name  (jfcZG / get_group populated it)
//  2. "<peer_sender_name> (DM)"      (single non-self sender in the space)
//  3. messages.space_name            (mirror column populated at insert)
//  4. messages.space_key             (raw placeholder, last resort)
//
// The (DM) label is deliberately heuristic — any space whose observed
// non-self senders collapse to one name looks like a DM from our side.
// Group chats with only one active peer will also get tagged as DM,
// which is fine for Chat-wise routing since the draft goes to the same
// room either way.
//
// Returned in time-descending order (newest first); cap with limit.
func (db *DB) ListClaudePending(ctx context.Context, userID int64, since time.Time, limit int, debug bool, filter ...ClaudePendingFilter) ([]ClaudePending, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	var f ClaudePendingFilter
	if len(filter) > 0 {
		f = filter[0]
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	selfFilter := `
  AND m.sender_is_me = 0
  AND (COALESCE(u.name, '') = '' OR m.sender_name IS NULL OR m.sender_name = '' OR lower(m.sender_name) <> lower(u.name))`
	mentionFilter := `
  AND (
    COALESCE(us.reply_only_when_mentioned, 0) = 0
    OR (COALESCE(u.name, '') <> '' AND instr(lower(m.body), lower('@' || u.name)) > 0)
  )`
	if debug {
		selfFilter = ""
		mentionFilter = ""
	}
	sinceFilter := ""
	args := []any{userID, limit}
	if !since.IsZero() {
		sinceFilter = `
  AND m.observed_at >= $3`
		args = append(args, since)
	}

	// Additional optional filters from ClaudePendingFilter
	extraClauses := ""
	if f.SpaceKey != "" {
		args = append(args, f.SpaceKey)
		extraClauses += fmt.Sprintf("\n  AND m.space_key = $%d", len(args))
	}
	if f.SenderContains != "" {
		args = append(args, "%"+f.SenderContains+"%")
		extraClauses += fmt.Sprintf("\n  AND COALESCE(NULLIF(cm.display_name, ''), m.sender_name) LIKE $%d", len(args))
	}
	if f.BodyContains != "" {
		args = append(args, "%"+f.BodyContains+"%")
		extraClauses += fmt.Sprintf("\n  AND m.body LIKE $%d", len(args))
	}
	if f.MentionedOnly {
		extraClauses += "\n  AND (COALESCE(u.name, '') <> '' AND instr(lower(m.body), lower('@' || u.name)) > 0)"
	}

	offsetClause := ""
	if f.Offset > 0 {
		args = append(args, f.Offset)
		offsetClause = fmt.Sprintf(" OFFSET $%d", len(args))
	}

	// SQLite doesn't have array_agg / LATERAL / array_length. The "(DM)" label
	// for 1-person spaces uses a scalar subquery + HAVING instead.
	q := fmt.Sprintf(`
SELECT
  m.id,
  m.space_key,
  COALESCE(
    NULLIF(dir.display_name, ''),
    (
      SELECT COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name) || ' (DM)'
      FROM messages peer_m
      LEFT JOIN chat_members cm2
        ON cm2.user_id = peer_m.user_id AND cm2.member_id = peer_m.sender_id
      WHERE peer_m.user_id = m.user_id
        AND peer_m.space_key = m.space_key
        AND peer_m.sender_is_me = 0
        AND COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name) <> ''
      GROUP BY peer_m.space_key
      HAVING COUNT(DISTINCT COALESCE(NULLIF(cm2.display_name, ''), peer_m.sender_name)) = 1
      LIMIT 1
    ),
    CASE WHEN m.space_name IS NULL
           OR m.space_name = ''
           OR m.space_name = m.space_key
           OR m.space_name LIKE 'space:%%' THEN NULL
         ELSE m.space_name END,
    m.space_key
  ) AS space_name,
  COALESCE(NULLIF(m.thread_key, ''), m.message_key) AS thread_key,
  m.message_key,
  COALESCE(NULLIF(cm.display_name, ''), m.sender_name) AS sender_name,
  m.body, m.observed_at,
  CASE
    WHEN COALESCE(u.name, '') = '' THEN 0
    ELSE CASE WHEN instr(lower(m.body), lower('@' || u.name)) > 0 THEN 1 ELSE 0 END
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
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key
LEFT JOIN chat_members cm
  ON cm.user_id = m.user_id AND cm.member_id = m.sender_id
WHERE m.user_id = $1
  AND d.id IS NULL
  AND m.skipped_at IS NULL
  AND COALESCE(s.disabled, 1) = 0%s%s%s%s
ORDER BY m.observed_at DESC
LIMIT $2%s`, selfFilter, mentionFilter, sinceFilter, extraClauses, offsetClause)
	rows, err := db.Query(ctx, q, args...)
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

// CountClaudePending returns the total count of pending messages matching the
// same filters as ListClaudePending (excluding LIMIT/OFFSET), for pagination.
func (db *DB) CountClaudePending(ctx context.Context, userID int64, since time.Time, debug bool, filter ...ClaudePendingFilter) (int, error) {
	var f ClaudePendingFilter
	if len(filter) > 0 {
		f = filter[0]
	}

	selfFilter := `
  AND m.sender_is_me = 0
  AND (COALESCE(u.name, '') = '' OR m.sender_name IS NULL OR m.sender_name = '' OR lower(m.sender_name) <> lower(u.name))`
	mentionFilter := `
  AND (
    COALESCE(us.reply_only_when_mentioned, 0) = 0
    OR (COALESCE(u.name, '') <> '' AND instr(lower(m.body), lower('@' || u.name)) > 0)
  )`
	if debug {
		selfFilter = ""
		mentionFilter = ""
	}

	args := []any{userID}
	sinceFilter := ""
	if !since.IsZero() {
		args = append(args, since)
		sinceFilter = fmt.Sprintf("\n  AND m.observed_at >= $%d", len(args))
	}

	extraClauses := ""
	if f.SpaceKey != "" {
		args = append(args, f.SpaceKey)
		extraClauses += fmt.Sprintf("\n  AND m.space_key = $%d", len(args))
	}
	if f.SenderContains != "" {
		args = append(args, "%"+f.SenderContains+"%")
		extraClauses += fmt.Sprintf("\n  AND COALESCE(NULLIF(cm.display_name, ''), m.sender_name) LIKE $%d", len(args))
	}
	if f.BodyContains != "" {
		args = append(args, "%"+f.BodyContains+"%")
		extraClauses += fmt.Sprintf("\n  AND m.body LIKE $%d", len(args))
	}
	if f.MentionedOnly {
		extraClauses += "\n  AND (COALESCE(u.name, '') <> '' AND instr(lower(m.body), lower('@' || u.name)) > 0)"
	}

	q := fmt.Sprintf(`
SELECT COUNT(*)
FROM messages m
LEFT JOIN drafts d
  ON d.message_id = m.id
LEFT JOIN space_settings s
  ON s.user_id = m.user_id AND s.space_key = m.space_key
LEFT JOIN user_settings us
  ON us.user_id = m.user_id
LEFT JOIN users u
  ON u.id = m.user_id
LEFT JOIN chat_members cm
  ON cm.user_id = m.user_id AND cm.member_id = m.sender_id
WHERE m.user_id = $1
  AND d.id IS NULL
  AND m.skipped_at IS NULL
  AND COALESCE(s.disabled, 1) = 0%s%s%s%s`,
		selfFilter, mentionFilter, sinceFilter, extraClauses)

	var total int
	if err := db.QueryRow(ctx, q, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

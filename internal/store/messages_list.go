package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// ListMessagesOpts holds query parameters for ListMessagesBySpace.
type ListMessagesOpts struct {
	// Limit is the maximum number of rows to return (1..500). Required.
	Limit int
	// BeforeID, when > 0, restricts results to id < BeforeID (cursor pagination).
	BeforeID int64
	// Since, when non-zero, restricts to observed_at >= Since.
	Since time.Time
}

// MessageForAPI is a projection of Message used by GET /api/messages.
// It omits internal fields (user_id, sender_is_me, space_name) that the
// mining skill / F-015 frontend do not need.
type MessageForAPI struct {
	ID         int64      `json:"id"`
	MessageID  string     `json:"message_id"`  // message_key in DB (Google Chat message resource name)
	SpaceKey   string     `json:"space_key"`
	ThreadKey  string     `json:"thread_key"`
	SenderID   string     `json:"sender_id"`
	SenderName string     `json:"sender_name"`
	Body       string     `json:"body"`
	ObservedAt time.Time  `json:"observed_at"`
	Mentioned  bool       `json:"mentioned"`
	SkippedAt  *time.Time `json:"skipped_at"`
}

// listMessagesSelectExpr is the shared SELECT list for list-messages queries.
// We join chat_members so display_name overrides the stale sender_name stored
// at ingest time (same approach as existing RecentInbox / MessageContext).
const listMessagesSelectExpr = `
SELECT
  m.id,
  m.message_key,
  m.space_key,
  m.thread_key,
  m.sender_id,
  ` + senderNameExpr + ` AS sender_name,
  m.body,
  m.observed_at,
  m.mentioned,
  m.skipped_at
FROM messages m` + memberJoin

// scanMessageForAPI scans a single row produced by listMessagesSelectExpr.
func scanMessageForAPI(row pgx.Row) (*MessageForAPI, error) {
	var m MessageForAPI
	if err := row.Scan(
		&m.ID, &m.MessageID, &m.SpaceKey, &m.ThreadKey,
		&m.SenderID, &m.SenderName, &m.Body,
		&m.ObservedAt, &m.Mentioned, &m.SkippedAt,
	); err != nil {
		return nil, err
	}
	return &m, nil
}

func scanMessagesForAPI(rows pgx.Rows) ([]MessageForAPI, error) {
	var out []MessageForAPI
	for rows.Next() {
		m, err := scanMessageForAPI(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *m)
	}
	return out, rows.Err()
}

// ListMessagesBySpace returns messages for a given space, ordered by id DESC
// (newest first), with optional pagination and time filter.
//
// Returns the slice of messages and the id of the next page boundary
// (next_before_id), which is the smallest id in the returned page minus 1.
// next_before_id is nil when there are no more pages.
func (db *DB) ListMessagesBySpace(ctx context.Context, userID int64, spaceKey string, opts ListMessagesOpts) ([]MessageForAPI, *int64, error) {
	// Fetch limit+1 to know whether a next page exists.
	fetchLimit := opts.Limit + 1

	// Build query with optional clauses.
	// Base conditions are always: user_id + space_key.
	// Optional:  id < before_id   (pagination)
	//            observed_at >= since (time filter)
	// Order: id DESC (stable, avoids observed_at ties).
	q := listMessagesSelectExpr + `
WHERE m.user_id = $1 AND m.space_key = $2`

	args := []any{userID, spaceKey}
	argN := 2

	if opts.BeforeID > 0 {
		argN++
		q += ` AND m.id < $` + itoa(argN)
		args = append(args, opts.BeforeID)
	}

	if !opts.Since.IsZero() {
		argN++
		q += ` AND m.observed_at >= $` + itoa(argN)
		args = append(args, opts.Since)
	}

	argN++
	q += ` ORDER BY m.id DESC LIMIT $` + itoa(argN)
	args = append(args, fetchLimit)

	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	all, err := scanMessagesForAPI(rows)
	if err != nil {
		return nil, nil, err
	}

	var nextBeforeID *int64
	if len(all) > opts.Limit {
		// Trim the extra row; use the last returned id as next_before_id.
		all = all[:opts.Limit]
		v := all[len(all)-1].ID
		nextBeforeID = &v
	}

	return all, nextBeforeID, nil
}

// ListMessagesByIDs fetches messages by their primary-key IDs for a given user.
// The result order is unspecified (PostgreSQL heap order).
// IDs that do not exist in the DB for this user are silently omitted.
func (db *DB) ListMessagesByIDs(ctx context.Context, userID int64, ids []int64) ([]MessageForAPI, error) {
	if len(ids) == 0 {
		return nil, nil
	}

	// Use ANY($3::bigint[]) to avoid building dynamic placeholders and
	// to stay safe from SQL injection. pgx knows how to encode []int64.
	q := listMessagesSelectExpr + `
WHERE m.user_id = $1 AND m.id = ANY($2::bigint[])`

	rows, err := db.Query(ctx, q, userID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return scanMessagesForAPI(rows)
}


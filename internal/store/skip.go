package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// SkipResult holds the skip-mark fields returned after a skip operation.
type SkipResult struct {
	MessageID  string    `json:"message_id"`
	SkippedAt  time.Time `json:"skipped_at"`
	SkipReason string    `json:"skip_reason"`
	SkippedBy  string    `json:"skipped_by"`
}

// SkippedItem is one row returned by ListSkipped.
type SkippedItem struct {
	MessageID  string    `json:"message_id"`
	SpaceKey   string    `json:"space_key"`
	SenderName string    `json:"sender_name"`
	Text       string    `json:"text"`
	SkippedAt  time.Time `json:"skipped_at"`
	SkipReason string    `json:"skip_reason"`
	SkippedBy  string    `json:"skipped_by"`
}

// ErrNotFound is returned when the requested message does not exist.
var ErrNotFound = errors.New("not found")

// SkipMessage marks a message as skipped (idempotent).
// If the message is already skipped the existing values are returned unchanged.
// Returns ErrNotFound if the message_key does not exist for the given user.
func (db *DB) SkipMessage(ctx context.Context, userID int64, messageKey, reason, by string) (*SkipResult, error) {
	// Attempt to UPDATE only if not yet skipped.
	const qUpdate = `
UPDATE messages
SET
  skipped_at  = NOW(),
  skip_reason = $3,
  skipped_by  = $4
WHERE user_id = $1
  AND message_key = $2
  AND skipped_at IS NULL
RETURNING message_key, skipped_at, skip_reason, skipped_by`

	var result SkipResult
	err := db.QueryRow(ctx, qUpdate, userID, messageKey, reason, by).
		Scan(&result.MessageID, &result.SkippedAt, &result.SkipReason, &result.SkippedBy)
	if err == nil {
		// Successfully updated — first skip.
		return &result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	// 0 rows affected — either message doesn't exist or already skipped.
	const qSelect = `
SELECT message_key, skipped_at, skip_reason, skipped_by
FROM messages
WHERE user_id = $1 AND message_key = $2`

	err = db.QueryRow(ctx, qSelect, userID, messageKey).
		Scan(&result.MessageID, &result.SkippedAt, &result.SkipReason, &result.SkippedBy)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	// Message exists and was already skipped — return idempotent response.
	return &result, nil
}

// UnskipMessage clears the three skip columns, returning the message to the
// pending pool. Returns ErrNotFound if the message_key does not exist.
func (db *DB) UnskipMessage(ctx context.Context, userID int64, messageKey string) error {
	const q = `
UPDATE messages
SET skipped_at = NULL, skip_reason = NULL, skipped_by = NULL
WHERE user_id = $1 AND message_key = $2`

	ct, err := db.Exec(ctx, q, userID, messageKey)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListSkippedOptions filters for ListSkipped.
type ListSkippedOptions struct {
	Limit int       // default 50, max 200
	Since time.Time // only rows with skipped_at >= Since; zero = no filter
	By    string    // filter skipped_by; empty = all
}

// ListSkipped returns skipped messages for a user, newest-skipped first.
func (db *DB) ListSkipped(ctx context.Context, userID int64, opts ListSkippedOptions) ([]SkippedItem, error) {
	if opts.Limit <= 0 {
		opts.Limit = 50
	}
	if opts.Limit > 200 {
		opts.Limit = 200
	}

	args := []any{userID, opts.Limit}
	sinceClause := ""
	byClause := ""

	if !opts.Since.IsZero() {
		args = append(args, opts.Since)
		sinceClause = fmt.Sprintf(" AND m.skipped_at >= $%d", len(args))
	}
	if opts.By != "" {
		args = append(args, opts.By)
		byClause = fmt.Sprintf(" AND m.skipped_by = $%d", len(args))
	}

	q := `
SELECT
  m.message_key,
  m.space_key,
  COALESCE(NULLIF(cm.display_name, ''), m.sender_name) AS sender_name,
  m.body,
  m.skipped_at,
  m.skip_reason,
  m.skipped_by
FROM messages m
LEFT JOIN chat_members cm
  ON cm.user_id = m.user_id AND cm.member_id = m.sender_id
WHERE m.user_id = $1
  AND m.skipped_at IS NOT NULL` + sinceClause + byClause + `
ORDER BY m.skipped_at DESC
LIMIT $2`

	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []SkippedItem
	for rows.Next() {
		var item SkippedItem
		if err := rows.Scan(
			&item.MessageID, &item.SpaceKey, &item.SenderName,
			&item.Text, &item.SkippedAt, &item.SkipReason, &item.SkippedBy,
		); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

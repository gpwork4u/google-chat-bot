package store

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"
)

// SentFilter holds query parameters for ListSentLog.
type SentFilter struct {
	Mode     string    // "" | "approved" | "auto"
	SpaceIDs []string  // filter by space_key values (empty = all)
	From     time.Time // inclusive lower bound on sent_at
	To       time.Time // inclusive upper bound on sent_at
	Q        string    // substring search on sent_content (case-insensitive)
	Cursor   string    // opaque cursor for keyset pagination
}

// SentLogRow is one row returned by ListSentLog.
type SentLogRow struct {
	ID             string    `json:"id"`
	SpaceID        string    `json:"space_id"`
	SpaceName      string    `json:"space_name"`
	SenderID       string    `json:"sender_id"`
	SenderName     string    `json:"sender_name"`
	TriggerMessage string    `json:"trigger_message"`
	SentContent    string    `json:"sent_content"`
	OriginalBody   string    `json:"original_body,omitempty"`
	Mode           string    `json:"mode"`  // "approved" | "auto"
	EditedByUser   bool      `json:"edited_by_user"`
	Category       string    `json:"category"`
	SentAt         time.Time `json:"sent_at"`
}

// SentCursor holds the keyset cursor position for pagination.
type SentCursor struct {
	SentAt time.Time
	ID     int64
}

// EncodeCursor encodes a SentCursor to an opaque base64 string.
func EncodeCursor(c SentCursor) string {
	s := fmt.Sprintf("%d|%d", c.SentAt.UnixNano(), c.ID)
	return base64.RawURLEncoding.EncodeToString([]byte(s))
}

// DecodeCursor decodes a base64 cursor string. Returns zero value on error.
func DecodeCursor(s string) (SentCursor, error) {
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return SentCursor{}, err
	}
	parts := strings.SplitN(string(b), "|", 2)
	if len(parts) != 2 {
		return SentCursor{}, fmt.Errorf("invalid cursor format")
	}
	var nanos, id int64
	if _, err := fmt.Sscanf(parts[0], "%d", &nanos); err != nil {
		return SentCursor{}, err
	}
	if _, err := fmt.Sscanf(parts[1], "%d", &id); err != nil {
		return SentCursor{}, err
	}
	return SentCursor{
		SentAt: time.Unix(0, nanos).UTC(),
		ID:     id,
	}, nil
}

// ListSentLog returns sent drafts with cursor-based pagination.
// Returns rows, next cursor string (empty if no more pages), and any error.
func (db *DB) ListSentLog(ctx context.Context, userID int64, filter SentFilter, limit int) ([]SentLogRow, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	// Build WHERE clauses.
	conds := []string{"d.status = 'sent'", "m.user_id = $1", "d.sent_at IS NOT NULL"}
	args := []any{userID}
	argN := 1

	nextArg := func(v any) string {
		argN++
		args = append(args, v)
		return fmt.Sprintf("$%d", argN)
	}

	// Mode filter: auto_sent=true → "auto", else "approved".
	if filter.Mode == "auto" {
		conds = append(conds, "d.auto_sent = TRUE")
	} else if filter.Mode == "approved" {
		conds = append(conds, "d.auto_sent = FALSE")
	}

	// Space filter.
	if len(filter.SpaceIDs) > 0 {
		placeholders := make([]string, len(filter.SpaceIDs))
		for i, sid := range filter.SpaceIDs {
			placeholders[i] = nextArg(sid)
		}
		conds = append(conds, fmt.Sprintf("m.space_key = ANY(ARRAY[%s])", strings.Join(placeholders, ",")))
	}

	// Date range filter.
	if !filter.From.IsZero() {
		conds = append(conds, fmt.Sprintf("d.sent_at >= %s", nextArg(filter.From)))
	}
	if !filter.To.IsZero() {
		conds = append(conds, fmt.Sprintf("d.sent_at <= %s", nextArg(filter.To)))
	}

	// Substring search on body.
	if filter.Q != "" {
		conds = append(conds, fmt.Sprintf("d.body ILIKE %s", nextArg("%"+filter.Q+"%")))
	}

	// Cursor-based pagination: (sent_at, id) keyset.
	if filter.Cursor != "" {
		cur, err := DecodeCursor(filter.Cursor)
		if err == nil {
			conds = append(conds, fmt.Sprintf(
				"(d.sent_at < %s OR (d.sent_at = %s AND d.id < %s))",
				nextArg(cur.SentAt), nextArg(cur.SentAt), nextArg(cur.ID),
			))
		}
	}

	where := strings.Join(conds, " AND ")

	// We fetch limit+1 to detect whether there is a next page.
	q := fmt.Sprintf(`
SELECT
  d.id,
  m.space_key,
  COALESCE(NULLIF(dir.display_name, ''), m.space_name) AS space_name,
  m.sender_id,
  COALESCE(NULLIF(cm.display_name, ''), m.sender_name) AS sender_name,
  m.body AS trigger_message,
  d.body AS sent_content,
  d.original_body,
  d.auto_sent,
  d.model AS category,
  d.sent_at
FROM drafts d
JOIN messages m ON m.id = d.message_id
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key
LEFT JOIN chat_members cm
  ON cm.user_id = m.user_id AND cm.member_id = m.sender_id
WHERE %s
ORDER BY d.sent_at DESC, d.id DESC
LIMIT %d`, where, limit+1)

	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []SentLogRow
	for rows.Next() {
		var r SentLogRow
		var rawID int64
		var autoSent bool
		var originalBody, category string
		var sentAt time.Time
		if err := rows.Scan(
			&rawID, &r.SpaceID, &r.SpaceName, &r.SenderID, &r.SenderName,
			&r.TriggerMessage, &r.SentContent, &originalBody, &autoSent,
			&category, &sentAt,
		); err != nil {
			return nil, "", err
		}
		r.ID = fmt.Sprintf("%d", rawID)
		r.OriginalBody = originalBody
		r.EditedByUser = originalBody != "" && r.SentContent != originalBody
		r.SentAt = sentAt.UTC()
		if autoSent {
			r.Mode = "auto"
		} else {
			r.Mode = "approved"
		}
		// Category is stored in the model field for now; use a simple mapping.
		r.Category = category
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	// Determine next cursor.
	var nextCursor string
	if len(out) > limit {
		// There is a next page; use the last returned row as cursor.
		last := out[limit-1]
		var lastID int64
		fmt.Sscanf(last.ID, "%d", &lastID)
		nextCursor = EncodeCursor(SentCursor{SentAt: last.SentAt, ID: lastID})
		out = out[:limit]
	}

	return out, nextCursor, nil
}

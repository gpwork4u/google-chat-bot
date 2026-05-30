package store

import (
	"context"
	"errors"

)

type ChatMember struct {
	MemberID    string
	DisplayName string
	Email       string
}

// UpsertChatMember records/refreshes a sender_id → name/email mapping.
// Empty strings are not allowed to overwrite an existing non-empty value,
// so a list_topics response that happens to include a sender with a blank
// profile field won't blank out a good record from elsewhere.
func (db *DB) UpsertChatMember(ctx context.Context, userID int64, memberID, name, email string) error {
	if memberID == "" {
		return nil
	}
	const q = `
INSERT INTO chat_members (user_id, member_id, display_name, email, updated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (user_id, member_id) DO UPDATE SET
  display_name = CASE WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name ELSE chat_members.display_name END,
  email        = CASE WHEN EXCLUDED.email        <> '' THEN EXCLUDED.email        ELSE chat_members.email END,
  updated_at   = NOW()`
	_, err := db.Exec(ctx, q, userID, memberID, name, email)
	return err
}

func (db *DB) LookupChatMember(ctx context.Context, userID int64, memberID string) (*ChatMember, error) {
	if memberID == "" {
		return nil, nil
	}
	const q = `SELECT member_id, display_name, email FROM chat_members WHERE user_id=$1 AND member_id=$2`
	var m ChatMember
	err := db.QueryRow(ctx, q, userID, memberID).Scan(&m.MemberID, &m.DisplayName, &m.Email)
	if errors.Is(err, ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// CountChatMembers returns how many rows exist for the user — useful as a
// startup-health log line.
func (db *DB) CountChatMembers(ctx context.Context, userID int64) (int, error) {
	var n int
	err := db.QueryRow(ctx, `SELECT count(*) FROM chat_members WHERE user_id=$1`, userID).Scan(&n)
	return n, err
}

// ListChatMembers returns every known member for the user, ordered by
// display_name (case-insensitive). Used by GET /api/chat-members.
func (db *DB) ListChatMembers(ctx context.Context, userID int64) ([]ChatMember, error) {
	const q = `
SELECT member_id, COALESCE(display_name, '') AS display_name, COALESCE(email, '') AS email
FROM chat_members
WHERE user_id = $1
ORDER BY lower(COALESCE(NULLIF(display_name, ''), email, member_id))`
	rows, err := db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChatMember
	for rows.Next() {
		var m ChatMember
		if err := rows.Scan(&m.MemberID, &m.DisplayName, &m.Email); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// LookupChatMembers resolves several member_ids at once. Missing ids are
// silently dropped — caller can compare returned len vs input len.
func (db *DB) LookupChatMembers(ctx context.Context, userID int64, memberIDs []string) (map[string]ChatMember, error) {
	out := map[string]ChatMember{}
	if len(memberIDs) == 0 {
		return out, nil
	}
	// SQLite/database-sql doesn't expand a slice arg directly; build the
	// placeholder list manually. Cap the input size to keep the SQL string
	// bounded.
	if len(memberIDs) > 500 {
		memberIDs = memberIDs[:500]
	}
	placeholders := ""
	args := []any{userID}
	for i, id := range memberIDs {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "$" + itoa(len(args)+1)
		args = append(args, id)
	}
	q := `SELECT member_id, COALESCE(display_name, ''), COALESCE(email, '')
	      FROM chat_members WHERE user_id = $1 AND member_id IN (` + placeholders + `)`
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m ChatMember
		if err := rows.Scan(&m.MemberID, &m.DisplayName, &m.Email); err != nil {
			return nil, err
		}
		out[m.MemberID] = m
	}
	return out, rows.Err()
}


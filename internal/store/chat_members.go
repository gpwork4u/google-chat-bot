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

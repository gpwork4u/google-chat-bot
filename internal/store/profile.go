package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ProfileFact is one piece of user-curated personal info the AI skill
// can consult. See migration 0011 for visibility semantics.
type ProfileFact struct {
	Key        string    `json:"key"`
	Value      string    `json:"value"`
	Visibility string    `json:"visibility"` // public | private | secret
	Note       string    `json:"note"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ListProfileFacts returns facts for userID. includeSecret=false filters
// out secret rows, which is what the skill-facing endpoint passes.
func (db *DB) ListProfileFacts(ctx context.Context, userID int64, includeSecret bool) ([]ProfileFact, error) {
	q := `
SELECT key, value, visibility, note, updated_at
FROM user_profile_facts
WHERE user_id = $1`
	if !includeSecret {
		q += ` AND visibility <> 'secret'`
	}
	q += ` ORDER BY key ASC`
	rows, err := db.Pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProfileFact{}
	for rows.Next() {
		var f ProfileFact
		if err := rows.Scan(&f.Key, &f.Value, &f.Visibility, &f.Note, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// GetProfileFact fetches a single fact by key. Returns nil when missing.
// Caller must check visibility if it intends to filter secrets.
func (db *DB) GetProfileFact(ctx context.Context, userID int64, key string) (*ProfileFact, error) {
	const q = `
SELECT key, value, visibility, note, updated_at
FROM user_profile_facts
WHERE user_id = $1 AND key = $2`
	var f ProfileFact
	err := db.Pool.QueryRow(ctx, q, userID, key).Scan(&f.Key, &f.Value, &f.Visibility, &f.Note, &f.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// UpsertProfileFact inserts or updates a fact. visibility must be one of
// public/private/secret; caller validates before hitting this.
func (db *DB) UpsertProfileFact(ctx context.Context, userID int64, f ProfileFact) error {
	const q = `
INSERT INTO user_profile_facts (user_id, key, value, visibility, note, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW())
ON CONFLICT (user_id, key) DO UPDATE SET
    value = EXCLUDED.value,
    visibility = EXCLUDED.visibility,
    note = EXCLUDED.note,
    updated_at = NOW()`
	_, err := db.Pool.Exec(ctx, q, userID, f.Key, f.Value, f.Visibility, f.Note)
	return err
}

// DeleteProfileFact removes a fact. Missing keys are a no-op.
func (db *DB) DeleteProfileFact(ctx context.Context, userID int64, key string) error {
	const q = `DELETE FROM user_profile_facts WHERE user_id = $1 AND key = $2`
	_, err := db.Pool.Exec(ctx, q, userID, key)
	return err
}

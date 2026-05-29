package store

import (
	"context"
	"errors"
	"time"

)

// ProfileFact is one piece of user-curated personal info the AI skill
// can consult. See migration 0011 for visibility semantics.
type ProfileFact struct {
	ID         int64     `json:"id"`
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
SELECT id, key, value, visibility, note, updated_at
FROM user_profile_facts
WHERE user_id = $1`
	if !includeSecret {
		q += ` AND visibility <> 'secret'`
	}
	q += ` ORDER BY key ASC`
	rows, err := db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProfileFact{}
	for rows.Next() {
		var f ProfileFact
		if err := rows.Scan(&f.ID, &f.Key, &f.Value, &f.Visibility, &f.Note, &f.UpdatedAt); err != nil {
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
SELECT id, key, value, visibility, note, updated_at
FROM user_profile_facts
WHERE user_id = $1 AND key = $2`
	var f ProfileFact
	err := db.QueryRow(ctx, q, userID, key).Scan(&f.ID, &f.Key, &f.Value, &f.Visibility, &f.Note, &f.UpdatedAt)
	if errors.Is(err, ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// GetProfileFactByID fetches a single fact by numeric ID. Returns nil when missing.
func (db *DB) GetProfileFactByID(ctx context.Context, userID int64, id int64) (*ProfileFact, error) {
	const q = `
SELECT id, key, value, visibility, note, updated_at
FROM user_profile_facts
WHERE user_id = $1 AND id = $2`
	var f ProfileFact
	err := db.QueryRow(ctx, q, userID, id).Scan(&f.ID, &f.Key, &f.Value, &f.Visibility, &f.Note, &f.UpdatedAt)
	if errors.Is(err, ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// CreateProfileFact inserts a new fact and returns the new ID.
func (db *DB) CreateProfileFact(ctx context.Context, userID int64, f ProfileFact) (int64, error) {
	const q = `
INSERT INTO user_profile_facts (user_id, key, value, visibility, note, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW())
RETURNING id`
	var id int64
	err := db.QueryRow(ctx, q, userID, f.Key, f.Value, f.Visibility, f.Note).Scan(&id)
	return id, err
}

// PatchProfileFact updates a fact by ID. Only non-nil fields are changed.
type PatchProfileFactRequest struct {
	Key        *string `json:"key"`
	Value      *string `json:"value"`
	Visibility *string `json:"visibility"`
	Note       *string `json:"note"`
}

func (db *DB) PatchProfileFact(ctx context.Context, userID int64, id int64, req PatchProfileFactRequest) error {
	if req.Key != nil {
		if _, err := db.Exec(ctx,
			`UPDATE user_profile_facts SET key=$3, updated_at=NOW() WHERE user_id=$1 AND id=$2`,
			userID, id, *req.Key); err != nil {
			return err
		}
	}
	if req.Value != nil {
		if _, err := db.Exec(ctx,
			`UPDATE user_profile_facts SET value=$3, updated_at=NOW() WHERE user_id=$1 AND id=$2`,
			userID, id, *req.Value); err != nil {
			return err
		}
	}
	if req.Visibility != nil {
		if _, err := db.Exec(ctx,
			`UPDATE user_profile_facts SET visibility=$3, updated_at=NOW() WHERE user_id=$1 AND id=$2`,
			userID, id, *req.Visibility); err != nil {
			return err
		}
	}
	if req.Note != nil {
		if _, err := db.Exec(ctx,
			`UPDATE user_profile_facts SET note=$3, updated_at=NOW() WHERE user_id=$1 AND id=$2`,
			userID, id, *req.Note); err != nil {
			return err
		}
	}
	return nil
}

// DeleteProfileFactByID removes a fact by numeric ID. Missing IDs are a no-op.
func (db *DB) DeleteProfileFactByID(ctx context.Context, userID int64, id int64) error {
	const q = `DELETE FROM user_profile_facts WHERE user_id = $1 AND id = $2`
	_, err := db.Exec(ctx, q, userID, id)
	return err
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
	_, err := db.Exec(ctx, q, userID, f.Key, f.Value, f.Visibility, f.Note)
	return err
}

// DeleteProfileFact removes a fact by key. Missing keys are a no-op.
func (db *DB) DeleteProfileFact(ctx context.Context, userID int64, key string) error {
	const q = `DELETE FROM user_profile_facts WHERE user_id = $1 AND key = $2`
	_, err := db.Exec(ctx, q, userID, key)
	return err
}

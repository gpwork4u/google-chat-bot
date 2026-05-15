package store

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Sentinel errors for space_facts operations.
var (
	ErrFactNotFound = errors.New("space fact not found")
	ErrSpaceNotFound = errors.New("space not found")
)

// SpaceFact represents one row in the space_facts table.
type SpaceFact struct {
	ID               int64      `json:"id"`
	SpaceKey         string     `json:"space_key"`
	Category         string     `json:"category"`
	Content          string     `json:"content"`
	Visibility       string     `json:"visibility"`
	Status           string     `json:"status"`
	SourceMessageIDs []int64    `json:"source_message_ids"`
	Note             string     `json:"note"`
	CreatedBy        string     `json:"created_by"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
	ApprovedAt       *time.Time `json:"approved_at"`
}

// ValidCategories is the allowed set of fact categories.
var ValidCategories = map[string]bool{
	"product":          true,
	"my-role":          true,
	"glossary":         true,
	"pinned-decision":  true,
	"relation":         true,
}

// ValidVisibilities is the allowed set of visibility values.
var ValidVisibilities = map[string]bool{
	"public":  true,
	"private": true,
	"secret":  true,
}

// ValidStatuses is the allowed set of status values.
var ValidStatuses = map[string]bool{
	"candidate": true,
	"approved":  true,
	"rejected":  true,
}

// SpaceFactFilter holds optional query filters for ListSpaceFacts.
type SpaceFactFilter struct {
	SpaceKey      string
	Category      string
	Status        string // default "approved" if empty
	Visibility    string
	IncludeSecret bool
	Limit         int // 0 means no limit
}

// CreateSpaceFactParams holds the required and optional fields for creating a fact.
type CreateSpaceFactParams struct {
	SpaceKey         string
	Category         string
	Content          string
	Visibility       string
	SourceMessageIDs []int64
	Note             string
	CreatedBy        string
}

// PatchSpaceFactParams holds optional fields for a partial update.
type PatchSpaceFactParams struct {
	Content    *string
	Visibility *string
	Status     *string
	Note       *string
	Category   *string
}

// CreateSpaceFact inserts a new space fact, deriving status from created_by:
//   - "mining-skill" → status=candidate, approved_at=NULL
//   - "manual"       → status=approved,  approved_at=NOW()
func (db *DB) CreateSpaceFact(ctx context.Context, p CreateSpaceFactParams) (*SpaceFact, error) {
	visibility := p.Visibility
	if visibility == "" {
		visibility = "private"
	}
	createdBy := p.CreatedBy
	if createdBy == "" {
		createdBy = "manual"
	}

	status := "approved"
	if createdBy == "mining-skill" {
		status = "candidate"
	}

	sourceIDs := p.SourceMessageIDs
	if sourceIDs == nil {
		sourceIDs = []int64{}
	}

	const q = `
INSERT INTO space_facts (space_key, category, content, visibility, status, source_message_ids, note, created_by, approved_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
    CASE WHEN $8 = 'manual' THEN NOW() ELSE NULL END
)
RETURNING id, space_key, category, content, visibility, status, source_message_ids, note, created_by, created_at, updated_at, approved_at`

	var f SpaceFact
	err := db.QueryRow(ctx, q,
		p.SpaceKey, p.Category, p.Content, visibility, status, sourceIDs, p.Note, createdBy,
	).Scan(
		&f.ID, &f.SpaceKey, &f.Category, &f.Content, &f.Visibility, &f.Status,
		&f.SourceMessageIDs, &f.Note, &f.CreatedBy, &f.CreatedAt, &f.UpdatedAt, &f.ApprovedAt,
	)
	if err != nil {
		return nil, err
	}
	if f.SourceMessageIDs == nil {
		f.SourceMessageIDs = []int64{}
	}
	return &f, nil
}

// GetSpaceFact returns a single fact by id, or ErrFactNotFound if it doesn't exist.
func (db *DB) GetSpaceFact(ctx context.Context, id int64) (*SpaceFact, error) {
	const q = `
SELECT id, space_key, category, content, visibility, status, source_message_ids, note, created_by, created_at, updated_at, approved_at
FROM space_facts WHERE id = $1`
	var f SpaceFact
	err := db.QueryRow(ctx, q, id).Scan(
		&f.ID, &f.SpaceKey, &f.Category, &f.Content, &f.Visibility, &f.Status,
		&f.SourceMessageIDs, &f.Note, &f.CreatedBy, &f.CreatedAt, &f.UpdatedAt, &f.ApprovedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFactNotFound
	}
	if err != nil {
		return nil, err
	}
	if f.SourceMessageIDs == nil {
		f.SourceMessageIDs = []int64{}
	}
	return &f, nil
}

// ListSpaceFacts returns facts matching the given filter.
// Default status is "approved". Secret visibility is excluded unless IncludeSecret=true.
func (db *DB) ListSpaceFacts(ctx context.Context, filter SpaceFactFilter) ([]SpaceFact, error) {
	status := filter.Status
	if status == "" {
		status = "approved"
	}

	conditions := []string{"status = $1"}
	args := []any{status}
	idx := 2

	if !filter.IncludeSecret {
		conditions = append(conditions, "visibility <> 'secret'")
	}
	if filter.SpaceKey != "" {
		conditions = append(conditions, "space_key = $"+itoa(idx))
		args = append(args, filter.SpaceKey)
		idx++
	}
	if filter.Category != "" {
		conditions = append(conditions, "category = $"+itoa(idx))
		args = append(args, filter.Category)
		idx++
	}
	if filter.Visibility != "" {
		conditions = append(conditions, "visibility = $"+itoa(idx))
		args = append(args, filter.Visibility)
		idx++
	}

	q := `SELECT id, space_key, category, content, visibility, status, source_message_ids, note, created_by, created_at, updated_at, approved_at
FROM space_facts
WHERE ` + strings.Join(conditions, " AND ") + `
ORDER BY created_at DESC`

	if filter.Limit > 0 {
		q += " LIMIT $" + itoa(idx)
		args = append(args, filter.Limit)
	}

	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []SpaceFact{}
	for rows.Next() {
		var f SpaceFact
		if err := rows.Scan(
			&f.ID, &f.SpaceKey, &f.Category, &f.Content, &f.Visibility, &f.Status,
			&f.SourceMessageIDs, &f.Note, &f.CreatedBy, &f.CreatedAt, &f.UpdatedAt, &f.ApprovedAt,
		); err != nil {
			return nil, err
		}
		if f.SourceMessageIDs == nil {
			f.SourceMessageIDs = []int64{}
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// PatchSpaceFact applies a partial update to a space fact.
// When status changes to "approved", approved_at is set to NOW().
// Returns ErrFactNotFound if the id doesn't exist.
func (db *DB) PatchSpaceFact(ctx context.Context, id int64, p PatchSpaceFactParams) (*SpaceFact, error) {
	// Build dynamic SET clause.
	sets := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	if p.Content != nil {
		sets = append(sets, "content = $"+itoa(idx))
		args = append(args, *p.Content)
		idx++
	}
	if p.Visibility != nil {
		sets = append(sets, "visibility = $"+itoa(idx))
		args = append(args, *p.Visibility)
		idx++
	}
	if p.Status != nil {
		sets = append(sets, "status = $"+itoa(idx))
		args = append(args, *p.Status)
		idx++
		// Auto-set approved_at when transitioning to approved.
		sets = append(sets, "approved_at = CASE WHEN $"+itoa(idx-1)+" = 'approved' AND approved_at IS NULL THEN NOW() ELSE approved_at END")
	}
	if p.Note != nil {
		sets = append(sets, "note = $"+itoa(idx))
		args = append(args, *p.Note)
		idx++
	}
	if p.Category != nil {
		sets = append(sets, "category = $"+itoa(idx))
		args = append(args, *p.Category)
		idx++
	}

	args = append(args, id)
	idPlaceholder := "$" + itoa(idx)

	q := `UPDATE space_facts SET ` + strings.Join(sets, ", ") + `
WHERE id = ` + idPlaceholder + `
RETURNING id, space_key, category, content, visibility, status, source_message_ids, note, created_by, created_at, updated_at, approved_at`

	var f SpaceFact
	err := db.QueryRow(ctx, q, args...).Scan(
		&f.ID, &f.SpaceKey, &f.Category, &f.Content, &f.Visibility, &f.Status,
		&f.SourceMessageIDs, &f.Note, &f.CreatedBy, &f.CreatedAt, &f.UpdatedAt, &f.ApprovedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrFactNotFound
	}
	if err != nil {
		return nil, err
	}
	if f.SourceMessageIDs == nil {
		f.SourceMessageIDs = []int64{}
	}
	return &f, nil
}

// DeleteSpaceFact hard-deletes a space fact by id.
// Returns ErrFactNotFound if the row didn't exist.
func (db *DB) DeleteSpaceFact(ctx context.Context, id int64) error {
	ct, err := db.Exec(ctx, `DELETE FROM space_facts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrFactNotFound
	}
	return nil
}

// SpaceExistsInDirectory checks if a space_key exists in the spaces_directory table
// for the given user. This is used to validate space_key during fact creation.
func (db *DB) SpaceExistsInDirectory(ctx context.Context, userID int64, spaceKey string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM spaces_directory WHERE user_id = $1 AND space_key = $2)`,
		userID, spaceKey,
	).Scan(&exists)
	return exists, err
}

// itoa converts int to string for building SQL placeholders.
func itoa(n int) string {
	return strconv.Itoa(n)
}

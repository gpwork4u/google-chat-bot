package store

// space_directory.go — read helpers over the spaces_directory table that
// holds space_key → display_name mappings. Authoritative writes still go
// through UpsertSpaceName in spaces.go.

import (
	"context"
	"time"
)

// SpaceDirectoryRow is one space_key → name mapping as exposed by
// GET /api/space-directory.
type SpaceDirectoryRow struct {
	SpaceKey    string    `json:"space_key"`
	DisplayName string    `json:"display_name"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ListSpaceDirectory returns every known space mapping for this user, ordered
// by display_name (case-insensitive). Returns an empty slice when nothing has
// been ingested yet.
func (db *DB) ListSpaceDirectory(ctx context.Context, userID int64) ([]SpaceDirectoryRow, error) {
	const q = `
SELECT space_key, COALESCE(display_name, '') AS display_name, updated_at
FROM spaces_directory
WHERE user_id = $1 AND display_name <> ''
ORDER BY lower(display_name)`
	rows, err := db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpaceDirectoryRow
	for rows.Next() {
		var r SpaceDirectoryRow
		if err := rows.Scan(&r.SpaceKey, &r.DisplayName, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

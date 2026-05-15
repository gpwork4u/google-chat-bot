package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// Sentinel errors for mining-queue operations.
var (
	ErrMiningJobRunning  = errors.New("mining job is already running")
	ErrMiningJobNotFound = errors.New("mining job not found")
)

// MiningJob represents one row in space_facts_mining_jobs.
type MiningJob struct {
	ID                  int64      `json:"id"`
	SpaceKey            string     `json:"space_key"`
	Status              string     `json:"status"`
	LastMinedMessageID  *int64     `json:"last_mined_message_id"`
	LastMinedAt         *time.Time `json:"last_mined_at"`
	CandidatesGenerated int        `json:"candidates_generated"`
	ErrorMessage        *string    `json:"error_message"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// PatchMiningJobParams carries optional fields for partial update.
type PatchMiningJobParams struct {
	Status              *string
	LastMinedMessageID  *int64
	CandidatesGenerated *int
	ErrorMessage        *string
}

// EnqueueMiningJob implements the upsert logic for POST /api/space-facts/mining-queue:
//   - No existing row → INSERT status=pending, returns (job, true, nil)
//   - Existing row with status pending → no-op, returns (job, false, nil)
//   - Existing row with status completed/failed → reset to pending, returns (job, false, nil)
//   - Existing row with status running → returns (nil, false, ErrMiningJobRunning)
func (db *DB) EnqueueMiningJob(ctx context.Context, spaceKey string) (*MiningJob, bool, error) {
	// Try to fetch existing row.
	var existing MiningJob
	err := db.QueryRow(ctx, `
SELECT id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at
FROM space_facts_mining_jobs WHERE space_key = $1`, spaceKey,
	).Scan(
		&existing.ID, &existing.SpaceKey, &existing.Status,
		&existing.LastMinedMessageID, &existing.LastMinedAt,
		&existing.CandidatesGenerated, &existing.ErrorMessage,
		&existing.CreatedAt, &existing.UpdatedAt,
	)

	if errors.Is(err, pgx.ErrNoRows) {
		// No existing row — INSERT.
		var job MiningJob
		err2 := db.QueryRow(ctx, `
INSERT INTO space_facts_mining_jobs (space_key, status)
VALUES ($1, 'pending')
RETURNING id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at`,
			spaceKey,
		).Scan(
			&job.ID, &job.SpaceKey, &job.Status,
			&job.LastMinedMessageID, &job.LastMinedAt,
			&job.CandidatesGenerated, &job.ErrorMessage,
			&job.CreatedAt, &job.UpdatedAt,
		)
		if err2 != nil {
			return nil, false, err2
		}
		return &job, true, nil
	}
	if err != nil {
		return nil, false, err
	}

	// Existing row found.
	switch existing.Status {
	case "running":
		return nil, false, ErrMiningJobRunning
	case "pending":
		// Already pending — return as-is.
		return &existing, false, nil
	default:
		// completed or failed → reset to pending.
		var job MiningJob
		err2 := db.QueryRow(ctx, `
UPDATE space_facts_mining_jobs
SET status = 'pending', error_message = NULL, updated_at = NOW()
WHERE space_key = $1
RETURNING id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at`,
			spaceKey,
		).Scan(
			&job.ID, &job.SpaceKey, &job.Status,
			&job.LastMinedMessageID, &job.LastMinedAt,
			&job.CandidatesGenerated, &job.ErrorMessage,
			&job.CreatedAt, &job.UpdatedAt,
		)
		if err2 != nil {
			return nil, false, err2
		}
		return &job, false, nil
	}
}

// ListMiningJobs returns mining jobs filtered by status (default "pending").
func (db *DB) ListMiningJobs(ctx context.Context, status string, limit int) ([]MiningJob, error) {
	if status == "" {
		status = "pending"
	}
	if limit <= 0 {
		limit = 50
	}

	const q = `
SELECT id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at
FROM space_facts_mining_jobs
WHERE status = $1
ORDER BY created_at DESC
LIMIT $2`

	rows, err := db.Query(ctx, q, status, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []MiningJob{}
	for rows.Next() {
		var job MiningJob
		if err := rows.Scan(
			&job.ID, &job.SpaceKey, &job.Status,
			&job.LastMinedMessageID, &job.LastMinedAt,
			&job.CandidatesGenerated, &job.ErrorMessage,
			&job.CreatedAt, &job.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, job)
	}
	return out, rows.Err()
}

// GetMiningJob fetches a mining job by space_key.
// Returns ErrMiningJobNotFound if no row exists for that space_key.
func (db *DB) GetMiningJob(ctx context.Context, spaceKey string) (*MiningJob, error) {
	const q = `
SELECT id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at
FROM space_facts_mining_jobs WHERE space_key = $1`
	var job MiningJob
	err := db.QueryRow(ctx, q, spaceKey).Scan(
		&job.ID, &job.SpaceKey, &job.Status,
		&job.LastMinedMessageID, &job.LastMinedAt,
		&job.CandidatesGenerated, &job.ErrorMessage,
		&job.CreatedAt, &job.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMiningJobNotFound
	}
	return &job, err
}

// PatchMiningJob applies a partial update to a mining job identified by space_key.
// When status is set to "completed", last_mined_at is set to NOW().
// Returns ErrMiningJobNotFound if no row exists.
func (db *DB) PatchMiningJob(ctx context.Context, spaceKey string, p PatchMiningJobParams) (*MiningJob, error) {
	sets := []string{"updated_at = NOW()"}
	args := []any{}
	idx := 1

	if p.Status != nil {
		sets = append(sets, "status = $"+itoa(idx))
		args = append(args, *p.Status)
		idx++
		// Auto-set last_mined_at when marking completed.
		sets = append(sets, "last_mined_at = CASE WHEN $"+itoa(idx-1)+" = 'completed' THEN NOW() ELSE last_mined_at END")
		// Clear error_message when resetting to a non-failed state.
		sets = append(sets, "error_message = CASE WHEN $"+itoa(idx-1)+" <> 'failed' THEN NULL ELSE error_message END")
	}
	if p.LastMinedMessageID != nil {
		sets = append(sets, "last_mined_message_id = $"+itoa(idx))
		args = append(args, *p.LastMinedMessageID)
		idx++
	}
	if p.CandidatesGenerated != nil {
		sets = append(sets, "candidates_generated = $"+itoa(idx))
		args = append(args, *p.CandidatesGenerated)
		idx++
	}
	if p.ErrorMessage != nil {
		sets = append(sets, "error_message = $"+itoa(idx))
		args = append(args, *p.ErrorMessage)
		idx++
	}

	args = append(args, spaceKey)
	q := `UPDATE space_facts_mining_jobs SET ` + strings.Join(sets, ", ") + `
WHERE space_key = $` + itoa(idx) + `
RETURNING id, space_key, status, last_mined_message_id, last_mined_at, candidates_generated, error_message, created_at, updated_at`

	var job MiningJob
	err := db.QueryRow(ctx, q, args...).Scan(
		&job.ID, &job.SpaceKey, &job.Status,
		&job.LastMinedMessageID, &job.LastMinedAt,
		&job.CandidatesGenerated, &job.ErrorMessage,
		&job.CreatedAt, &job.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrMiningJobNotFound
	}
	if err != nil {
		return nil, err
	}
	return &job, nil
}

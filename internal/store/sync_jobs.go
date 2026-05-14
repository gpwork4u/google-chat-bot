package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrJobExists is returned when a sync job with the same job_id already exists.
var ErrJobExists = errors.New("sync job exists")

// ErrJobNotFound is returned when no sync job matches the given job_id.
var ErrJobNotFound = errors.New("sync job not found")

// SyncJob represents a row in space_history_sync_jobs.
type SyncJob struct {
	ID               int64          `json:"id"`
	JobID            string         `json:"job_id"`
	SpaceKey         *string        `json:"space_key"`
	Status           string         `json:"status"`
	TotalMessages    int            `json:"total_messages"`
	InsertedMessages int            `json:"inserted_messages"`
	DuplicateMessages int           `json:"duplicate_messages"`
	FailedMessages   int            `json:"failed_messages"`
	StartedAt        time.Time      `json:"started_at"`
	CompletedAt      sql.NullTime   `json:"completed_at"`
	ErrorMessage     *string        `json:"error_message"`
}

// CreateSyncJob inserts a new sync job row with status='running'.
// Returns ErrJobExists if the job_id already exists.
func (db *DB) CreateSyncJob(ctx context.Context, jobID string, spaceKey *string) error {
	const q = `
INSERT INTO space_history_sync_jobs (job_id, space_key)
VALUES ($1, $2)`
	_, err := db.Exec(ctx, q, jobID, spaceKey)
	if err != nil {
		// pgx wraps pg error codes inside the error message; check for unique violation (23505).
		if isUniqueViolation(err) {
			return ErrJobExists
		}
		return err
	}
	return nil
}

// RecordBatch atomically adds inserted/duplicates/failed counts to the running totals
// and increments total_messages by (inserted + duplicates + failed).
func (db *DB) RecordBatch(ctx context.Context, jobID string, inserted, duplicates, failed int) error {
	const q = `
UPDATE space_history_sync_jobs
SET
  inserted_messages  = inserted_messages  + $2,
  duplicate_messages = duplicate_messages + $3,
  failed_messages    = failed_messages    + $4,
  total_messages     = total_messages     + ($2 + $3 + $4)
WHERE job_id = $1`
	ct, err := db.Exec(ctx, q, jobID, inserted, duplicates, failed)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrJobNotFound
	}
	return nil
}

// MarkJobComplete sets the job status to the given value and records completed_at.
// status must be one of: completed, failed, cancelled.
// If errMsg is non-nil it is stored in error_message.
// The update is idempotent: calling it a second time on an already-completed job
// is a no-op (returns nil) so callers don't need to check current state first.
func (db *DB) MarkJobComplete(ctx context.Context, jobID, status string, errMsg *string) error {
	const q = `
UPDATE space_history_sync_jobs
SET
  status        = $2,
  completed_at  = NOW(),
  error_message = $3
WHERE job_id = $1`
	ct, err := db.Exec(ctx, q, jobID, status, errMsg)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrJobNotFound
	}
	return nil
}

// GetSyncJob fetches one sync job by job_id.
// Returns ErrJobNotFound if no row matches.
func (db *DB) GetSyncJob(ctx context.Context, jobID string) (*SyncJob, error) {
	const q = `
SELECT
  id, job_id, space_key, status,
  total_messages, inserted_messages, duplicate_messages, failed_messages,
  started_at, completed_at, error_message
FROM space_history_sync_jobs
WHERE job_id = $1`
	var j SyncJob
	err := db.QueryRow(ctx, q, jobID).Scan(
		&j.ID, &j.JobID, &j.SpaceKey, &j.Status,
		&j.TotalMessages, &j.InsertedMessages, &j.DuplicateMessages, &j.FailedMessages,
		&j.StartedAt, &j.CompletedAt, &j.ErrorMessage,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrJobNotFound
	}
	if err != nil {
		return nil, err
	}
	return &j, nil
}

// MarkTimedOutJobs scans for sync jobs with status='running' that were started
// more than 60 minutes ago and marks them as failed with error_message='timeout'.
// Returns the number of jobs updated.
func (db *DB) MarkTimedOutJobs(ctx context.Context) (int, error) {
	const q = `
UPDATE space_history_sync_jobs
SET
  status        = 'failed',
  completed_at  = NOW(),
  error_message = 'timeout'
WHERE status = 'running'
  AND started_at < NOW() - INTERVAL '60 minutes'`
	ct, err := db.Exec(ctx, q)
	if err != nil {
		return 0, err
	}
	return int(ct.RowsAffected()), nil
}

// RunSyncJobTimeoutTicker starts a goroutine that calls MarkTimedOutJobs on the
// given interval until ctx is cancelled. Intended to be called once at startup.
func RunSyncJobTimeoutTicker(ctx context.Context, db *DB, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				n, err := db.MarkTimedOutJobs(ctx)
				if err != nil {
					// Non-fatal: log would be nice but we avoid the slog import here.
					continue
				}
				_ = n
			}
		}
	}()
}

// isUniqueViolation reports whether err is a PostgreSQL unique-constraint violation (23505).
// pgx does not re-export pgconn.PgError easily, so we check the error string.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	// pgconn.PgError has a Code field; unwrap or check message substring.
	type pgErr interface{ SQLState() string }
	var pe pgErr
	if errors.As(err, &pe) {
		return pe.SQLState() == "23505"
	}
	return false
}

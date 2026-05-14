package store

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestSyncJobsIntegration runs against a real PostgreSQL instance.
// Set DATABASE_URL to enable; skipped otherwise (no DB in CI unit-test pass).
func TestSyncJobsIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping sync_jobs integration tests")
	}

	ctx := context.Background()
	db, err := Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	jobID := "test-job-" + time.Now().Format("20060102150405.000")
	spaceKey := "spaces/TEST"

	// Create + Get happy path.
	if err := db.CreateSyncJob(ctx, jobID, &spaceKey); err != nil {
		t.Fatalf("CreateSyncJob: %v", err)
	}
	job, err := db.GetSyncJob(ctx, jobID)
	if err != nil {
		t.Fatalf("GetSyncJob: %v", err)
	}
	if job.JobID != jobID {
		t.Errorf("job_id mismatch: got %q, want %q", job.JobID, jobID)
	}
	if job.Status != "running" {
		t.Errorf("expected status=running, got %q", job.Status)
	}

	// Create duplicate job_id → ErrJobExists.
	err = db.CreateSyncJob(ctx, jobID, nil)
	if err != ErrJobExists {
		t.Errorf("expected ErrJobExists, got %v", err)
	}

	// RecordBatch: multiple calls accumulate correctly.
	if err := db.RecordBatch(ctx, jobID, 10, 2, 1); err != nil {
		t.Fatalf("RecordBatch 1: %v", err)
	}
	if err := db.RecordBatch(ctx, jobID, 5, 0, 0); err != nil {
		t.Fatalf("RecordBatch 2: %v", err)
	}
	job, err = db.GetSyncJob(ctx, jobID)
	if err != nil {
		t.Fatalf("GetSyncJob after batches: %v", err)
	}
	if job.InsertedMessages != 15 {
		t.Errorf("inserted_messages: got %d, want 15", job.InsertedMessages)
	}
	if job.DuplicateMessages != 2 {
		t.Errorf("duplicate_messages: got %d, want 2", job.DuplicateMessages)
	}
	if job.FailedMessages != 1 {
		t.Errorf("failed_messages: got %d, want 1", job.FailedMessages)
	}
	if job.TotalMessages != 18 {
		t.Errorf("total_messages: got %d, want 18", job.TotalMessages)
	}

	// MarkJobComplete.
	if err := db.MarkJobComplete(ctx, jobID, "completed", nil); err != nil {
		t.Fatalf("MarkJobComplete: %v", err)
	}
	job, err = db.GetSyncJob(ctx, jobID)
	if err != nil {
		t.Fatalf("GetSyncJob after complete: %v", err)
	}
	if job.Status != "completed" {
		t.Errorf("status after complete: got %q, want completed", job.Status)
	}
	if !job.CompletedAt.Valid {
		t.Error("completed_at should be non-null after MarkJobComplete")
	}

	// GetSyncJob non-existent → ErrJobNotFound.
	_, err = db.GetSyncJob(ctx, "non-existent-job-id")
	if err != ErrJobNotFound {
		t.Errorf("expected ErrJobNotFound, got %v", err)
	}

	// MarkTimedOutJobs: only marks running + >60min jobs.
	// Insert a job that looks old (by directly cheating started_at).
	oldJobID := "test-timeout-" + time.Now().Format("20060102150405.000")
	if err := db.CreateSyncJob(ctx, oldJobID, nil); err != nil {
		t.Fatalf("CreateSyncJob for timeout test: %v", err)
	}
	// Backdate started_at by 2 hours.
	if _, err := db.Exec(ctx,
		`UPDATE space_history_sync_jobs SET started_at = NOW() - INTERVAL '2 hours' WHERE job_id = $1`,
		oldJobID); err != nil {
		t.Fatalf("backdate started_at: %v", err)
	}

	// A fresh running job (should not be marked).
	freshJobID := "test-fresh-" + time.Now().Format("20060102150405.000")
	if err := db.CreateSyncJob(ctx, freshJobID, nil); err != nil {
		t.Fatalf("CreateSyncJob for fresh test: %v", err)
	}

	count, err := db.MarkTimedOutJobs(ctx)
	if err != nil {
		t.Fatalf("MarkTimedOutJobs: %v", err)
	}
	if count < 1 {
		t.Errorf("expected at least 1 timed-out job, got %d", count)
	}

	// Verify old job is now failed.
	old, err := db.GetSyncJob(ctx, oldJobID)
	if err != nil {
		t.Fatalf("GetSyncJob old: %v", err)
	}
	if old.Status != "failed" {
		t.Errorf("old job status: got %q, want failed", old.Status)
	}
	if old.ErrorMessage == nil || *old.ErrorMessage != "timeout" {
		t.Errorf("old job error_message: got %v, want 'timeout'", old.ErrorMessage)
	}

	// Fresh job should still be running.
	fresh, err := db.GetSyncJob(ctx, freshJobID)
	if err != nil {
		t.Fatalf("GetSyncJob fresh: %v", err)
	}
	if fresh.Status != "running" {
		t.Errorf("fresh job status should still be running, got %q", fresh.Status)
	}

	// Cleanup.
	for _, id := range []string{jobID, oldJobID, freshJobID} {
		_, _ = db.Exec(ctx, `DELETE FROM space_history_sync_jobs WHERE job_id = $1`, id)
	}
}

// TestIsUniqueViolation covers the helper without a DB.
func TestIsUniqueViolation(t *testing.T) {
	// nil error should return false.
	if isUniqueViolation(nil) {
		t.Error("nil error should not be a unique violation")
	}

	// A random non-pg error should return false.
	if isUniqueViolation(ErrJobExists) {
		t.Error("ErrJobExists is not a pg unique violation")
	}
}

package store

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestMiningQueueIntegration runs against a real PostgreSQL instance.
// Set DATABASE_URL to enable; skipped otherwise.
func TestMiningQueueIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping mining_queue integration tests")
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

	spaceKey := "spaces/MINE-" + time.Now().Format("150405.000")

	t.Run("EnqueueNew", func(t *testing.T) {
		sk := spaceKey + "-new"
		job, isNew, err := db.EnqueueMiningJob(ctx, sk)
		if err != nil {
			t.Fatalf("EnqueueMiningJob: %v", err)
		}
		if !isNew {
			t.Error("expected isNew=true for first enqueue")
		}
		if job.Status != "pending" {
			t.Errorf("expected status=pending, got %q", job.Status)
		}
	})

	t.Run("EnqueuePendingIdempotent", func(t *testing.T) {
		sk := spaceKey + "-pending"
		_, _, _ = db.EnqueueMiningJob(ctx, sk) // first enqueue

		job, isNew, err := db.EnqueueMiningJob(ctx, sk)
		if err != nil {
			t.Fatalf("EnqueueMiningJob second: %v", err)
		}
		if isNew {
			t.Error("expected isNew=false for existing pending job")
		}
		if job.Status != "pending" {
			t.Errorf("expected status=pending, got %q", job.Status)
		}
	})

	t.Run("EnqueueCompletedResetsToPaynding", func(t *testing.T) {
		sk := spaceKey + "-completed"
		_, _, _ = db.EnqueueMiningJob(ctx, sk)
		// Mark as completed.
		status := "completed"
		_, _ = db.PatchMiningJob(ctx, sk, PatchMiningJobParams{Status: &status})

		job, isNew, err := db.EnqueueMiningJob(ctx, sk)
		if err != nil {
			t.Fatalf("EnqueueMiningJob after completed: %v", err)
		}
		if isNew {
			t.Error("expected isNew=false for reset job")
		}
		if job.Status != "pending" {
			t.Errorf("expected status=pending after reset, got %q", job.Status)
		}
	})

	t.Run("EnqueueRunningReturns409", func(t *testing.T) {
		sk := spaceKey + "-running"
		_, _, _ = db.EnqueueMiningJob(ctx, sk)
		// Mark as running.
		status := "running"
		_, _ = db.PatchMiningJob(ctx, sk, PatchMiningJobParams{Status: &status})

		_, _, err := db.EnqueueMiningJob(ctx, sk)
		if err != ErrMiningJobRunning {
			t.Errorf("expected ErrMiningJobRunning, got %v", err)
		}
	})

	t.Run("ListMiningJobs", func(t *testing.T) {
		// Create 2 pending + 1 completed.
		sk1 := spaceKey + "-list1"
		sk2 := spaceKey + "-list2"
		sk3 := spaceKey + "-list3"
		_, _, _ = db.EnqueueMiningJob(ctx, sk1)
		_, _, _ = db.EnqueueMiningJob(ctx, sk2)
		_, _, _ = db.EnqueueMiningJob(ctx, sk3)
		status := "completed"
		_, _ = db.PatchMiningJob(ctx, sk3, PatchMiningJobParams{Status: &status})

		jobs, err := db.ListMiningJobs(ctx, "pending", 100)
		if err != nil {
			t.Fatalf("ListMiningJobs: %v", err)
		}
		// At least 2 pending (sk1, sk2).
		pendingCount := 0
		for _, j := range jobs {
			if j.SpaceKey == sk1 || j.SpaceKey == sk2 {
				pendingCount++
			}
		}
		if pendingCount < 2 {
			t.Errorf("expected at least 2 pending jobs (sk1, sk2), found %d matching", pendingCount)
		}
	})

	t.Run("GetMiningJob", func(t *testing.T) {
		sk := spaceKey + "-get"
		_, _, _ = db.EnqueueMiningJob(ctx, sk)

		job, err := db.GetMiningJob(ctx, sk)
		if err != nil {
			t.Fatalf("GetMiningJob: %v", err)
		}
		if job.SpaceKey != sk {
			t.Errorf("unexpected space_key: %q", job.SpaceKey)
		}
	})

	t.Run("GetMiningJobNotFound", func(t *testing.T) {
		_, err := db.GetMiningJob(ctx, "spaces/NOTEXIST-999")
		if err != ErrMiningJobNotFound {
			t.Errorf("expected ErrMiningJobNotFound, got %v", err)
		}
	})

	t.Run("PatchMiningJobRunningAndCompleted", func(t *testing.T) {
		sk := spaceKey + "-patch"
		_, _, _ = db.EnqueueMiningJob(ctx, sk)

		// Mark running.
		running := "running"
		job, err := db.PatchMiningJob(ctx, sk, PatchMiningJobParams{Status: &running})
		if err != nil {
			t.Fatalf("PatchMiningJob running: %v", err)
		}
		if job.Status != "running" {
			t.Errorf("expected status=running, got %q", job.Status)
		}

		// Mark completed with last_mined_message_id and candidates_generated.
		completed := "completed"
		msgID := int64(5000)
		candidates := 7
		job, err = db.PatchMiningJob(ctx, sk, PatchMiningJobParams{
			Status:              &completed,
			LastMinedMessageID:  &msgID,
			CandidatesGenerated: &candidates,
		})
		if err != nil {
			t.Fatalf("PatchMiningJob completed: %v", err)
		}
		if job.Status != "completed" {
			t.Errorf("expected status=completed, got %q", job.Status)
		}
		if job.LastMinedMessageID == nil || *job.LastMinedMessageID != 5000 {
			t.Errorf("expected last_mined_message_id=5000, got %v", job.LastMinedMessageID)
		}
		if job.CandidatesGenerated != 7 {
			t.Errorf("expected candidates_generated=7, got %d", job.CandidatesGenerated)
		}
		if job.LastMinedAt == nil {
			t.Error("expected last_mined_at to be set when status=completed")
		}
	})

	t.Run("PatchMiningJobNotFound", func(t *testing.T) {
		status := "running"
		_, err := db.PatchMiningJob(ctx, "spaces/NOTEXIST-ABC", PatchMiningJobParams{Status: &status})
		if err != ErrMiningJobNotFound {
			t.Errorf("expected ErrMiningJobNotFound, got %v", err)
		}
	})

	t.Run("PatchMiningJobFailed", func(t *testing.T) {
		sk := spaceKey + "-failed"
		_, _, _ = db.EnqueueMiningJob(ctx, sk)
		failed := "failed"
		errMsg := "LLM timeout"
		job, err := db.PatchMiningJob(ctx, sk, PatchMiningJobParams{
			Status:       &failed,
			ErrorMessage: &errMsg,
		})
		if err != nil {
			t.Fatalf("PatchMiningJob failed: %v", err)
		}
		if job.Status != "failed" {
			t.Errorf("expected status=failed, got %q", job.Status)
		}
		if job.ErrorMessage == nil || *job.ErrorMessage != "LLM timeout" {
			t.Errorf("expected error_message=LLM timeout, got %v", job.ErrorMessage)
		}
	})
}

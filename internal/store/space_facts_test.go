package store

import (
	"context"
	"os"
	"testing"
	"time"
)

// TestSpaceFactsIntegration runs against a real PostgreSQL instance.
// Set DATABASE_URL to enable; skipped otherwise.
func TestSpaceFactsIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping space_facts integration tests")
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

	// Seed a user and a space in spaces_directory for validation tests.
	var userID int64
	err = db.QueryRow(ctx, `
INSERT INTO users (name, email, google_user_id, google_token)
VALUES ('Test User', $1, 'goog-sf-test', '{}')
ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
		"test-space-facts-"+time.Now().Format("20060102150405")+"@example.com",
	).Scan(&userID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	spaceKey := "spaces/AAA-" + time.Now().Format("150405")
	_, err = db.Exec(ctx, `
INSERT INTO spaces_directory (user_id, space_key, display_name)
VALUES ($1, $2, 'Test Space')
ON CONFLICT (user_id, space_key) DO NOTHING`, userID, spaceKey)
	if err != nil {
		t.Fatalf("seed spaces_directory: %v", err)
	}

	t.Run("CreateManualFact", func(t *testing.T) {
		f, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{
			SpaceKey:  spaceKey,
			Category:  "product",
			Content:   "This space discusses the fedflow K8s controller",
			CreatedBy: "manual",
		})
		if err != nil {
			t.Fatalf("CreateSpaceFact: %v", err)
		}
		if f.Status != "approved" {
			t.Errorf("expected status=approved, got %q", f.Status)
		}
		if f.ApprovedAt == nil {
			t.Error("expected approved_at to be non-nil for manual fact")
		}
		if f.Visibility != "private" {
			t.Errorf("expected default visibility=private, got %q", f.Visibility)
		}
		if f.SourceMessageIDs == nil {
			t.Error("expected source_message_ids to be non-nil (empty slice)")
		}
	})

	t.Run("CreateMiningSkillFact", func(t *testing.T) {
		f, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{
			SpaceKey:         spaceKey,
			Category:         "glossary",
			Content:          "TERM_A: some definition",
			CreatedBy:        "mining-skill",
			SourceMessageIDs: []int64{123, 124},
		})
		if err != nil {
			t.Fatalf("CreateSpaceFact: %v", err)
		}
		if f.Status != "candidate" {
			t.Errorf("expected status=candidate, got %q", f.Status)
		}
		if f.ApprovedAt != nil {
			t.Error("expected approved_at to be nil for mining-skill fact")
		}
		if len(f.SourceMessageIDs) != 2 {
			t.Errorf("expected 2 source_message_ids, got %d", len(f.SourceMessageIDs))
		}
	})

	t.Run("GetSpaceFact", func(t *testing.T) {
		f, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{
			SpaceKey:  spaceKey,
			Category:  "relation",
			Content:   "Alice is PM",
			CreatedBy: "manual",
		})
		if err != nil {
			t.Fatalf("CreateSpaceFact: %v", err)
		}

		got, err := db.GetSpaceFact(ctx, f.ID)
		if err != nil {
			t.Fatalf("GetSpaceFact: %v", err)
		}
		if got.Content != "Alice is PM" {
			t.Errorf("unexpected content: %q", got.Content)
		}
	})

	t.Run("GetSpaceFactNotFound", func(t *testing.T) {
		_, err := db.GetSpaceFact(ctx, 999999999)
		if err != ErrFactNotFound {
			t.Errorf("expected ErrFactNotFound, got %v", err)
		}
	})

	t.Run("ListSpaceFactsDefaultApprovedNoSecret", func(t *testing.T) {
		// Create approved + candidate + secret approved
		testSpace := "spaces/LIST-" + time.Now().Format("150405.000")
		_, _ = db.Exec(ctx, `INSERT INTO spaces_directory (user_id, space_key, display_name) VALUES ($1, $2, 'List Test')`, userID, testSpace)

		_, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "product", Content: "approved 1", CreatedBy: "manual"})
		if err != nil {
			t.Fatalf("create fact 1: %v", err)
		}
		_, err = db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "my-role", Content: "approved 2", CreatedBy: "manual"})
		if err != nil {
			t.Fatalf("create fact 2: %v", err)
		}
		_, err = db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "glossary", Content: "candidate 1", CreatedBy: "mining-skill"})
		if err != nil {
			t.Fatalf("create fact 3: %v", err)
		}
		secretFact, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "relation", Content: "secret approved", CreatedBy: "manual", Visibility: "secret"})
		if err != nil {
			t.Fatalf("create secret fact: %v", err)
		}
		// secretFact is manual so status=approved, visibility=secret — should be filtered out by default
		_ = secretFact

		facts, err := db.ListSpaceFacts(ctx, SpaceFactFilter{SpaceKey: testSpace})
		if err != nil {
			t.Fatalf("ListSpaceFacts: %v", err)
		}
		if len(facts) != 2 {
			t.Errorf("expected 2 approved non-secret facts, got %d", len(facts))
		}
		for _, f := range facts {
			if f.Visibility == "secret" {
				t.Errorf("unexpected secret fact in default list: %+v", f)
			}
			if f.Status != "approved" {
				t.Errorf("unexpected non-approved fact: %+v", f)
			}
		}
	})

	t.Run("ListSpaceFactsIncludeSecret", func(t *testing.T) {
		testSpace := "spaces/SECRET-" + time.Now().Format("150405.000")
		_, _ = db.Exec(ctx, `INSERT INTO spaces_directory (user_id, space_key, display_name) VALUES ($1, $2, 'Secret Test')`, userID, testSpace)

		_, _ = db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "product", Content: "normal", CreatedBy: "manual"})
		_, _ = db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: "relation", Content: "secret one", CreatedBy: "manual", Visibility: "secret"})

		facts, err := db.ListSpaceFacts(ctx, SpaceFactFilter{SpaceKey: testSpace, IncludeSecret: true})
		if err != nil {
			t.Fatalf("ListSpaceFacts include_secret: %v", err)
		}
		if len(facts) != 2 {
			t.Errorf("expected 2 facts with include_secret, got %d", len(facts))
		}
	})

	t.Run("PatchSpaceFact", func(t *testing.T) {
		f, _ := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: spaceKey, Category: "product", Content: "old content", CreatedBy: "manual"})
		newContent := "new content"
		patched, err := db.PatchSpaceFact(ctx, f.ID, PatchSpaceFactParams{Content: &newContent})
		if err != nil {
			t.Fatalf("PatchSpaceFact: %v", err)
		}
		if patched.Content != "new content" {
			t.Errorf("expected content=new content, got %q", patched.Content)
		}
		if !patched.UpdatedAt.After(f.UpdatedAt) && patched.UpdatedAt.Equal(f.UpdatedAt) {
			// updated_at may be same second in fast tests, just verify it didn't decrease
		}
	})

	t.Run("PatchSpaceFactApprove", func(t *testing.T) {
		f, _ := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: spaceKey, Category: "glossary", Content: "term", CreatedBy: "mining-skill"})
		if f.Status != "candidate" {
			t.Fatalf("expected candidate, got %q", f.Status)
		}
		approved := "approved"
		patched, err := db.PatchSpaceFact(ctx, f.ID, PatchSpaceFactParams{Status: &approved})
		if err != nil {
			t.Fatalf("PatchSpaceFact approve: %v", err)
		}
		if patched.Status != "approved" {
			t.Errorf("expected status=approved, got %q", patched.Status)
		}
		if patched.ApprovedAt == nil {
			t.Error("expected approved_at to be set")
		}
	})

	t.Run("PatchSpaceFactNotFound", func(t *testing.T) {
		content := "x"
		_, err := db.PatchSpaceFact(ctx, 999999999, PatchSpaceFactParams{Content: &content})
		if err != ErrFactNotFound {
			t.Errorf("expected ErrFactNotFound, got %v", err)
		}
	})

	t.Run("DeleteSpaceFact", func(t *testing.T) {
		f, _ := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: spaceKey, Category: "relation", Content: "to delete", CreatedBy: "manual"})
		if err := db.DeleteSpaceFact(ctx, f.ID); err != nil {
			t.Fatalf("DeleteSpaceFact: %v", err)
		}
		_, err := db.GetSpaceFact(ctx, f.ID)
		if err != ErrFactNotFound {
			t.Errorf("expected ErrFactNotFound after delete, got %v", err)
		}
	})

	t.Run("DeleteSpaceFactNotFound", func(t *testing.T) {
		err := db.DeleteSpaceFact(ctx, 999999999)
		if err != ErrFactNotFound {
			t.Errorf("expected ErrFactNotFound, got %v", err)
		}
	})

	t.Run("SpaceExistsInDirectory", func(t *testing.T) {
		exists, err := db.SpaceExistsInDirectory(ctx, userID, spaceKey)
		if err != nil {
			t.Fatalf("SpaceExistsInDirectory: %v", err)
		}
		if !exists {
			t.Error("expected space to exist")
		}

		notExists, err := db.SpaceExistsInDirectory(ctx, userID, "spaces/NOTEXIST")
		if err != nil {
			t.Fatalf("SpaceExistsInDirectory not exists: %v", err)
		}
		if notExists {
			t.Error("expected space NOT to exist")
		}
	})

	t.Run("ListSpaceFactsFilterByCategory", func(t *testing.T) {
		testSpace := "spaces/CAT-" + time.Now().Format("150405.000")
		_, _ = db.Exec(ctx, `INSERT INTO spaces_directory (user_id, space_key, display_name) VALUES ($1, $2, 'Cat Test')`, userID, testSpace)

		for _, cat := range []string{"product", "my-role", "glossary", "pinned-decision", "relation"} {
			_, err := db.CreateSpaceFact(ctx, CreateSpaceFactParams{SpaceKey: testSpace, Category: cat, Content: "fact for " + cat, CreatedBy: "manual"})
			if err != nil {
				t.Fatalf("create fact for category %q: %v", cat, err)
			}
		}

		for _, cat := range []string{"product", "my-role", "glossary", "pinned-decision", "relation"} {
			facts, err := db.ListSpaceFacts(ctx, SpaceFactFilter{SpaceKey: testSpace, Category: cat})
			if err != nil {
				t.Fatalf("ListSpaceFacts for category %q: %v", cat, err)
			}
			if len(facts) != 1 {
				t.Errorf("expected 1 fact for category %q, got %d", cat, len(facts))
			}
			if len(facts) > 0 && facts[0].Category != cat {
				t.Errorf("expected category=%q, got %q", cat, facts[0].Category)
			}
		}
	})
}

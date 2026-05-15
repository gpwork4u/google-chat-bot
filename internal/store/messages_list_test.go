package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

// TestListMessages runs against a real PostgreSQL instance.
// Set DATABASE_URL to enable; skipped otherwise.
func TestListMessages(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping messages list integration tests")
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

	// Create or reuse the canonical test user (google_sub must be unique).
	var userID int64
	err = db.QueryRow(ctx, `
		INSERT INTO users (google_sub, email, name, access_token)
		VALUES ('test-list-msgs-sub', 'list-msgs@test.local', 'Test ListMsgs', ''::bytea)
		ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email
		RETURNING id`).Scan(&userID)
	if err != nil {
		t.Fatalf("ensure user: %v", err)
	}

	spaceKey := fmt.Sprintf("spaces/TEST-LISTMSGS-%d", time.Now().UnixNano())
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

	// Insert 10 messages: 5 before 2026-01-01, 5 on or after.
	// IDs are assigned by the DB; we collect them for batch-lookup tests.
	var msgIDs []int64
	for i := 0; i < 10; i++ {
		obs := base.AddDate(0, 0, i-5) // i=0..4 → before base, i=5..9 → at/after
		msg := &Message{
			UserID:     userID,
			SpaceKey:   spaceKey,
			ThreadKey:  "thread/1",
			MessageKey: fmt.Sprintf("%s/messages/msg-%d", spaceKey, i),
			SenderName: "Alice",
			Body:       fmt.Sprintf("message %d", i),
			ObservedAt: obs,
			Mentioned:  i%2 == 0,
		}
		_, err := db.InsertOrGetMessage(ctx, msg)
		if err != nil {
			t.Fatalf("insert message %d: %v", i, err)
		}
		msgIDs = append(msgIDs, msg.ID)
	}

	t.Run("ListMessagesBySpace basic", func(t *testing.T) {
		msgs, next, err := db.ListMessagesBySpace(ctx, userID, spaceKey, ListMessagesOpts{Limit: 200})
		if err != nil {
			t.Fatalf("ListMessagesBySpace: %v", err)
		}
		if len(msgs) != 10 {
			t.Errorf("got %d messages, want 10", len(msgs))
		}
		if next != nil {
			t.Errorf("next_before_id should be nil (all rows fit): got %v", *next)
		}
		// Verify ordering: id DESC means first element has the highest id.
		for i := 1; i < len(msgs); i++ {
			if msgs[i-1].ID <= msgs[i].ID {
				t.Errorf("result not ordered id DESC at position %d", i)
			}
		}
	})

	t.Run("ListMessagesBySpace with since filter", func(t *testing.T) {
		msgs, _, err := db.ListMessagesBySpace(ctx, userID, spaceKey, ListMessagesOpts{
			Limit: 200,
			Since: base,
		})
		if err != nil {
			t.Fatalf("ListMessagesBySpace with since: %v", err)
		}
		// Only messages with observed_at >= base (i=5..9) should be returned.
		if len(msgs) != 5 {
			t.Errorf("got %d messages with since filter, want 5", len(msgs))
		}
		for _, m := range msgs {
			if m.ObservedAt.Before(base) {
				t.Errorf("message %d has observed_at %v before since %v", m.ID, m.ObservedAt, base)
			}
		}
	})

	t.Run("ListMessagesBySpace pagination with before_id", func(t *testing.T) {
		// Fetch page 1 (first 5).
		page1, next, err := db.ListMessagesBySpace(ctx, userID, spaceKey, ListMessagesOpts{Limit: 5})
		if err != nil {
			t.Fatalf("page1: %v", err)
		}
		if len(page1) != 5 {
			t.Fatalf("page1: got %d messages, want 5", len(page1))
		}
		if next == nil {
			t.Fatal("page1: next_before_id should not be nil")
		}

		// Fetch page 2 using next_before_id.
		page2, next2, err := db.ListMessagesBySpace(ctx, userID, spaceKey, ListMessagesOpts{
			Limit:    5,
			BeforeID: *next,
		})
		if err != nil {
			t.Fatalf("page2: %v", err)
		}
		if len(page2) != 5 {
			t.Fatalf("page2: got %d messages, want 5", len(page2))
		}
		// There should be no third page.
		if next2 != nil {
			t.Errorf("page2: next_before_id should be nil, got %d", *next2)
		}

		// Combined pages should cover all 10 unique IDs.
		seen := map[int64]bool{}
		for _, m := range append(page1, page2...) {
			if seen[m.ID] {
				t.Errorf("duplicate id %d across pages", m.ID)
			}
			seen[m.ID] = true
		}
		if len(seen) != 10 {
			t.Errorf("pages cover %d unique ids, want 10", len(seen))
		}
	})

	t.Run("ListMessagesByIDs happy path", func(t *testing.T) {
		// Pick the first 3 inserted IDs.
		ids := msgIDs[:3]
		msgs, err := db.ListMessagesByIDs(ctx, userID, ids)
		if err != nil {
			t.Fatalf("ListMessagesByIDs: %v", err)
		}
		if len(msgs) != 3 {
			t.Errorf("got %d messages, want 3", len(msgs))
		}
		gotIDs := map[int64]bool{}
		for _, m := range msgs {
			gotIDs[m.ID] = true
		}
		for _, id := range ids {
			if !gotIDs[id] {
				t.Errorf("id %d missing from result", id)
			}
		}
	})

	t.Run("ListMessagesByIDs with non-existent ids", func(t *testing.T) {
		msgs, err := db.ListMessagesByIDs(ctx, userID, []int64{999999999, 999999998})
		if err != nil {
			t.Fatalf("ListMessagesByIDs non-existent: %v", err)
		}
		if len(msgs) != 0 {
			t.Errorf("got %d messages for non-existent ids, want 0", len(msgs))
		}
	})

	t.Run("ListMessagesByIDs empty slice", func(t *testing.T) {
		msgs, err := db.ListMessagesByIDs(ctx, userID, nil)
		if err != nil {
			t.Fatalf("ListMessagesByIDs empty: %v", err)
		}
		if len(msgs) != 0 {
			t.Errorf("got %d messages for empty id slice, want 0", len(msgs))
		}
	})

	t.Run("mentioned field round-trip", func(t *testing.T) {
		msgs, _, err := db.ListMessagesBySpace(ctx, userID, spaceKey, ListMessagesOpts{Limit: 200})
		if err != nil {
			t.Fatalf("ListMessagesBySpace: %v", err)
		}
		mentionedCount := 0
		for _, m := range msgs {
			if m.Mentioned {
				mentionedCount++
			}
		}
		// We inserted 10 messages with Mentioned = (i%2==0), so i=0,2,4,6,8 → 5 mentioned.
		if mentionedCount != 5 {
			t.Errorf("mentioned count: got %d, want 5", mentionedCount)
		}
	})
}

// TestItoaHelper verifies the internal itoa helper.
func TestItoaHelper(t *testing.T) {
	cases := []struct {
		n    int
		want string
	}{
		{0, "0"},
		{1, "1"},
		{9, "9"},
		{10, "10"},
		{100, "100"},
		{1234567890, "1234567890"},
	}
	for _, tc := range cases {
		got := itoa(tc.n)
		if got != tc.want {
			t.Errorf("itoa(%d) = %q, want %q", tc.n, got, tc.want)
		}
	}
}

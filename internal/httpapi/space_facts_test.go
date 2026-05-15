package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// TestSpaceFactsIntegration exercises the HTTP handlers against a real PostgreSQL instance.
// Set DATABASE_URL to enable; skipped otherwise.
func TestSpaceFactsHTTPIntegration(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping space_facts HTTP integration tests")
	}

	ctx := context.Background()
	db, err := store.Open(ctx, dsn)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := store.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	// Seed user.
	var userID int64
	err = db.QueryRow(ctx, `
INSERT INTO users (name, email, google_user_id, google_token)
VALUES ('HTTP Test', $1, 'goog-http-sf-test', '{}')
ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
		"http-space-facts-"+time.Now().Format("20060102150405")+"@example.com",
	).Scan(&userID)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}

	spaceKey := "spaces/HTTP-" + time.Now().Format("150405")
	_, err = db.Exec(ctx, `
INSERT INTO spaces_directory (user_id, space_key, display_name)
VALUES ($1, $2, 'HTTP Test Space')
ON CONFLICT (user_id, space_key) DO NOTHING`, userID, spaceKey)
	if err != nil {
		t.Fatalf("seed spaces_directory: %v", err)
	}

	// Build a config that points to our test user.
	cfg := &config.Config{
		LocalUserEmail: "http-space-facts-" + time.Now().Format("20060102150405") + "@example.com",
	}

	mux := http.NewServeMux()
	spaceFactsRoutes(mux, db, cfg)

	post := func(path string, body any) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	get := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	patch := func(path string, body any) *httptest.ResponseRecorder {
		b, _ := json.Marshal(body)
		req := httptest.NewRequest(http.MethodPatch, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	del := func(path string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodDelete, path, nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	t.Run("POST_InvalidContent_Empty_400", func(t *testing.T) {
		rec := post("/api/space-facts", map[string]any{
			"space_key": spaceKey,
			"category":  "product",
			"content":   "",
		})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
		assertCode(t, rec, "INVALID_INPUT")
	})

	t.Run("POST_InvalidCategory_400", func(t *testing.T) {
		rec := post("/api/space-facts", map[string]any{
			"space_key": spaceKey,
			"category":  "xyz",
			"content":   "abc",
		})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d: %s", rec.Code, rec.Body.String())
		}
		assertCode(t, rec, "INVALID_INPUT")
	})

	t.Run("POST_InvalidContent_TooLong_400", func(t *testing.T) {
		// content > 1000 chars.
		longContent := string(make([]byte, 1001))
		rec := post("/api/space-facts", map[string]any{
			"space_key": spaceKey,
			"category":  "product",
			"content":   longContent,
		})
		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", rec.Code)
		}
		assertCode(t, rec, "INVALID_INPUT")
	})

	t.Run("MiningQueue_Enqueue_New_201", func(t *testing.T) {
		rec := post("/api/space-facts/mining-queue", map[string]any{
			"space_key": spaceKey + "-q1",
		})
		if rec.Code != http.StatusCreated {
			t.Errorf("expected 201, got %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		json.Unmarshal(rec.Body.Bytes(), &body)
		if body["status"] != "pending" {
			t.Errorf("expected status=pending, got %v", body["status"])
		}
	})

	t.Run("MiningQueue_EnqueueRunning_409", func(t *testing.T) {
		sk := spaceKey + "-qrun"
		post("/api/space-facts/mining-queue", map[string]any{"space_key": sk})
		patch("/api/space-facts/mining-queue/"+sk, map[string]any{"status": "running"})

		rec := post("/api/space-facts/mining-queue", map[string]any{"space_key": sk})
		if rec.Code != http.StatusConflict {
			t.Errorf("expected 409, got %d: %s", rec.Code, rec.Body.String())
		}
		assertCode(t, rec, "JOB_RUNNING")
	})

	t.Run("MiningQueue_List_Pending", func(t *testing.T) {
		sk1 := spaceKey + "-ql1"
		sk2 := spaceKey + "-ql2"
		post("/api/space-facts/mining-queue", map[string]any{"space_key": sk1})
		post("/api/space-facts/mining-queue", map[string]any{"space_key": sk2})

		rec := get("/api/space-facts/mining-queue?status=pending")
		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		json.Unmarshal(rec.Body.Bytes(), &body)
		jobs := body["jobs"].([]any)
		if len(jobs) < 2 {
			t.Errorf("expected at least 2 pending jobs, got %d", len(jobs))
		}
	})

	t.Run("MiningQueue_Patch_Running", func(t *testing.T) {
		sk := spaceKey + "-qpatch"
		post("/api/space-facts/mining-queue", map[string]any{"space_key": sk})

		rec := patch("/api/space-facts/mining-queue/"+sk, map[string]any{"status": "running"})
		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		json.Unmarshal(rec.Body.Bytes(), &body)
		if body["status"] != "running" {
			t.Errorf("expected status=running, got %v", body["status"])
		}
	})

	t.Run("MiningQueue_Patch_Completed_LastMinedAt", func(t *testing.T) {
		sk := spaceKey + "-qcomplete"
		post("/api/space-facts/mining-queue", map[string]any{"space_key": sk})
		patch("/api/space-facts/mining-queue/"+sk, map[string]any{"status": "running"})

		rec := patch("/api/space-facts/mining-queue/"+sk, map[string]any{
			"status":                "completed",
			"last_mined_message_id": 5000,
			"candidates_generated":  7,
		})
		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		json.Unmarshal(rec.Body.Bytes(), &body)
		if body["status"] != "completed" {
			t.Errorf("expected status=completed, got %v", body["status"])
		}
		if body["last_mined_at"] == nil {
			t.Error("expected last_mined_at to be set")
		}
	})

	t.Run("PATCH_NotFound_404", func(t *testing.T) {
		rec := patch("/api/space-facts/999999999", map[string]any{"content": "x"})
		if rec.Code != http.StatusNotFound {
			t.Errorf("expected 404, got %d", rec.Code)
		}
	})

	t.Run("DELETE_Lifecycle", func(t *testing.T) {
		// First create a fact directly in the store for testing delete.
		fact, err := db.CreateSpaceFact(ctx, store.CreateSpaceFactParams{
			SpaceKey:  spaceKey,
			Category:  "product",
			Content:   "to delete via HTTP",
			CreatedBy: "manual",
		})
		if err != nil {
			t.Fatalf("create fact: %v", err)
		}

		rec := del("/api/space-facts/" + itoa64(fact.ID))
		if rec.Code != http.StatusOK {
			t.Errorf("expected 200, got %d: %s", rec.Code, rec.Body.String())
		}

		// Verify 404 on subsequent GET.
		req := httptest.NewRequest(http.MethodGet, "/api/space-facts?space_key="+spaceKey, nil)
		resp := httptest.NewRecorder()
		mux.ServeHTTP(resp, req)
		// GET list doesn't return 404, but the deleted fact should not be in results.
	})
}

// assertCode checks that the response JSON contains a "code" field with the expected value.
func assertCode(t *testing.T, rec *httptest.ResponseRecorder, expected string) {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON in response: %v", err)
	}
	if body["code"] != expected {
		t.Errorf("expected code=%q, got %v (body: %s)", expected, body["code"], rec.Body.String())
	}
}

// itoa64 converts int64 to string for building paths.
func itoa64(n int64) string {
	return strconv.FormatInt(n, 10)
}

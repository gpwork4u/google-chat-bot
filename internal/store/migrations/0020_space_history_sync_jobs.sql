-- Migration 0020: space_history_sync_jobs
-- Tracks full-history sync jobs initiated from the Chrome extension popup.
-- Each job represents one "sync all" or "sync this space" operation.

CREATE TABLE space_history_sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id TEXT NOT NULL UNIQUE,
    space_key TEXT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
        'running', 'completed', 'failed', 'cancelled'
    )),
    total_messages INTEGER NOT NULL DEFAULT 0,
    inserted_messages INTEGER NOT NULL DEFAULT 0,
    duplicate_messages INTEGER NOT NULL DEFAULT 0,
    failed_messages INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL,
    error_message TEXT NULL
);

CREATE INDEX idx_sync_jobs_recent ON space_history_sync_jobs (started_at DESC);

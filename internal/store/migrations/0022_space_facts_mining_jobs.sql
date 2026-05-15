CREATE TABLE space_facts_mining_jobs (
    id BIGSERIAL PRIMARY KEY,
    space_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'failed'
    )),
    last_mined_message_id BIGINT NULL,
    last_mined_at TIMESTAMPTZ NULL,
    candidates_generated INTEGER NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mining_jobs_pending
    ON space_facts_mining_jobs (created_at DESC)
    WHERE status = 'pending';

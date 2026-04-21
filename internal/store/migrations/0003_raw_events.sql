CREATE TABLE IF NOT EXISTS raw_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL,            -- fetch / xhr / ws-open / ws-out / ws-in
    url         TEXT NOT NULL DEFAULT '',
    payload     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS raw_events_kind_idx ON raw_events(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS raw_events_url_idx ON raw_events((payload->>'url'));

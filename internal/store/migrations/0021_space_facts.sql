CREATE TABLE space_facts (
    id BIGSERIAL PRIMARY KEY,
    space_key TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'product', 'my-role', 'glossary', 'pinned-decision', 'relation'
    )),
    content TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN (
        'public', 'private', 'secret'
    )),
    status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
        'candidate', 'approved', 'rejected'
    )),
    source_message_ids BIGINT[] NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL CHECK (created_by IN (
        'mining-skill', 'manual'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ NULL
);

CREATE INDEX idx_space_facts_active
    ON space_facts (space_key, category)
    WHERE status = 'approved';

CREATE INDEX idx_space_facts_candidates
    ON space_facts (space_key, created_at DESC)
    WHERE status = 'candidate';

-- Personal profile facts the user wants the AI skill to know about.
-- Populated/edited by the user (via PUT /api/claude/profile); consumed by
-- the chat-drafts skill when it detects the other party asking something
-- the skill cannot answer from conversation context alone (e.g. "where
-- do you live", "what's your phone", "where do you work").
--
-- visibility controls how exposed a fact is:
--   public  — skill can volunteer this freely
--   private — skill may use it only when the sender/space context warrants
--             (family group asking home city, etc.). Skill is responsible
--             for judging; backend does not enforce.
--   secret  — skill never sees this. GET /api/claude/profile filters these
--             out. Stored so the user can keep a record, not for AI use.

CREATE TABLE IF NOT EXISTS user_profile_facts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'secret')),
    note TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS user_profile_facts_user_idx
    ON user_profile_facts (user_id, visibility);

-- F-011 / CR-001: add skip-mark columns to messages table.
-- These three columns let the skill and backend mark a message as intentionally
-- not needing a draft, so that /api/claude/pending stops returning it on every loop.

ALTER TABLE messages
  ADD COLUMN skipped_at  TIMESTAMPTZ NULL,
  ADD COLUMN skip_reason TEXT NULL,
  ADD COLUMN skipped_by  TEXT NULL CHECK (
    skipped_by IN ('skill', 'backend_auto', 'manual', 'backfill')
  );

COMMENT ON COLUMN messages.skipped_at IS
  'Set when this message is intentionally not going to receive a draft. Filtered out of /api/claude/pending.';
COMMENT ON COLUMN messages.skip_reason IS
  'Free-form reason. e.g. "pure-ack", "blocked-keyword:money", "not-mentioned"';
COMMENT ON COLUMN messages.skipped_by IS
  'Who marked: skill / backend_auto / manual / backfill';

-- Partial index for /api/claude/pending performance: only index unskipped rows
-- which are the hot path (most messages will eventually be skipped or have a draft).
CREATE INDEX idx_messages_pending_active
  ON messages (created_at DESC)
  WHERE skipped_at IS NULL;

-- Rollback: remove skip-mark columns from messages table.
DROP INDEX IF EXISTS idx_messages_pending_active;

ALTER TABLE messages
  DROP COLUMN IF EXISTS skipped_by,
  DROP COLUMN IF EXISTS skip_reason,
  DROP COLUMN IF EXISTS skipped_at;

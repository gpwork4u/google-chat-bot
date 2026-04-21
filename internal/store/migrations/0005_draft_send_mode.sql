ALTER TABLE drafts
ADD COLUMN IF NOT EXISTS send_mode TEXT NOT NULL DEFAULT 'new_topic';

ALTER TABLE drafts
DROP CONSTRAINT IF EXISTS drafts_send_mode_check;

ALTER TABLE drafts
ADD CONSTRAINT drafts_send_mode_check
CHECK (send_mode IN ('new_topic', 'reply_thread'));

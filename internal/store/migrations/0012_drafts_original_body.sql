-- Add original_body to track the AI-generated draft body before user edits.
-- When body != original_body, the user modified the draft before approving.
ALTER TABLE drafts ADD COLUMN IF NOT EXISTS original_body TEXT NOT NULL DEFAULT '';

-- Backfill: for existing sent drafts, treat current body as original.
UPDATE drafts SET original_body = body WHERE original_body = '' AND status = 'sent';

-- Efficient cursor pagination for the sent log query (sent_at DESC, id DESC).
CREATE INDEX IF NOT EXISTS drafts_sent_at_idx
  ON drafts(sent_at DESC, id DESC) WHERE status = 'sent';

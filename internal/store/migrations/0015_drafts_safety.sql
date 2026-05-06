-- F-008 Safety Rails: add safety columns to drafts table
ALTER TABLE drafts
    ADD COLUMN IF NOT EXISTS safety_flags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS safety_trigger_reason TEXT,
    ADD COLUMN IF NOT EXISTS safety_overridden_by TEXT;

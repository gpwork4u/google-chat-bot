-- Add mention_only column to space_settings for per-channel mention-only mode.
ALTER TABLE space_settings
    ADD COLUMN IF NOT EXISTS mention_only BOOLEAN NOT NULL DEFAULT FALSE;

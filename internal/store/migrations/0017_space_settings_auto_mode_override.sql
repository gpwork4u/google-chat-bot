-- F-004 retrofit: add auto_mode_override TEXT column to space_settings.
-- Code (Sprint 2) was written expecting this enum column but no migration shipped it.
-- Existing rows with auto_mode BOOLEAN (NULL/true/false) map to:
--   NULL  -> 'inherit'
--   true  -> 'always_on'
--   false -> 'always_off'
-- The legacy auto_mode column is kept for rollback safety; can be dropped in a later sprint.

ALTER TABLE space_settings
    ADD COLUMN IF NOT EXISTS auto_mode_override TEXT NOT NULL DEFAULT 'inherit';

UPDATE space_settings
SET auto_mode_override = CASE
    WHEN auto_mode IS TRUE  THEN 'always_on'
    WHEN auto_mode IS FALSE THEN 'always_off'
    ELSE 'inherit'
END
WHERE auto_mode_override = 'inherit'  -- only backfill once
  AND auto_mode IS NOT NULL;

ALTER TABLE space_settings
    DROP CONSTRAINT IF EXISTS space_settings_auto_mode_override_check;

ALTER TABLE space_settings
    ADD CONSTRAINT space_settings_auto_mode_override_check
    CHECK (auto_mode_override IN ('inherit', 'always_on', 'always_off'));

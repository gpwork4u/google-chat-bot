-- F-008 Safety Rails: add safety columns to settings and space_settings
ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS safety_rails_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS safety_rules JSONB NOT NULL DEFAULT '{"money": true}';

ALTER TABLE space_settings
    ADD COLUMN IF NOT EXISTS safety_rails_override TEXT NOT NULL DEFAULT 'inherit';

ALTER TABLE space_settings
    DROP CONSTRAINT IF EXISTS space_settings_safety_rails_override_check;

ALTER TABLE space_settings
    ADD CONSTRAINT space_settings_safety_rails_override_check
    CHECK (safety_rails_override IN ('inherit', 'disabled'));

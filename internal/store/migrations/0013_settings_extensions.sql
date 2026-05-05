-- F-004 Settings extensions: per-user freshness window + debug mode toggle
ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS freshness_window_minutes INTEGER NOT NULL DEFAULT 30,
    ADD COLUMN IF NOT EXISTS debug_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_settings
    DROP CONSTRAINT IF EXISTS user_settings_freshness_check;

ALTER TABLE user_settings
    ADD CONSTRAINT user_settings_freshness_check
    CHECK (freshness_window_minutes >= 1 AND freshness_window_minutes <= 1440);

-- F-004 Channels section: per-channel blocked_keywords (override user-level)
ALTER TABLE space_settings
    ADD COLUMN IF NOT EXISTS blocked_keywords TEXT[] NOT NULL DEFAULT '{}';

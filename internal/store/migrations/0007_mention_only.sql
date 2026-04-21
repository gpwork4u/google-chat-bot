-- When true, only generate a draft if the incoming message body contains
-- a literal "@<local user display name>" mention. Used to keep the inbox
-- focused on messages that actually need a response.

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS reply_only_when_mentioned BOOLEAN NOT NULL DEFAULT FALSE;

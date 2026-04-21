-- Track the authenticated user's numeric Google Chat user id so backend
-- code can join to chat_members and recover email / display_name without
-- any .env configuration. Populated the first time a get_user_settings
-- response is ingested.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS chat_user_id TEXT NOT NULL DEFAULT '';

-- Cache of sender_id → display_name / email observed across list_topics
-- responses. Webchannel push frames only carry sender_id, so we use this
-- directory to fill in a readable name when ingesting new messages.

CREATE TABLE IF NOT EXISTS chat_members (
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    member_id     TEXT   NOT NULL,
    display_name  TEXT   NOT NULL DEFAULT '',
    email         TEXT   NOT NULL DEFAULT '',
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, member_id)
);

CREATE INDEX IF NOT EXISTS chat_members_display_idx ON chat_members (user_id, display_name);

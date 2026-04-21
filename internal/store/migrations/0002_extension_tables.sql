-- Messages observed by the Chrome extension on chat.google.com.
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_key       TEXT NOT NULL,           -- extension-supplied space id (DOM / URL derived)
    space_name      TEXT NOT NULL DEFAULT '',
    thread_key      TEXT NOT NULL DEFAULT '',
    message_key     TEXT NOT NULL,           -- stable id for dedup (DOM attr or content hash)
    sender_name     TEXT NOT NULL,
    sender_is_me    BOOLEAN NOT NULL DEFAULT FALSE,
    body            TEXT NOT NULL,
    observed_at     TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, message_key)
);

CREATE INDEX IF NOT EXISTS messages_space_idx ON messages(user_id, space_key, observed_at DESC);

-- Draft replies (generated, approved, or sent).
CREATE TABLE IF NOT EXISTS drafts (
    id           BIGSERIAL PRIMARY KEY,
    message_id   BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    model        TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','sent','failed')),
    auto_sent    BOOLEAN NOT NULL DEFAULT FALSE,
    confidence   REAL,
    reasoning    TEXT NOT NULL DEFAULT '',
    error        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS drafts_status_idx ON drafts(status, updated_at DESC);

-- Per-user global settings.
CREATE TABLE IF NOT EXISTS user_settings (
    user_id           BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    auto_mode         BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_keywords  TEXT NOT NULL DEFAULT '金額,匯款,密碼,簽約,合約',
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-space overrides (auto_mode NULL means inherit user_settings).
CREATE TABLE IF NOT EXISTS space_settings (
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_key  TEXT NOT NULL,
    auto_mode  BOOLEAN,
    disabled   BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, space_key)
);

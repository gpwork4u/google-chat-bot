CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    google_sub      TEXT NOT NULL UNIQUE,         -- Google's stable user id
    email           TEXT NOT NULL,
    name            TEXT NOT NULL DEFAULT '',
    picture_url     TEXT NOT NULL DEFAULT '',
    access_token    BYTEA NOT NULL,               -- AES-GCM ciphertext
    refresh_token   BYTEA,                        -- AES-GCM ciphertext (nullable)
    token_expiry    TIMESTAMPTZ,
    scopes          TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

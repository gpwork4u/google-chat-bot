-- Migration 0021: add mentioned column to messages table.
-- The Chrome extension sync-history batch ingest already carries a `mentioned`
-- field in the payload; this column persists it so that the space-facts-mining
-- skill and the GET /api/messages endpoint can surface it.

ALTER TABLE messages
  ADD COLUMN mentioned BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN messages.mentioned IS
  'TRUE when the local user was @-mentioned in this message (set by the Chrome extension at ingest time).';

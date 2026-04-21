-- Dedicated mapping table for space_key → display_name.
--
-- Previously the "real" name lived denormalized on messages.space_name,
-- which meant every ingest that didn't yet know the real name wrote a
-- placeholder like "space:AAQA…" and the same space ended up with two
-- distinct names in the table. This new directory is the single source
-- of truth and is populated whenever we learn a real name (get_group,
-- list_members profile, etc.). messages.space_name stays as a legacy
-- mirror but display code joins through here first.

CREATE TABLE IF NOT EXISTS spaces_directory (
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    space_key    TEXT   NOT NULL,
    display_name TEXT   NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, space_key)
);

CREATE INDEX IF NOT EXISTS spaces_directory_name_idx ON spaces_directory (user_id, display_name);

-- Seed from whatever real names we've already captured on messages.
-- Only take rows where space_name is a real name (non-empty, not the key
-- itself, doesn't start with "space:"); MAX groups to the longest in
-- case several competed.
INSERT INTO spaces_directory (user_id, space_key, display_name)
SELECT
    user_id,
    space_key,
    MAX(space_name) AS display_name
FROM messages
WHERE space_key <> ''
  AND space_name <> ''
  AND space_name <> space_key
  AND space_name NOT LIKE 'space:%'
GROUP BY user_id, space_key
ON CONFLICT (user_id, space_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    updated_at = NOW();

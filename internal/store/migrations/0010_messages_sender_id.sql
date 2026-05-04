-- Shift messages.sender_name from authoritative to fallback: the real
-- source of truth is chat_members.display_name, joined on sender_id at
-- read time. messages.sender_name stays around for legacy rows and as
-- a last-resort label when we insert before learning the sender's id.
--
-- Same pattern spaces_directory established in migration 0009 for
-- space names.

ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS sender_id TEXT NOT NULL DEFAULT '';

-- Best-effort backfill: match existing rows to chat_members by
-- display_name. Names aren't guaranteed unique per org, but collisions
-- are rare enough that this covers most legacy rows usefully; anything
-- ambiguous stays with sender_id='' and falls back to sender_name.
UPDATE messages m
SET sender_id = cm.member_id
FROM chat_members cm
WHERE m.user_id = cm.user_id
  AND m.sender_id = ''
  AND cm.display_name <> ''
  AND m.sender_name = cm.display_name;

CREATE INDEX IF NOT EXISTS messages_sender_id_idx
    ON messages (user_id, sender_id);

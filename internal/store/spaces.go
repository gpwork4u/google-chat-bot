package store

import (
	"context"
	"time"
)

type SpaceRow struct {
	SpaceKey            string     `json:"space_key"`
	SpaceName           string     `json:"space_name"`
	Disabled            bool       `json:"disabled"`
	Enabled             bool       `json:"enabled"`
	MentionOnly         bool       `json:"mention_only"`
	AutoModeOverride    string     `json:"auto_mode_override"`    // inherit | always_on | always_off
	SafetyRailsOverride string     `json:"safety_rails_override"` // inherit | disabled
	BlockedKeywords     []string   `json:"blocked_keywords"`
	MessageCount        int        `json:"message_count"`
	LastMessageAt       *time.Time `json:"last_message_at"`
}

// PatchSpaceRequest carries optional per-channel settings for partial PATCH.
type PatchSpaceRequest struct {
	MentionOnly         *bool    `json:"mention_only"`
	AutoModeOverride    *string  `json:"auto_mode_override"`
	SafetyRailsOverride *string  `json:"safety_rails_override"`
	BlockedKeywords     []string `json:"blocked_keywords"`
	HasBlockedKeywords  bool     `json:"-"` // true when blocked_keywords key was present in JSON
}

// PatchSpaceSettings applies a partial update to space_settings.
func (db *DB) PatchSpaceSettings(ctx context.Context, userID int64, spaceKey string, req PatchSpaceRequest) error {
	// Ensure the row exists first (default disabled so existing behaviour preserved).
	const upsert = `
INSERT INTO space_settings (user_id, space_key, disabled) VALUES ($1, $2, TRUE)
ON CONFLICT (user_id, space_key) DO NOTHING`
	if _, err := db.Exec(ctx, upsert, userID, spaceKey); err != nil {
		return err
	}
	if req.MentionOnly != nil {
		if _, err := db.Exec(ctx,
			`UPDATE space_settings SET mention_only=$3, updated_at=NOW() WHERE user_id=$1 AND space_key=$2`,
			userID, spaceKey, *req.MentionOnly); err != nil {
			return err
		}
	}
	if req.AutoModeOverride != nil {
		if _, err := db.Exec(ctx,
			`UPDATE space_settings SET auto_mode_override=$3, updated_at=NOW() WHERE user_id=$1 AND space_key=$2`,
			userID, spaceKey, *req.AutoModeOverride); err != nil {
			return err
		}
	}
	if req.SafetyRailsOverride != nil {
		if _, err := db.Exec(ctx,
			`UPDATE space_settings SET safety_rails_override=$3, updated_at=NOW() WHERE user_id=$1 AND space_key=$2`,
			userID, spaceKey, *req.SafetyRailsOverride); err != nil {
			return err
		}
	}
	if req.HasBlockedKeywords {
		if _, err := db.Exec(ctx,
			`UPDATE space_settings SET blocked_keywords=$3, updated_at=NOW() WHERE user_id=$1 AND space_key=$2`,
			userID, spaceKey, req.BlockedKeywords); err != nil {
			return err
		}
	}
	return nil
}

// recentSpacesWindow bounds the UI's Channel 設定 list to match the
// worker's ingest freshness window (worker.freshnessWindow = 30 min).
// Kept in sync so we never show a space whose only "recent" activity
// wouldn't have been stored anyway.
const recentSpacesWindow = "30 minutes"

// ListSpaces returns spaces that have received at least one message since
// the later of (sessionStart, now - recentSpacesWindow), along with their
// current settings. Drafting defaults to OFF for spaces the user has
// never explicitly enabled, so the disabled column coalesces to TRUE.
//
// Passing sessionStart=zero falls back to the window-only behavior.
func (db *DB) ListSpaces(ctx context.Context, userID int64, sessionStart time.Time) ([]SpaceRow, error) {
	args := []any{userID}
	floorExpr := `NOW() - INTERVAL '` + recentSpacesWindow + `'`
	if !sessionStart.IsZero() {
		args = append(args, sessionStart)
		floorExpr = `GREATEST($2::timestamptz, NOW() - INTERVAL '` + recentSpacesWindow + `')`
	}
	q := `
SELECT
  m.space_key,
  COALESCE(NULLIF(dir.display_name, ''), MAX(m.space_name)) AS space_name,
  COALESCE(s.disabled, TRUE) AS disabled,
  COALESCE(s.mention_only, FALSE) AS mention_only,
  COALESCE(s.auto_mode_override, 'inherit') AS auto_mode_override,
  COALESCE(s.safety_rails_override, 'inherit') AS safety_rails_override,
  COALESCE(s.blocked_keywords, '{}') AS blocked_keywords,
  count(*) AS message_count,
  MAX(m.observed_at) AS last_at
FROM messages m
LEFT JOIN space_settings s
  ON s.user_id = m.user_id AND s.space_key = m.space_key
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key
WHERE m.user_id = $1
  AND m.space_key <> ''
  AND m.observed_at >= ` + floorExpr + `
GROUP BY m.space_key, s.disabled, s.mention_only, s.auto_mode_override, s.safety_rails_override, s.blocked_keywords, dir.display_name
ORDER BY last_at DESC NULLS LAST`
	rows, err := db.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SpaceRow
	for rows.Next() {
		var r SpaceRow
		if err := rows.Scan(
			&r.SpaceKey, &r.SpaceName, &r.Disabled, &r.MentionOnly,
			&r.AutoModeOverride, &r.SafetyRailsOverride, &r.BlockedKeywords, &r.MessageCount, &r.LastMessageAt,
		); err != nil {
			return nil, err
		}
		r.Enabled = !r.Disabled
		if r.BlockedKeywords == nil {
			r.BlockedKeywords = []string{}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// ListSpacesMissingName returns the distinct space_keys we've observed for
// this user that still have a placeholder-looking name (empty, equal to the
// key itself, or of the form "space:xxx"). Used at startup to decide which
// spaces need an active get_group refresh.
//
// The returned strings are the raw space ids (no "space:" prefix), ready to
// drop straight into the extension's get_group request.
func (db *DB) ListSpacesMissingName(ctx context.Context, userID int64) ([]string, error) {
	const q = `
SELECT DISTINCT space_key
FROM messages
WHERE user_id = $1
  AND space_key <> ''
  AND space_key LIKE 'space:%'
  AND (
    space_name = ''
    OR space_name = space_key
    OR space_name LIKE 'space:%'
  )
ORDER BY space_key`
	rows, err := db.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sk string
		if err := rows.Scan(&sk); err != nil {
			return nil, err
		}
		// messages.space_key is "space:XXX"; strip the prefix.
		if len(sk) > len("space:") {
			out = append(out, sk[len("space:"):])
		}
	}
	return out, rows.Err()
}

// UpsertSpaceDisabled toggles the disabled flag for a space.
func (db *DB) UpsertSpaceDisabled(ctx context.Context, userID int64, spaceKey string, disabled bool) error {
	const q = `
INSERT INTO space_settings (user_id, space_key, disabled) VALUES ($1, $2, $3)
ON CONFLICT (user_id, space_key) DO UPDATE SET disabled = EXCLUDED.disabled, updated_at = NOW()`
	_, err := db.Exec(ctx, q, userID, spaceKey, disabled)
	return err
}

// UpsertSpaceName is the authoritative write for space_key → display_name.
// Empty display_name values are rejected so placeholders never clobber a
// real name. Both the spaces_directory row and the denormalized mirror
// on messages.space_name get updated atomically.
func (db *DB) UpsertSpaceName(ctx context.Context, userID int64, spaceKey, displayName string) error {
	if spaceKey == "" || displayName == "" {
		return nil
	}
	const qDir = `
INSERT INTO spaces_directory (user_id, space_key, display_name, updated_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (user_id, space_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    updated_at = NOW()`
	if _, err := db.Exec(ctx, qDir, userID, spaceKey, displayName); err != nil {
		return err
	}
	// Mirror to messages.space_name only where we'd be overwriting a
	// placeholder — same guard UpdateSpaceName originally had.
	const qMsg = `
UPDATE messages
SET space_name = $3
WHERE user_id = $1
  AND space_key = $2
  AND (space_name = '' OR space_name = space_key OR space_name LIKE 'space:%')`
	_, err := db.Exec(ctx, qMsg, userID, spaceKey, displayName)
	return err
}

// LookupSpaceName returns the canonical display name for a space, or ""
// if we've never learned one. Callers can use that empty return to fall
// back to the raw space_key for UI purposes.
func (db *DB) LookupSpaceName(ctx context.Context, userID int64, spaceKey string) (string, error) {
	if spaceKey == "" {
		return "", nil
	}
	var name string
	err := db.QueryRow(ctx,
		`SELECT display_name FROM spaces_directory WHERE user_id=$1 AND space_key=$2`,
		userID, spaceKey,
	).Scan(&name)
	if err != nil {
		// No row → unknown name; don't treat as error.
		return "", nil
	}
	return name, nil
}

// IsSpaceDisabled returns whether drafting should be skipped for this space.
// Default is disabled: the user must explicitly enable a space in the UI
// before we start generating drafts for it.
func (db *DB) IsSpaceDisabled(ctx context.Context, userID int64, spaceKey string) (bool, error) {
	var disabled bool
	err := db.QueryRow(ctx,
		`SELECT disabled FROM space_settings WHERE user_id=$1 AND space_key=$2`,
		userID, spaceKey,
	).Scan(&disabled)
	if err != nil {
		// No row = default disabled (opt-in).
		return true, nil
	}
	return disabled, nil
}

// WasRecentlySentDraft returns true when the given message body matches a draft
// we already sent to the same space around the same observation time. This is
// used to recognize our own messages and avoid reply loops.
func (db *DB) WasRecentlySentDraft(ctx context.Context, userID int64, spaceKey, body string, observedAt time.Time) (bool, error) {
	const q = `
SELECT EXISTS (
  SELECT 1
  FROM drafts d
  JOIN messages m ON m.id = d.message_id
  WHERE m.user_id = $1
    AND m.space_key = $2
    AND d.status = 'sent'
    AND d.body = $3
    AND d.sent_at IS NOT NULL
    AND d.sent_at >= $4::timestamptz - INTERVAL '1 hour'
    AND d.sent_at <= $4::timestamptz + INTERVAL '5 minutes'
)`
	var ok bool
	if err := db.QueryRow(ctx, q, userID, spaceKey, body, observedAt).Scan(&ok); err != nil {
		return false, err
	}
	return ok, nil
}

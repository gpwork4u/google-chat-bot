package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const localExtensionGoogleSub = "local-extension-user"

type User struct {
	ID         int64
	GoogleSub  string
	Email      string
	Name       string
	PictureURL string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (db *DB) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	return db.getUser(ctx, `email=$1`, email)
}

func (db *DB) GetUserByID(ctx context.Context, id int64) (*User, error) {
	return db.getUser(ctx, `id=$1`, id)
}

// GetFirstUser returns the single authorized user (MVP convenience for local single-user mode).
func (db *DB) GetFirstUser(ctx context.Context) (*User, error) {
	return db.getUser(ctx, `TRUE ORDER BY id LIMIT 1`)
}

func (db *DB) getUser(ctx context.Context, where string, args ...any) (*User, error) {
	q := `SELECT id, google_sub, email, name, picture_url, created_at, updated_at FROM users WHERE ` + where
	var u User
	err := db.QueryRow(ctx, q, args...).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.PictureURL,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// SetChatUserID records the user's numeric Google Chat id on the local
// user row so later code can JOIN to chat_members and discover the real
// email / display_name without any .env configuration.
func (db *DB) SetChatUserID(ctx context.Context, userID int64, chatUserID string) error {
	if chatUserID == "" {
		return nil
	}
	_, err := db.Exec(ctx,
		`UPDATE users SET chat_user_id = $2, updated_at = NOW()
         WHERE id = $1 AND (chat_user_id IS NULL OR chat_user_id = '' OR chat_user_id <> $2)`,
		userID, chatUserID)
	return err
}

// LookupSelfIdentity walks users → chat_members on chat_user_id to find
// the email / display_name the authenticated Chat session reports for
// this local user. Returns empty strings (no error) when the mapping
// isn't set up yet.
func (db *DB) LookupSelfIdentity(ctx context.Context, userID int64) (email, name, chatUserID string, err error) {
	const q = `
SELECT COALESCE(u.chat_user_id, ''),
       COALESCE(cm.email, ''),
       COALESCE(cm.display_name, '')
FROM users u
LEFT JOIN chat_members cm
  ON cm.user_id = u.id AND cm.member_id = u.chat_user_id
WHERE u.id = $1`
	err = db.QueryRow(ctx, q, userID).Scan(&chatUserID, &email, &name)
	return
}

// EnsureLocalUser creates or updates the singleton local-extension user used by
// extension-only mode.
func (db *DB) EnsureLocalUser(ctx context.Context, email, name string) (*User, error) {
	if email == "" {
		email = "local-extension-user@localhost"
	}
	if name == "" {
		name = "Local Extension User"
	}
	// On conflict: only overwrite name/email when the existing row still has the
	// default/empty placeholder. Once AutoDetectChatIdentity detects the real chat
	// identity (e.g. "GP Wang 王鈞平") we must not revert it back to defaults on
	// every request.
	const q = `
INSERT INTO users (google_sub, email, name, picture_url, updated_at)
VALUES ($1, $2, $3, '', NOW())
ON CONFLICT (google_sub) DO UPDATE SET
    email = CASE
        WHEN users.email = '' OR users.email = 'local-extension-user@localhost' THEN EXCLUDED.email
        ELSE users.email
    END,
    name = CASE
        WHEN users.name = '' OR users.name = 'Local Extension User' THEN EXCLUDED.name
        ELSE users.name
    END,
    updated_at = NOW()
RETURNING id`
	var id int64
	if err := db.QueryRow(ctx, q, localExtensionGoogleSub, email, name).Scan(&id); err != nil {
		return nil, err
	}
	return db.GetUserByID(ctx, id)
}

// AutoDetectChatIdentity finds the user's real chat identity from
// sender_is_me=TRUE messages and updates users.name + chat_user_id when the
// row still holds the default placeholder. Idempotent — no-op once a real
// name is detected (or no self messages exist yet).
func (db *DB) AutoDetectChatIdentity(ctx context.Context, userID int64) error {
	var senderID, senderName string
	err := db.QueryRow(ctx, `
SELECT sender_id, sender_name
FROM messages
WHERE user_id = $1 AND sender_is_me = TRUE
  AND sender_name <> '' AND sender_id <> ''
GROUP BY sender_id, sender_name
ORDER BY COUNT(*) DESC
LIMIT 1`, userID).Scan(&senderID, &senderName)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `
UPDATE users SET
    name = CASE WHEN name = '' OR name = 'Local Extension User' THEN $2 ELSE name END,
    chat_user_id = COALESCE(NULLIF(chat_user_id, ''), $3),
    updated_at = NOW()
WHERE id = $1
  AND (name = '' OR name = 'Local Extension User' OR chat_user_id IS NULL OR chat_user_id = '')`,
		userID, senderName, senderID)
	return err
}

package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const localExtensionGoogleSub = "local-extension-user"

type User struct {
	ID           int64
	GoogleSub    string
	Email        string
	Name         string
	PictureURL   string
	AccessToken  []byte // encrypted
	RefreshToken []byte // encrypted (may be nil)
	TokenExpiry  *time.Time
	Scopes       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// UpsertUserOnAuth inserts or updates a user row on OAuth callback.
// Access/refresh tokens passed in should already be encrypted.
func (db *DB) UpsertUserOnAuth(ctx context.Context, u User) (int64, error) {
	const q = `
INSERT INTO users (google_sub, email, name, picture_url, access_token, refresh_token, token_expiry, scopes, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
ON CONFLICT (google_sub) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    picture_url = EXCLUDED.picture_url,
    access_token = EXCLUDED.access_token,
    refresh_token = COALESCE(EXCLUDED.refresh_token, users.refresh_token),
    token_expiry = EXCLUDED.token_expiry,
    scopes = EXCLUDED.scopes,
    updated_at = NOW()
RETURNING id`
	var id int64
	err := db.QueryRow(ctx, q,
		u.GoogleSub, u.Email, u.Name, u.PictureURL,
		u.AccessToken, u.RefreshToken, u.TokenExpiry, u.Scopes,
	).Scan(&id)
	return id, err
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
	q := `SELECT id, google_sub, email, name, picture_url, access_token, refresh_token, token_expiry, scopes, created_at, updated_at FROM users WHERE ` + where
	var u User
	err := db.QueryRow(ctx, q, args...).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.PictureURL,
		&u.AccessToken, &u.RefreshToken, &u.TokenExpiry, &u.Scopes,
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

// UpdateUserAccessToken persists a refreshed access token back to the DB.
// The caller passes already-encrypted ciphertext.
func (db *DB) UpdateUserAccessToken(ctx context.Context, userID int64, encAccess []byte, expiry *time.Time) error {
	_, err := db.Exec(ctx, `UPDATE users SET access_token=$1, token_expiry=$2, updated_at=NOW() WHERE id=$3`,
		encAccess, expiry, userID)
	return err
}

// GetAuthorizedUser returns the first non-local user that has an encrypted
// access token. This is the user whose OAuth credentials the backend can use
// to call the official Google Chat API.
func (db *DB) GetAuthorizedUser(ctx context.Context) (*User, error) {
	const q = `
SELECT id, google_sub, email, name, picture_url, access_token, refresh_token, token_expiry, scopes, created_at, updated_at
FROM users
WHERE google_sub <> $1 AND octet_length(access_token) > 0
ORDER BY id
LIMIT 1`
	var u User
	err := db.QueryRow(ctx, q, localExtensionGoogleSub).Scan(
		&u.ID, &u.GoogleSub, &u.Email, &u.Name, &u.PictureURL,
		&u.AccessToken, &u.RefreshToken, &u.TokenExpiry, &u.Scopes,
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

// EnsureLocalUser creates or updates the singleton local-extension user used by
// extension-only mode. This keeps the current schema intact while removing the
// runtime dependency on OAuth.
func (db *DB) EnsureLocalUser(ctx context.Context, email, name string) (*User, error) {
	if email == "" {
		email = "local-extension-user@localhost"
	}
	if name == "" {
		name = "Local Extension User"
	}
	const q = `
INSERT INTO users (google_sub, email, name, picture_url, access_token, refresh_token, token_expiry, scopes, updated_at)
VALUES ($1, $2, $3, '', '\\x'::bytea, NULL, NULL, '', NOW())
ON CONFLICT (google_sub) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    updated_at = NOW()
RETURNING id`
	var id int64
	if err := db.QueryRow(ctx, q, localExtensionGoogleSub, email, name).Scan(&id); err != nil {
		return nil, err
	}
	return db.GetUserByID(ctx, id)
}

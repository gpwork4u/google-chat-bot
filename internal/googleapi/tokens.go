// Package googleapi wires our stored, encrypted OAuth tokens into Google API clients,
// and persists refreshes back to the DB transparently.
package googleapi

import (
	"context"
	"sync"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/cryptoutil"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
	"golang.org/x/oauth2"
	googleoauth "golang.org/x/oauth2/google"
)

// TokenSourceForUser returns an oauth2.TokenSource backed by the user's stored,
// encrypted tokens. Refreshed tokens are re-encrypted and saved back to the DB.
func TokenSourceForUser(ctx context.Context, cfg *config.Config, db *store.DB, u *store.User) (oauth2.TokenSource, error) {
	access, err := cryptoutil.Decrypt(cfg.TokenEncryptionKey, u.AccessToken)
	if err != nil {
		return nil, err
	}
	var refresh []byte
	if len(u.RefreshToken) > 0 {
		refresh, err = cryptoutil.Decrypt(cfg.TokenEncryptionKey, u.RefreshToken)
		if err != nil {
			return nil, err
		}
	}
	tok := &oauth2.Token{
		AccessToken:  string(access),
		RefreshToken: string(refresh),
		TokenType:    "Bearer",
	}
	if u.TokenExpiry != nil {
		tok.Expiry = *u.TokenExpiry
	}

	oauthCfg := &oauth2.Config{
		ClientID:     cfg.GoogleClientID,
		ClientSecret: cfg.GoogleClientSecret,
		Endpoint:     googleoauth.Endpoint,
	}

	return &persistentTokenSource{
		base:    oauthCfg.TokenSource(ctx, tok),
		cfg:     cfg,
		db:      db,
		userID:  u.ID,
		lastAT:  tok.AccessToken,
		lastExp: tok.Expiry,
	}, nil
}

type persistentTokenSource struct {
	base oauth2.TokenSource

	cfg    *config.Config
	db     *store.DB
	userID int64

	mu      sync.Mutex
	lastAT  string
	lastExp time.Time
}

func (p *persistentTokenSource) Token() (*oauth2.Token, error) {
	tok, err := p.base.Token()
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if tok.AccessToken == p.lastAT {
		return tok, nil
	}
	// token was refreshed — persist
	enc, err := cryptoutil.Encrypt(p.cfg.TokenEncryptionKey, []byte(tok.AccessToken))
	if err != nil {
		return nil, err
	}
	var expiry *time.Time
	if !tok.Expiry.IsZero() {
		e := tok.Expiry
		expiry = &e
	}
	if err := p.db.UpdateUserAccessToken(context.Background(), p.userID, enc, expiry); err != nil {
		return nil, err
	}
	p.lastAT = tok.AccessToken
	p.lastExp = tok.Expiry
	return tok, nil
}

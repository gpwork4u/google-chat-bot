package oauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/cryptoutil"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
	"golang.org/x/oauth2"
	googleoauth "golang.org/x/oauth2/google"
	oauth2api "google.golang.org/api/oauth2/v2"
	"google.golang.org/api/option"
)

// Scopes requested from the user. These cover:
//   - reading/sending Chat messages on the user's behalf
//   - listing spaces and memberships
//   - identifying the user (email + profile)
var Scopes = []string{
	"openid",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/chat.messages",
	"https://www.googleapis.com/auth/chat.messages.readonly",
	"https://www.googleapis.com/auth/chat.spaces.readonly",
	"https://www.googleapis.com/auth/chat.memberships.readonly",
}

const stateCookieName = "oauth_state"
const stateMaxAge = 10 * time.Minute

type Service struct {
	cfg   *config.Config
	db    *store.DB
	oauth *oauth2.Config
}

func New(cfg *config.Config, db *store.DB) *Service {
	return &Service{
		cfg: cfg,
		db:  db,
		oauth: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
			Scopes:       Scopes,
			Endpoint:     googleoauth.Endpoint,
		},
	}
}

// Start begins the OAuth dance: issues a signed state cookie, redirects to Google.
func (s *Service) Start(w http.ResponseWriter, r *http.Request) {
	nonce := randomString(32)
	signed, err := signState(s.cfg.StateSigningKey, nonce)
	if err != nil {
		http.Error(w, "state sign failed", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    signed,
		Path:     "/",
		MaxAge:   int(stateMaxAge.Seconds()),
		HttpOnly: true,
		Secure:   strings.HasPrefix(s.cfg.PublicBaseURL, "https://"),
		SameSite: http.SameSiteLaxMode,
	})
	// Force consent + offline access so we get a refresh_token on the first run.
	authURL := s.oauth.AuthCodeURL(nonce,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback handles Google's redirect: verifies state, exchanges code, stores tokens.
// Returns the authenticated user's email on success.
func (s *Service) Callback(w http.ResponseWriter, r *http.Request) (string, error) {
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		return "", fmt.Errorf("google returned error: %s", errParam)
	}
	code := r.URL.Query().Get("code")
	returnedState := r.URL.Query().Get("state")
	if code == "" || returnedState == "" {
		return "", errors.New("missing code or state")
	}
	cookie, err := r.Cookie(stateCookieName)
	if err != nil {
		return "", errors.New("missing state cookie")
	}
	if !verifyState(s.cfg.StateSigningKey, cookie.Value, returnedState) {
		return "", errors.New("state mismatch")
	}
	// Clear the cookie.
	http.SetCookie(w, &http.Cookie{Name: stateCookieName, Path: "/", MaxAge: -1})

	ctx := r.Context()
	tok, err := s.oauth.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("code exchange: %w", err)
	}

	// Fetch identity with the fresh token.
	svc, err := oauth2api.NewService(ctx, option.WithTokenSource(s.oauth.TokenSource(ctx, tok)))
	if err != nil {
		return "", fmt.Errorf("oauth2 api service: %w", err)
	}
	info, err := svc.Userinfo.Get().Do()
	if err != nil {
		return "", fmt.Errorf("userinfo: %w", err)
	}

	encAccess, err := cryptoutil.Encrypt(s.cfg.TokenEncryptionKey, []byte(tok.AccessToken))
	if err != nil {
		return "", fmt.Errorf("encrypt access: %w", err)
	}
	var encRefresh []byte
	if tok.RefreshToken != "" {
		encRefresh, err = cryptoutil.Encrypt(s.cfg.TokenEncryptionKey, []byte(tok.RefreshToken))
		if err != nil {
			return "", fmt.Errorf("encrypt refresh: %w", err)
		}
	}

	var expiry *time.Time
	if !tok.Expiry.IsZero() {
		e := tok.Expiry
		expiry = &e
	}

	_, err = s.db.UpsertUserOnAuth(ctx, store.User{
		GoogleSub:    info.Id,
		Email:        info.Email,
		Name:         info.Name,
		PictureURL:   info.Picture,
		AccessToken:  encAccess,
		RefreshToken: encRefresh,
		TokenExpiry:  expiry,
		Scopes:       strings.Join(Scopes, " "),
	})
	if err != nil {
		return "", fmt.Errorf("persist user: %w", err)
	}

	return info.Email, nil
}

// --- state signing helpers ---

type stateEnvelope struct {
	Nonce    string `json:"n"`
	IssuedAt int64  `json:"t"`
}

func signState(key []byte, nonce string) (string, error) {
	env := stateEnvelope{Nonce: nonce, IssuedAt: time.Now().Unix()}
	raw, err := json.Marshal(env)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(raw)
	sig := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(raw) + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func verifyState(key []byte, signed, expectedNonce string) bool {
	parts := strings.SplitN(signed, ".", 2)
	if len(parts) != 2 {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return false
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(raw)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return false
	}
	var env stateEnvelope
	if err := json.Unmarshal(raw, &env); err != nil {
		return false
	}
	if time.Since(time.Unix(env.IssuedAt, 0)) > stateMaxAge {
		return false
	}
	return env.Nonce == expectedNonce
}

func randomString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

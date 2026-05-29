package httpapi

// reactions_direct.go — auth-state + emoji-catalog state intake from the
// extension. Used by every backend-driven Chat call (reactions, send,
// sync-history etc) to know which xsrf token / ext-bin / catalog to use.
//
// The earlier /api/reactions/direct endpoint (which tried Go-direct POST to
// chat.google.com) was removed: Chrome integrity headers can't be reproduced
// from a Go HTTP client, so all mutations must proxy through the extension.

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// authState is the latest credentials snapshot the extension pushed.
type authState struct {
	XSRF         string       `json:"x_framework_xsrf_token"`
	GoogAuthuser string       `json:"x_goog_authuser"`
	GoogExtBin   string       `json:"x_goog_ext_353267353_bin"`
	XClientData  string       `json:"x_client_data"`
	AccountBase  string       `json:"account_base"`
	// Batchexecute "boq" params — needed to drive /DynamiteWebUi/data/batchexecute RPCs.
	BoqAt   string `json:"boq_at"`
	BoqFsid string `json:"boq_fsid"`
	BoqBl   string `json:"boq_bl"`

	UserAgent  string       `json:"user_agent"`
	Cookies    []authCookie `json:"cookies"`
	ObservedAt string       `json:"observed_at"`
}

type authCookie struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Domain string `json:"domain"`
	Path   string `json:"path"`
}

var (
	authStateMu   sync.RWMutex
	authStateData *authState

	emojiCatalogMu sync.RWMutex
	emojiCatalog   = map[string]emojiCatalogEntry{}
)

func setAuthState(s *authState) {
	authStateMu.Lock()
	authStateData = s
	authStateMu.Unlock()
}

func getAuthState() *authState {
	authStateMu.RLock()
	defer authStateMu.RUnlock()
	return authStateData
}

func setEmojiCatalog(entries map[string]emojiCatalogEntry) {
	emojiCatalogMu.Lock()
	emojiCatalog = entries
	emojiCatalogMu.Unlock()
}

func lookupEmoji(key string) (emojiCatalogEntry, bool) {
	emojiCatalogMu.RLock()
	defer emojiCatalogMu.RUnlock()
	e, ok := emojiCatalog[key]
	return e, ok
}

func reactionsDirectRoutes(mux *http.ServeMux, _ *store.DB, _ *config.Config, _ *hub.Hub) {
	mux.HandleFunc("POST /api/ext/auth-state", handlePushAuthState)
	mux.HandleFunc("GET /api/ext/auth-state", handleGetAuthState)
	mux.HandleFunc("POST /api/ext/emoji-catalog", handlePushEmojiCatalog)
	mux.HandleFunc("GET /api/ext/emoji-catalog", func(w http.ResponseWriter, _ *http.Request) {
		emojiCatalogMu.RLock()
		defer emojiCatalogMu.RUnlock()
		keys := make([]string, 0, len(emojiCatalog))
		for k := range emojiCatalog {
			keys = append(keys, k)
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"count": len(emojiCatalog),
			"keys":  keys,
		})
	})
}

func handlePushAuthState(w http.ResponseWriter, r *http.Request) {
	var s authState
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if s.XSRF == "" || len(s.Cookies) == 0 {
		writeErr(w, http.StatusBadRequest, "xsrf and cookies required")
		return
	}
	if s.AccountBase == "" {
		s.AccountBase = "/u/0"
	}
	setAuthState(&s)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "cookies": len(s.Cookies)})
}

func handleGetAuthState(w http.ResponseWriter, _ *http.Request) {
	s := getAuthState()
	if s == nil {
		writeJSON(w, http.StatusOK, map[string]any{"present": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"present":      true,
		"cookies":      len(s.Cookies),
		"account_base": s.AccountBase,
		"observed_at":  s.ObservedAt,
		"has_xsrf":     s.XSRF != "",
		"has_ext_bin":  s.GoogExtBin != "",
		"has_boq_at":   s.BoqAt != "",
		"has_boq_fsid": s.BoqFsid != "",
		"has_boq_bl":   s.BoqBl != "",
	})
}

func handlePushEmojiCatalog(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Entries map[string]emojiCatalogEntry `json:"entries"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if len(body.Entries) == 0 {
		writeErr(w, http.StatusBadRequest, "entries required")
		return
	}
	setEmojiCatalog(body.Entries)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "count": len(body.Entries)})
}


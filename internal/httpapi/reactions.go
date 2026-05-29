package httpapi

// reactions.go — POST /api/reactions
//
// Backend builds the full update_reaction payload (using cached emoji
// catalog + auth state), asks the extension to proxy the HTTPS call into
// chat.google.com's origin, parses the response. The extension is a dumb
// XHR relay; all wire knowledge lives here.

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

type reactionRequest struct {
	SpaceKey  string `json:"space_key"`
	ThreadKey string `json:"thread_key"`
	MessageID string `json:"message_id"`
	Emoji     string `json:"emoji"`
	Action    string `json:"action"` // "add" | "remove" (default "add")
}

func reactionsRoutes(mux *http.ServeMux, _ *store.DB, _ *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /api/reactions", func(w http.ResponseWriter, r *http.Request) {
		handleReaction(w, r, h)
	})
}

func handleReaction(w http.ResponseWriter, r *http.Request, h *hub.Hub) {
	if h == nil {
		writeErr(w, http.StatusInternalServerError, "hub unavailable")
		return
	}
	var req reactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.SpaceKey = strings.TrimSpace(req.SpaceKey)
	req.MessageID = strings.TrimSpace(req.MessageID)
	req.Emoji = strings.TrimSpace(req.Emoji)
	req.Action = strings.ToLower(strings.TrimSpace(req.Action))
	if req.Action == "" {
		req.Action = "add"
	}
	if req.SpaceKey == "" || req.MessageID == "" || req.Emoji == "" {
		writeErr(w, http.StatusBadRequest, "space_key, message_id, emoji required")
		return
	}
	if req.Action != "add" && req.Action != "remove" {
		writeErr(w, http.StatusBadRequest, `action must be "add" or "remove"`)
		return
	}

	auth := getAuthState()
	if auth == nil {
		writeErr(w, http.StatusPreconditionFailed, "no auth-state yet — open Google Chat once with the extension installed")
		return
	}
	cat, ok := lookupEmoji(req.Emoji)
	if !ok {
		writeErr(w, http.StatusUnprocessableEntity, fmt.Sprintf("emoji %q not in catalog — reload Google Chat tab to refresh", req.Emoji))
		return
	}

	payload := buildReactionPayloadGo(req, cat)
	body, _ := json.Marshal(payload)

	spaceID := spaceIDFromKey(req.SpaceKey)
	headers := buildChatHeaders(auth, map[string]string{
		"X-Goog-Chat-Space-Id": spaceID,
	})
	url := fmt.Sprintf("%s/api/update_reaction?c=%d", auth.AccountBase, nextAPICounter())

	resp, err := chatProxyCall(r.Context(), h, ProxyCall{
		URL:     url,
		Method:  "POST",
		Headers: headers,
		Body:    string(body),
	})
	if err != nil {
		writeJSON(w, http.StatusGatewayTimeout, map[string]any{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}
	if !resp.OK || resp.Status < 200 || resp.Status >= 300 {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"ok":          false,
			"chat_status": resp.Status,
			"error":       strings.TrimSpace(fmt.Sprintf("%s %s", resp.Error, truncateStr(resp.Response, 240))),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"chat_status": resp.Status,
	})
}

// --- shared helpers / state (used by reactions + future endpoints) -------

// emojiCatalogEntry mirrors the inject-main shape.
type emojiCatalogEntry struct {
	Type      string `json:"type"`
	UUID      string `json:"uuid,omitempty"`
	Shortcode string `json:"shortcode,omitempty"`
	Unicode   string `json:"unicode,omitempty"`
	UserID    string `json:"userId,omitempty"`
	LocalID   string `json:"localId,omitempty"`
	Timestamp int64  `json:"timestamp,omitempty"`
	Blob      string `json:"blob,omitempty"`
}

// spaceIDFromKey strips a leading "space:" prefix if present.
func spaceIDFromKey(spaceKey string) string {
	s := strings.TrimSpace(spaceKey)
	if s == "" {
		return ""
	}
	if i := strings.Index(s, ":"); i >= 0 {
		return s[i+1:]
	}
	return s
}

// nextAPICounter mirrors Chat web's per-tab counter; we keep our own
// monotonic counter to avoid collision with whatever the Chat tab is doing.
var apiCounter int64

func nextAPICounter() int64 {
	return atomic.AddInt64(&apiCounter, 1)
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// buildReactionPayloadGo constructs the positional array Google Chat expects
// at POST /api/update_reaction. Wire shape (reverse-engineered):
//
//	payload[0]   = [[null,null,null,[null, msgId, [[spaceID]]]], msgId]
//	payload[1]   = (custom)  [null, [uuid, null, shortcode, 1, [userId], [localId], null, ts, blob]]
//	             | (unicode) [unicode_char]
//	payload[2]   = 1 (add) | 2 (remove)
//	payload[100] = footer [randReqID, 3, 1, "en", DEFAULT_PREFS]
func buildReactionPayloadGo(req reactionRequest, cat emojiCatalogEntry) []any {
	spaceID := spaceIDFromKey(req.SpaceKey)
	action := 1
	if req.Action == "remove" {
		action = 2
	}
	payload := make([]any, 101)
	payload[0] = []any{
		[]any{nil, nil, nil, []any{nil, req.MessageID, []any{[]any{spaceID}}}},
		req.MessageID,
	}
	if cat.Type == "custom" {
		payload[1] = []any{nil, []any{
			cat.UUID,
			nil,
			cat.Shortcode,
			1,
			[]any{cat.UserID},
			[]any{cat.LocalID},
			nil,
			cat.Timestamp,
			cat.Blob,
		}}
	} else {
		payload[1] = []any{cat.Unicode}
	}
	payload[2] = action
	payload[100] = []any{
		randomFooterReqID(),
		3,
		1,
		"en",
		defaultPrefs(),
	}
	return payload
}

func defaultPrefs() []any {
	src := []any{
		nil, nil, nil, nil, 2, 2, nil, 2, 2, 2, 2, nil, nil, nil, nil, 2, 2, 2, 2, 2,
		2, 2, 2, 2, 2, 2, 2, 2, 2, nil, nil, 2, 2, nil, nil, nil, 2, 2, nil, nil, nil,
		nil, 2, 2, 2, 2, nil, 2, nil, nil, 2, nil, 2, 2, 2, 2, nil, 2, nil, 2, 2, nil,
		nil, nil, 2, 2,
	}
	out := make([]any, len(src))
	copy(out, src)
	return out
}

// randomFooterReqID returns a large random integer in string form for the
// footer's first slot (mirrors what Chat web's SPA puts there).
func randomFooterReqID() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(9e18))
	return n.String()
}

// unused; kept here to satisfy go vet when context import is needed
var _ context.Context

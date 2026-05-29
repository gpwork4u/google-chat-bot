package httpapi

// send_message.go — POST /api/messages/send
//
// Backend builds the create_message / create_topic payload (positional array
// reverse-engineered from Chat web) and proxies it through the extension to
// chat.google.com. Same architecture as /api/reactions.

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

type sendMessageRequest struct {
	SpaceKey  string `json:"space_key"`
	ThreadKey string `json:"thread_key"` // present → reply; absent → new topic
	Text      string `json:"text"`
}

func sendMessageRoutes(mux *http.ServeMux, _ *store.DB, _ *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /api/messages/send", func(w http.ResponseWriter, r *http.Request) {
		handleSendMessage(w, r, h)
	})
}

func handleSendMessage(w http.ResponseWriter, r *http.Request, h *hub.Hub) {
	if h == nil {
		writeErr(w, http.StatusInternalServerError, "hub unavailable")
		return
	}
	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.SpaceKey = strings.TrimSpace(req.SpaceKey)
	req.Text = strings.TrimSpace(req.Text)
	if req.SpaceKey == "" || req.Text == "" {
		writeErr(w, http.StatusBadRequest, "space_key and text are required")
		return
	}

	auth := getAuthState()
	if auth == nil {
		writeErr(w, http.StatusPreconditionFailed, "no auth-state yet — open Google Chat once")
		return
	}

	spaceID := spaceIDFromKey(req.SpaceKey)
	headers := buildChatHeaders(auth, map[string]string{
		"X-Goog-Chat-Space-Id": spaceID,
	})

	var url string
	var payload []any
	if req.ThreadKey != "" {
		// reply to existing thread
		payload = buildCreateMessagePayloadGo(req.Text, req.ThreadKey, spaceID)
		url = fmt.Sprintf("%s/api/create_message?c=%d", auth.AccountBase, nextAPICounter())
	} else {
		// new topic
		payload = buildCreateTopicPayloadGo(req.Text, spaceID)
		url = fmt.Sprintf("%s/api/create_topic?c=%d", auth.AccountBase, nextAPICounter())
	}
	body, _ := json.Marshal(payload)

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
			"error":       strings.TrimSpace(resp.Error + " " + truncateStr(resp.Response, 240)),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":          true,
		"chat_status": resp.Status,
	})
}

// --- payload builders -----------------------------------------------------

func buildCreateMessagePayloadGo(text, sourceThreadKey, spaceID string) []any {
	requestMessageKey := randomKey11()
	payload := make([]any, 100)
	payload[0] = []any{nil, nil, nil, []any{nil, sourceThreadKey, []any{[]any{spaceID}}}}
	payload[1] = text
	payload[5] = requestMessageKey
	payload[6] = []any{1}
	payload[7] = []any{1}
	payload[99] = []any{
		randomFooterReqID(),
		3,
		1,
		"en",
		defaultPrefs(),
	}
	return payload
}

func buildCreateTopicPayloadGo(text, spaceID string) []any {
	requestThreadKey := randomKey11()
	payload := make([]any, 105)
	payload[1] = text
	payload[4] = []any{[]any{spaceID}}
	payload[5] = []any{1}
	payload[6] = requestThreadKey
	payload[7] = 1
	payload[8] = []any{1}
	payload[104] = []any{
		randomFooterReqID(),
		3,
		1,
		"en",
		defaultPrefs(),
	}
	return payload
}

// randomKey11 — alphanumeric+"-_" 11-char key (Chat's standard thread/message
// key shape: see randomTopicKey() in inject-main.js).
func randomKey11() string {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	var buf [11]byte
	_, _ = rand.Read(buf[:])
	out := make([]byte, 11)
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return string(out)
}

// unused; keeps context import valid if compiler complains
var _ context.Context

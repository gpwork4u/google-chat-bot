package httpapi

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// debugRoutes registers developer-only endpoints for driving the pipeline
// without the Chrome extension — useful for smoke-testing the backend→UI
// WebSocket path in isolation.
func debugRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /debug/simulate_message", func(w http.ResponseWriter, r *http.Request) {
		handleSimulateMessage(w, r, db, cfg, h)
	})
}

type simulateMessageReq struct {
	SpaceKey   string `json:"space_key"`
	SpaceName  string `json:"space_name"`
	ThreadKey  string `json:"thread_key"`
	SenderName string `json:"sender_name"`
	Body       string `json:"body"`
	SenderIsMe bool   `json:"sender_is_me"`
	WithDraft  bool   `json:"with_draft"` // default true
}

func handleSimulateMessage(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	var req simulateMessageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Body == "" {
		req.Body = "假訊息 (simulate) @ " + time.Now().Format(time.RFC3339)
	}
	if req.SenderName == "" {
		req.SenderName = "Debug Bot"
	}
	if req.SpaceKey == "" {
		req.SpaceKey = "sim:" + randHex(6)
	}
	if req.SpaceName == "" {
		req.SpaceName = "Simulated space"
	}
	if req.ThreadKey == "" {
		req.ThreadKey = "sim-thread-" + randHex(4)
	}

	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	msg := &store.Message{
		UserID:     user.ID,
		SpaceKey:   req.SpaceKey,
		SpaceName:  req.SpaceName,
		ThreadKey:  req.ThreadKey,
		MessageKey: "sim-msg-" + randHex(8),
		SenderName: req.SenderName,
		SenderIsMe: req.SenderIsMe,
		Body:       req.Body,
		ObservedAt: time.Now(),
	}
	inserted, err := db.InsertOrGetMessage(ctx, msg)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	draftCreated := false
	if inserted && !msg.SenderIsMe && (req.WithDraft || !req.SenderIsMe) {
		draft := &store.Draft{
			MessageID: msg.ID,
			Body:      "[simulated draft] 收到「" + truncate(req.Body, 40) + "」",
			Model:     "simulate",
			SendMode:  "new_topic",
			Status:    "pending",
			Reasoning: "debug/simulate_message",
		}
		if err := db.InsertDraft(ctx, draft); err != nil {
			writeErr(w, http.StatusInternalServerError, "insert draft: "+err.Error())
			return
		}
		draftCreated = true
	}

	if h != nil {
		h.InboxChanged()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"message_id":    msg.ID,
		"inserted":      inserted,
		"draft_created": draftCreated,
		"space_key":     req.SpaceKey,
		"message_key":   msg.MessageKey,
	})
}

func randHex(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

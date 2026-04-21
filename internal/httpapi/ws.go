package httpapi

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// Ingestor is the subset of worker.ChatProcessor that ws.go needs. Declared
// as an interface here so httpapi doesn't hard-depend on worker internals.
type Ingestor interface {
	Ingest(ctx context.Context, kind, url string, payload json.RawMessage) error
}

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Localhost-only dev server. Chrome extension content scripts use the page
	// origin (chat.google.com); the UI uses http://localhost:8080. Accept both.
	CheckOrigin: func(r *http.Request) bool { return true },
}

const (
	wsWriteTimeout = 10 * time.Second
	wsPingInterval = 20 * time.Second
	wsPongWait     = 60 * time.Second
	wsReadLimit    = 512 * 1024 // raw response bodies can be tens of KB; cap at 512KB
)

func wsRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub, ing Ingestor) {
	if h == nil {
		return
	}
	mux.HandleFunc("GET /ws/ui", func(w http.ResponseWriter, r *http.Request) {
		handleUIWS(w, r, h)
	})
	mux.HandleFunc("GET /ws/ext", func(w http.ResponseWriter, r *http.Request) {
		handleExtWS(w, r, db, cfg, h, ing)
	})
}

// handleUIWS pushes hub UI events (inbox_changed etc.) to the web UI. The
// client has no data to send; we only read to detect disconnects.
func handleUIWS(w http.ResponseWriter, r *http.Request, h *hub.Hub) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("ws upgrade ui", "err", err)
		return
	}
	defer conn.Close()
	slog.Info("ws ui connected", "remote", r.RemoteAddr)
	defer slog.Info("ws ui disconnected", "remote", r.RemoteAddr)

	conn.SetReadLimit(1024)
	_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	sub, unsub := h.SubscribeUI()
	defer unsub()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	ping := time.NewTicker(wsPingInterval)
	defer ping.Stop()

	for {
		select {
		case <-done:
			return
		case ev, ok := <-sub:
			if !ok {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if err := conn.WriteJSON(ev); err != nil {
				return
			}
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
			if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(wsWriteTimeout)); err != nil {
				return
			}
		}
	}
}

// --- extension WS -------------------------------------------------------

type extInMsg struct {
	Type    string          `json:"type"`
	Kind    string          `json:"kind,omitempty"`
	URL     string          `json:"url,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
	Stage   string          `json:"stage,omitempty"`
	DraftID int64           `json:"draft_id,omitempty"`
	Success bool            `json:"success,omitempty"`
	Error   string          `json:"error,omitempty"`
	Token   json.RawMessage `json:"token,omitempty"`
}

func handleExtWS(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub, ing Ingestor) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("ws upgrade ext", "err", err)
		return
	}
	defer conn.Close()
	slog.Info("ws ext connected", "remote", r.RemoteAddr)
	defer slog.Info("ws ext disconnected", "remote", r.RemoteAddr)

	conn.SetReadLimit(wsReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(wsPongWait))
		return nil
	})

	sub, unsub := h.SubscribeExt()
	defer unsub()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// writer channel so both the hub sub loop and the post-connect backlog
	// push serialize onto a single goroutine (gorilla's WriteJSON is not
	// concurrency-safe).
	out := make(chan any, 32)

	// writer
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		ping := time.NewTicker(wsPingInterval)
		defer ping.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-out:
				if !ok {
					return
				}
				_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				if err := conn.WriteJSON(msg); err != nil {
					return
				}
			case <-ping.C:
				_ = conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
				if err := conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(wsWriteTimeout)); err != nil {
					return
				}
			}
		}
	}()

	// hub → out
	hubDone := make(chan struct{})
	go func() {
		defer close(hubDone)
		for {
			select {
			case <-ctx.Done():
				return
			case ev, ok := <-sub:
				if !ok {
					return
				}
				select {
				case out <- ev:
				case <-ctx.Done():
					return
				}
			}
		}
	}()

	// post-connect: flush any currently-approved drafts so the extension
	// doesn't miss work that landed while it was disconnected.
	if user, err := requireLocalUser(ctx, db, cfg); err == nil && user != nil {
		if pending, err := db.ListApprovedPending(ctx, user.ID, 20); err == nil {
		flushPending:
			for _, item := range pending {
				select {
				case out <- hub.ExtEvent{Type: "pending", Pending: item}:
				case <-ctx.Done():
					break flushPending
				}
			}
		}
	}

	// reader
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg extInMsg
		if err := json.Unmarshal(data, &msg); err != nil {
			slog.Warn("ws ext bad frame", "err", err)
			continue
		}
		handleExtInbound(ctx, db, cfg, h, ing, &msg)
	}
	cancel()
	<-writerDone
	<-hubDone
}

func handleExtInbound(ctx context.Context, db *store.DB, cfg *config.Config, h *hub.Hub, ing Ingestor, m *extInMsg) {
	switch m.Type {
	case "raw":
		if m.Kind == "" || m.URL == "" {
			return
		}
		data := m.Data
		if len(data) == 0 {
			data = []byte("null")
		}
		uid := int64(0)
		if u, _ := requireLocalUser(ctx, db, cfg); u != nil {
			uid = u.ID
		}
		if err := db.InsertRawEvent(ctx, uid, m.Kind, m.URL, data); err != nil {
			slog.Warn("ws ext insert raw", "err", err)
			return
		}
		if ing != nil {
			if err := ing.Ingest(ctx, m.Kind, m.URL, data); err != nil {
				slog.Warn("ws ext ingest", "err", err, "url", m.URL)
			}
		}

	case "debug":
		if m.Stage == "" {
			return
		}
		payload, _ := json.Marshal(map[string]any{"stage": m.Stage, "data": json.RawMessage(m.Data)})
		uid := int64(0)
		if u, _ := requireLocalUser(ctx, db, cfg); u != nil {
			uid = u.ID
		}
		if err := db.InsertRawEvent(ctx, uid, "ext-debug", "/ws/ext/debug", payload); err != nil {
			slog.Warn("ws ext insert debug", "err", err)
		}

	case "sent":
		if m.DraftID <= 0 {
			return
		}
		status := "sent"
		if !m.Success {
			status = "failed"
		}
		if err := db.UpdateDraftStatus(ctx, m.DraftID, status, m.Error); err != nil {
			slog.Warn("ws ext update draft status", "err", err, "draft_id", m.DraftID)
			return
		}
		if h != nil {
			h.InboxChanged()
		}

	case "token":
		// Store the raw token envelope under raw_events kind="auth-token" so we
		// can inspect it later without needing a bespoke schema. Single-user
		// MVP, localhost-only — no key management needed.
		if len(m.Token) == 0 {
			return
		}
		uid := int64(0)
		if u, _ := requireLocalUser(ctx, db, cfg); u != nil {
			uid = u.ID
		}
		if err := db.InsertRawEvent(ctx, uid, "auth-token", "/ws/ext/token", m.Token); err != nil {
			slog.Warn("ws ext insert token", "err", err)
		}

	case "hello":
		// no-op; connection established

	default:
		slog.Debug("ws ext unknown type", "type", m.Type)
	}
}

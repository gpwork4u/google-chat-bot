package httpapi

// chatproxy.go — backend-side helper that asks the extension to run an HTTP
// call inside chat.google.com's origin and returns the parsed result. This is
// the only way for the backend to issue mutations to Chat (Chrome integrity
// headers cannot be reproduced from a Go HTTP client; see README).

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/hub"
)

const defaultProxyTimeout = 20 * time.Second

// ProxyCall holds the parameters of a single chat.google.com HTTP call we
// want the extension to run on our behalf.
type ProxyCall struct {
	URL     string            // relative (e.g. "/u/0/api/update_reaction?c=1") or absolute
	Method  string            // "POST", "GET" etc; defaults to "GET" if empty
	Headers map[string]string // request headers (do NOT include Cookie — browser auto-attaches)
	Body    string            // JSON or form body; empty for GET
}

// ProxyResp is the rendered ProxyResult with helpers for downstream code.
type ProxyResp struct {
	hub.ProxyResult
}

// Call publishes a proxy_request and blocks until the extension replies
// (or context/timeout expires). Returns the extension's verdict on success.
func chatProxyCall(ctx context.Context, h *hub.Hub, call ProxyCall) (*ProxyResp, error) {
	if h == nil {
		return nil, errors.New("hub unavailable")
	}
	if call.URL == "" {
		return nil, errors.New("URL required")
	}
	reqID, err := newProxyReqID()
	if err != nil {
		return nil, err
	}
	wait, cleanup := h.AwaitProxy(reqID)
	defer cleanup()

	h.ProxyRequest(reqID, call.URL, call.Method, call.Headers, call.Body)

	deadline := defaultProxyTimeout
	select {
	case res := <-wait:
		return &ProxyResp{ProxyResult: res}, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(deadline):
		return nil, fmt.Errorf("extension did not respond within %s (is Google Chat open?)", deadline)
	}
}

func newProxyReqID() (string, error) {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "px-" + hex.EncodeToString(buf[:]), nil
}

// buildChatHeaders builds the standard header set we attach to every chat
// /api/ POST. Caller may override / add per-request headers.
func buildChatHeaders(auth *authState, extra map[string]string) map[string]string {
	h := map[string]string{
		"Content-Type":    "application/json",
		"Accept":          "*/*",
		"Accept-Language": "en",
	}
	if auth != nil {
		if auth.XSRF != "" {
			h["X-Framework-Xsrf-Token"] = auth.XSRF
		}
		if auth.GoogExtBin != "" {
			h["X-Goog-Ext-353267353-Bin"] = auth.GoogExtBin
		}
	}
	for k, v := range extra {
		if v == "" {
			continue
		}
		h[k] = v
	}
	return h
}

// makeChatURL turns a relative /api/... path into an absolute URL using the
// observed account base. Caller may pass absolute URL too.
func makeChatURL(auth *authState, path string) string {
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	base := "/u/0"
	if auth != nil && auth.AccountBase != "" {
		base = auth.AccountBase
	}
	if strings.HasPrefix(path, "/u/") {
		// already prefixed
		return "https://chat.google.com" + path
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return "https://chat.google.com" + base + path
}

package httpapi

// chat_rpc.go — backend-side wrappers for Google Chat's batchexecute RPCs.
// We build the URL + form body in Go, hand it to chatProxyCall, then parse the
// XSSI-prefixed framed response. All Chat wire knowledge that used to live in
// inject-main.js now lives here.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/hub"
)

func nowIsoUTC() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func microsToISO(us int64) string {
	return time.Unix(0, us*1000).UTC().Format(time.RFC3339)
}

var batchexecuteReqID int64

func nextBatchexecuteReqID() int64 {
	return atomic.AddInt64(&batchexecuteReqID, 1)
}

// batchexecuteCall invokes a single batchexecute RPC via the extension proxy
// and returns the raw response text (still XSSI-prefixed, framed). Use the
// rpc-specific parser to extract the inner JSON.
func batchexecuteCall(ctx context.Context, h *hub.Hub, rpcID string, innerReq any, sourcePath string) (string, error) {
	auth := getAuthState()
	if auth == nil {
		return "", errors.New("no auth-state cached — open Google Chat with the extension first")
	}
	if auth.BoqAt == "" || auth.BoqFsid == "" || auth.BoqBl == "" {
		return "", errors.New("missing boq params (at / f.sid / bl) — reload Chat tab")
	}

	innerJSON, err := json.Marshal(innerReq)
	if err != nil {
		return "", fmt.Errorf("marshal inner req: %w", err)
	}
	fReq, err := json.Marshal([]any{[]any{[]any{rpcID, string(innerJSON), nil, "1"}}})
	if err != nil {
		return "", fmt.Errorf("marshal f.req envelope: %w", err)
	}

	if sourcePath == "" {
		sourcePath = auth.AccountBase + "/app"
	}
	qs := url.Values{}
	qs.Set("rpcids", rpcID)
	qs.Set("source-path", sourcePath)
	qs.Set("f.sid", auth.BoqFsid)
	qs.Set("bl", auth.BoqBl)
	qs.Set("hl", "en")
	qs.Set("_reqid", strconv.FormatInt(nextBatchexecuteReqID()*1000+100, 10))
	qs.Set("rt", "c")

	relURL := fmt.Sprintf("%s/_/DynamiteWebUi/data/batchexecute?%s", auth.AccountBase, qs.Encode())
	formBody := fmt.Sprintf("f.req=%s&at=%s&",
		url.QueryEscape(string(fReq)),
		url.QueryEscape(auth.BoqAt),
	)

	headers := map[string]string{
		"Content-Type":  "application/x-www-form-urlencoded;charset=UTF-8",
		"X-Same-Domain": "1",
	}
	resp, err := chatProxyCall(ctx, h, ProxyCall{
		URL:     relURL,
		Method:  "POST",
		Headers: headers,
		Body:    formBody,
	})
	if err != nil {
		return "", err
	}
	if !resp.OK || resp.Status < 200 || resp.Status >= 300 {
		return "", fmt.Errorf("batchexecute %s: status=%d err=%s", rpcID, resp.Status, resp.Error)
	}
	return resp.Response, nil
}

// parseBatchexecuteFrames strips the )]}' XSSI prefix and pulls the inner JSON
// payload of the named rpcID's wrb.fr frame.
func parseBatchexecuteFrames(text, rpcID string) (any, error) {
	body := strings.TrimLeft(text, " \r\n\t")
	body = strings.TrimPrefix(body, ")]}'")
	body = strings.TrimLeft(body, " \r\n\t")
	pos := 0
	for pos < len(body) {
		nl := strings.IndexByte(body[pos:], '\n')
		if nl < 0 {
			break
		}
		lenStr := strings.TrimSpace(body[pos : pos+nl])
		n, err := strconv.Atoi(lenStr)
		if err != nil || n <= 0 {
			pos = pos + nl + 1
			continue
		}
		frameStart := pos + nl + 1
		if frameStart+n > len(body) {
			break
		}
		frame := body[frameStart : frameStart+n]
		pos = frameStart + n
		var arr []any
		if err := json.Unmarshal([]byte(frame), &arr); err != nil {
			continue
		}
		for _, item := range arr {
			it, ok := item.([]any)
			if !ok || len(it) < 3 {
				continue
			}
			if tag, _ := it[0].(string); tag != "wrb.fr" {
				continue
			}
			if rid, _ := it[1].(string); rid != rpcID {
				continue
			}
			innerStr, _ := it[2].(string)
			if innerStr == "" {
				continue
			}
			var inner any
			if err := json.Unmarshal([]byte(innerStr), &inner); err != nil {
				return nil, fmt.Errorf("decode inner: %w", err)
			}
			return inner, nil
		}
	}
	return nil, fmt.Errorf("no wrb.fr frame for rpc %s", rpcID)
}

// --- specific RPC wrappers --------------------------------------------------

// SyncTopic is the (topic_id, parent_space) pair returned by list_topics.
type syncTopic struct {
	TopicID  string
	SpaceKey string
}

// listTopics calls oGiIKf and returns one page of topic ids. Pagination via
// pageToken; pass "" on the first call.
func listTopics(ctx context.Context, h *hub.Hub, spaceKey, pageToken string) (topics []syncTopic, nextPageToken string, err error) {
	spaceID := spaceIDFromKey(spaceKey)
	var pt any
	if pageToken != "" {
		pt = pageToken
	}
	innerReq := []any{[]any{[]any{spaceID}}, 50, pt}
	text, err := batchexecuteCall(ctx, h, "oGiIKf", innerReq, "")
	if err != nil {
		return nil, "", err
	}
	inner, err := parseBatchexecuteFrames(text, "oGiIKf")
	if err != nil {
		return nil, "", err
	}
	arr, ok := inner.([]any)
	if !ok {
		return nil, "", nil
	}
	out := []syncTopic{}
	if len(arr) > 0 {
		if list, ok := arr[0].([]any); ok {
			for _, t := range list {
				tt, ok := t.([]any)
				if !ok || len(tt) == 0 {
					continue
				}
				h0, ok := tt[0].([]any)
				if !ok || len(h0) < 2 {
					continue
				}
				tid, _ := h0[1].(string)
				if tid == "" {
					continue
				}
				out = append(out, syncTopic{TopicID: tid, SpaceKey: spaceKey})
			}
		}
	}
	if len(arr) > 1 {
		nextPageToken, _ = arr[1].(string)
	}
	return out, nextPageToken, nil
}

// syncMessageGo is the wire-shape message we hand to the existing sync-history
// batch insert path.
type syncMessageGo struct {
	MessageID  string `json:"message_id"`
	SpaceKey   string `json:"space_key"`
	SpaceName  string `json:"space_name"`
	ThreadKey  string `json:"thread_key"`
	SenderID   string `json:"sender_id"`
	SenderName string `json:"sender_name"`
	Body       string `json:"body"`
	ObservedAt string `json:"observed_at"`
	Mentioned  bool   `json:"mentioned"`
}

// getTopicMessages calls QyR6M for a single topic.
func getTopicMessages(ctx context.Context, h *hub.Hub, spaceKey, topicID, spaceName string) ([]syncMessageGo, error) {
	spaceID := spaceIDFromKey(spaceKey)
	innerReq := []any{[]any{[]any{spaceID}}, topicID, 100, nil}
	text, err := batchexecuteCall(ctx, h, "QyR6M", innerReq, "")
	if err != nil {
		return nil, err
	}
	inner, err := parseBatchexecuteFrames(text, "QyR6M")
	if err != nil {
		return nil, err
	}
	arr, ok := inner.([]any)
	if !ok || len(arr) == 0 {
		return nil, nil
	}
	msgList, ok := arr[0].([]any)
	if !ok {
		return nil, nil
	}
	var out []syncMessageGo
	for _, m := range msgList {
		mm, ok := m.([]any)
		if !ok || len(mm) < 10 {
			continue
		}
		h0, _ := mm[0].([]any)
		if len(h0) < 2 {
			continue
		}
		msgID, _ := h0[1].(string)
		if msgID == "" {
			continue
		}
		sender, _ := mm[1].([]any)
		senderID := ""
		senderName := ""
		if len(sender) >= 2 {
			if sid0, _ := sender[0].([]any); len(sid0) > 0 {
				senderID, _ = sid0[0].(string)
			}
			senderName, _ = sender[1].(string)
		}
		observedAt := nowIsoUTC()
		if ts, _ := mm[2].(string); ts != "" {
			if us, err := strconv.ParseInt(ts, 10, 64); err == nil && us > 0 {
				observedAt = microsToISO(us)
			}
		}
		body, _ := mm[9].(string)
		if body == "" {
			continue
		}
		out = append(out, syncMessageGo{
			MessageID:  fmt.Sprintf("spaces/%s/messages/%s", spaceID, msgID),
			SpaceKey:   spaceKey,
			SpaceName:  spaceName,
			ThreadKey:  topicID,
			SenderID:   formatSenderID(senderID),
			SenderName: senderName,
			Body:       body,
			ObservedAt: observedAt,
			Mentioned:  strings.Contains(body, "@"),
		})
	}
	return out, nil
}

func formatSenderID(raw string) string {
	if raw == "" {
		return ""
	}
	return "users/" + raw
}

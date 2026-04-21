// Package parser decodes Google Chat's internal list_topics / list_members
// JSON array responses into our own Message struct.
//
// The wire format is an undocumented, index-based nested array (protobuf-like
// serialization). Field positions were discovered empirically by observing
// captured responses in the raw_events table. Expect periodic breakage when
// Google adds/reorders fields — this is the tradeoff for bypassing the
// public API entirely.
package parser

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

// ParsedMessage is a decoded Chat message.
type ParsedMessage struct {
	MessageID   string
	SpaceKey    string // e.g. "space:AAQA209tk3g"
	TopicID     string // thread id within the space
	SenderEmail string
	SenderName  string
	SenderID    string
	Body        string
	ObservedAt  time.Time
}

// ParseListTopicsResponse takes the raw response body of
// /u/0/api/list_topics and returns all messages it contains.
// Returns (nil, nil) when the payload is empty or not a list_topics response.
func ParseListTopicsResponse(body string) ([]ParsedMessage, error) {
	body = strings.TrimSpace(body)
	body = strings.TrimPrefix(body, ")]}'")
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, nil
	}
	var root any
	if err := json.Unmarshal([]byte(body), &root); err != nil {
		return nil, err
	}

	// Expected shape: [["dfe.t.lt", [topic1, topic2, ...]]]
	outer, ok := root.([]any)
	if !ok || len(outer) == 0 {
		return nil, nil
	}
	first, ok := outer[0].([]any)
	if !ok || len(first) < 2 {
		return nil, nil
	}
	method, _ := first[0].(string)
	if !strings.Contains(method, "lt") {
		// not a list_topics response
		return nil, nil
	}
	topicsList, ok := first[1].([]any)
	if !ok {
		return nil, nil
	}

	var out []ParsedMessage
	for _, t := range topicsList {
		topic, ok := t.([]any)
		if !ok || len(topic) < 7 {
			continue
		}
		topicKey, spaceKey := extractTopicAndSpace(topic)
		msgs, ok := topic[6].([]any)
		if !ok {
			continue
		}
		for _, m := range msgs {
			pm := parseMessage(m, spaceKey, topicKey)
			if pm != nil {
				out = append(out, *pm)
			}
		}
	}
	return out, nil
}

// topic[0] looks like [null, "<topicId>", [["<spaceId>"]]].
func extractTopicAndSpace(topic []any) (topicID, spaceKey string) {
	if len(topic) == 0 {
		return "", ""
	}
	head, ok := topic[0].([]any)
	if !ok {
		return "", ""
	}
	if len(head) >= 2 {
		topicID, _ = head[1].(string)
	}
	if len(head) >= 3 {
		if spaceBox, ok := head[2].([]any); ok && len(spaceBox) > 0 {
			if spaceArr, ok := spaceBox[0].([]any); ok && len(spaceArr) > 0 {
				if s, ok := spaceArr[0].(string); ok {
					spaceKey = "space:" + s
				}
			}
		}
	}
	return topicID, spaceKey
}

func parseMessage(raw any, spaceKey, topicID string) *ParsedMessage {
	msg, ok := raw.([]any)
	if !ok || len(msg) < 10 {
		return nil
	}

	// msg[0] = [[...], "message_id"]
	var msgID string
	if idWrapper, ok := msg[0].([]any); ok && len(idWrapper) >= 2 {
		msgID, _ = idWrapper[1].(string)
	}
	if msgID == "" {
		return nil
	}

	// msg[1] = sender info:
	//   [[user_id], display_name, avatar_url, email, family_name, given_name, is_bot, ...]
	var senderName, senderEmail, senderID string
	if sender, ok := msg[1].([]any); ok {
		if len(sender) >= 1 {
			if idArr, ok := sender[0].([]any); ok && len(idArr) > 0 {
				senderID, _ = idArr[0].(string)
			}
		}
		if len(sender) >= 2 {
			senderName, _ = sender[1].(string)
		}
		if len(sender) >= 4 {
			senderEmail, _ = sender[3].(string)
		}
	}

	// msg[2] = timestamp in microseconds, as a string.
	var observed time.Time
	if ts, ok := msg[2].(string); ok && ts != "" {
		if n, err := strconv.ParseInt(ts, 10, 64); err == nil {
			observed = time.Unix(0, n*int64(time.Microsecond))
		}
	}

	// msg[9] = body text.
	body, _ := msg[9].(string)

	// Messages with no body (e.g. system events, reactions-only) are skipped.
	if body == "" {
		return nil
	}

	return &ParsedMessage{
		MessageID:   msgID,
		SpaceKey:    spaceKey,
		TopicID:     topicID,
		SenderEmail: senderEmail,
		SenderName:  senderName,
		SenderID:    senderID,
		Body:        body,
		ObservedAt:  observed,
	}
}

// ErrNotListTopics is returned when the response URL is not a list_topics call.
var ErrNotListTopics = errors.New("not a list_topics response")

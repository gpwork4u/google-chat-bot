package parser

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"time"
)

// SearchMessage is one message pulled out of a /DynamiteWebUi/data/batchexecute
// response with rpc SBNmJb (sender-ldap search). Every result in that RPC has
// the search target as its sender, so all rows here are messages the local
// user sent themselves — ideal for a style corpus.
type SearchMessage struct {
	MessageKey string
	SpaceID    string // "AAQAtHR3g_s"
	SpaceKey   string // "space:AAQAtHR3g_s"
	SenderID   string // Google numeric user id
	Body       string
	ObservedAt time.Time
}

// SearchPage is the decoded result of one batchexecute request.
type SearchPage struct {
	LdapFilter      string // echoed back in inner[6]
	Messages        []SearchMessage
	OldestObserved  time.Time
	NewestObserved  time.Time
}

// ParseBatchExecuteSBNmJb decodes a batchexecute SBNmJb response. Format:
//
//	)]}'
//	<len>
//	[["wrb.fr","SBNmJb","<json-stringified-inner>",null,null,null,"3"]]
//	<len>
//	[["di",...]]
//	...
//
// We ignore the length lines (json.Decoder skips the numeric tokens) and
// scan for the wrb.fr envelope. inner[9] is the message list; each entry is
// [ payload_array, relevance_score ].
func ParseBatchExecuteSBNmJb(body []byte) (*SearchPage, error) {
	body = bytes.TrimPrefix(body, []byte(")]}'"))
	body = bytes.TrimLeft(body, " \t\r\n")

	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()

	page := &SearchPage{}
	for {
		var v any
		if err := dec.Decode(&v); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			// a stray length number sitting between arrays arrives as
			// json.Number; that gets decoded cleanly so any error here is real
			return nil, err
		}
		arr, ok := v.([]any)
		if !ok {
			continue
		}
		for _, item := range arr {
			entry, ok := item.([]any)
			if !ok || len(entry) < 3 {
				continue
			}
			tag, _ := entry[0].(string)
			if tag != "wrb.fr" {
				continue
			}
			innerStr, ok := entry[2].(string)
			if !ok || innerStr == "" {
				continue
			}
			if err := parseInner(innerStr, page); err != nil {
				return nil, err
			}
		}
	}
	return page, nil
}

func parseInner(s string, page *SearchPage) error {
	var inner []any
	dec := json.NewDecoder(bytes.NewReader([]byte(s)))
	dec.UseNumber()
	if err := dec.Decode(&inner); err != nil {
		return err
	}
	if len(inner) < 10 {
		return nil
	}
	if ldap, ok := inner[6].(string); ok {
		page.LdapFilter = ldap
	}
	list, ok := inner[9].([]any)
	if !ok {
		return nil
	}
	for _, rec := range list {
		recArr, ok := rec.([]any)
		if !ok || len(recArr) == 0 {
			continue
		}
		payload, ok := recArr[0].([]any)
		if !ok || len(payload) < 17 {
			continue
		}
		msg := SearchMessage{}
		if s, ok := payload[1].(string); ok {
			msg.MessageKey = s
		}
		if box, ok := payload[2].([]any); ok && len(box) >= 2 {
			if s, ok := box[1].(string); ok {
				msg.SpaceID = s
				msg.SpaceKey = "space:" + s
			}
		}
		if sender, ok := payload[4].([]any); ok && len(sender) > 0 {
			if s, ok := sender[0].(string); ok {
				msg.SenderID = s
			}
		}
		if s, ok := payload[5].(string); ok {
			msg.Body = s
		}
		// Timestamp: payload[16] is ms as a number; payload[11] is μs as string.
		// Prefer [16] because it's already numeric.
		if n, ok := payload[16].(json.Number); ok {
			if ms, err := n.Int64(); err == nil && ms > 0 {
				msg.ObservedAt = time.Unix(0, ms*int64(time.Millisecond))
			}
		}
		if msg.ObservedAt.IsZero() {
			if s, ok := payload[11].(string); ok && s != "" {
				msg.ObservedAt = parseMicroTS(s)
			}
		}
		if msg.MessageKey == "" || msg.Body == "" {
			continue
		}
		page.Messages = append(page.Messages, msg)
	}

	if len(page.Messages) > 0 {
		page.OldestObserved = page.Messages[0].ObservedAt
		page.NewestObserved = page.Messages[0].ObservedAt
		for _, m := range page.Messages[1:] {
			if m.ObservedAt.Before(page.OldestObserved) {
				page.OldestObserved = m.ObservedAt
			}
			if m.ObservedAt.After(page.NewestObserved) {
				page.NewestObserved = m.ObservedAt
			}
		}
	}
	return nil
}

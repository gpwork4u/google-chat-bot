package parser

import (
	"encoding/json"
	"strconv"
	"time"
)

// ParseWebchannelFrame extracts new-message events out of a single decoded
// BrowserChannel frame (as captured by inject-main.js on
// /u/N/webchannel/events).
//
// Empirically (see raw_events samples 9488 / id with event code 20), a
// "message create" frame nests a record of the form:
//
//	[
//	  msg_handle,           // [0]  array/struct containing the short message id
//	  [[sender_user_id]],   // [1]  always [[string]]
//	  created_us_string,    // [2]  microsecond timestamp as digits string
//	  modified_us_string,   // [3]  ditto
//	  null, null, null, null, null,  // [4..8]
//	  body_text,            // [9]  the body (string)
//	  ...                   // trailing fields we don't need
//	]
//
// Because the frame layout has multiple nesting layers that differ slightly
// between event types, we walk the tree and pick out every sub-array that
// matches the record shape. This is resilient to structural drift; the
// trade-off is that non-message records with matching shapes could slip in,
// so the heuristic is deliberately strict (all five key fields must validate).
func ParseWebchannelFrame(raw json.RawMessage) ([]ParsedMessage, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var root any
	if err := json.Unmarshal(raw, &root); err != nil {
		return nil, err
	}
	var out []ParsedMessage
	seen := map[string]struct{}{}
	walkFrame(root, &out, seen)
	return out, nil
}

func walkFrame(v any, out *[]ParsedMessage, seen map[string]struct{}) {
	arr, ok := v.([]any)
	if !ok {
		return
	}
	if pm := tryParseMessageRecord(arr); pm != nil {
		if _, dup := seen[pm.MessageID]; !dup {
			seen[pm.MessageID] = struct{}{}
			*out = append(*out, *pm)
		}
		// Don't recurse into a parsed record — its children are internal fields
		// (reactions, formatting) that won't contain nested messages.
		return
	}
	for _, item := range arr {
		walkFrame(item, out, seen)
	}
}

func tryParseMessageRecord(arr []any) *ParsedMessage {
	if len(arr) < 10 {
		return nil
	}
	// arr[9] must be a non-empty string — the body.
	body, ok := arr[9].(string)
	if !ok || body == "" {
		return nil
	}
	// arr[1] must look like [[user_id_string]].
	senderArr, ok := arr[1].([]any)
	if !ok || len(senderArr) == 0 {
		return nil
	}
	senderInner, ok := senderArr[0].([]any)
	if !ok || len(senderInner) == 0 {
		return nil
	}
	senderID, ok := senderInner[0].(string)
	if !ok || senderID == "" || !allDigits(senderID) {
		return nil
	}
	// arr[2] & arr[3] must be digit strings (μs timestamps).
	created, ok := arr[2].(string)
	if !ok || !allDigits(created) {
		return nil
	}
	if s, ok := arr[3].(string); !ok || !allDigits(s) {
		return nil
	}

	// Derive message key + space key from arr[0] (the msg handle). The handle
	// nests the short message id and the space token somewhere; search for
	// the first occurrence of each pattern.
	msgKey, spaceID := extractHandle(arr[0])
	if msgKey == "" {
		// Fallback: some frames put the short id later in the record.
		// arr[13] tends to repeat it, but we require arr[0] to succeed.
		return nil
	}

	ts := parseMicroTS(created)
	spaceKey := ""
	if spaceID != "" {
		spaceKey = "space:" + spaceID
	}

	return &ParsedMessage{
		MessageID:  msgKey,
		SpaceKey:   spaceKey,
		Body:       body,
		SenderID:   senderID,
		ObservedAt: ts,
	}
}

// extractHandle walks the msg handle (arr[0] of a message record) and returns
// (short_message_id, raw_space_id). The handle looks like one of:
//
//	[null, "K8aX5ieuMrc", [["AAQAtHR3g_s"]]]
//	[[null, null, null, [null, "K8aX5ieuMrc", [["AAQAtHR3g_s"]]]], "K8aX5ieuMrc"]
//
// so we just find the first string that looks like a short id and the first
// string that looks like a space id (AAQA… prefix).
func extractHandle(v any) (msgKey, spaceID string) {
	var visit func(any)
	visit = func(node any) {
		switch n := node.(type) {
		case []any:
			for _, c := range n {
				visit(c)
			}
		case string:
			if spaceID == "" && looksLikeSpaceID(n) {
				spaceID = n
			} else if msgKey == "" && looksLikeShortID(n) {
				msgKey = n
			}
		}
		_ = msgKey // silence staticcheck; both may still be empty
	}
	visit(v)
	return msgKey, spaceID
}

func looksLikeSpaceID(s string) bool {
	// Space IDs in webchannel frames are ~11-char base64url tokens that
	// start with "AA" (observed: AAQA…, AAAA…, AAAB…). Message short ids
	// are base64url with a ~1/4000 chance of starting with "AA" themselves;
	// we rely on extractHandle's visit order (msg_key at top-level first,
	// space_id nested inside [[…]]) to disambiguate when both do.
	if len(s) < 6 || len(s) > 32 {
		return false
	}
	if s[0] != 'A' || s[1] != 'A' {
		return false
	}
	for _, r := range s {
		if !(r >= 'A' && r <= 'Z') && !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9') && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

func looksLikeShortID(s string) bool {
	// Short message IDs are ~11-char base64-url tokens that are not pure
	// digits (rules out timestamps) and don't start with AAQA.
	if len(s) < 6 || len(s) > 32 {
		return false
	}
	if looksLikeSpaceID(s) {
		return false
	}
	if allDigits(s) {
		return false
	}
	// Must be URL-safe alphanumerics plus - _ / etc.
	for _, r := range s {
		if !(r >= 'a' && r <= 'z') && !(r >= 'A' && r <= 'Z') && !(r >= '0' && r <= '9') && r != '-' && r != '_' {
			return false
		}
	}
	return true
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func parseMicroTS(s string) time.Time {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return time.Time{}
	}
	return time.Unix(0, n*int64(time.Microsecond))
}

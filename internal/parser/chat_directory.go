package parser

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"strings"
)

// ParseBatchExecuteUIgx0 decodes a batchexecute UIgx0 response — the RPC
// behind Chat's "Members" / space-management panel. Despite being scoped
// to a single space in the URL, the response is effectively a directory
// listing of every human the local user can see (roughly the org roster
// + external contacts that appear in any shared space).
//
// Response envelope matches SBNmJb / jfcZG: )]}' prefix, length header,
// then [["wrb.fr","UIgx0","<inner-json>", ...]].
//
// Inner json shape (after json.Unmarshal of the stringified payload):
//
//	[
//	  [ entry, entry, ... ],   // inner[0]: the member list
//	  <cursor / meta slots>
//	]
//
// Each entry nests a user tuple we care about at entry[1][1]:
//
//	entry = [
//	  header,                                                     // entry[0]
//	  [ user_ref,                                                 // entry[1][0]
//	    [ id, display_name, avatar_url, email, null, true,        // entry[1][1]
//	      short_name, 1, ... ],
//	    null, true ],                                             // entry[1][2..]
//	]
//
// We pull id + display_name + email. Avatars are ignored — the UI only
// surfaces names today, and carrying thousands of signed CDN URLs just
// bloats spaces_directory without upside.
func ParseBatchExecuteUIgx0(body []byte) ([]MemberProfile, error) {
	trimmed := bytes.TrimPrefix(body, []byte(")]}'"))
	trimmed = bytes.TrimLeft(trimmed, " \t\r\n")

	dec := json.NewDecoder(bytes.NewReader(trimmed))
	dec.UseNumber()

	var out []MemberProfile
	parseErr := false
	for {
		var v any
		if err := dec.Decode(&v); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			// Decoder hit malformed bytes — most often a captured response
			// that was truncated before its closing quotes / brackets. Fall
			// back to regex scanning below rather than returning nothing.
			parseErr = true
			break
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
			users, err := decodeUIgx0Inner(innerStr)
			if err != nil {
				// Same rationale: keep whatever we got and fall through.
				parseErr = true
				continue
			}
			out = append(out, users...)
		}
	}
	if parseErr {
		// Merge anything the regex scanner finds (dedupe by id).
		seen := make(map[string]struct{}, len(out))
		for _, m := range out {
			seen[m.ID] = struct{}{}
		}
		for _, m := range extractUIgx0UsersByRegex(body) {
			if _, ok := seen[m.ID]; ok {
				continue
			}
			seen[m.ID] = struct{}{}
			out = append(out, m)
		}
	}
	return out, nil
}

// uigx0UserPat matches a user tuple inside the JSON-string-encoded inner
// payload. Because the inner is already escaped for transport, every `"`
// is represented as `\"` in the raw bytes. The URL slot can contain its
// own escape sequences (`=`, `\"`, etc.), so we match it via an
// alternation that tolerates `\` followed by any char.
//
//	\"<id>\",\"<name>\",\"<url|escape>*\",\"<email>\"
//
// Used as a fallback when the response was truncated mid-string by the
// extension's old 50KB capture cap.
var uigx0UserPat = regexp.MustCompile(`\\"(\d{15,25})\\",\\"([^\\"]+)\\",\\"(?:[^\\"]|\\\\.)+\\",\\"([^\\"]+@[^\\"]+)\\"`)

func extractUIgx0UsersByRegex(body []byte) []MemberProfile {
	seen := map[string]struct{}{}
	var out []MemberProfile
	for _, m := range uigx0UserPat.FindAllSubmatch(body, -1) {
		id := strings.TrimSpace(string(m[1]))
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, MemberProfile{
			ID:          id,
			DisplayName: strings.TrimSpace(string(m[2])),
			Email:       strings.TrimSpace(string(m[3])),
		})
	}
	return out
}

func decodeUIgx0Inner(s string) ([]MemberProfile, error) {
	var inner []any
	dec := json.NewDecoder(bytes.NewReader([]byte(s)))
	dec.UseNumber()
	if err := dec.Decode(&inner); err != nil {
		return nil, err
	}
	if len(inner) < 1 {
		return nil, nil
	}
	list, ok := inner[0].([]any)
	if !ok {
		return nil, nil
	}
	var out []MemberProfile
	for _, rec := range list {
		entry, ok := rec.([]any)
		if !ok || len(entry) < 2 {
			continue
		}
		userBox, ok := entry[1].([]any)
		if !ok || len(userBox) < 2 {
			continue
		}
		info, ok := userBox[1].([]any)
		if !ok || len(info) < 2 {
			continue
		}
		id, _ := info[0].(string)
		name, _ := info[1].(string)
		var email string
		if len(info) >= 4 {
			if s, ok := info[3].(string); ok && strings.Contains(s, "@") {
				email = s
			}
		}
		id = strings.TrimSpace(id)
		name = strings.TrimSpace(name)
		email = strings.TrimSpace(email)
		if id == "" {
			continue
		}
		out = append(out, MemberProfile{
			ID:          id,
			DisplayName: name,
			Email:       email,
		})
	}
	return out, nil
}

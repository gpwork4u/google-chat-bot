package parser

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

// ParseBatchExecuteJfcZG decodes a batchexecute jfcZG response — the RPC
// that powers Chat's "Browse spaces" panel. One call returns the full
// list of spaces the user has visibility into (joined rooms + browsable
// rooms + DMs), so it's our one-shot way to populate spaces_directory
// for every space_key that shows up in SBNmJb / message ingest but that
// the user hasn't opened directly in the UI (and therefore never had a
// per-space get_group fired for).
//
// Response envelope is the same batchexecute shape used by SBNmJb:
//
//	)]}'
//	<len>
//	[["wrb.fr","jfcZG","<inner-json>",null,null,null,"3"]]
//	<len>
//	[["e",4,null,null,<ms>]]
//
// Inner json (after json.Unmarshal) is a two-slot array:
//
//	["", [ entry, entry, ... ]]
//
// And each entry is:
//
//	entry[0][0][0]  space_id  (e.g. "AAQAGWm02b8")
//	entry[1]        display name
//	entry[2]        description (nullable)
//	entry[5]        kind  (2 = joined room, 3 = browsable / alert-style room)
//
// Other slots (avatar URL, emoji, flags, member-count tuples) are
// ignored — we only want space_id → name/description for directory.
func ParseBatchExecuteJfcZG(body []byte) ([]ParsedSpace, error) {
	body = bytes.TrimPrefix(body, []byte(")]}'"))
	body = bytes.TrimLeft(body, " \t\r\n")

	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()

	var out []ParsedSpace
	for {
		var v any
		if err := dec.Decode(&v); err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
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
			inner, err := decodeJfcZGInner(innerStr)
			if err != nil {
				return nil, err
			}
			out = append(out, inner...)
		}
	}
	return out, nil
}

func decodeJfcZGInner(s string) ([]ParsedSpace, error) {
	var inner []any
	dec := json.NewDecoder(bytes.NewReader([]byte(s)))
	dec.UseNumber()
	if err := dec.Decode(&inner); err != nil {
		return nil, err
	}
	if len(inner) < 2 {
		return nil, nil
	}
	list, ok := inner[1].([]any)
	if !ok {
		return nil, nil
	}
	var out []ParsedSpace
	for _, rec := range list {
		entry, ok := rec.([]any)
		if !ok || len(entry) < 2 {
			continue
		}
		id := extractJfcZGSpaceID(entry[0])
		if id == "" {
			continue
		}
		name, _ := entry[1].(string)
		if name == "" {
			continue
		}
		out = append(out, ParsedSpace{
			SpaceKey:  "space:" + id,
			SpaceName: name,
		})
	}
	return out, nil
}

// extractJfcZGSpaceID reads space_id out of entry[0], which nests as
// [[<space_id>]]. Defensive against schema drift — returns "" if the
// shape doesn't match rather than panicking.
func extractJfcZGSpaceID(v any) string {
	outer, ok := v.([]any)
	if !ok || len(outer) == 0 {
		return ""
	}
	mid, ok := outer[0].([]any)
	if !ok || len(mid) == 0 {
		return ""
	}
	id, _ := mid[0].(string)
	return id
}

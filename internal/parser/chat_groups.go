package parser

import (
	"encoding/json"
	"strings"
)

type ParsedSpace struct {
	SpaceKey  string
	SpaceName string
}

// ParseGetGroupResponse extracts a human-readable space name from Chat's
// internal /api/get_group response.
func ParseGetGroupResponse(body string) (*ParsedSpace, error) {
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

	outer, ok := root.([]any)
	if !ok || len(outer) == 0 {
		return nil, nil
	}
	first, ok := outer[0].([]any)
	if !ok || len(first) < 2 {
		return nil, nil
	}
	method, _ := first[0].(string)
	if !strings.Contains(method, "g.gg") {
		return nil, nil
	}

	group, ok := first[1].([]any)
	if !ok || len(group) == 0 {
		return nil, nil
	}

	spaceID := extractSpaceID(group)
	if spaceID == "" {
		return nil, nil
	}

	name := extractSpaceName(group)
	if strings.TrimSpace(name) == "" {
		return nil, nil
	}

	return &ParsedSpace{
		SpaceKey:  "space:" + spaceID,
		SpaceName: name,
	}, nil
}

func extractSpaceID(group []any) string {
	if len(group) == 0 {
		return ""
	}
	box, ok := group[0].([]any)
	if !ok || len(box) == 0 {
		return ""
	}
	ids, ok := box[0].([]any)
	if !ok || len(ids) == 0 {
		return ""
	}
	id, _ := ids[0].(string)
	return id
}

func extractSpaceName(group []any) string {
	if len(group) > 1 {
		if name, _ := group[1].(string); strings.TrimSpace(name) != "" {
			return strings.TrimSpace(name)
		}
	}
	// GROUP_DM payloads often store the display title at index 33:
	// [[memberIds...], false, "Alice, Bob"].
	if len(group) > 33 {
		if dmInfo, ok := group[33].([]any); ok && len(dmInfo) >= 3 {
			if name, _ := dmInfo[2].(string); strings.TrimSpace(name) != "" {
				return strings.TrimSpace(name)
			}
		}
	}
	return ""
}

package parser

import (
	"encoding/json"
	"strings"
)

// MemberProfile is an entry pulled out of a list_members response that
// happened to include the full profile block (name / email / avatar).
type MemberProfile struct {
	ID          string
	DisplayName string
	Email       string
	AvatarURL   string
}

// ParseListMembersProfiles extracts the optional profile list embedded in
// a /u/N/api/list_members response. The wire shape is a flat array where
// each field occupies its own top-level position:
//
//	[[ "dfe.mem.lm", ids_list, profile_list, "", [ts], ..., true, null, [1] ]]
//	              └ [0]      └ [1]         └ [2]   └ [3]…
//
// profile_list (at first[2]) is either absent / empty — in which case we
// return nothing — or an array where each entry is one of:
//
//	[ [[user_id], name, avatar, email,  family, given, ...] ]           // human (len 1)
//	[ null, [[user_id], name, avatar, int, email, ...] ]                 // group / bot (len 2)
//
// For both we pull id + name + email. A profile with no recoverable
// member_id is skipped rather than returned with an empty ID.
func ParseListMembersProfiles(body string) ([]MemberProfile, error) {
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
	if !ok || len(first) < 3 {
		return nil, nil
	}
	method, _ := first[0].(string)
	if !strings.Contains(method, "lm") {
		return nil, nil
	}
	profileList, ok := first[2].([]any)
	if !ok {
		return nil, nil
	}
	var out []MemberProfile
	for _, p := range profileList {
		prof := parseProfile(p)
		if prof != nil {
			out = append(out, *prof)
		}
	}
	return out, nil
}

func parseProfile(raw any) *MemberProfile {
	arr, ok := raw.([]any)
	if !ok || len(arr) == 0 {
		return nil
	}

	// Each profile entry is always wrapped by one extra array layer:
	//   [ [ [id], name, avatar, email, ... ] ]            — human
	//   [ null, [ [id], name, avatar, int, email, ... ] ] — group / bot
	// Core is the first non-nil inner array we find.
	var core []any
	for _, item := range arr {
		if c, ok := item.([]any); ok && len(c) > 0 {
			core = c
			break
		}
	}
	if len(core) < 2 {
		return nil
	}

	memberID := extractMemberID(core[0])
	if memberID == "" {
		return nil
	}
	name, _ := core[1].(string)
	var avatar string
	if len(core) >= 3 {
		avatar, _ = core[2].(string)
	}
	// Email lives at core[3] for human members, core[4] for groups (core[3]
	// being an int in that shape). Accept either as long as it contains "@".
	email := stringWithAt(indexOr(core, 3))
	if email == "" {
		email = stringWithAt(indexOr(core, 4))
	}

	return &MemberProfile{
		ID:          memberID,
		DisplayName: strings.TrimSpace(name),
		Email:       strings.TrimSpace(email),
		AvatarURL:   avatar,
	}
}

func extractMemberID(v any) string {
	arr, ok := v.([]any)
	if !ok || len(arr) == 0 {
		return ""
	}
	// Sometimes arr[0] is the id string directly; sometimes arr[0] is null
	// and arr[1] is [id_string].
	if s, ok := arr[0].(string); ok && s != "" {
		return s
	}
	if len(arr) >= 2 {
		if inner, ok := arr[1].([]any); ok && len(inner) > 0 {
			if s, ok := inner[0].(string); ok {
				return s
			}
		}
	}
	return ""
}

func stringWithAt(v any) string {
	s, ok := v.(string)
	if !ok {
		return ""
	}
	if !strings.Contains(s, "@") {
		return ""
	}
	return s
}

func indexOr(arr []any, i int) any {
	if i < 0 || i >= len(arr) {
		return nil
	}
	return arr[i]
}

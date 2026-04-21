package parser

import (
	"encoding/json"
	"strings"
)

// ParseGetUserSettings pulls the authenticated user's numeric Chat id out
// of a /u/N/api/get_user_settings response. Shape observed empirically:
//
//	[["dfe.uset.gus",[ [USER_ID], ts, null, flags, null, [...timestamps...], null,
//	                   [ ...settings flags, including ["DOMAIN",[DOMAIN_GAIA_ID],...] ] ]]]
//
// Returns "" with no error when the payload isn't a gus response.
func ParseGetUserSettings(body string) (string, error) {
	body = strings.TrimSpace(body)
	body = strings.TrimPrefix(body, ")]}'")
	body = strings.TrimSpace(body)
	if body == "" {
		return "", nil
	}
	var root any
	if err := json.Unmarshal([]byte(body), &root); err != nil {
		return "", err
	}
	outer, ok := root.([]any)
	if !ok || len(outer) == 0 {
		return "", nil
	}
	first, ok := outer[0].([]any)
	if !ok || len(first) < 2 {
		return "", nil
	}
	if m, _ := first[0].(string); !strings.Contains(m, "gus") {
		return "", nil
	}
	inner, ok := first[1].([]any)
	if !ok || len(inner) == 0 {
		return "", nil
	}
	idArr, ok := inner[0].([]any)
	if !ok || len(idArr) == 0 {
		return "", nil
	}
	id, _ := idArr[0].(string)
	return id, nil
}

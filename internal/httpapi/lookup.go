package httpapi

// lookup.go — unified ID → name resolver.
//
// Lets a caller pass any mix of space_keys / member_ids / emoji shortcodes
// and get back the human-readable label for each one. Built for the React
// UI: rather than calling /api/space-directory + /api/chat-members + parsing
// emoji catalog separately, pages can hit POST /api/lookup with whatever IDs
// they're rendering and get a single resolved map back.
//
//   POST /api/lookup
//     { "space_keys": ["space:AAQ..."], "member_ids": ["1234..."], "emojis": [":sadge:", "👌"] }
//   →
//     {
//       "spaces":  {"space:AAQ...": {"name":"FedGPT", "updated_at":"..."}},
//       "members": {"1234...":     {"name":"GP Wang", "email":"..."}},
//       "emojis":  {":sadge:":     {"type":"custom", "unicode":"", "shortcode":":sadge:"}}
//     }

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

type lookupRequest struct {
	SpaceKeys []string `json:"space_keys"`
	MemberIDs []string `json:"member_ids"`
	Emojis    []string `json:"emojis"`
}

func lookupRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("POST /api/lookup", func(w http.ResponseWriter, r *http.Request) {
		handleLookup(w, r, db, cfg)
	})
	// Convenience GET — call with ?space_keys=a,b&member_ids=c,d&emojis=:x:,:y:
	// for cases where forming a JSON body is overkill (curl, bookmarks).
	mux.HandleFunc("GET /api/lookup", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		req := lookupRequest{
			SpaceKeys: splitCSV(q.Get("space_keys")),
			MemberIDs: splitCSV(q.Get("member_ids")),
			Emojis:    splitCSV(q.Get("emojis")),
		}
		runLookup(w, r, db, cfg, req)
	})
}

func splitCSV(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if v := strings.TrimSpace(p); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func handleLookup(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config) {
	var req lookupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	runLookup(w, r, db, cfg, req)
}

func runLookup(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, req lookupRequest) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	spaces := map[string]map[string]any{}
	if len(req.SpaceKeys) > 0 {
		dir, err := db.ListSpaceDirectory(ctx, user.ID)
		if err == nil {
			byKey := map[string]store.SpaceDirectoryRow{}
			for _, d := range dir {
				byKey[d.SpaceKey] = d
			}
			for _, key := range req.SpaceKeys {
				lookup := key
				if !strings.HasPrefix(lookup, "space:") {
					lookup = "space:" + lookup
				}
				if d, ok := byKey[lookup]; ok {
					spaces[key] = map[string]any{
						"space_key":    d.SpaceKey,
						"display_name": d.DisplayName,
						"updated_at":   d.UpdatedAt,
					}
				} else {
					spaces[key] = nil
				}
			}
		}
	}

	members := map[string]map[string]any{}
	if len(req.MemberIDs) > 0 {
		// Strip the "users/" prefix that some APIs return; chat_members keys
		// by the raw numeric id.
		normalized := make([]string, 0, len(req.MemberIDs))
		origByNorm := map[string]string{}
		for _, id := range req.MemberIDs {
			norm := strings.TrimPrefix(id, "users/")
			normalized = append(normalized, norm)
			origByNorm[norm] = id
		}
		found, err := db.LookupChatMembers(ctx, user.ID, normalized)
		if err == nil {
			for _, norm := range normalized {
				orig := origByNorm[norm]
				if m, ok := found[norm]; ok {
					members[orig] = map[string]any{
						"member_id":    m.MemberID,
						"display_name": m.DisplayName,
						"email":        m.Email,
					}
				} else {
					members[orig] = nil
				}
			}
		}
	}

	emojis := map[string]map[string]any{}
	if len(req.Emojis) > 0 {
		emojiCatalogMu.RLock()
		for _, e := range req.Emojis {
			if entry, ok := emojiCatalog[e]; ok {
				emojis[e] = map[string]any{
					"type":      entry.Type,
					"shortcode": entry.Shortcode,
					"unicode":   entry.Unicode,
				}
			} else {
				emojis[e] = nil
			}
		}
		emojiCatalogMu.RUnlock()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"spaces":  spaces,
		"members": members,
		"emojis":  emojis,
	})
}

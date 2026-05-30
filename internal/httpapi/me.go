package httpapi

// me.go — GET /api/me
//
// Returns everything the backend has learned about the local user plus
// directory-size counts. Useful as a top-of-page "status" call so the UI
// can warn when chat_user_id is still empty (= worker hasn't ingested
// get_user_settings yet → self messages won't be tagged sender_is_me).

import (
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func meRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, err := requireLocalUser(ctx, db, cfg)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err.Error())
			return
		}

		chatUserID, name, email, _ := db.LookupSelfIdentity(ctx, user.ID)
		members, _ := db.CountChatMembers(ctx, user.ID)
		spaces, _ := db.ListSpaceDirectory(ctx, user.ID)

		// Self lookup row from chat_members (if worker has learned it)
		var selfMember *store.ChatMember
		if chatUserID != "" {
			selfMember, _ = db.LookupChatMember(ctx, user.ID, chatUserID)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"local_user_id": user.ID,
			"email":         user.Email,
			"name":          user.Name,
			"chat_user_id":  chatUserID,
			"learned_name":  name,
			"learned_email": email,
			"self_member":   selfMember,
			"counts": map[string]any{
				"chat_members":     members,
				"space_directory":  len(spaces),
				"emoji_catalog":    emojiCatalogCount(),
				"auth_state_alive": getAuthState() != nil,
			},
		})
	})
}

func emojiCatalogCount() int {
	emojiCatalogMu.RLock()
	defer emojiCatalogMu.RUnlock()
	return len(emojiCatalog)
}

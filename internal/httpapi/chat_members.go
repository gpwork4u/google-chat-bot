package httpapi

// chat_members.go — directory of known users (sender_id → name/email).
//
//   GET /api/chat-members
//     → { count, rows: [{member_id, display_name, email}, ...] }
//
// Populated passively by the worker from list_topics / list_members / UIgx0
// ingest. To kick a refresh, open the Members panel in Chat (fires UIgx0)
// or hit POST /api/space-directory/refresh to at least sync space names.

import (
	"net/http"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

func chatMembersRoutes(mux *http.ServeMux, db *store.DB, cfg *config.Config) {
	mux.HandleFunc("GET /api/chat-members", func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		user, err := requireLocalUser(ctx, db, cfg)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err.Error())
			return
		}
		rows, err := db.ListChatMembers(ctx, user.ID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out := make([]map[string]any, 0, len(rows))
		for _, m := range rows {
			out = append(out, map[string]any{
				"member_id":    m.MemberID,
				"display_name": m.DisplayName,
				"email":        m.Email,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"count": len(rows),
			"rows":  out,
		})
	})
}

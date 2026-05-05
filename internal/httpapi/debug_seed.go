package httpapi

// debug_seed.go — POST /api/debug/seed-drafts
//
// 批次建立 pending draft，供 QA e2e 測試使用。
// 只在 INJECT_DRAFT_ENABLED=1 或 NODE_ENV=development 時啟用。
//
// 請求 body 結構（與 test/support/helpers.ts seedDrafts() 相同）：
//
//	{
//	  "drafts": [
//	    {
//	      "id":               "draft-xxx",       // 忽略（DB 自動產生）
//	      "space_id":         "SPACE001",
//	      "space_name":       "Team #general",
//	      "sender_id":        "users/alice",
//	      "sender_name":      "Alice",
//	      "original_message": "你好，請問下午有空嗎？",
//	      "draft_content":    "好的，收到",
//	      "category":         "daily-chat",
//	      "context_messages": [...],            // 忽略（context 由 DB 查詢）
//	      "debug":            { ... },          // 選填
//	      "created_at":       "..."             // 忽略（DB 自動產生）
//	    }
//	  ]
//	}
//
// 成功回應：
//
//	{ "ok": true, "created": [draft_id, ...] }

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/hub"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// seedDraftItem 對應 helpers.ts makeDraft() 回傳的欄位。
// 未使用的欄位（id, context_messages, created_at）由資料庫決定，不從外部接受。
type seedDraftItem struct {
	SpaceID         string                 `json:"space_id"`
	SpaceName       string                 `json:"space_name"`
	SenderID        string                 `json:"sender_id"`
	SenderName      string                 `json:"sender_name"`
	OriginalMessage string                 `json:"original_message"`
	DraftContent    string                 `json:"draft_content"`
	Category        string                 `json:"category"`
	Debug           map[string]interface{} `json:"debug"`
}

type seedDraftsReq struct {
	Drafts []seedDraftItem `json:"drafts"`
}

// registerSeedDraftsRoute 由 draftsRoutes() 呼叫，在 dev / test 模式下註冊路由。
func registerSeedDraftsRoute(mux *http.ServeMux, db *store.DB, cfg *config.Config, h *hub.Hub) {
	mux.HandleFunc("POST /api/debug/seed-drafts", func(w http.ResponseWriter, r *http.Request) {
		handleDebugSeedDrafts(w, r, db, cfg, h)
	})
}

func handleDebugSeedDrafts(w http.ResponseWriter, r *http.Request, db *store.DB, cfg *config.Config, h *hub.Hub) {
	ctx := r.Context()
	user, err := requireLocalUser(ctx, db, cfg)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, err.Error())
		return
	}

	reset := r.URL.Query().Get("reset") == "1"

	// reset=1 表示先清空該使用者所有 pending drafts，常用於 BDD 場景之間的隔離
	if reset {
		if _, err := db.Exec(ctx, `DELETE FROM drafts WHERE message_id IN (SELECT id FROM messages WHERE user_id=$1) AND status='pending'`, user.ID); err != nil {
			writeErr(w, http.StatusInternalServerError, "reset drafts: "+err.Error())
			return
		}
	}

	var req seedDraftsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if len(req.Drafts) == 0 {
		// reset=1 且空陣列 = 純清空
		if reset {
			writeJSON(w, http.StatusOK, map[string]any{"ok": true, "created_ids": []int64{}})
			return
		}
		writeErr(w, http.StatusBadRequest, "drafts array is empty")
		return
	}
	if len(req.Drafts) > 100 {
		writeErr(w, http.StatusBadRequest, "too many drafts (max 100)")
		return
	}

	var createdIDs []int64

	for i, item := range req.Drafts {
		// 設定預設值
		if item.SpaceID == "" {
			item.SpaceID = "debug-space-" + strconv.Itoa(i)
		}
		if item.SpaceName == "" {
			item.SpaceName = "Debug Space " + strconv.Itoa(i)
		}
		if item.SenderName == "" {
			item.SenderName = "Debug User"
		}
		if item.OriginalMessage == "" {
			item.OriginalMessage = "test message " + strconv.Itoa(i)
		}
		if item.DraftContent == "" {
			item.DraftContent = "test draft reply " + strconv.Itoa(i)
		}

		// 建立訊息
		msg := &store.Message{
			UserID:     user.ID,
			SpaceKey:   item.SpaceID,
			SpaceName:  item.SpaceName,
			ThreadKey:  "seed-thread-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "-" + strconv.Itoa(i),
			MessageKey: "seed-msg-" + strconv.FormatInt(time.Now().UnixNano(), 10) + "-" + strconv.Itoa(i),
			SenderID:   item.SenderID,
			SenderName: item.SenderName,
			SenderIsMe: false,
			Body:       item.OriginalMessage,
			ObservedAt: time.Now(),
		}
		if _, err := db.InsertOrGetMessage(ctx, msg); err != nil {
			writeErr(w, http.StatusInternalServerError, "insert message["+strconv.Itoa(i)+"]: "+err.Error())
			return
		}

		// 取出 debug.categorize_reason（若有）
		reasoning := ""
		if item.Debug != nil {
			if v, ok := item.Debug["categorize_reason"].(string); ok {
				reasoning = v
			}
		}

		// 建立 pending draft
		d := &store.Draft{
			MessageID: msg.ID,
			Body:      item.DraftContent,
			Model:     "seed",
			Status:    "pending",
			SendMode:  "new_topic",
			Reasoning: reasoning,
		}
		if err := db.InsertDraft(ctx, d); err != nil {
			writeErr(w, http.StatusInternalServerError, "insert draft["+strconv.Itoa(i)+"]: "+err.Error())
			return
		}

		createdIDs = append(createdIDs, d.ID)
	}

	if h != nil {
		h.InboxChanged()
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"ok":      true,
		"created": createdIDs,
	})
}

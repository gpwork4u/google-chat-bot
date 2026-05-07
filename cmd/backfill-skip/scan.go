// scan.go — 透過 GET /api/claude/pending 取得候選訊息清單。
//
// 注意：不直連 DB，全走 HTTP endpoint，確保 skip 邏輯和 backend 一致。
// pending API 已過濾「無 draft」、「skipped_at IS NULL」（migration 0018 之後），
// 故不需在此重複過濾。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// PendingMessage 對應 /api/claude/pending 回傳的單一訊息欄位。
// message_id 在後端是 int64，JSON 以數字表示。
type PendingMessage struct {
	MessageID  int64     `json:"message_id"`
	SpaceKey   string    `json:"space_key"`
	SpaceName  string    `json:"space_name"`
	ThreadKey  string    `json:"thread_key"`
	MessageKey string    `json:"message_key"`
	SenderName string    `json:"sender_name"`
	Body       string    `json:"body"`
	ObservedAt time.Time `json:"observed_at"`
	Mentioned  bool      `json:"mentioned"`
	// CreatedAt 由 ObservedAt 代替（pending API 不直接回傳 created_at，
	// 但 observed_at 為訊息首次被看到的時間，足以作為 cooldown 安全閘判據）。
	CreatedAt time.Time `json:"-"` // 填充自 ObservedAt
}

type pendingResponse struct {
	Pending []PendingMessage `json:"pending"`
}

// fetchPending 呼叫 GET /api/claude/pending?limit=N 取得候選訊息。
// limit=0 表示不限（預設抓 1000）。
func fetchPending(ctx context.Context, apiBase string, limit int) ([]PendingMessage, error) {
	if limit <= 0 {
		limit = 1000
	}
	url := fmt.Sprintf("%s/api/claude/pending?limit=%d", apiBase, limit)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("建立 request 失敗: %w", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GET %s 失敗: %w", url, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("pending API 回傳 %d: %s", resp.StatusCode, string(body))
	}

	var pr pendingResponse
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, fmt.Errorf("解析 pending response 失敗: %w", err)
	}

	// 以 ObservedAt 填充 CreatedAt 供 cooldown 判斷
	for i := range pr.Pending {
		pr.Pending[i].CreatedAt = pr.Pending[i].ObservedAt
	}

	return pr.Pending, nil
}

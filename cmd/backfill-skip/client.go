// client.go — 呼叫 POST /api/claude/skip 的 HTTP client。
//
// 規格來源：specs/contracts/api.md §D-Skip POST /api/claude/skip
// by 值固定為 "backfill"，讓 audit 欄位可區分此工具的標記。
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// skipRequest 對應 POST /api/claude/skip 的 request body。
type skipRequest struct {
	MessageID int64  `json:"message_id"`
	Reason    string `json:"reason"`
	By        string `json:"by"`
}

// skipResponse 對應 POST /api/claude/skip 的成功回傳。
type skipResponse struct {
	MessageID  int64   `json:"message_id"`
	SkippedAt  *string `json:"skipped_at"`
	SkipReason string  `json:"skip_reason"`
	SkippedBy  string  `json:"skipped_by"`
}

// postSkip 呼叫 POST /api/claude/skip，以 by="backfill" 標記指定訊息。
// 支援 idempotent：同一 message_id 重複呼叫回 200，不算錯誤。
func postSkip(ctx context.Context, apiBase string, messageID int64, reason string) error {
	reqBody := skipRequest{
		MessageID: messageID,
		Reason:    reason,
		By:        "backfill",
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("序列化 request 失敗: %w", err)
	}

	url := apiBase + "/api/claude/skip"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("建立 request 失敗: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return fmt.Errorf("POST %s 失敗: %w", url, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))

	switch resp.StatusCode {
	case http.StatusOK:
		// 成功（包含 idempotent 重複呼叫）
		return nil
	case http.StatusBadRequest:
		return fmt.Errorf("400 INVALID_INPUT: %s", string(body))
	case http.StatusNotFound:
		return fmt.Errorf("404 NOT_FOUND: message_id=%d 不存在", messageID)
	default:
		return fmt.Errorf("skip API 回傳 %d: %s", resp.StatusCode, string(body))
	}
}

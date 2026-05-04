# F-003: Sent Log 頁

## Status: planned
## Sprint: 2
## Priority: P1
## Lane: frontend

## 使用者故事

As a 使用者
I want 看到過去送出的所有訊息（含 auto-mode 自動送的）
So that 我可以稽核 AI 代我發了什麼、找回特定回覆內容

## 範圍

1. `/sent` 頁，顯示過去送出記錄，依時間降序
2. 每筆顯示：
   - 送出時間
   - Space 名稱 + Sender（對方）名稱
   - 原始訊息（觸發送出的對方訊息）
   - 送出內容
   - 送出方式：`approved` / `auto`（標籤區分顏色）
   - 編輯與否：若使用者編輯過 draft，顯示「使用者編輯過」徽章
3. Filter：
   - 模式 filter（全部 / approved / auto）
   - Space filter（多選）
   - 日期區間（預設最近 7 天）
4. 搜尋：對「送出內容」做 case-insensitive 子字串搜尋
5. 分頁：每頁 50 筆，infinite scroll 或頁碼擇一
6. 點擊一筆可展開詳情（context messages、debug info）

## 非範圍

- 重送已 sent 訊息
- 從 sent 拉回變成 draft 重編
- 匯出 CSV

## API Contract

### `GET /api/sent`（**新增**）

Query parameters:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 50 | 每頁筆數，最大 100 |
| `cursor` | string | "" | 分頁 cursor（base64 encoded `created_at`+`id`）|
| `mode` | string | "" | 篩選 `approved` / `auto`，空字串 = all |
| `space_ids` | string[] | [] | 篩選 space（multi-value query param）|
| `from` | ISO 8601 | -7 days | 起始時間 |
| `to` | ISO 8601 | now | 結束時間 |
| `q` | string | "" | 對 sent_content 子字串搜尋 |

Response 200:

```json
{
  "items": [
    {
      "id": "uuid",
      "space_id": "AAAA",
      "space_name": "Team #frontend",
      "sender_id": "users/123",
      "sender_name": "Alice",
      "trigger_message": "你好嗎",
      "sent_content": "還行，謝謝",
      "mode": "approved",
      "edited_by_user": true,
      "category": "daily-chat",
      "sent_at": "2026-05-04T10:00:00Z"
    }
  ],
  "next_cursor": "..."
}
```

Response 4xx/5xx:

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAM | limit > 100 或時間區間反向 |
| 500 | INTERNAL | DB query 失敗 |

## Data Model

「sent log」其實已存在於 `claude_replies` / drafts 表（`status='sent'`）。本 feature 不新增表，只新增 query：

- 從既有 drafts 表 query `status IN ('sent', 'auto_sent')`
- JOIN spaces directory 取 space_name
- JOIN chat_members 取 sender_name
- `mode` 由 `status` 衍生：`sent` → `approved`，`auto_sent` → `auto`
- `edited_by_user` 由 draft 是否有 `user_edited_content` 欄位判斷（若無，tech-lead 在 survey 補 schema 或拋給 F-003 加 migration）

## Business Rules

1. 預設只看最近 7 天，避免一次撈太多
2. 若資料庫沒有 `mode` / `edited_by_user` 紀錄，回 `mode="approved"`、`edited_by_user=false`（保守值）
3. 已 reject 的 draft 不算 sent，不出現在 sent log

## 驗收標準

- 進入 `/sent` 顯示最近 7 天送出記錄，依時間降序
- 切換 mode filter（全部 / approved / auto）正確過濾
- 切換 space filter 正確過濾
- 搜尋「OK」只顯示 sent_content 包含 OK 的筆
- 分頁 / infinite scroll 正常運作
- 點擊一筆展開詳情顯示完整 context

## Scenarios

詳見 `f003-sent-log.feature`

# F-002: Approval Queue 頁

## Status: planned
## Sprint: 1
## Priority: P0
## Lane: frontend

## 使用者故事

As a 使用者
I want 在一個畫面看到所有待回覆的 draft、可以 approve / edit / reject
So that 我能用最少點擊處理日常 inbox

## 範圍（In Scope）

1. `/approvals` 頁，顯示所有「狀態 = pending」的 draft，依時間倒序
2. 每張 draft 卡片顯示：
   - Space 名稱（透過 spaces directory 反查 display_name）
   - Sender 名稱（透過 chat_members directory 反查）
   - 原始訊息內容（最近 N 則上下文，預設 3）
   - 草稿內容（可即時編輯的 textarea）
   - Categorize 標籤（daily-chat / work-coordination / engineering / skip）+ debug 詳情（折疊）
   - 三個操作按鈕：Approve（送出）、Reject（丟棄）、Edit Saved（暫存修改）
3. 鍵盤快捷鍵：
   - `j` / `k` 上下移動焦點
   - `Enter` approve
   - `e` 進入編輯模式
   - `x` reject
4. WebSocket 即時更新：新 draft 進來、其他端 approve/reject 後 list 自動刷新
5. 空狀態：沒有 pending draft 時顯示「Inbox zero 🎉」
6. Loading / error states

## 非範圍

- Bulk operations（多選 approve / reject）— 之後再說
- Draft 排序自訂（按 sender / space group）— 之後再說
- Channel 設定（在 F-004 Settings 處理）

## API Contract

沿用既有 endpoint，前端只需呼叫：

### `GET /api/inbox`（既有）
回傳 pending draft list。前端期待結構：

```json
{
  "drafts": [
    {
      "id": "uuid",
      "space_id": "AAAA...",
      "space_name": "Team #frontend",
      "sender_id": "users/123",
      "sender_name": "Alice",
      "original_message": "...",
      "context_messages": [
        { "sender_name": "...", "content": "...", "created_at": "..." }
      ],
      "draft_content": "...",
      "category": "daily-chat",
      "debug": {
        "categorize_reason": "...",
        "context_source": "..."
      },
      "created_at": "ISO 8601"
    }
  ]
}
```

> ⚠️ 若既有 `/api/inbox` 結構不一致，由 tech-lead 在 survey 階段決定：(a) 改 backend 回應；(b) 前端 adapter 補齊。傾向 (a)，讓 API 回傳的就是 UI 直接消費的結構。

### `POST /api/drafts/{id}/approve`（既有）
Body 可選 `{ "content": "..." }`（若使用者編輯過）。
Response 200 → draft sender 接手送出。

### `POST /api/drafts/{id}/reject`（既有）
Response 200 → draft 標記 rejected。

### `PATCH /api/drafts/{id}`（既有）
Body `{ "content": "..." }` 暫存編輯不送出。

### WebSocket events（`/ws/ui`）

訂閱以下事件：

| Event | Payload | 行為 |
|-------|---------|------|
| `draft_created` | `{ draft }` | append 到 list |
| `draft_updated` | `{ draft }` | 找到同 id 替換 |
| `draft_removed` | `{ draft_id }` | 從 list 移除 |

## Business Rules

1. 編輯後送出 → backend 應紀錄使用者修改的版本（用於語氣學習）
2. Reject 不再回到 inbox（不允許 undo，至少這個 sprint 不做）
3. 同一 draft 兩個 tab 同時 approve → backend `/reply` 已 idempotent，前端只需顯示「已送出」即可
4. Draft 載入超過 100 則時分頁（無限捲動或 paginate，由實作決定）

## 驗收標準

- 進入 `/approvals` 看到所有 pending draft
- 點擊 Approve 按鈕 → 該 draft 從 list 移除 + 顯示成功 toast
- 編輯 textarea + Approve → 送出的是編輯後的版本
- Reject → 該 draft 從 list 移除
- 鍵盤快捷鍵 `j/k/Enter/e/x` 都能用
- 新 draft 透過 WS 進來時自動出現在 list 頂端，不需手動刷新
- 空狀態文案顯示

## Scenarios

詳見 `f002-approval-queue.feature`

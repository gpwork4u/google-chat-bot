# F-013: Pending Message Viewer

## Status: planned
## Sprint: 6
## Priority: P0
## Lane: frontend (主) + backend (query param 擴充 + WS event)
## Source: CR-002

---

## 使用者故事

As a 單人使用者
I want 看到一個 UI 頁面顯示「backend 過濾後的 pending message 列表」（沒 draft 也沒 skip 的中間狀態訊息）
So that 我能直接巡邏目前等待 skill 處理的訊息、手動 skip 不該回覆的、Debug 為何某訊息卡在 pending

---

## 範圍（In Scope）

1. 新頁 `/pending`
2. 三個 tab：**Pending（active）** / **Skipped** / **Drafted**
3. 篩選工具列：
   - Space (multi-select dropdown，沿用 SentPage 的 `space-filter`)
   - Sender (free text input，case-insensitive contains)
   - Body keyword (free text input，case-insensitive contains)
   - Mentioned only (checkbox)
4. 每筆 row 顯示：
   - message_id (small / monospace)
   - space_name + sender_name
   - body (truncate 100 字，hover 或 click expand 看全文)
   - observed_at (相對時間 + ISO tooltip)
   - mentioned badge（被 @ 時顯示）
   - 為何 pending 說明（pending tab：「等待 skill 處理」；skipped tab：顯示 skip_reason + skipped_by）
   - 動作按鈕（pending: Skip；skipped: Unskip）
5. Skip 按鈕點擊：彈出 reason 選單（pure-ack / overheard / policy-redline / not-targeted / low-info / manual-other），確認後 `POST /api/claude/skip` with `by=manual`
6. Unskip 按鈕點擊：直接 `POST /api/claude/unskip`，顯示 toast 「已復原 skip」附 5 秒「復原」連結（雖然 unskip 本身就是復原，這裡 cosmetic）
7. WS event `pending_changed` 訂閱，任何訊息進 / 出 pending 自動 SWR revalidate
8. 分頁：預設 limit=50，「載入更多」按鈕（offset 累加）
9. Backend `/api/claude/pending` + `/api/claude/skipped` 加 query params 支援上述篩選
10. 新 WS event 類型 `pending_changed`

## 非範圍（Out of Scope）

- 在這頁直接編輯訊息 / 產 draft（仍由 chat-drafts skill 處理；本頁只負責檢視 / skip）
- 批次 skip（多選 + 一鍵 skip）— 後續優化
- Skipped 訊息統計儀表
- 訊息搜尋全文 index（純 substring contains）

---

## API Contract

### `GET /api/claude/pending`（既有 + 新增 query params）

新增 query params:
| Param | Type | Default | Constraints |
|-------|------|---------|-------------|
| space_key | string | (none, all) | 完整 space_key 比對 |
| sender_contains | string | (none) | case-insensitive substring on sender_name |
| body_contains | string | (none) | case-insensitive substring on body |
| mentioned_only | bool | false | true → 只回 mentioned=true |
| limit | int | 50 | 1..200 |
| offset | int | 0 | >= 0 |

Response 既有結構不變（`{ pending: [...], auto_mode, ... }`），加 `total` 與 `next_offset`:
```json
{
  "pending": [...],
  "total": 152,
  "next_offset": 50,
  "auto_mode": false,
  "reply_only_when_mentioned": true,
  "blocked_keywords": "...",
  "local_user_name": "...",
  "local_user_email": "..."
}
```

Errors:
| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAM | limit > 200 或 offset < 0 |

### `GET /api/claude/skipped`（既有 + 新增 query params）

新增同上的 `space_key` / `sender_contains` / `body_contains` / `mentioned_only` / `limit` / `offset`。

### WS event `pending_changed`

Server → client：
```json
{
  "type": "pending_changed",
  "reason": "new_message" | "skipped" | "drafted" | "unskipped",
  "message_id": "spaces/AAA/messages/BBB"
}
```

每當以下事件發生時 backend 廣播：
- chat_processor insert 新 message 且未被 backend_auto skip
- POST /api/claude/skip 成功
- POST /api/claude/unskip 成功
- drafts table insert（pending → drafted 狀態變化）

Backend 端 debounce 200ms（同類 event 短時間多次只送最後一次）。

---

## Data Model

不新增 table。沿用既有 `messages` + `drafts` + CR-001 新增的 skip 三欄。

---

## Business Rules

1. **Pending 定義**：`messages` 表中 `skipped_at IS NULL` AND NOT EXISTS draft for message_id
2. **Skipped 定義**：`messages.skipped_at IS NOT NULL`
3. **Drafted 定義**：EXISTS draft for message_id（不論 draft.status）
4. **三 tab 互斥**：同一訊息只可能屬於其中一個狀態
5. **手動 skip 用 `by=manual`**（CR-001 enum 已支援）
6. **空 body 訊息仍顯示**（顯示「(空訊息)」placeholder，避免 row 高度為 0）
7. **mentioned 判斷**：以 backend `messages.mentioned` 欄位為準
8. **WS event debounce**：backend 累積 200ms 內同類 event 只送最後一次
9. **空狀態**：pending 為 0 → 顯示「目前沒有等待處理的訊息 🎉」`{TOAST.pendingEmpty}` placeholder

---

## DOM Contract (新增)

| testid | 元素 | 用途 |
|--------|------|------|
| `pending-tab-pending` | `<button>` | 切到 Pending tab |
| `pending-tab-skipped` | `<button>` | 切到 Skipped tab |
| `pending-tab-drafted` | `<button>` | 切到 Drafted tab |
| `pending-row` | `<article>` | 每筆訊息 row container，附 `data-message-id` |
| `pending-skip-btn` | `<button>` | Skip 按鈕（Pending tab） |
| `pending-unskip-btn` | `<button>` | Unskip 按鈕（Skipped tab） |
| `pending-skip-reason-menu` | `<div>` | Skip reason 選單 popup |
| `pending-skip-reason-option` | `<button>` | Reason 選單 item，附 `data-reason` |
| `space-filter` | `<select>` | 沿用 SentPage 命名 |
| `sender-filter` | `<input>` | sender_contains 輸入 |
| `body-filter` | `<input>` | body_contains 輸入 |
| `mentioned-filter` | `<input type=checkbox>` | mentioned only |
| `pending-load-more` | `<button>` | 載入下 50 筆 |
| `pending-empty-state` | `<div>` | 空狀態 |
| `pending-row-expand` | `<button>` | 展開 body 全文 |

---

## UX Text Contract (新增)

| key | 文字 | 類型 |
|-----|------|------|
| `TOAST.skipped` | `已 skip` | success |
| `TOAST.unskipped` | `已復原 skip` | success |
| `TOAST.skipFailed` | `Skip 失敗，請重試` | error |
| `TOAST.unskipFailed` | `復原失敗，請重試` | error |
| `TOAST.pendingEmpty` | `目前沒有等待處理的訊息 🎉` | info (empty state，非 toast) |
| `TOAST.syncDone` | `同步完成` | success |
| `TOAST.syncFailed` | `同步失敗，請重試` | error |
| `BUTTON.skip` | `Skip` | |
| `BUTTON.unskip` | `Unskip` | |
| `LABEL.pendingTab` | `Pending` | |
| `LABEL.skippedTab` | `Skipped` | |
| `LABEL.draftedTab` | `Drafted` | |
| `LABEL.mentionedFilter` | `只看 @我` | |

---

## Acceptance Criteria

### Happy Path
- [ ] AC-1: 進入 `/pending`，預設顯示 Pending tab，最多 50 筆，按 observed_at desc 排序
- [ ] AC-2: 按 Space filter 選 `spaces/AAA`，列表只顯示該 space 的訊息（response 過濾）
- [ ] AC-3: Sender filter 輸入「Alice」，列表只顯示 sender_name 含「Alice」的訊息
- [ ] AC-4: Body filter 輸入「bug」，列表只顯示 body 含「bug」（case-insensitive）的訊息
- [ ] AC-5: Mentioned only checkbox 勾選，列表只顯示 mentioned=true 的訊息
- [ ] AC-6: 點某 row Skip → 彈出 reason 選單 → 選 `pure-ack` → POST /api/claude/skip with `{message_id, reason: "pure-ack", by: "manual"}` → 該 row 從列表消失，顯示 toast `{TOAST.skipped}`
- [ ] AC-7: 切到 Skipped tab → 顯示剛 skip 的訊息，含 reason / by 標籤
- [ ] AC-8: 在 Skipped tab 點某 row Unskip → POST /api/claude/unskip → 該 row 從 Skipped 列表消失，顯示 toast `{TOAST.unskipped}`，該訊息回到 Pending tab
- [ ] AC-9: WS event `pending_changed` 收到 → SWR 自動 revalidate，新訊息出現在 Pending tab
- [ ] AC-10: 點「載入更多」→ offset+=50，append 顯示下 50 筆

### Error Handling
- [ ] AC-11: Skip API 回 500 → 顯示 toast `{TOAST.skipFailed}`，該 row 保留在 Pending（optimistic 不採用，等 response）
- [ ] AC-12: Pending API 回 500 → 顯示 error-state，提供 retry 按鈕
- [ ] AC-13: 切 tab 時前一 tab 的 filter state 保留（user 切回時不需重輸）

### Edge Cases
- [ ] AC-14: 同時收到 5 個 `pending_changed` events 在 200ms 內 → debounce，只 revalidate 1 次
- [ ] AC-15: Body 含 emoji / 中英夾雜 / 換行 → 正確顯示 truncate（按字元數而非 bytes）
- [ ] AC-16: 空狀態（pending=0）→ 顯示 `pending-empty-state`，無 row
- [ ] AC-17: 訊息 body 為空字串 → 顯示「(空訊息)」placeholder，row 不消失
- [ ] AC-18: `limit=201` query param → 400 / `INVALID_PARAM`
- [ ] AC-19: Skipped tab：mention badge 仍正確顯示（不因 skip 而消失）
- [ ] AC-20: 三 tab 同時有訊息時，總和 = `total` 欄位（messages 表非 deleted 訊息數）

### 回歸（既有功能）
- [ ] AC-R1: F-002 Approval queue 行為不變（不顯示 pending viewer 中的訊息，只顯示有 draft 的）
- [ ] AC-R2: F-011 D-skip 仍正常（chat-drafts skill 自動 skip 走 `by=skill`，pending viewer 手動 skip 走 `by=manual`，UI 兩者都能在 Skipped tab 看到並區分）

---

## Scenarios

`f013-pending-viewer.feature`：
- 列表渲染 + 篩選 4 種
- Skip / Unskip 完整流程
- WS revalidate
- 空 / 錯誤狀態
- Tab 切換

---

## 相關

- CR-002: `specs/changes/CR-002.md`
- 依賴：CR-001 / F-011（skip 機制）
- 影響：F-002 / F-011 AC 增補（不衝突）

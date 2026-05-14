# F-004: Settings 頁

## Status: planned
## Sprint: 2
## Priority: P0
## Lane: frontend

## 使用者故事

As a 使用者
I want 在一個地方管理全域設定（auto-mode / freshness / debug）和 per-channel 設定
So that 我不用回到舊版 single-page UI 也能調整這些參數

## 範圍

1. `/settings` 頁，分兩個 sections：
   - **Global**：auto-mode toggle、freshness window（分鐘數，預設 30）、debug mode toggle
   - **Channels**：所有已知 space 的 per-channel 設定，每個 channel 一張卡片
2. 每個 channel 卡片顯示 / 可編輯：
   - Space 名稱 + space_id（readonly）
   - 啟用 / 停用（白名單機制）
   - Mention-only mode（只在 @我 時觸發）
   - Auto-mode override（繼承全域 / 強制 on / 強制 off）
   - Blocked keywords（陣列，支援新增 / 刪除）
3. 任何設定變更 → 即時 PATCH 對應 endpoint，顯示「已儲存」toast
4. 全域設定改變 → WebSocket 廣播給其他 client，自動同步
5. Profile facts 編輯區塊（取代既有 app.html 中的 profile editor）：
   - 列出所有 facts，依 visibility 分組（public / private / secret）
   - 新增 / 編輯 / 刪除 fact

## 非範圍

- Theme 切換（沒做）
- 匯入 / 匯出設定 JSON
- 多帳號切換

## API Contract

沿用既有 endpoints：

| Endpoint | Method | 用途 |
|----------|--------|------|
| `GET /api/settings` | GET | 全域設定 |
| `PATCH /api/settings` | PATCH | 部分更新全域設定 |
| `GET /api/spaces` | GET | 所有 channel 列表 + 個別設定 |
| `POST /api/spaces/toggle` | POST | 啟用 / 停用 channel |
| `PATCH /api/spaces/{space_id}` | PATCH | 更新 per-channel 設定 |
| `GET /api/claude/profile` | GET | profile facts |
| `POST /api/claude/profile` | POST | 新增 fact |
| `PATCH /api/claude/profile/{id}` | PATCH | 編輯 fact |
| `DELETE /api/claude/profile/{id}` | DELETE | 刪除 fact |

> ⚠️ 若上述 endpoint 結構與目前實作不一致，由 tech-lead 在 survey 階段對齊。

### `GET /api/settings` Response

```json
{
  "auto_mode": false,
  "freshness_window_minutes": 30,
  "debug_mode": false
}
```

### `PATCH /api/settings` Body

```json
{
  "auto_mode": true,
  "freshness_window_minutes": 60,
  "debug_mode": true
}
```

任一欄位 optional，partial update。

### `GET /api/spaces` Response

```json
{
  "spaces": [
    {
      "space_id": "AAAA",
      "space_name": "Team #frontend",
      "enabled": true,
      "mention_only": false,
      "auto_mode_override": "inherit",
      "blocked_keywords": ["薪水", "辭職"]
    }
  ]
}
```

`auto_mode_override` ∈ `inherit` | `always_on` | `always_off`。

### Errors

| Status | Code | Condition |
|--------|------|-----------|
| 400 | INVALID_PARAM | freshness_window_minutes < 1 或 > 1440 |
| 404 | NOT_FOUND | space_id 不存在 |

## Business Rules

1. `freshness_window_minutes` 範圍 1-1440（一天）
2. 全域 auto-mode = false 時，channel `always_on` override 仍然會自動送（明確覆蓋）
3. 全域 auto-mode = true 時，channel `always_off` override 強制 draft 模式
4. Blocked keywords 為 OR 邏輯：訊息含任一關鍵字 → 不觸發 draft（直接 skip）
5. Profile fact key 不可重複（同一使用者）

## 驗收標準

- 進入 `/settings` 看到 Global + Channels + Profile 三個 sections
- 切 auto-mode toggle → 全域生效，所有開啟頁面同步
- 改 freshness window 數字 + Enter → 儲存 + toast
- 對某 channel 切 mention-only → 立即 PATCH backend
- 新增 blocked keyword 「薪水」→ 立即生效
- 新增 profile fact 「我都用敬語回主管」→ 出現在 list
- 設定無效值（freshness=0 或 = 9999）→ 顯示驗證錯誤、不送 PATCH

## Scenarios

詳見 `f004-settings.feature`

---

## Sprint 6+7 增補 AC（來自 CR-002）

### Sprint 6: Sync history 按鈕入口
- [ ] AC-CR002-S1: Chrome extension popup 顯示「Sync all spaces」按鈕（`data-testid="sync-history-all"`）
- [ ] AC-CR002-S2: Chrome extension popup 在打開的 chat space 頁面時，顯示「Sync this space」按鈕（`data-testid="sync-history-current"`）
- [ ] AC-CR002-S3: 點按鈕後彈出進度顯示，poll `/api/extension/sync-history/status` 每 2 秒更新

### Sprint 7: Space facts section
- [ ] AC-CR002-S4: 進入 `/settings` 看到 Global + Channels + Profile + **Space 事實** 四個 sections（順序保留 Profile 在上、Space facts 在下）
- [ ] AC-CR002-S5: Space facts section 頂部顯示「待審核 candidate: N 筆」連到 `/space-facts/candidates`（`data-testid="space-facts-pending-badge"`）
- [ ] AC-CR002-S6: Space facts section 列出 per-space 卡片，顯示 space_name + approved facts 總數
- [ ] AC-CR002-S7: 點某 space 卡片進入 `/space-facts/{space_key}` 詳情頁
- [ ] AC-CR002-S8: 候選總數為 0 時，徽章顯示 0（不隱藏）；approved 0 的 space 卡片仍顯示但 facts 數量為 0

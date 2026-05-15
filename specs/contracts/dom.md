# DOM Contract — data-testid

所有 `data-testid` attribute 的清單，從 `web/src/**/*.tsx` extract。

> **Source of truth**: `web/src/contracts.ts` → `TESTIDS`

---

## ApprovalsPage / ApprovalCard (F-002)

| testid | 元素 | 用途 |
|--------|------|------|
| `draft-card` | `<article>` | 每張草稿卡片容器。附帶 `data-draft-id`, `data-focused`, `data-created-at` |
| `space-name` | `<p>` | 卡片中的 space 名稱 |
| `sender-name` | `<p>` | 卡片中的 sender 名稱 |
| `category-label` | `<span>` | 草稿類別 badge（daily-chat / work-coordination / engineering / skip） |
| `connection-badge` | `<span>` | WS 連線狀態 badge（「已連線」） |
| `toast` | `<div>` | Toast 通知容器（success/error） |
| `empty-state` | `<div>` | 草稿列表空白狀態 |
| `error-state` | `<div>` | 草稿列表錯誤狀態（含 retry 按鈕） |

**ApprovalCard 特殊屬性**：
- `data-draft-id`: 草稿 ID（字串，可為 DB 數字 ID 或符號型 "draft-ws-new"）
- `data-focused`: `"true"` | `"false"` — 是否為鍵盤焦點卡片
- `data-created-at`: ISO 8601 時間字串（用於排序驗證）

---

## SentPage / SentRecordCard (F-003)

| testid | 元素 | 用途 |
|--------|------|------|
| `sent-record` | `<article>` | 每筆 sent 記錄容器。附帶 `data-record-id`, `data-sent-at`, `data-space-id` |
| `space-name` | `<span>` | 記錄中的 space 名稱 |
| `sender-name` | `<span>` | 記錄中的 sender 名稱 |
| `sent-content` | `<div>` | 送出內容 |
| `mode-badge` | `<span>` | 模式 badge（「已審核」/「自動送出」）。附帶 `data-mode` |
| `edited-badge` | `<span>` | 「使用者編輯過」badge（edited_by_user=true 才顯示） |
| `record-detail` | `<div>` | 展開詳情容器（含 category, edited_by_user 詳細資訊） |
| `category` | `<div>` | 展開詳情中的類別顯示 |
| `mode-filter` | `<select>` | 模式過濾下拉選單 |
| `space-filter` | `<select>` | Space 多選過濾下拉選單 |
| `search-input` | `<input>` | 搜尋文字輸入 |
| `empty-state` | `<div>` | 空白狀態（近 7 天沒有送出記錄） |

**SentRecordCard 特殊屬性**：
- `data-record-id`: 記錄 ID
- `data-sent-at`: ISO 8601 送出時間（用於排序驗證）
- `data-space-id`: Space ID（用於 space filter 驗證）

---

## SettingsPage (F-004)

### Global Section

| testid | 元素 | 用途 |
|--------|------|------|
| `global-section` | `<section>` | 全域設定區塊 |
| `auto-mode-toggle` | `<button role="switch">` | Auto 模式開關（`aria-checked`) |
| `freshness-input` | `<input type="number">` | 訊息新鮮度分鐘數輸入 |
| `freshness-error` | `<p>` | freshness 驗證錯誤訊息（aria-invalid） |
| `debug-toggle` | `<button role="switch">` | Debug 模式開關（`aria-checked`) |

### Channels Section

| testid | 元素 | 用途 |
|--------|------|------|
| `channels-section` | `<section>` | 空間設定區塊 |
| `channel-card` | `<div role="region">` | 每個 channel 設定卡片。附帶 `data-space-id` |
| `enabled-toggle` | `<button role="switch">` | 啟用此空間開關 |
| `mention-only-toggle` | `<button role="switch">` | 只在 @提及 時觸發開關 |
| `override-inherit` | `<input type="radio">` | auto_mode_override = 繼承全域 |
| `override-always_on` | `<input type="radio">` | auto_mode_override = 強制開啟 |
| `override-always_off` | `<input type="radio">` | auto_mode_override = 強制關閉 |
| `keyword-chip` | `<span>` | 封鎖關鍵字 chip。附帶 `data-keyword` |
| `remove-keyword` | `<button>` | 移除關鍵字 chip 的 X 按鈕 |
| `keyword-input` | `<input type="text">` | 輸入新封鎖關鍵字 |

### Profile Section

| testid | 元素 | 用途 |
|--------|------|------|
| `profile-section` | `<section>` | 個人特質區塊 |
| `profile-group` | `<div role="group">` | 可見度分組（public/private/secret）。附帶 `data-visibility` |
| `profile-fact-item` | `<li role="listitem">` | 每筆 profile fact |
| `fact-key` | `<input>` | Profile fact 名稱輸入 |
| `fact-value` | `<textarea>` | Profile fact 內容輸入 |
| `fact-visibility` | `<select>` | 可見度選擇 |

---

## PendingPage (F-013)

| testid | 元素 | 用途 |
|--------|------|------|
| `pending-page` | `<div>` | PendingPage 根容器 |
| `pending-tab-pending` | `<button>` | 切到 Pending tab |
| `pending-tab-skipped` | `<button>` | 切到 Skipped tab |
| `pending-tab-drafted` | `<button>` | 切到 Drafted tab |
| `pending-row` | `<article>` | 每筆訊息 row 容器。附帶 `data-message-id` |
| `pending-skip-btn` | `<button>` | Skip 按鈕（Pending tab） |
| `pending-unskip-btn` | `<button>` | Unskip 按鈕（Skipped tab） |
| `pending-skip-reason-menu` | `<div role="menu">` | Skip reason 選單 popup |
| `pending-skip-reason-option` | `<button role="menuitem">` | Reason 選單 item，附帶 `data-reason` |
| `space-filter` | `<select>` | Space 過濾（沿用 SentPage 命名） |
| `sender-filter` | `<input>` | sender_contains 文字輸入 |
| `body-filter` | `<input>` | body_contains 文字輸入 |
| `mentioned-filter` | `<input type="checkbox">` | mentioned_only 勾選 |
| `pending-load-more` | `<button>` | 載入下 50 筆 |
| `pending-empty-state` | `<div>` | 空狀態容器 |
| `pending-row-expand` | `<button>` | 展開 body 全文 |

---

## Extension Popup / Settings (F-004/F-012)

| testid | 元素 | 用途 |
|--------|------|------|
| `sync-history-all` | `<button>` | 同步所有 space 歷史（popup.html） |
| `sync-history-current` | `<button>` | 同步此 space 歷史（popup.html，僅 chat.google.com） |
| `sync-progress` | `<div>` | 同步進度顯示區（popup.html） |
| `settings-pending-link` | `<a>` | Settings 頁「Pending 訊息檢視」連結 |

---

## Space Facts (F-015)

### /space-facts/candidates 頁

| testid | 元素 | 用途 |
|--------|------|------|
| `space-facts-candidates-page` | `<div>` | Candidates 頁根容器 |
| `candidate-fact-row` | `<article>` | 每筆 candidate fact 行容器。附帶 `data-fact-id` |
| `candidate-fact-approve-btn` | `<button>` | Approve 此 fact 按鈕 |
| `candidate-fact-reject-btn` | `<button>` | Reject 此 fact 按鈕（觸發確認 dialog） |
| `candidate-fact-edit-btn` | `<button>` | 進入編輯模式按鈕 |
| `candidate-fact-content` | `<textarea>` | 編輯模式下的 content 輸入框 |
| `candidate-fact-save-btn` | `<button>` | 編輯模式儲存按鈕 |
| `candidate-fact-cancel-btn` | `<button>` | 編輯模式取消按鈕（還原原內容） |
| `candidate-fact-source-toggle` | `<button>` | 展開 / 折疊 source messages 切換 |
| `candidate-fact-source-list` | `<div>` | 展開後的 source messages 列表容器 |
| `candidate-fact-visibility-select` | `<select>` | Visibility 下拉選單（public / private / secret） |
| `space-facts-batch-approve` | `<button>` | 以 space 為單位 batch approve 所有 candidates |

**candidate-fact-row 特殊屬性**：
- `data-fact-id`: fact ID（數字，供 QA selector 定位）

### SettingsPage Space Facts section

| testid | 元素 | 用途 |
|--------|------|------|
| `settings-space-facts-section` | `<section>` | SettingsPage 中的 Space Facts 區塊 |
| `space-facts-pending-badge` | `<span>` | 待審核 candidate 總數 badge |
| `space-facts-space-card` | `<div role="button">` | 各 space 的摘要卡片（點擊進入詳情）。附帶 `data-space-key` |

**space-facts-space-card 特殊屬性**：
- `data-space-key`: URL-encoded space key（例 `spaces%2FAAA`）

### /space-facts/{space_key} 詳情頁

| testid | 元素 | 用途 |
|--------|------|------|
| `space-facts-detail-page` | `<div>` | 詳情頁根容器 |
| `space-facts-section-product` | `<section>` | Product category 區塊 |
| `space-facts-section-my-role` | `<section>` | My-role category 區塊 |
| `space-facts-section-glossary` | `<section>` | Glossary category 區塊 |
| `space-facts-section-pinned-decision` | `<section>` | Pinned-decision category 區塊 |
| `space-facts-section-relation` | `<section>` | Relation category 區塊 |
| `space-facts-row` | `<article>` | 詳情頁每條 fact 行容器。附帶 `data-fact-id` |
| `space-facts-add-btn` | `<button>` | 手動新增 fact 按鈕 |
| `space-facts-mine-again-btn` | `<button>` | 重新 mine 此 space 按鈕（觸發 enqueue） |
| `space-facts-empty-state` | `<div>` | 無 facts 時的空白狀態容器 |

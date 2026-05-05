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

# Design Open Questions

> 設計上有疑似遺漏或需要決策的問題，記錄在此，等待 tech-lead / product 確認後更新。
> 不自行腦補或假設答案。

---

## Sprint 6 — OQ-001: Navbar 是否加 Pending 常駐 nav item

**問題**：`/pending` 是否需要在 Navbar（全域 top nav）加一個常駐 nav item（如同 `/approvals`、`/sent`）？

**背景**：
- 目前 Sprint 6 設計只在 Settings 頁加 hint banner
- 若 Pending viewer 是高頻使用頁，應加入 Navbar 讓用戶直接點擊

**影響範圍**：
- Navbar 元件（`components/Layout.md` 需更新）
- 若加入，Navbar 元件的 nav items 數量從 3 變 4，需確認排版不會 overflow（特別是 mobile）

**暫定做法**：Sprint 6 先用 Settings hint，Sprint 7 評估是否升級為 Navbar item。

---

## Sprint 6 — OQ-002: Drafted tab 動作按鈕

**問題**：Drafted tab 的 MessageRow 是否需要動作按鈕？

**背景**：
- F-013 spec 說 Drafted tab 顯示「EXISTS draft for message_id（不論 draft.status）」的訊息
- Spec 沒有明確說 Drafted tab 有何操作按鈕
- 可能的選項：無按鈕 / 「前往審核」連結跳 `/approvals` / 「撤銷草稿」按鈕

**暫定做法**：Drafted tab 的 MessageRow 不顯示動作按鈕（顯示 drafted 狀態 badge 即可）。等 tech-lead 確認後更新。

---

## Sprint 6 — OQ-003: Extension popup toast 位置與 z-index

**問題**：Extension popup（280px 寬）的 toast 是否用 popup 內部 fixed，還是直接用 Chrome extension notification API？

**背景**：
- 目前設計選擇 popup 內部顯示 toast（`position: absolute, bottom: 0`）
- Chrome extension 可用 `chrome.notifications` API 顯示系統通知，但樣式不可控
- 若使用者在 popup 開著的情況下才看到 toast，沒問題；但若 popup 被關閉，toast 會消失

**暫定做法**：使用 popup 內部 toast，3 秒自動消失。sync 完成後若 popup 已關閉，下次打開才看到最後狀態（SyncProgress 元件仍顯示 completed/failed 狀態）。

---

## Sprint 6 — OQ-004: Space filter 在 Pending tab 是否顯示已選 space chip

**問題**：PendingFilterBar 的 Space 多選是否如 SentPage FilterBar 用 chip-list 方式顯示已選項目？

**背景**：
- SentPage FilterBar 使用 `KeywordChip` 顯示已選 space
- Pending viewer filter bar 更密集（4 個控制項），chip 可能造成 overflow
- 替代方案：用 native `<select multiple>` 或 dropdown checkbox list（已選數量 badge 在 button 上）

**暫定做法**：Pending filter bar 使用 native `<select multiple>`（或 custom dropdown 顯示「N 個空間」），不用 chip-list。節省水平空間。等 engineer 實作時確認可行性。

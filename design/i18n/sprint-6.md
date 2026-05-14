# UX Text — Sprint 6 新增

> 此檔案供 frontend engineer 同步進 `specs/contracts/ux-text.md`。
> 格式：key（對應 `contracts.ts` 的 UX_TEXT 物件） / 文字 / 類型

---

## Toast 通知

| key | 文字 | 類型 | 觸發時機 |
|-----|------|------|---------|
| `TOAST.skipped` | `已 skip` | success toast | POST /api/claude/skip 成功 |
| `TOAST.unskipped` | `已復原 skip` | success toast | POST /api/claude/unskip 成功 |
| `TOAST.skipFailed` | `Skip 失敗，請重試` | error toast | POST /api/claude/skip 失敗 |
| `TOAST.unskipFailed` | `復原失敗，請重試` | error toast | POST /api/claude/unskip 失敗 |
| `TOAST.syncDone` | `同步完成` | success toast | sync job completed |
| `TOAST.syncFailed` | `同步失敗，請重試` | error toast | sync job failed / network error |

---

## 按鈕文字

| key | 文字 | 用途 |
|-----|------|------|
| `BUTTON.skip` | `Skip` | MessageRow Skip 按鈕 |
| `BUTTON.unskip` | `Unskip` | MessageRow Unskip 按鈕 |
| `BUTTON.syncCurrent` | `同步此 Space 歷史` | Extension popup Sync current 按鈕 |
| `BUTTON.syncAll` | `同步所有 Space 歷史` | Extension popup Sync all 按鈕 |
| `BUTTON.loadMore` | `載入更多` | Pending viewer load-more 按鈕 |
| `BUTTON.retry` | `重試` | Error state retry 按鈕 |
| `BUTTON.confirmSkip` | `確認 Skip` | SkipReasonMenu 確認按鈕 |
| `BUTTON.cancelSkip` | `取消` | SkipReasonMenu 取消按鈕 |

---

## Tab / Label 文字

| key | 文字 | 用途 |
|-----|------|------|
| `LABEL.pendingTab` | `Pending` | Pending tab |
| `LABEL.skippedTab` | `Skipped` | Skipped tab |
| `LABEL.draftedTab` | `Drafted` | Drafted tab |
| `LABEL.mentionedFilter` | `只看 @我` | Mentioned only checkbox label |
| `LABEL.allSpaces` | `所有空間` | Space filter placeholder |
| `LABEL.senderPlaceholder` | `發話人...` | Sender filter placeholder |
| `LABEL.bodyPlaceholder` | `關鍵字...` | Body filter placeholder |
| `LABEL.syncSectionTitle` | `歷史同步` | Extension popup sync section 標題 |
| `LABEL.pendingViewerLink` | `Pending 訊息檢視` | Extension popup 連結文字 |

---

## 空狀態文字

| key | 文字 | 用途 |
|-----|------|------|
| `EMPTY.pendingTab` | `目前沒有等待處理的訊息 🎉` | Pending tab 空狀態主訊息（也是 `TOAST.pendingEmpty`） |
| `EMPTY.pendingTabSub` | `所有訊息都已處理完畢` | Pending tab 空狀態副訊息 |
| `EMPTY.skippedTab` | `沒有已略過的訊息` | Skipped tab 空狀態 |
| `EMPTY.draftedTab` | `沒有草稿中的訊息` | Drafted tab 空狀態 |

---

## Skip Reason 選項文字

| reason 值 | 顯示文字 |
|-----------|---------|
| `pure-ack` | 單純回應 |
| `overheard` | 無關對話 |
| `policy-redline` | 政策紅線 |
| `not-targeted` | 不相關（非對象） |
| `low-info` | 資訊不足 |
| `manual-other` | 手動其他 |

---

## Skipped-by 文字

| skipped_by 值 | 顯示文字 |
|---------------|---------|
| `skill` | 自動（skill） |
| `manual` | 手動 |
| `backend_auto` | 後台自動 |

---

## 錯誤 / 系統文字

| key | 文字 | 用途 |
|-----|------|------|
| `ERROR.pendingLoadFailed` | `載入失敗` | Error state 主文字 |
| `ERROR.pendingLoadFailedSub` | `無法取得訊息列表` | Error state 副文字 |
| `MISC.emptyBody` | `(空訊息)` | body 為空字串時的 placeholder |
| `MISC.syncProgress` | `同步中...` | SyncProgress running 主文字 |
| `MISC.syncProgressCount` | `{total} 則已讀取（{dup} 則重複）` | SyncProgress 計數文字（含變數） |
| `MISC.syncDoneDetail` | `新增 {ins} 則・重複 {dup} 則` | SyncProgress completed 副文字（含變數） |
| `MISC.syncFailedDetail` | `請重試` | SyncProgress failed 副文字 |
| `MISC.skipReasonTitle` | `略過原因` | SkipReasonMenu 標題 |
| `MISC.skipReasonPrefix` | `略過原因：` | MessageRow Skipped tab 略過原因前綴 |
| `MISC.skippedByPrefix` | `by` | MessageRow skipped_by 前綴 |
| `MISC.syncProgressBadgeRunning` | `進行中` | SyncProgress badge text（running） |
| `MISC.syncProgressBadgeDone` | `完成` | SyncProgress badge text（completed） |
| `MISC.syncProgressBadgeFailed` | `失敗` | SyncProgress badge text（failed） |
| `MISC.pageTitle` | `Pending 訊息` | /pending 頁面標題 |

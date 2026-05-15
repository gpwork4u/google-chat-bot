# UX Text Contract — Toast / Label / Error 文字

所有使用者看得到的文字，特別是 toast、badge、error message 等。

> **Source of truth**: `web/src/contracts.ts` → `TOAST`  
> BDD step 中的文字驗證應 import 自 `TOAST` 常數（在 test/ 環境通過 helper 或直接引用）

---

## Toast 訊息 (ApprovalsPage)

| 情境 | Toast 文字 | 類型 |
|------|-----------|------|
| Approve 成功 | `已送出` | success |
| Approve 失敗 | `送出失敗` | error |
| Reject 成功 | `已丟棄` | error (丟棄操作) |
| Reject 失敗 | `丟棄失敗` | error |
| Save draft 成功 | `已暫存` | success |
| Save draft 失敗 | `暫存失敗` | error |

## Toast 訊息 (SettingsPage)

| 情境 | Toast 文字 | 類型 |
|------|-----------|------|
| 設定儲存成功 | `已儲存` | success |
| 設定儲存失敗 | `儲存失敗，請重試` | error |
| Profile fact 新增成功 | `已新增` | success |
| Profile fact 刪除成功 | `已刪除` | success |

---

## Badge 文字 (SentRecordCard)

| mode 值 | 顯示文字 | CSS |
|---------|---------|-----|
| `approved` | `已審核` | blue |
| `auto` | `自動送出` | amber |

| 條件 | 顯示文字 |
|------|---------|
| `edited_by_user = true` | `使用者編輯過` (list 中), `使用者在核准前編輯過此草稿` (展開詳情中) |

---

## Badge 文字 (ApprovalCard categories)

| category 值 | 顯示文字 |
|------------|---------|
| `daily-chat` | `閒聊` |
| `work-coordination` | `工作協調` |
| `engineering` | `工程` |
| `skip` | `略過` |

---

## 空白狀態文字

| 頁面 | 文字 |
|------|------|
| ApprovalsPage (空) | (EmptyState 元件，無固定文字——使用 role="status" 或自訂文案) |
| SentPage (空) | `近 7 天沒有送出記錄` |

---

## 錯誤狀態文字

| 情境 | 文字 |
|------|------|
| ApprovalsPage 載入失敗 | ErrorState 元件（`data-testid="error-state"`），含 retry 按鈕 |
| SettingsPage 全域設定失敗 | `載入全域設定失敗` |
| SettingsPage 空間設定失敗 | `載入空間設定失敗` |
| SettingsPage 個人特質失敗 | `載入個人特質失敗` |
| Freshness 驗證錯誤 | `請輸入 1–1440 之間的數字` |

---

## Profile Fact 可見度標籤

| visibility 值 | 顯示文字 |
|--------------|---------|
| `public` | `公開` |
| `private` | `私人` |
| `secret` | `機密` |

---

## Sprint 7: Space Facts (F-015)

### Toast

| key | 文字 | 類型 |
|-----|------|------|
| `TOAST.factApproved` | `Fact 已核准` | success |
| `TOAST.factRejected` | `Fact 已拒絕` | success |
| `TOAST.factEdited` | `Fact 已編輯` | success |
| `TOAST.factDeleted` | `Fact 已刪除` | success |
| `TOAST.factCreated` | `Fact 已新增` | success |
| `TOAST.factSaveFailed` | `儲存失敗，請重試` | error |
| `TOAST.miningEnqueued` | `已加入 mining queue` | success |
| `TOAST.miningAlreadyRunning` | `Mining 已在進行中` | info |
| `TOAST.batchApproveDone` | `已核准 {N} 條 fact` | success (N = 實際數量) |
| `TOAST.batchRejectDone` | `已拒絕 {N} 條 fact` | success |

### Label

| key | 文字 |
|-----|------|
| `LABEL.spaceFactsSection` | `Space 事實` |
| `LABEL.pendingCandidates` | `待審核 candidate` |
| `LABEL.categoryProduct` | `產品` |
| `LABEL.categoryMyRole` | `我的角色` |
| `LABEL.categoryGlossary` | `術語` |
| `LABEL.categoryPinnedDecision` | `決議` |
| `LABEL.categoryRelation` | `人物` |

### Button

| key | 文字 |
|-----|------|
| `BUTTON.approve` | `核准` |
| `BUTTON.reject` | `拒絕` |
| `BUTTON.edit` | `編輯` |
| `BUTTON.save` | `儲存` |
| `BUTTON.cancel` | `取消` |
| `BUTTON.delete` | `刪除` |
| `BUTTON.mineAgain` | `重新 mine 此 space` |
| `BUTTON.addFact` | `新增 fact` |
| `BUTTON.batchApprove` | `Approve all in space` |
| `BUTTON.batchReject` | `Reject all in space` |
| `BUTTON.confirm` | `確定` |

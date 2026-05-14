# F-015: Space Facts Approval UI + chat-drafts Integration

## Status: planned
## Sprint: 7
## Priority: P0
## Lane: frontend (主) + backend (skill 修改)
## Source: CR-002

---

## 使用者故事

As a 單人使用者
I want UI 讓我**逐條** approve / edit / reject mining skill 產出的 candidate facts，且 chat-drafts skill 在處理訊息時自動拉 approved facts 注入 prompt
So that 我能 review AI 萃取的 context、避免錯誤 fact 污染回覆，且回覆品質提升因為 skill 有 per-space 長期記憶

---

## 範圍（In Scope）

1. SettingsPage 加 **Space facts** section（並列於 Global / Channels / Profile）：
   - 顯示「待審核 N 筆」入口（連 `/space-facts/candidates`）
   - Per-space 卡片：space_name + approved facts 數量 + 「查看 / 編輯」連結
2. 新頁 `/space-facts/candidates`：
   - 列出所有 status=candidate 的 facts（按 space_key 分組）
   - 每筆顯示：category badge + content (markdown 渲染) + visibility 下拉 + source messages（可展開看原文）
   - 三個動作按鈕：
     - **Approve**: POST `/api/space-facts/{id}/approve`
     - **Edit**: 行內編輯 content / visibility / category → PATCH，然後可選 approve
     - **Reject**: POST `/api/space-facts/{id}/reject`
   - 批次工具列：「Approve all in space」/「Reject all in space」（給 user 快速處理）
3. Per-space facts 詳情頁 `/space-facts/{space_key}`（從 SettingsPage 卡片連過去）：
   - 列出該 space 所有 approved facts（依 category 分 5 section）
   - 每筆可 edit / delete
   - 頂部有「Mine this space again」按鈕 → `POST /api/space-facts/mining-queue {space_key}`
   - 「新增 fact」按鈕（manual create）
4. chat-drafts skill `.claude/skills/chat-drafts/SKILL.md` 加 step 1.5：
   - 對每個 pending message 的 space_key，第一次遇到時 `GET /api/space-facts?space_key=...&status=approved`
   - 結果 cache 在 session 記憶內
   - 注入 system prompt（格式見 §4.7 in CR-002）
5. 沒 facts 的 space → skill 不報錯，照常處理（不阻塞）
6. WS event 不新增（用 SWR mutate 即可）

## 非範圍（Out of Scope）

- Bulk import facts from CSV/JSON
- Fact 統計儀表
- 自動 enqueue mining（依 message threshold）
- Fact 合併 UI（user 用 edit 手動合併）

---

## API Contract

複用 F-014 endpoints，不新增。

---

## DOM Contract (新增)

| testid | 元素 | 用途 |
|--------|------|------|
| `settings-space-facts-section` | `<section>` | SettingsPage 新 section |
| `space-facts-pending-badge` | `<span>` | 「待審核 N 筆」徽章 |
| `space-facts-space-card` | `<article>` | 每個 space 卡片，附 `data-space-key` |
| `space-facts-candidates-page` | `<main>` | candidates 頁主容器 |
| `candidate-fact-row` | `<article>` | 每條 candidate row，附 `data-fact-id` |
| `candidate-fact-content` | `<div>` | content 顯示 / 編輯區 |
| `candidate-fact-category` | `<span>` | category badge |
| `candidate-fact-visibility-select` | `<select>` | visibility 切換 |
| `candidate-fact-source-toggle` | `<button>` | 展開 source messages |
| `candidate-fact-source-list` | `<ul>` | source messages list |
| `candidate-fact-approve-btn` | `<button>` | Approve |
| `candidate-fact-edit-btn` | `<button>` | 進入編輯模式 |
| `candidate-fact-reject-btn` | `<button>` | Reject |
| `candidate-fact-save-btn` | `<button>` | 編輯模式存檔 |
| `candidate-fact-cancel-btn` | `<button>` | 編輯模式取消 |
| `space-facts-batch-approve` | `<button>` | 「Approve all in space」 |
| `space-facts-batch-reject` | `<button>` | 「Reject all in space」 |
| `space-facts-detail-page` | `<main>` | per-space 詳情頁 |
| `space-facts-section-product` | `<section>` | 詳情頁產品 section |
| `space-facts-section-my-role` | `<section>` | |
| `space-facts-section-glossary` | `<section>` | |
| `space-facts-section-pinned-decision` | `<section>` | |
| `space-facts-section-relation` | `<section>` | |
| `space-facts-row` | `<article>` | approved fact row，附 `data-fact-id` |
| `space-facts-mine-again-btn` | `<button>` | 觸發 re-mining |
| `space-facts-add-btn` | `<button>` | 手動新增 fact |
| `space-facts-empty-state` | `<div>` | 空狀態 |

---

## UX Text Contract (新增)

| key | 文字 | 類型 |
|-----|------|------|
| `TOAST.factApproved` | `Fact 已核准` | success |
| `TOAST.factRejected` | `Fact 已拒絕` | success |
| `TOAST.factEdited` | `Fact 已編輯` | success |
| `TOAST.factDeleted` | `Fact 已刪除` | success |
| `TOAST.factCreated` | `Fact 已新增` | success |
| `TOAST.factSaveFailed` | `儲存失敗，請重試` | error |
| `TOAST.miningEnqueued` | `已加入 mining queue` | success |
| `TOAST.batchApproveDone` | `已核准 N 條 fact` | success |
| `TOAST.batchRejectDone` | `已拒絕 N 條 fact` | success |
| `LABEL.spaceFactsSection` | `Space 事實` | |
| `LABEL.pendingCandidates` | `待審核 candidate` | |
| `LABEL.categoryProduct` | `產品` | |
| `LABEL.categoryMyRole` | `我的角色` | |
| `LABEL.categoryGlossary` | `術語` | |
| `LABEL.categoryPinnedDecision` | `決議` | |
| `LABEL.categoryRelation` | `人物` | |
| `LABEL.visibilityPublic` | `公開` | |
| `LABEL.visibilityPrivate` | `private` | |
| `LABEL.visibilitySecret` | `secret` | |
| `BUTTON.approve` | `核准` | |
| `BUTTON.reject` | `拒絕` | |
| `BUTTON.mineAgain` | `重新 mine 此 space` | |

---

## Business Rules

1. **Approve 順序**：在 candidates 頁，user approve 後該 row 立即從 candidates 列表消失（SWR optimistic update + revalidate）
2. **Edit + Approve 流程**：點 Edit 進入 inline 編輯模式 → 改 content / visibility / category → 點 Save 觸發 PATCH → 點 Approve 觸發另一個 PATCH (status=approved)；或合併動作（save + approve 一個按鈕）— UI 提供「儲存並核准」
3. **Batch approve**：對單一 space 的所有 candidate 平行 POST `/approve`，全部完成後 toast 顯示總數
4. **Reject 不可復原**：rejected fact 不能再 approve（要重新 mining 才會產新 candidate）— UI 顯示確認 dialog「確定拒絕？此操作不可復原」
5. **Manual fact 預設 visibility=private**（safety default）
6. **Source messages 展開**：點 toggle 後 lazy load 對應 messages（依 source_message_ids[] 拉 `/api/messages?id_in=...`，若 backend 無此 endpoint 則用 `/api/messages/{id}` 逐筆拉）
7. **chat-drafts skill 整合 cache**：第一輪 loop 對遇到的 space 拉 facts，session 內 cache（同 style-profile）
8. **Skill 注入順序**：在 step 1（拉 pending）後立即拉，避免 step 3 分類前缺 context
9. **Empty space facts**：skill 對沒 fact 的 space 不報錯、不阻塞，prompt 中略過 facts section
10. **Visibility 處理**（與 user_profile_facts 對齊）：
    - public: skill 可自由引用
    - private: skill 看得到，但 prompt 明示「以下為 private，不主動洩漏」
    - secret: skill 永遠看不到（`GET /api/space-facts` 預設不回）

---

## chat-drafts Skill 修改

`.claude/skills/chat-drafts/SKILL.md` 在現有「### 1. 拿待處理訊息」與「### 2. 先拉完整前後文」之間插入：

```markdown
### 1.5 拉 space facts（每 space 第一次遇到時拉，後續 cache）

對 pending 列表中的每個 unique space_key，第一輪遇到時拉 facts：

```bash
SPACE_KEY="<from pending msg>"
curl -s "http://localhost:8080/api/space-facts?space_key=${SPACE_KEY}&status=approved"
```

Response 結構（F-014）：
```json
{ "facts": [{ "id", "category", "content", "visibility", ... }] }
```

把結果以下列格式注入 system prompt（在處理該 space 訊息時）：

```
## Space context: <space_name> (key=<space_key>)
### 產品 (product)
- ...

### 我的角色 (my-role)
- ...

### 術語 (glossary)
- TERM_A: 定義...

### 決議 (pinned-decision)
- ...

### 人物 (relation)
- Alice: PM
- Bob: SRE lead

> 注意：visibility=private 的 fact 不可主動向第三方提及。
```

Cache：本 session 第一次拉、後續輪重用（同 style-profile 機制）。secret visibility 永遠不出現。
```

---

## Acceptance Criteria

### Happy Path - Candidates Page
- [ ] AC-1: 進入 `/space-facts/candidates` → 列出所有 status=candidate facts，按 space 分組
- [ ] AC-2: 每筆 row 顯示 category badge + content + visibility 下拉 + source messages toggle
- [ ] AC-3: 點 Approve → POST `/api/space-facts/{id}/approve` → row 從列表消失 → toast `{TOAST.factApproved}`
- [ ] AC-4: 點 Reject → 顯示確認 dialog → 確認後 POST `/api/space-facts/{id}/reject` → row 消失 → toast `{TOAST.factRejected}`
- [ ] AC-5: 點 Edit → row 變編輯模式（content textarea / visibility select / category select / Save / Cancel）
- [ ] AC-6: Edit 模式點 Save → PATCH content → row 變回顯示模式 → toast `{TOAST.factEdited}`
- [ ] AC-7: Edit 模式點 Cancel → 變回顯示模式，內容不變
- [ ] AC-8: 點 source toggle → 展開 source messages list，顯示每則 message body + sender + observed_at
- [ ] AC-9: Visibility 下拉改 public → PATCH visibility → toast `{TOAST.factEdited}`
- [ ] AC-10: 「Approve all in space」→ 對該 space 所有 candidate 平行 approve → toast `{TOAST.batchApproveDone}` 顯示數量

### Happy Path - SettingsPage Space Facts Section
- [ ] AC-11: SettingsPage 看到「Space 事實」section，顯示 candidates 總數徽章
- [ ] AC-12: Section 下方列出每個 space 卡片，每張顯示 space_name + approved facts 數量
- [ ] AC-13: 點某 space 卡片 → 進入 `/space-facts/{space_key}` 詳情頁
- [ ] AC-14: 候選總數為 0 時，徽章顯示 0 或隱藏（依設計）

### Happy Path - Per-Space Detail Page
- [ ] AC-15: `/space-facts/{space_key}` 顯示 5 個 category section
- [ ] AC-16: 每個 section 列出該 category 的 approved facts
- [ ] AC-17: 點某 fact 的 edit → 行內編輯 → save → PATCH 成功
- [ ] AC-18: 點某 fact 的 delete → 確認 dialog → DELETE 成功 → row 消失 → toast `{TOAST.factDeleted}`
- [ ] AC-19: 點「新增 fact」→ 新 row 出現於對應 category section（或 modal）→ 填 content + visibility → 儲存 → POST 成功（status 直接 approved）→ toast `{TOAST.factCreated}`
- [ ] AC-20: 點「重新 mine 此 space」→ POST `/api/space-facts/mining-queue {space_key}` → toast `{TOAST.miningEnqueued}`

### Happy Path - chat-drafts Skill Integration
- [ ] AC-21: 對某 pending message（space=X），第一次處理該 space → skill 呼叫 `GET /api/space-facts?space_key=X&status=approved`
- [ ] AC-22: 該 space 有 approved facts → 注入 system prompt（manual smoke test，不強制 e2e；e2e 可 mock skill 行為）
- [ ] AC-23: 同 session 第二則同 space pending → skill 不重複拉 facts（cache hit）
- [ ] AC-24: 某 space 完全沒 facts → skill 正常處理 message，不報錯，prompt 中不出現 facts section

### Error Handling
- [ ] AC-25: Approve API 回 500 → toast `{TOAST.factSaveFailed}`, row 留在列表
- [ ] AC-26: Edit save 時 content="" → backend 400 → toast `{TOAST.factSaveFailed}`，編輯模式保留
- [ ] AC-27: 進入不存在的 space_key 詳情頁 → 顯示 empty-state 或 redirect 到 SettingsPage
- [ ] AC-28: Mining queue API 回 409 (JOB_RUNNING) → toast 「Mining 已在進行中」`{TOAST.miningEnqueued}` 替換為適合文字（可用 toast 系統的 info 級別）

### Edge Cases
- [ ] AC-29: 同 space 有 candidate 又有 approved facts → SettingsPage 卡片顯示 approved 數量（不含 candidate）
- [ ] AC-30: 一個 fact `visibility=secret` → 不出現在預設 GET response，因此不出現在 UI 任何 list
- [ ] AC-31: source_message_ids 中某 message 已被刪除 → toggle 展開時該筆顯示「(訊息已刪除)」placeholder
- [ ] AC-32: Batch approve 50 筆 → 平行請求不 overload（uses Promise.allSettled），失敗者保留在列表
- [ ] AC-33: Visibility 從 private 改 secret 後 → 該 fact 立即從 UI 消失（下次 SWR revalidate 不回該筆）
- [ ] AC-34: 同條 fact 連續 PATCH 多次 → updated_at 持續更新，approved_at 不變（保留首次核准時間）

### 回歸
- [ ] AC-R1: F-002 Approval queue 仍正常運作（不受影響）
- [ ] AC-R2: F-004 Settings Global / Channels / Profile sections 不變
- [ ] AC-R3: chat-drafts skill 對既有 profile facts (user_profile_facts) 的處理不變
- [ ] AC-R4: 從 SettingsPage 進入 Space facts section 不影響 SettingsPage 其他 SWR fetch

---

## Scenarios

`f015-space-facts-approval.feature`：
- candidates 頁三動作（approve / edit / reject）
- per-space 詳情頁 CRUD
- batch approve / reject
- SettingsPage section 顯示
- visibility 變更即時生效
- chat-drafts skill 整合（mock 化驗證 prompt 中含 fact section）

---

## 相關

- CR-002: `specs/changes/CR-002.md`
- 依賴：F-014（backend + skill 產生 candidates）
- 修改：F-004（SettingsPage 加 section）+ chat-drafts skill SKILL.md

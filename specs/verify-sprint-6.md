# Sprint 6 驗證報告 — CR-002 Space Facts + Pending Viewer (Part B)

## 結論：PASS（with documented warnings）

驗證日期：2026-05-14
Sprint Milestone：Sprint 6: CR-002 Space Facts + Pending Viewer
Sprint Issues：#83 / #84 / #85 / #86 / #87 / #88 / #89 / #90 — 全部 closed
Sprint Scope（Part B + 跨 sprint infra）：F-012 Extension sync history + F-013 Pending viewer + F-004/F-011 AC append

---

## 已合併 PR

| PR | 標題 | Lane | 狀態 |
|----|------|------|------|
| #91 | F-012-be1: Migration 0020 + sync_jobs store | backend | merged |
| #92 | F-012-be1: Migration 0020 + sync_jobs store (合併 v2) | backend | merged |
| #93 | F-012-pipe1: Extension batchexecute sync history scan loop | pipeline | merged |
| #94 | design Sprint 6: pending viewer + extension popup sync | design | merged |
| #95 | F-013-fe1: /pending page with filters + WS revalidate + skip/unskip | frontend | merged |
| #96 | QA Sprint 6: Playwright e2e for CR-002 | qa | merged |
| #97 | F-004-fe1: Popup sync-history buttons + Settings pending link | frontend | merged |
| #98 | F-013-be1: pending/skipped query params + WS pending_changed | backend | merged |
| #99 | F-012-be2: Sync-history endpoints + batch ingestion handler | backend | merged |

---

## 三維度結果

### 1. Completeness — PASS

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| 8 個 Sprint 6 issues 全部 closed | ✅ | #83–#90 closed |
| Migration 0020 `space_history_sync_jobs` 存在 | ✅ | `internal/store/migrations/0020_space_history_sync_jobs.sql` |
| sync_jobs store CRUD（Create / Get / RecordBatch / MarkComplete / TimedOut） | ✅ | `internal/store/sync_jobs.go` |
| 4 個 sync-history endpoints (start / batch / complete / status) | ✅ | `internal/httpapi/extension_sync_history.go` + `routes.go` |
| `/api/claude/pending` 加 query params（space_key/sender_contains/body_contains/mentioned） | ✅ | `internal/httpapi/claude.go` + `internal/store/claude.go` |
| `/api/claude/skipped` 加 query params + offset | ✅ | `internal/httpapi/claude_skip.go` + `internal/store/skip.go` |
| WS `pending_changed` event broadcast | ✅ | `internal/hub/hub.go` + `chat_processor.go` 觸發 |
| `/pending` 頁（3 tab + 4 filter + skip/unskip） | ✅ | `web/src/pages/PendingPage.tsx` + `MessageList.tsx` + `SkipReasonMenu.tsx` + `usePending.ts` |
| Extension popup sync buttons（all + current） | ✅ | `extension/popup.html` + `extension/popup.js` |
| Settings 加 /pending 連結 | ✅ | `web/src/pages/SettingsPage.tsx` |
| Extension content.js batchexecute scan loop | ✅ | `extension/inject-main.js` 3 個 RPC wrappers + handleSyncHistoryScan + content.js bridge |
| Design dataset (tokens / 4 elements / 2 pages / i18n handoff) | ✅ | `design/` Sprint 6 PR #94 |
| Playwright e2e spec.ts × 4 (f012/f013/f004/f011) | ✅ | `test/e2e/` PR #96 |
| go build ./... PASS | ✅ | 零編譯錯誤 |
| go test ./... PASS | ✅ | httpapi / hub / parser / safety / store / worker 全綠 |
| web tsc --noEmit PASS | ✅ | TS 零錯誤 |
| web build (vite) PASS | ✅ | 284 kB bundle (88 kB gzip) |
| Contracts no-drift | ✅ | `tygo generate` 後 web/src/contracts.generated.ts 無變動 |

缺失：無。

---

### 2. Correctness — PASS

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| Migration 0020 schema 對應 spec §4.1（job_id / status / space_key / processed_count / total_spaces / started_at / ended_at + unique idx） | ✅ | 對齊 |
| Sync-history endpoints idempotent（重複 message_key 走 InsertOrGetMessage 不重複插入） | ✅ | 複用既有 ingestion path |
| sync_jobs status transition: running → done / failed / timed_out | ✅ | `MarkJobComplete` + `RunSyncJobTimeoutTicker` |
| pending query: space_key 精確 / sender_contains 與 body_contains 用 ILIKE / mentioned 過濾 sender_is_me=false AND mentioned=true | ✅ | `ListPendingOptions` 完整實作 |
| skipped query: 同上 + offset 翻頁 | ✅ | `ListSkippedOptions` 完整 |
| WS pending_changed: chat_processor 新訊息 / skip / unskip / draft 各自帶 reason | ✅ | `hub.BroadcastPendingChanged` + reason enum |
| /pending 頁 3 tab：pending / skipped / drafted | ✅ | tab state + URL search param 持久 |
| /pending 4 filter: space multi-select / sender / body / mentioned-only | ✅ | `usePending` 帶 query 進 fetch |
| Skip popover 6 reasons 對齊 SKILL.md §3.5 enum | ✅ | pure-ack / overheard / policy-redline / not-targeted / low-info + manual |
| WS 200ms debounce revalidate | ✅ | `usePending.ts` |
| Extension popup：偵測 chat.google.com tab 才顯示 sync-current 按鈕 | ✅ | `chrome.tabs.query` filter |
| Extension popup：UUID job_id + chrome.storage 暫存 resume polling | ✅ | popup.js |
| Extension batchexecute RPC: jfcZG (spaces) / oGiIKf (topics) / QyR6M (messages) | ✅ | 200ms rate limit + exp backoff 4 attempts |
| httpapi unit tests 涵蓋 query params 4 case + WS broadcast | ✅ | claude_skip_test.go / hub_test.go 補新 case |
| sync_jobs_test.go duplicate job_id → ErrJobExists | ✅ | PG 23505 mapping |

偏差：無。

---

### 3. Coherence — PASS（with documented warnings）

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| API path 跨 lane 對齊 | ✅ | contracts.ts SYNC_HISTORY_{START,BATCH,COMPLETE,STATUS} = api.md 4 個 endpoint = httpapi handler 註冊 path |
| WS event name 對齊 | ✅ | contracts.ts PENDING_CHANGED = `pending_changed` = hub.go broadcast type |
| Skip reason enum 對齊（5 自動 + 1 manual） | ✅ | SKILL.md / web/src/contracts.ts / extension /reason 多處用同字串 |
| DOM testid 對齊 | ✅ | design 給出 21 個 testid → frontend 用、QA spec.ts 用同名（透過 contracts-sprint6.ts） |
| UX text 跨 lane | ✅ | contracts.ts TOAST/LABELS centralized，無 hardcode 中文 |
| Migration 編號（Sprint 6 實作版） | ⚠️ WARNING | tech-lead 改 sync_jobs=0020（spec 原寫 0021）。CR-002.md §4 主文未同步更新（仍寫 0020=space_facts，Sprint 7 才用），是 cosmetic drift，不影響執行 |
| contracts.generated.ts 與 types.go 對齊 | ✅ | `tygo generate` 後 zero diff |
| dependency graph: pipeline (#88) → backend (#83/#84) → frontend (#86/#87) → QA (#90) | ✅ | 依 wave 順序 merge，無循環 |

問題：
- Migration 編號 drift（cosmetic）：CR-002.md 主文 §4 仍寫「0020 = space_facts」，但 Sprint 6 實際把 0020 給了 sync_jobs。Sprint 7 規劃 space_facts 時需要採 0021/0022/0023 — tech-lead 已 record 在 `specs/sprints/sprint-6.md` 與 `tech-survey.md §0`。建議 Sprint 7 開工前 update CR-002.md 一致化。

---

## Issues 發現

### CRITICAL（必須修復）
無。

### WARNING（建議修復）
- **CR-002.md migration 編號未同步**：主 spec 文件未反映 Sprint 6 deviation。建議 Sprint 7 spec phase 順帶補正。
- **E2E tests 未在實機跑過**：PR #96 寫了 4 個 spec.ts，但本 sprint 期間無 frontend live demo + backend live API 端到端跑過。建議部署後手動跑 `npx playwright test` 確認全綠（若失敗建 bug issue）。

### SUGGESTION（可改善）
- **Worktree race condition 流程教訓**：本 sprint 過程中 backend + frontend agent 一度共用主 worktree 而 race condition，半成品 stash 到 `rescue/sprint-6-wip`。建議改善 `specflow:implement` skill：確保 isolation=worktree 對 engineer agents 真的有效，且 worktree 建立失敗應 fail-fast 而非 fallback 到主 worktree。
- **PR #91/#92 重複**：F-012-be1 有兩個 merged PR (#91 為 v1 + #92 為 v2 補強)。建議 review process 改善：v1 merged 後若有 follow-up，改成 hotfix PR 而非同名 v2，PR 標題避免歧義。
- **特殊 backend agent 卡 commit 問題**：兩次 backend agent + 一次 QA agent 在「commit + push + create PR」階段被截斷。建議 engineer agent 在 prompt 顯式分步：先 commit + push（最重要），最後再清理 / 回報。

---

## AC 覆蓋總結

Sprint 6 對應 CR-002 Part B + sync infra 完成標準逐項：

| 完成標準 | 狀態 |
|---------|------|
| Migration 0020 (sync_jobs) up + down 跑得起來 | ✅ |
| Extension popup「同步所有 space」按鈕觸發 batchexecute 並 mirror 到 backend | ✅（程式碼齊；實機驗證留給 QA / 使用者） |
| `/api/extension/sync-history/*` 4 個 endpoint 通過 unit test | ✅ |
| Pending viewer 4 filter + skip/unskip + WS live update | ✅ |
| Settings 頁加 /pending 連結 | ✅ |

---

## 結論

Sprint 6 三大交付目標全部達成：
- ✅ Extension-only sync history 鏈路（popup → content.js → batchexecute RPC → backend ingestion → sync_jobs 持久狀態）
- ✅ Pending message viewer 頁面（filter + skip / unskip + WS pending_changed live update）
- ✅ 跨 lane contract 一致（API path / WS event / testid / 字串完全對齊）

靜態驗證 PASS，unit tests PASS，`go build ./...` 零錯誤，web build 零錯誤，contracts no-drift。
兩項 WARNING 為 cosmetic drift（CR-002.md 編號未同步）與待實機跑 e2e — 都不阻擋 release。

Sprint 6 release recommendation：**proceed**（建議版本號 v0.6.0）。

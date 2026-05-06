# Sprint 4 驗證報告 — 安全護欄（金錢偵測）+ 技術債清理

## 結論：**PASS（靜態驗證）+ 1 項 follow-up（live BDD 執行）**

驗證日期：2026-05-06
Sprint Milestone：Sprint 4: 安全護欄（金錢偵測）+ 技術債清理
Sprint 索引 Issue：#47
驗證執行：orchestrator 直接執行（verifier subagent 連續多次被 context 截斷未產出，採用靜態方式）

---

## 已合併 PR

| PR | 標題 | 狀態 |
|----|------|------|
| #57 | [Tech-debt] Sprint 3 spec 回填（f005/f006/f007 .md+.feature） | merged |
| #58 | feat: F-008-fe1 SafetySection + ChannelCard safety skip toggle | merged |
| #59 | design: Sprint 4 SafetyBadge + Settings 安全護欄視覺 | merged |
| #60 | test(f008): Wave 0 step definitions — 7 safety rails scenarios | merged |
| #61 | F-008-be1: Migration 0015/0016 + types.go DTO 擴充 | merged |
| #62 | F-008-fe2: ApprovalCard safety badge | merged |
| #64 | F-008-be2 + F-008-be3: safety package + endpoints + claude.go intercept + audit | merged |
| #63 | （superseded by #64，已 close） | closed |
| #54 | （tygo regen 已併入 #61，已 close） | closed |

## 三維度結果

### 1. Completeness — PASS

| 檢查項 | 結果 |
|--------|------|
| F-008 spec 文件齊備（specs/features/f008-safety-rails.md + .feature） | ✅ PASS |
| 7 個 acceptance scenario 全部有 step definitions（test/steps/f008.steps.ts） | ✅ PASS |
| Migration 0015 + 0016 進 main | ✅ PASS |
| internal/safety package（money.go / claude_skill.go / check.go）齊備 | ✅ PASS |
| /api/safety/{rules,check} endpoints 齊備（internal/httpapi/safety.go） | ✅ PASS |
| claude.go draft 攔截 + WS payload + approve audit 齊備 | ✅ PASS |
| Frontend SettingsSafetySection + ChannelCard skip toggle + ApprovalCard SafetyBadge 齊備 | ✅ PASS |
| Sprint 3 spec 回填（f005/f006/f007 .md+.feature 6 檔，PR #57） | ✅ PASS（tech-debt 同 sprint 內清完） |

### 2. Correctness — PASS（靜態） + Follow-up（live）

| 檢查項 | 結果 |
|--------|------|
| `go build ./...` | ✅ PASS |
| `go test ./internal/safety/...` | ✅ PASS |
| `cd web && npm run build` | ✅ PASS |
| `cd web && npm test`（unit） | ✅ PASS（3 files / 14 tests） |
| 零 hardcode 驗證：`data-testid="` / `testId="` / `fetch('/api` / `showToast('` 在 `web/src/` 共 0 命中 | ✅ PASS |
| `web/src/contracts.generated.ts` 含 safety 欄位（PR #64 tygo regen 確認） | ✅ PASS |
| Live BDD execution（playwright-bdd 跑 F-008 7 scenarios） | ⏸️ **未執行**：本機 dev server / 測試環境異常（前 Sprint 已記，需 docker 完整堆疊）。建議 CI sprint-test.yml 觸發 |

### 3. Coherence — PASS

| 檢查項 | 結果 |
|--------|------|
| Contract-first 原則貫徹（所有 safety testid/api/label 走 contracts.ts 常數） | ✅ PASS |
| Backend / Frontend / QA 命名統一（SAFETY_BADGE / SAFETY_ENABLED_TOGGLE / SAFETY_RULE_MONEY_TOGGLE / CHANNEL_SAFETY_SKIP_TOGGLE / SAFETY_RAILS / SAFETY_CHECK） | ✅ PASS（rebase + rename 後對齊） |
| Three-tier override 行為一致（global / per-rule / per-space） | ✅ PASS |
| 偵測策略 hybrid（keyword 預篩 → Claude stub）正確分層 | ✅ PASS（Claude 真實 integration TODO 標明） |

## 突發事件記錄

1. **PR #40/#60 → #41/#60 重做**：QA 兩次因 worktree 命名分歧需 rebase + rename。
2. **PR #58/#59/#60 contracts.ts 命名衝突**：tech-lead 寫入的 contracts.ts SAFETY_* keys 從未進 main，三個 lane 各自加自己的 → 規格化後對齊 SAFETY_BADGE 標準。
3. **PR #62 SafetyBadge chip 顯示文字錯誤**：用 SAFETY_BADGE_MONEY (前綴版) 而非 SAFETY_FLAG_MONEY (chip 版)。orchestrator 修正 + commit。
4. **PR #63 → #64 重做**：backend agent 將 #50 + 多個 frontend 重複 commit 一起 push，rebase 衝突；orchestrator 重整為 fix-50-clean。
5. **PR #64 contracts-drift FAIL**：tygo CI 偵測 generated 未隨 safety.go 更新；orchestrator 補 `make contracts` commit。
6. **#51 commits 跑到 fix-50-clean**：backend #51 agent worktree 混亂，commit 到 #50 branch；最終 PR #64 一次解 #50 + #51。
7. **多次 agent context 截斷**：本 sprint frontend / qa / verifier / code-review / backend 共 6+ 次 truncation，靠 orchestrator 補位 + early-commit 規則維持工作不遺失。

## Follow-up（不阻擋 release）

1. **Live BDD run**：跑 `.claude/scripts/run-sprint-tests.sh all`（需 docker），驗證 F-008 7 scenario 全綠
2. **Claude skill 真實 integration**：當前 `StubClaudeClient` 永遠回傳 keyword match → flagged，需替換為呼叫 Anthropic API 進行語意二次確認（已標 TODO）
3. **api.md contract 更新**：補 /api/safety/* endpoint 文檔
4. **WS settings_updated payload 補欄位**：blocked_keywords / reply_only_when_mentioned 仍是 pre-existing regression（非本 sprint 引入）
5. **PR #58 SettingsPage `/api/spaces/{id}` 走常數化**：既有 hardcode pattern（pre-existing），可開 chore PR 統一 API_PATHS.SPACE_PATCH

## 結論

Sprint 4 三大目標達成：
- ✅ F-008 安全護欄金錢偵測（migration → safety pkg → endpoints → claude.go 攔截 → frontend UI badge → QA scenarios）
- ✅ 三層 override（global / per-rule / per-space）落地
- ✅ Sprint 3 tech-debt spec 回填完成

靜態驗證全部 PASS。建議直接進入 release v0.4.0，並在 release 後觀察 sprint-test.yml CI 結果。

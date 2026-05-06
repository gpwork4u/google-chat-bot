# F-007: BDD Cleanup（28 fail → 0 fail，58/58 全綠）

## Status: completed
## Sprint: 3
## Priority: P0
## Lane: qa

## 使用者故事

As a QA engineer
I want Sprint 2 accumulated 28 個 fail scenario 全部修復
So that `bash .claude/scripts/run-sprint-tests.sh` exit 0，cucumber report 58 passed / 0 failed / 0 pending

## 背景（28 Fail 根因分組）

### Group A — F-002 deferred（5 fail）
Sprint 1 #14 留下；ID model + WS payload-driven 修補後仍有 step 端 timing 問題

### Group B — F-003 filter / pagination（5 fail）
mode/space/date filter state mgmt + cursor pagination append 邏輯

### Group C — F-004 testid alignment（13 fail）
Settings 頁 testid 對不上；主要由 F-005 完成後自動解決，本 issue 處理 step impl 端 import contracts

### Group D — Toast race condition
Hotfix #29 後殘餘；toast 抓取改用 `TESTIDS.TOAST` 而非 `role="status"`

詳細場景見 `specs/verify-sprint-2.md`。

## 範圍（In Scope）

1. Step definitions 全面 import `contracts.ts`（API_PATHS / TESTIDS / TOAST），移除所有 hardcode
2. F-002 step：inbox state assertion timing + WS payload-driven ID model
3. F-003 frontend：mode/space/date filter state mgmt；cursor pagination append
4. F-003 step：filter 切換後等待 list re-render 再 assert
5. F-004 step：依賴 F-005 完成後 import TESTIDS
6. Toast：所有 `then 顯示 toast` step 改 testid + text 雙重 assert + `await expect(toast).toBeVisible()`

## 非範圍（Out of Scope）

- 新增 BDD scenario（僅修復既有 fail）
- 修改 `.feature` 檔案內容（step wording 不變）
- 修改 backend 邏輯

## 驗收標準（硬性）

- `bash .claude/scripts/run-sprint-tests.sh` exit 0
- cucumber report：**58 passed / 0 failed / 0 pending**
- `rg 'data-testid="' test/steps/` 結果為空
- `rg "fetch\\('/api" test/steps/` 結果為空
- `rg "已儲存|儲存失敗" test/steps/` 結果為空（改 TOAST 常數）
- F-001 既有 8 個 scenario 仍全綠

## 相關

- Epic: #1
- Sprint 3 Issue: #32
- 依賴：F-005（Group C 必須等 F-005 merge 後才能完成）
- Verify report: `specs/verify-sprint-2.md`

## Scenarios

詳見 `f007-bdd-cleanup.feature`

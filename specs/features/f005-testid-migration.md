# F-005: Testid Migration（contracts.ts.TESTIDS 全面採用）

## Status: completed
## Sprint: 3
## Priority: P0
## Lane: frontend

## 使用者故事

As a 開發者
I want 所有 frontend 元件改為從 `web/src/contracts.ts` 的常數讀取 testid / API path / toast 文字
So that 前端有 single source of truth，QA step definitions 與 frontend 實作永遠一致，不會因為 hardcode 字串漂移而 BDD 失敗

## 範圍（In Scope）

1. 全面替換 `web/src/` 下所有 hardcoded `data-testid="..."` 改用 `TESTIDS.*` 常數
2. 全面替換 `fetch('/api/...')` 改用 `API_PATHS.*` 常數
3. 全面替換 `showToast('...')` / toast 文字改用 `TOAST.*` 常數
4. 全面替換 UI label 文字改用 `LABELS.*` 常數（如有）
5. 缺鍵時擴充 `contracts.ts`，不另寫 hardcode
6. 涵蓋元件：
   - `web/src/pages/SettingsPage.tsx`（含 ChannelList / ProfileFactsEditor）
   - `web/src/pages/SentPage.tsx`
   - `web/src/pages/ApprovalsPage.tsx`
   - `web/src/components/*.tsx` 所有元件

## 非範圍（Out of Scope）

- 變更 API 結構或 backend
- 新增 UI 功能
- contracts.ts 型別定義（由 F-006 負責）

## 驗收標準

- `rg 'data-testid="' web/src/ --glob '!contracts.ts'` 結果為空
- `rg "fetch\\('/api" web/src/` 結果為空（全改 API_PATHS）
- 缺鍵時擴 contracts.ts，不另寫 hardcode
- F-001 / F-002 既有 BDD 不 regression
- F-004 testid 對齊問題（13 fail）至少消除 11 個

## 相關

- Epic: #1
- Sprint 3 Issue: #30
- 依賴：無（可優先啟動）
- 後續：F-007 step impl 端會 import 同一份 TESTIDS

## Scenarios

詳見 `f005-testid-migration.feature`

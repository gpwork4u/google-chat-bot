# language: en

@sprint-3 @f005 @frontend @regression
Feature: F-005 Testid Migration（contracts.ts 全面採用）
  As a 開發者
  I want 所有元件透過 contracts.ts 常數使用 testid / API path / toast 文字
  So that 前端與 QA 有 single source of truth

  # --- Zero hardcode 驗證 ---

  Scenario: web/src/ 不含 hardcoded data-testid 字串
    Given 已 checkout main 分支
    When 執行 `rg 'data-testid="' web/src/ --glob '!contracts.ts'`
    Then 命令輸出為空（0 個命中）

  Scenario: web/src/ 不含 hardcoded fetch API 路徑
    Given 已 checkout main 分支
    When 執行 `rg "fetch\\('/api" web/src/`
    Then 命令輸出為空（0 個命中）

  Scenario: web/src/ 不含 hardcoded toast 文字
    Given 已 checkout main 分支
    When 執行 `rg "showToast\\('" web/src/ --glob '!contracts.ts'`
    Then 命令輸出為空（0 個命中）

  # --- contracts.ts 完整性 ---

  Scenario: contracts.ts 包含所有必要的 TESTIDS 常數
    Given contracts.ts 已載入
    Then TESTIDS 物件包含 ApprovalsPage 相關的 testid 鍵
    And TESTIDS 物件包含 SentPage 相關的 testid 鍵
    And TESTIDS 物件包含 SettingsPage 相關的 testid 鍵

  Scenario: contracts.ts 包含所有必要的 API_PATHS 常數
    Given contracts.ts 已載入
    Then API_PATHS 物件包含 inbox / drafts / settings / spaces / profile 相關路徑

  Scenario: contracts.ts 包含所有必要的 TOAST 常數
    Given contracts.ts 已載入
    Then TOAST 物件包含 approved / rejected / saved / error 相關文字

  # --- 既有 BDD 不 regression ---

  Scenario: F-001 所有 scenario 仍然通過
    Given Sprint 3 F-005 已 merge
    When 執行 F-001 相關的 playwright-bdd tests
    Then 8 個 scenario 全部通過

  Scenario: F-002 所有 scenario 仍然通過
    Given Sprint 3 F-005 已 merge
    When 執行 F-002 相關的 playwright-bdd tests
    Then 12 個 scenario 全部通過

  # --- SettingsPage testid 對齊 ---

  Scenario: F-004 testid 對齊問題大幅改善
    Given F-005 已 merge
    When 執行 F-004 相關的 playwright-bdd tests
    Then 原本 13 個 fail 中至少 11 個消除

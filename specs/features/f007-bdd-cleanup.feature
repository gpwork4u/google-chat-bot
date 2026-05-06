# language: en

@sprint-3 @f007 @qa @regression
Feature: F-007 BDD Cleanup（28 fail → 0 fail）
  As a QA engineer
  I want Sprint 2 的 28 個 fail scenario 全部修復
  So that cucumber report 全綠，CI sprint-test.yml 通過

  # --- Zero hardcode in step definitions ---

  Scenario: test/steps/ 不含 hardcoded data-testid 字串
    Given 已 checkout main 分支（F-007 已 merge）
    When 執行 `rg 'data-testid="' test/steps/`
    Then 命令輸出為空（0 個命中）

  Scenario: test/steps/ 不含 hardcoded API 路徑
    Given 已 checkout main 分支（F-007 已 merge）
    When 執行 `rg "fetch\\('/api" test/steps/`
    Then 命令輸出為空（0 個命中）

  Scenario: test/steps/ 不含 hardcoded toast 文字
    Given 已 checkout main 分支（F-007 已 merge）
    When 執行 `rg "已儲存|儲存失敗" test/steps/`
    Then 命令輸出為空（0 個命中）

  # --- Group A: F-002 timing（5 fail fix）---

  Scenario: F-002 WebSocket 新 draft 即時加入
    Given backend 已啟動且 /ws/ui 連線正常
    And list 目前有 2 張 draft
    When backend 透過 /ws/ui 推送 draft_created 事件
    Then step 等待 list re-render 完成後
    And list 變成 3 張

  Scenario: F-002 他端送出後本端自動移除
    Given list 目前有 2 張 draft（id=A, id=B）
    When 另一個 tab 對 draft B 按 Approve
    And step 等待 WS 事件 draft_removed 傳遞
    Then list 只剩 1 張（id=A）

  # --- Group B: F-003 filter / pagination（5 fail fix）---

  Scenario: F-003 mode filter 切換後 list 正確過濾
    Given SentPage 已載入，有 draft 和 auto-sent 兩種 record
    When 使用者切換 mode filter 為 "draft"
    And step 等待 list re-render 完成
    Then 只顯示 mode=draft 的 record

  Scenario: F-003 space filter 切換後 list 正確過濾
    Given SentPage 已載入，有多個 space 的 record
    When 使用者切換 space filter 為特定 space
    And step 等待 list re-render 完成
    Then 只顯示該 space 的 record

  Scenario: F-003 cursor pagination append 正確
    Given SentPage 已載入第一頁 10 筆
    When 使用者捲動到頁面底部或點擊「載入更多」
    And step 等待第二頁載入完成
    Then list 新增第二頁資料而非取代

  # --- Group C: F-004 testid alignment（13 fail fix，依賴 F-005）---

  Scenario: F-004 SettingsPage 全域設定區塊 testid 正確
    Given SettingsPage 已載入
    And F-005 已 merge（testid 從 contracts.ts 讀取）
    Then step 可以用 TESTIDS.SETTINGS_AUTO_MODE_TOGGLE 找到 auto-mode toggle
    And step 可以用 TESTIDS.SETTINGS_FRESHNESS_INPUT 找到 freshness input

  Scenario: F-004 ChannelList testid 正確
    Given SettingsPage 已載入且有 channel 資料
    And F-005 已 merge
    Then step 可以用 TESTIDS.CHANNEL_CARD 找到 channel 卡片
    And step 可以用 TESTIDS.CHANNEL_ENABLED_TOGGLE 找到啟用 toggle

  Scenario: F-004 ProfileFactsEditor testid 正確
    Given SettingsPage 已載入且有 profile facts
    And F-005 已 merge
    Then step 可以用 TESTIDS.PROFILE_FACT_ITEM 找到 fact 項目
    And step 可以用 TESTIDS.ADD_FACT_BUTTON 找到新增按鈕

  # --- Group D: Toast race condition fix ---

  Scenario: Toast 以 testid 雙重 assert 取代 role=status
    Given 任何觸發 toast 的操作完成
    When toast 出現
    Then step 使用 TESTIDS.TOAST 定位 toast 元素（而非 role=status）
    And step assert toast 文字正確（使用 TOAST 常數）
    And step assert toast 可見（await expect(toast).toBeVisible()）

  # --- 整體回歸 ---

  Scenario: sprint-test.sh 全部通過
    Given Sprint 3 F-007 已 merge
    When 執行 `bash .claude/scripts/run-sprint-tests.sh`
    Then 命令 exit code 為 0
    And cucumber report 顯示 58 passed / 0 failed / 0 pending

  Scenario: F-001 既有 scenario 仍然全綠
    Given Sprint 3 F-007 已 merge
    When 執行 F-001 相關的 playwright-bdd tests
    Then 8 個 scenario 全部通過，無 regression

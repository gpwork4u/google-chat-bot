# language: en

@sprint-1 @f002 @frontend
Feature: F-002 Approval Queue 頁
  As a 使用者
  I want 在一個畫面 approve / edit / reject 所有 pending draft
  So that 我能快速處理 inbox

  Background:
    Given 使用者已開啟 React app 並導航到 /approvals
    And backend /ws/ui 連線正常

  # --- Happy Path ---

  Scenario: 載入 pending drafts
    Given backend 有 3 個 pending draft
    When 頁面完成載入
    Then 顯示 3 張 draft 卡片
    And 卡片依 created_at 降序排列
    And 每張卡片顯示 space_name / sender_name / draft_content / category

  Scenario: 直接 Approve 送出原始草稿
    Given 第一張 draft 內容為 "好的, 收到"
    When 使用者點擊第一張卡片的 Approve 按鈕
    Then 發送 POST /api/drafts/{id}/approve with body {"content": "好的, 收到"}
    And 該卡片從 list 移除
    And 顯示成功 toast "已送出"

  Scenario: 編輯後 Approve
    Given 第一張 draft 原內容為 "OK"
    When 使用者編輯 textarea 改成 "OK, 我等等回你"
    And 點擊 Approve
    Then 發送 POST /api/drafts/{id}/approve with body {"content": "OK, 我等等回你"}
    And 卡片從 list 移除

  Scenario: Reject 丟棄
    When 使用者點擊第一張卡片的 Reject 按鈕
    Then 發送 POST /api/drafts/{id}/reject
    And 卡片從 list 移除
    And 顯示 toast "已丟棄"

  # --- WebSocket realtime ---

  Scenario: 新 draft 即時加入
    Given list 目前有 2 張 draft
    When backend 透過 /ws/ui 推送 draft_created 事件
    Then list 變成 3 張
    And 新 draft 出現在最上方

  Scenario: 他端送出後本端自動移除
    Given list 目前有 2 張 draft (id=A, id=B)
    When 另一個 tab 對 draft B 按 Approve
    And 本端透過 /ws/ui 收到 draft_removed {"draft_id": "B"}
    Then list 只剩 1 張 (id=A)

  # --- Keyboard shortcuts ---

  Scenario: j / k 移動焦點
    Given list 有 3 張卡片，焦點在第 1 張
    When 使用者按 "j"
    Then 焦點移到第 2 張
    When 使用者按 "k"
    Then 焦點移回第 1 張

  Scenario: Enter approve、e edit、x reject
    Given 焦點在第 1 張卡片
    When 使用者按 "Enter"
    Then 觸發該卡片的 Approve

  # --- Edge cases ---

  Scenario: 空狀態
    Given backend 沒有任何 pending draft
    When 頁面載入完成
    Then 顯示文案 "Inbox zero"

  Scenario: API 失敗
    Given backend /api/inbox 回 500
    When 頁面載入
    Then 顯示錯誤狀態 + retry 按鈕
    When 使用者點 retry
    Then 重新呼叫 /api/inbox

  Scenario: 重複 approve 不會出錯
    Given draft id=A 已被 approve 過
    When 使用者再次按 Approve
    Then backend /reply idempotent 回 200
    And 前端顯示「已送出」(不出現紅色錯誤)

  # --- Debug mode ---

  Scenario Outline: Categorize 標籤顯示
    Given draft 的 category 為 <category>
    Then 卡片標籤顯示 <label>

    Examples:
      | category           | label    |
      | daily-chat         | 閒聊     |
      | work-coordination  | 工作協調 |
      | engineering        | 工程     |
      | skip               | 略過     |

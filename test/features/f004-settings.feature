# language: en

@sprint-2 @f004 @frontend
Feature: F-004 Settings 頁
  As a 使用者
  I want 集中管理全域 + per-channel + profile 設定
  So that 不需要回到舊版 UI 操作

  Background:
    Given 使用者導航到 /settings
    And backend 已連線

  # --- Global section ---

  Scenario: 載入全域設定
    Given GET /api/settings 回 {auto_mode:false, freshness_window_minutes:30, debug_mode:false}
    When 頁面完成載入
    Then auto-mode toggle 顯示 off
    And freshness 數字顯示 30
    And debug toggle 顯示 off

  Scenario: 切換 auto-mode
    When 使用者點 auto-mode toggle 從 off → on
    Then 發送 PATCH /api/settings with body {"auto_mode": true}
    And 顯示 toast "已儲存"
    And toggle 視覺切到 on

  Scenario: 修改 freshness window
    When 使用者把 freshness 改成 60 並按 Enter
    Then 發送 PATCH /api/settings with body {"freshness_window_minutes": 60}

  Scenario Outline: freshness 邊界值
    When 使用者把 freshness 改成 <value>
    Then 行為 <behavior>

    Examples:
      | value | behavior                                           |
      | 1     | 允許，PATCH 成功                                   |
      | 1440  | 允許，PATCH 成功                                   |
      | 0     | 拒絕，前端顯示驗證錯誤，不送 PATCH                 |
      | 1441  | 拒絕，前端顯示驗證錯誤                             |
      | -5    | 拒絕，前端顯示驗證錯誤                             |

  # --- Channels section ---

  Scenario: 載入 channel 列表
    Given GET /api/spaces 回 3 個 space
    Then 顯示 3 張 channel 卡片
    And 每張顯示 enabled / mention_only / auto_mode_override / blocked_keywords

  Scenario: 切換 channel 啟用狀態
    Given channel "AAAA" 目前 enabled=true
    When 使用者切 toggle 為 off
    Then 發送 POST /api/spaces/toggle with body {"space_id":"AAAA","enabled":false}

  Scenario: 切換 mention-only
    When 使用者對 channel "AAAA" 切 mention-only 為 on
    Then 發送 PATCH /api/spaces/AAAA with body {"mention_only":true}

  Scenario Outline: auto_mode_override 三態
    When 使用者選 channel "AAAA" 的 override 為 <value>
    Then 發送 PATCH /api/spaces/AAAA with body {"auto_mode_override":"<value>"}

    Examples:
      | value       |
      | inherit     |
      | always_on   |
      | always_off  |

  Scenario: 新增 blocked keyword
    When 使用者在 channel "AAAA" 的 blocked keywords 輸入 "薪水" 並按 Enter
    Then 發送 PATCH /api/spaces/AAAA with body {"blocked_keywords":["薪水"]}
    And 該 keyword 顯示為 chip

  Scenario: 刪除 blocked keyword
    Given channel "AAAA" 已有 keyword "薪水"
    When 使用者點該 chip 的 X 按鈕
    Then 發送 PATCH /api/spaces/AAAA with body {"blocked_keywords":[]}

  # --- Profile section ---

  Scenario: 列出 profile facts 依 visibility 分組
    Given GET /api/claude/profile 回 facts: 2 public, 1 private, 1 secret
    Then 顯示 3 個分組標題: Public / Private / Secret
    And Public 區塊顯示 2 筆

  Scenario: 新增 profile fact
    When 使用者點擊 "Add fact"
    And 輸入 key="主管溝通", value="敬語為主", visibility="private"
    And 點 Save
    Then 發送 POST /api/claude/profile with 對應 body
    And 該 fact 出現在 Private 分組

  Scenario: 編輯 profile fact
    When 使用者點 fact 旁的 Edit
    And 改 value 為 "更口語"
    And 點 Save
    Then 發送 PATCH /api/claude/profile/{id}

  Scenario: 刪除 profile fact
    When 使用者點 fact 旁的 Delete
    And 確認對話框
    Then 發送 DELETE /api/claude/profile/{id}
    And 該 fact 從 list 移除

  # --- WebSocket sync ---

  Scenario: 他端改全域設定本端同步
    Given 本端 auto-mode toggle 為 off
    When 另一個 tab PATCH auto_mode=true
    And 本端 /ws/ui 收到 settings_updated 事件
    Then 本端 toggle 自動切到 on
    And 不顯示 toast (避免噪音)

  # --- Errors ---

  Scenario: PATCH 失敗顯示錯誤
    When 使用者切 auto-mode toggle，但 backend 回 500
    Then 顯示錯誤 toast "儲存失敗，請重試"
    And toggle 回滾到原始狀態

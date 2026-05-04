# language: en

@sprint-2 @f003 @frontend
Feature: F-003 Sent Log 頁
  As a 使用者
  I want 看到送出歷史
  So that 我可以稽核 AI 代我送了什麼

  Background:
    Given 使用者已導航到 /sent

  # --- Happy Path ---

  Scenario: 載入最近 7 天 sent log
    Given backend GET /api/sent 回傳 10 筆
    When 頁面載入完成
    Then 顯示 10 筆 sent 記錄
    And 依 sent_at 降序排列
    And 每筆顯示 space_name / sender_name / trigger_message / sent_content / mode

  Scenario Outline: Mode 標籤顯示
    Given sent record mode 為 <mode>
    Then 標籤文字為 <label>
    And 標籤顏色為 <color>

    Examples:
      | mode     | label    | color |
      | approved | 已審核   | blue  |
      | auto     | 自動送出 | amber |

  # --- Filters ---

  Scenario: Mode filter 過濾
    Given list 有 5 筆 approved + 3 筆 auto
    When 使用者選擇 filter "auto"
    Then 發送 GET /api/sent?mode=auto
    And 只顯示 3 筆

  Scenario: Space filter 多選
    Given 使用者勾選 space "Team A" 和 "Team B"
    When 套用 filter
    Then 請求包含 space_ids=A&space_ids=B
    And 只顯示這兩個 space 的記錄

  Scenario: 日期區間
    Given 使用者選擇 from=2026-04-01 to=2026-04-30
    When 套用 filter
    Then 請求包含 from=2026-04-01T00:00:00Z 與 to=2026-04-30T23:59:59Z
    And 只顯示該區間記錄

  Scenario: 預設區間為最近 7 天
    Given 今日為 2026-05-04
    When 頁面首次載入
    Then 請求 from 為 2026-04-27T00:00:00Z

  # --- Search ---

  Scenario: 子字串搜尋
    Given 使用者在搜尋框輸入 "OK"
    When 失焦或按 Enter
    Then 發送 GET /api/sent?q=OK
    And 只顯示 sent_content 包含 "OK" 的筆（不分大小寫）

  # --- Pagination ---

  Scenario: 載入下一頁
    Given 第一頁有 50 筆且回傳 next_cursor="abc"
    When 使用者捲動到底部 / 點擊「載入更多」
    Then 發送 GET /api/sent?cursor=abc
    And 新 50 筆 append 到既有 list

  # --- Detail expand ---

  Scenario: 點擊展開詳情
    When 使用者點擊一筆 record
    Then 該筆展開顯示 context messages + category + edited_by_user 徽章

  # --- Edge cases ---

  Scenario: 空狀態
    Given GET /api/sent 回 0 筆
    Then 顯示文案 "近 7 天沒有送出記錄"

  Scenario: limit 超過 100 應拒絕
    When 請求 GET /api/sent?limit=200
    Then response status 為 400
    And response code 為 "INVALID_PARAM"

  Scenario: 編輯過徽章
    Given record edited_by_user=true
    Then 顯示徽章 "使用者編輯過"

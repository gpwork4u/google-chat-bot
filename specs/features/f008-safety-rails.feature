Feature: F-008 安全護欄 - 金錢偵測
  作為使用者，我希望系統能偵測 draft 中的金錢相關內容，
  即使 auto_mode=ON 也強制降級為 draft，避免 LLM 誤觸金錢承諾。

  Background:
    Given 已登入並開啟 Settings 頁
    And 全域 safety_rails_enabled = true
    And 全域 safety_rules.money = true
    And 預設 space override = "inherit"

  @safety @money
  Scenario: money keyword 命中 + Claude 二次確認 → draft 帶 flag、強制 draft 模式
    Given auto_mode = "always_on"
    And space "spaces/AAA" 有新訊息「請報價」
    When Claude 產出 draft「好的，這個案子 NT$50000，週五前付款」
    And 系統呼叫 /api/safety/check
    Then safety check 回傳 flagged=true, flags=["money"]
    And draft 寫入 DB 時 mode = "draft"（不是 auto_send）
    And draft.safety_flags = ["money"]
    And draft.safety_trigger_reason 非空
    And ApprovalCard 顯示警示 badge

  @safety @money
  Scenario: 全域 safety_rails_enabled=false → 不檢查
    Given safety_rails_enabled = false
    And auto_mode = "always_on"
    When Claude 產出 draft「轉 NT$10000 給你」
    Then 不呼叫 /api/safety/check
    And draft.safety_flags = []
    And draft 依 auto_mode 規則直接送出

  @safety @money
  Scenario: per-space override = "disabled" → 該 space 跳過
    Given space "spaces/test" 的 safety_rails_override = "disabled"
    And auto_mode = "always_on"
    When 在 "spaces/test" 收到訊息並產出 draft「定金 NT$3000」
    Then draft.safety_flags = []
    And draft 不被降級

  @safety @money
  Scenario: per-rule money=false → 跳過 money 偵測
    Given safety_rules.money = false
    When Claude 產出 draft「我會匯 NT$5000」
    Then 不執行 keyword 預篩
    And draft.safety_flags = []

  @safety @money @cost
  Scenario: keyword 預篩未命中 → 不呼叫 Claude（節省 token）
    When Claude 產出 draft「好的，沒問題，週五前完成」
    Then keyword 預篩 = false
    And 不呼叫 Claude safety-check skill
    And draft.safety_flags = []

  @safety @money
  Scenario: keyword 命中但 Claude 二次確認否定 → 不降級
    When Claude 產出 draft「我們的 RD team 報告長度大概 5000 字」
    Then keyword 預篩命中（5000 數字+量詞）
    And Claude safety-check 回傳 flagged=false（context 非金錢）
    And draft.safety_flags = []
    And draft 依 auto_mode 規則處理

  @safety @audit
  Scenario: 使用者手動 approve 帶 safety_flags 的 draft → 寫入 audit
    Given 有一個 draft.safety_flags=["money"] 在 approval queue
    When 使用者點 approve
    Then POST /api/drafts/{id}/approve 成功
    And draft.safety_overridden_by = "manual_approve"
    And draft 被送出

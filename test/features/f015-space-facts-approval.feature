Feature: F-015 Space Facts Approval UI + chat-drafts Integration
  As a 單人使用者
  I want UI 讓我逐條 approve / edit / reject mining skill 產出的 candidate facts
  So that 我能 review AI 萃取的 context，且 chat-drafts skill 有 per-space 長期記憶

  Background:
    Given 使用者已登入

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-1 candidates 頁列出所有 candidate facts（按 space 分組）
    Given space "spaces/AAA" 有 2 筆 candidate facts
    And space "spaces/BBB" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    Then candidates 頁面顯示
    And "spaces/AAA" group 下有 2 筆 candidate rows
    And "spaces/BBB" group 下有 1 筆 candidate row

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-2 每筆 row 顯示 category badge + content + visibility 下拉 + source toggle
    Given space "spaces/AAA" 有 1 筆 candidate fact（category=product，content="FedGPT 平台"，source_message_ids=[100]）
    When 使用者前往 /space-facts/candidates
    Then 第一筆 candidate row 顯示 category badge
    And 第一筆 candidate row 顯示 content 文字
    And 第一筆 candidate row 顯示 visibility 下拉
    And 第一筆 candidate row 顯示 source toggle 按鈕

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-3 點 Approve → row 從列表消失，顯示 toast
    Given space "spaces/AAA" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Approve 按鈕
    Then 該 candidate row 從列表消失
    And 顯示 toast "Fact 已核准"

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-4 點 Reject → 顯示確認 dialog → 確認後 row 消失
    Given space "spaces/AAA" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Reject 按鈕
    Then 顯示確認 dialog
    When 使用者確認 dialog
    Then 該 candidate row 從列表消失
    And 顯示 toast "Fact 已拒絕"

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-5 點 Edit → row 進入編輯模式
    Given space "spaces/AAA" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Edit 按鈕
    Then 第一筆 candidate row 顯示編輯模式（content textarea 可輸入）
    And 顯示 Save 按鈕
    And 顯示 Cancel 按鈕

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-6 Edit 模式點 Save → PATCH，row 回顯示模式
    Given space "spaces/AAA" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Edit 按鈕
    And 使用者在 content 輸入 "修改後的內容"
    And 使用者點擊 Save 按鈕
    Then row 回到顯示模式
    And content 顯示 "修改後的內容"
    And 顯示 toast "Fact 已編輯"

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-7 Edit 模式點 Cancel → 回顯示模式，內容不變
    Given space "spaces/AAA" 有 1 筆 candidate fact（content="原始內容"）
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Edit 按鈕
    And 使用者在 content 輸入 "臨時輸入"
    And 使用者點擊 Cancel 按鈕
    Then row 回到顯示模式
    And content 顯示 "原始內容"

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-8 點 source toggle → 展開 source messages list
    Given space "spaces/AAA" 有 1 筆 candidate fact（source_message_ids=[100, 101]）
    And messages id=100 和 id=101 存在
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 source toggle
    Then source messages list 展開顯示
    And 列表包含 2 筆 message（body + sender + observed_at）

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-9 Visibility 下拉改 public → PATCH visibility
    Given space "spaces/AAA" 有 1 筆 candidate fact（visibility=private）
    When 使用者前往 /space-facts/candidates
    And 使用者將第一筆 candidate 的 visibility 改為 "public"
    Then PATCH /api/space-facts/{id} 被呼叫（visibility="public"）
    And 顯示 toast "Fact 已編輯"

  @f015 @sprint-7 @ui @candidates
  Scenario: AC-10 Approve all in space → 平行 approve，toast 顯示數量
    Given space "spaces/AAA" 有 3 筆 candidate facts
    When 使用者前往 /space-facts/candidates
    And 使用者點擊 "Approve all in space" 按鈕（spaces/AAA）
    Then "spaces/AAA" 的所有 candidate rows 消失
    And 顯示 toast 包含 "已核准" 和數量

  @f015 @sprint-7 @ui @settings
  Scenario: AC-11 SettingsPage 顯示 Space 事實 section 和 pending badge
    Given space "spaces/AAA" 有 3 筆 candidate facts
    When 使用者前往 /settings
    Then SettingsPage 顯示 Space 事實 section
    And 顯示待審核 candidates 數量徽章（N >= 3）

  @f015 @sprint-7 @ui @settings
  Scenario: AC-12 SettingsPage Space 事實 section 列出每個 space 卡片
    Given space "spaces/AAA" 有 2 筆 approved facts
    And space "spaces/BBB" 有 1 筆 approved fact
    When 使用者前往 /settings
    Then Space 事實 section 顯示 "spaces/AAA" 卡片（approved 數量=2）
    And Space 事實 section 顯示 "spaces/BBB" 卡片（approved 數量=1）

  @f015 @sprint-7 @ui @settings
  Scenario: AC-13 點 space 卡片進入詳情頁
    Given space "spaces/AAA" 有 1 筆 approved fact
    When 使用者前往 /settings
    And 使用者點擊 "spaces/AAA" 的 space 卡片
    Then 頁面 URL 包含 "/space-facts/"
    And 詳情頁面顯示

  @f015 @sprint-7 @ui @detail
  Scenario: AC-15 per-space 詳情頁顯示 5 個 category section
    Given space "spaces/AAA" 有各 category 的 approved facts
    When 使用者前往 /space-facts/spaces%2FAAA
    Then 詳情頁面顯示
    And 顯示 product section
    And 顯示 my-role section
    And 顯示 glossary section
    And 顯示 pinned-decision section
    And 顯示 relation section

  @f015 @sprint-7 @ui @detail
  Scenario: AC-16 詳情頁各 category section 列出 approved facts
    Given space "spaces/AAA" 有 2 筆 category=product 的 approved facts
    When 使用者前往 /space-facts/spaces%2FAAA
    Then product section 內有 2 筆 fact rows

  @f015 @sprint-7 @ui @detail
  Scenario: AC-17 詳情頁 edit → save → PATCH 成功
    Given space "spaces/AAA" 有 1 筆 approved fact
    When 使用者前往 /space-facts/spaces%2FAAA
    And 使用者點擊該 fact 的 edit 按鈕
    And 使用者在 content 輸入 "詳情頁修改內容"
    And 使用者點擊 Save 按鈕
    Then fact 顯示 "詳情頁修改內容"
    And 顯示 toast "Fact 已編輯"

  @f015 @sprint-7 @ui @detail
  Scenario: AC-18 詳情頁 delete → 確認 → DELETE 成功，row 消失
    Given space "spaces/AAA" 有 1 筆 approved fact
    When 使用者前往 /space-facts/spaces%2FAAA
    And 使用者點擊該 fact 的 delete 按鈕
    Then 顯示確認 dialog
    When 使用者確認 dialog
    Then 該 fact row 消失
    And 顯示 toast "Fact 已刪除"

  @f015 @sprint-7 @ui @detail
  Scenario: AC-19 詳情頁新增 manual fact → POST 成功，status=approved
    Given space "spaces/AAA" 的詳情頁
    When 使用者前往 /space-facts/spaces%2FAAA
    And 使用者點擊新增 fact 按鈕
    And 使用者填入 content="新增的手動事實" 且 category="glossary"
    And 使用者儲存
    Then 新 fact row 出現在 glossary section
    And 顯示 toast "Fact 已新增"

  @f015 @sprint-7 @ui @detail
  Scenario: AC-20 詳情頁點「重新 mine 此 space」→ toast 顯示已加入 queue
    Given space "spaces/AAA" 的詳情頁
    When 使用者前往 /space-facts/spaces%2FAAA
    And 使用者點擊「重新 mine 此 space」按鈕
    Then POST /api/space-facts/mining-queue 被呼叫（space_key="spaces/AAA"）
    And 顯示 toast "已加入 mining queue"

  @f015 @sprint-7 @ui @error
  Scenario: AC-25 Approve API 回 500 → toast 顯示儲存失敗，row 留在列表
    Given space "spaces/AAA" 有 1 筆 candidate fact
    And /api/space-facts/{id}/approve 被 mock 回 500
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Approve 按鈕
    Then 顯示 toast "儲存失敗，請重試"
    And 該 candidate row 仍在列表中

  @f015 @sprint-7 @ui @error
  Scenario: AC-26 Edit save 時 content="" → 400 → toast 儲存失敗
    Given space "spaces/AAA" 有 1 筆 candidate fact
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 Edit 按鈕
    And 使用者清空 content 輸入
    And 使用者點擊 Save 按鈕
    Then 顯示 toast "儲存失敗，請重試"
    And 編輯模式保留（Save/Cancel 仍顯示）

  @f015 @sprint-7 @ui @error
  Scenario: AC-27 不存在的 space_key 詳情頁 → 顯示 empty-state 或 redirect
    When 使用者前往 /space-facts/spaces%2FNOTEXIST
    Then 顯示 empty-state 或 redirect 到 /settings

  @f015 @sprint-7 @ui @error
  Scenario: AC-28 Mining queue 409 JOB_RUNNING → toast 顯示適當文字
    Given space "spaces/AAA" 的 mining job 已在 running
    And /api/space-facts/mining-queue 被 mock 回 409
    When 使用者前往 /space-facts/spaces%2FAAA
    And 使用者點擊「重新 mine 此 space」按鈕
    Then 顯示 toast 包含 "Mining" 相關提示

  @f015 @sprint-7 @ui @edge
  Scenario: AC-29 SettingsPage 卡片顯示 approved 數量（不含 candidate）
    Given space "spaces/AAA" 有 2 筆 approved facts 且 3 筆 candidate facts
    When 使用者前往 /settings
    Then "spaces/AAA" 卡片顯示 approved 數量 2（不含 candidate）

  @f015 @sprint-7 @ui @edge
  Scenario: AC-31 source_message_ids 中某 message 已刪除 → 顯示 placeholder
    Given space "spaces/AAA" 有 1 筆 candidate fact（source_message_ids=[999997]）
    And message id=999997 不存在
    When 使用者前往 /space-facts/candidates
    And 使用者點擊第一筆 candidate 的 source toggle
    Then source messages list 展開
    And 顯示 "訊息已刪除" 或類似 placeholder

  @f015 @sprint-7 @ui @edge
  Scenario: AC-33 visibility 改 secret 後 fact 不再出現在預設列表
    Given space "spaces/AAA" 有 1 筆 approved fact（visibility=private）
    When PATCH /api/space-facts/{id}（visibility=secret）
    Then 再次 GET /api/space-facts?space_key=spaces/AAA 不回此 fact

  @f015 @sprint-7 @ui @edge
  Scenario: AC-34 同一 fact 多次 PATCH → updated_at 更新，approved_at 不變
    Given space "spaces/AAA" 已有一條 approved fact（approved_at 已記錄）
    When PATCH /api/space-facts/{fact_id} 更改 content
    Then response 的 updated_at 更新
    And response 的 approved_at 與原始值相同

  @f015 @sprint-7 @skill @chat-drafts
  Scenario: AC-21 chat-drafts skill 對 space 第一次呼叫 GET /api/space-facts
    Given space "spaces/AAA" 有 2 筆 approved facts
    And chat-drafts skill mock 啟用
    When chat-drafts skill 處理 "spaces/AAA" 的 pending 訊息
    Then skill 呼叫 GET /api/space-facts?space_key=spaces/AAA&status=approved
    And skill prompt 包含 space facts section

  @f015 @sprint-7 @skill @chat-drafts
  Scenario: AC-24 某 space 無 facts → skill 正常處理，不報錯
    Given space "spaces/EMPTY" 無 approved facts
    And chat-drafts skill mock 啟用
    When chat-drafts skill 處理 "spaces/EMPTY" 的 pending 訊息
    Then skill 正常完成
    And skill prompt 中不包含 facts section（或 facts section 為空）

  @f015 @sprint-7 @regression
  Scenario: AC-R1 F-002 Approval queue 仍正常運作
    Given backend 有 1 個 pending draft
    When 使用者前往 /approvals
    Then 顯示 1 張 draft 卡片

  @f015 @sprint-7 @regression
  Scenario: AC-R2 F-004 SettingsPage Global / Channels / Profile sections 不變
    When 使用者前往 /settings
    Then SettingsPage 顯示 Global section
    And SettingsPage 顯示 Channels section
    And SettingsPage 顯示 Profile section

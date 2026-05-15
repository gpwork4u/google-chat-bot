Feature: F-014 Space Facts Mining — Backend + Skill
  As a 單人使用者
  I want 從每個 space 的歷史訊息自動萃取 5 類事實
  So that chat-drafts skill 在回覆時有 per-space 長期記憶

  @f014 @sprint-7 @api
  Scenario: AC-2 手動新增 fact 立即 approved
    Given space "spaces/AAA" 存在
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/AAA",
        "category": "product",
        "content": "此 space 主要討論 FedGPT 產品",
        "created_by": "manual"
      }
      """
    Then response status 201
    And response body 的 status 為 "approved"
    And response body 的 approved_at 不為 null

  @f014 @sprint-7 @api
  Scenario: AC-3 mining-skill 新增 fact 為 candidate
    Given space "spaces/AAA" 存在
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/AAA",
        "category": "relation",
        "content": "Alice 是 PM",
        "created_by": "mining-skill",
        "source_message_ids": [100, 101]
      }
      """
    Then response status 201
    And response body 的 status 為 "candidate"
    And response body 的 approved_at 為 null

  @f014 @sprint-7 @api
  Scenario: AC-4 approve endpoint 變更 status 為 approved
    Given space "spaces/AAA" 已有一條 candidate fact
    When POST /api/space-facts/{fact_id}/approve
    Then response status 200
    And response body 的 status 為 "approved"
    And response body 的 approved_at 不為 null

  @f014 @sprint-7 @api
  Scenario: AC-5 reject endpoint 變更 status 為 rejected
    Given space "spaces/AAA" 已有一條 candidate fact
    When POST /api/space-facts/{fact_id}/reject
    Then response status 200
    And response body 的 status 為 "rejected"

  @f014 @sprint-7 @api
  Scenario: AC-6 GET /api/space-facts?status=approved 只回 approved
    Given space "spaces/AAA" 有混合 status 的 facts
    When GET /api/space-facts?space_key=spaces/AAA&status=approved
    Then response status 200
    And response body 中所有 fact 的 status 為 "approved"

  @f014 @sprint-7 @api
  Scenario: AC-7 預設不回 secret visibility
    Given space "spaces/AAA" 有一條 visibility=secret 的 approved fact
    When GET /api/space-facts?space_key=spaces/AAA
    Then response status 200
    And response body 中不包含 visibility=secret 的 fact

  @f014 @sprint-7 @api
  Scenario: AC-8 include_secret=1 回所有 visibility
    Given space "spaces/AAA" 有一條 visibility=secret 的 approved fact
    When GET /api/space-facts?space_key=spaces/AAA&include_secret=1
    Then response status 200
    And response body 中包含 visibility=secret 的 fact

  @f014 @sprint-7 @api
  Scenario: AC-9 enqueue space 到 mining queue
    Given space "spaces/BBB" 存在
    When POST /api/space-facts/mining-queue with body:
      """
      { "space_key": "spaces/BBB" }
      """
    Then response status 為 201 或 200
    And response body 的 status 為 "pending"
    And response body 的 space_key 為 "spaces/BBB"

  @f014 @sprint-7 @api
  Scenario: AC-10 重複 enqueue completed job → reset 為 pending
    Given space "spaces/BBB" 的 mining job 為 "completed"
    When POST /api/space-facts/mining-queue with body:
      """
      { "space_key": "spaces/BBB" }
      """
    Then response status 為 201 或 200
    And response body 的 status 為 "pending"

  @f014 @sprint-7 @api
  Scenario: AC-12 GET /api/messages 回該 space 歷史訊息
    Given space "spaces/AAA" 有預載的歷史訊息
    When GET /api/messages?space_key=spaces/AAA&limit=200
    Then response status 200
    And response body 的 messages 為陣列
    And 所有 messages 的 space_key 為 "spaces/AAA"

  @f014 @sprint-7 @api
  Scenario: AC-13 content 為空 → 400 INVALID_INPUT
    Given space "spaces/AAA" 存在
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/AAA",
        "category": "product",
        "content": "",
        "created_by": "manual"
      }
      """
    Then response status 400
    And response body 的 code 為 "INVALID_INPUT"

  @f014 @sprint-7 @api
  Scenario: AC-14 category 不在 enum → 400 INVALID_INPUT
    Given space "spaces/AAA" 存在
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/AAA",
        "category": "xyz",
        "content": "測試內容",
        "created_by": "manual"
      }
      """
    Then response status 400
    And response body 的 code 為 "INVALID_INPUT"

  @f014 @sprint-7 @api
  Scenario: AC-15 space_key 不存在 → 404 SPACE_NOT_FOUND
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/NOTEXIST",
        "category": "product",
        "content": "測試內容",
        "created_by": "manual"
      }
      """
    Then response status 404
    And response body 的 code 為 "SPACE_NOT_FOUND"

  @f014 @sprint-7 @api
  Scenario: AC-16 PATCH 不存在的 fact → 404 NOT_FOUND
    When PATCH /api/space-facts/99999 with body:
      """
      { "content": "更新" }
      """
    Then response status 404
    And response body 的 code 為 "NOT_FOUND"

  @f014 @sprint-7 @api
  Scenario: AC-17 mining job 已 running → 409 JOB_RUNNING
    Given space "spaces/BBB" 的 mining job 為 "running"
    When POST /api/space-facts/mining-queue with body:
      """
      { "space_key": "spaces/BBB" }
      """
    Then response status 409
    And response body 的 code 為 "JOB_RUNNING"

  @f014 @sprint-7 @api
  Scenario: AC-20 source_message_ids 引用不存在 id → backend 接受
    Given space "spaces/AAA" 存在
    When POST /api/space-facts with body:
      """
      {
        "space_key": "spaces/AAA",
        "category": "glossary",
        "content": "FedGPT: 聯邦式 GPT 平台",
        "created_by": "mining-skill",
        "source_message_ids": [999998, 999999]
      }
      """
    Then response status 201
    And response body 的 source_message_ids 包含 999998

  @f014 @sprint-7 @api
  Scenario: AC-21 多次 PATCH content → updated_at 更新，approved_at 不變
    Given space "spaces/AAA" 已有一條 approved fact
    When PATCH /api/space-facts/{fact_id} with body:
      """
      { "content": "更新後的內容第一次" }
      """
    Then response status 200
    And response body 的 content 為 "更新後的內容第一次"
    When PATCH /api/space-facts/{fact_id} with body:
      """
      { "content": "更新後的內容第二次" }
      """
    Then response status 200
    And approved_at 未因 PATCH 而改變

  @f014 @sprint-7 @api
  Scenario: AC-22 同時 filter category + space_key
    Given space "spaces/AAA" 有多個 categories 的 approved facts
    When GET /api/space-facts?space_key=spaces/AAA&category=product&status=approved
    Then response status 200
    And response body 中所有 fact 的 category 為 "product"
    And response body 中所有 fact 的 space_key 為 "spaces/AAA"

  @f014 @sprint-7 @api
  Scenario: AC-11 mining queue lifecycle — running 到 completed
    Given space "spaces/AAA" 的 mining job 為 "pending"
    When PATCH /api/space-facts/mining-queue/spaces%2FAAA with body:
      """
      { "status": "running" }
      """
    Then response status 200
    And response body 的 status 為 "running"
    When PATCH /api/space-facts/mining-queue/spaces%2FAAA with body:
      """
      { "status": "completed", "candidates_generated": 5, "last_mined_message_id": 101 }
      """
    Then response status 200
    And response body 的 status 為 "completed"
    And response body 的 candidates_generated 為 5

  @f014 @sprint-7 @api
  Scenario: DELETE fact 成功移除
    Given space "spaces/AAA" 已有一條 approved fact
    When DELETE /api/space-facts/{fact_id}
    Then response status 200
    And 再次 GET /api/space-facts/{fact_id} 回 404

  @f014 @sprint-7 @api
  Scenario: GET /api/space-facts/candidates 等同 status=candidate
    Given space "spaces/AAA" 有 2 筆 candidate facts
    When GET /api/space-facts/candidates?space_key=spaces/AAA
    Then response status 200
    And response body 中所有 fact 的 status 為 "candidate"

  @f014 @sprint-7 @api
  Scenario: GET /api/space-facts/mining-queue 回 pending jobs
    Given space "spaces/AAA" 的 mining job 為 "pending"
    When GET /api/space-facts/mining-queue?status=pending
    Then response status 200
    And response body 的 jobs 包含 space_key="spaces/AAA"

  @f014 @sprint-7 @skill
  Scenario: AC-19 space 訊息為 0 → skill 標 completed candidates_generated=0
    Given space "spaces/EMPTY" 無歷史訊息
    And space "spaces/EMPTY" 的 mining job 為 "pending"
    When mining skill 處理 space "spaces/EMPTY"
    Then mining job 的 status 為 "completed"
    And mining job 的 candidates_generated 為 0

  @f014 @sprint-7 @skill
  Scenario: AC-23 skill LLM call 失敗 → 標 failed，其他 space 繼續
    Given space "spaces/AAA" 的 mining job 為 "pending"
    And space "spaces/BBB" 的 mining job 為 "pending"
    And LLM mock 對 "spaces/AAA" 拋出錯誤
    When mining skill 執行 batch
    Then "spaces/AAA" 的 mining job status 為 "failed"
    And "spaces/AAA" 的 mining job 有 error_message
    And "spaces/BBB" 的 mining job status 不為 "failed"

  @f014 @sprint-7 @skill
  Scenario: AC-18 同 space 連續 mine 兩次 — incremental
    Given space "spaces/AAA" 已完成第一次 mining（last_mined_message_id=101）
    And space "spaces/AAA" 有 id > 101 的新訊息
    When mining skill 第二次執行
    Then skill 只拉 before_id 或 since 之後的新訊息
    And 不重複生成已有的 candidates

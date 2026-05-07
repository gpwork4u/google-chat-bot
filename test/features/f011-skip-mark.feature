# language: en

@sprint-5 @f011 @backend @cr-001
Feature: F-011 D-skip Mark Mechanism
  As a 單人使用者運行 chat-drafts skill loop
  I want skill 對 D 類訊息標記成 backend 已知狀態
  So that loop 不會每分鐘重複處理同一批訊息

  Background:
    Given backend service 在 "http://localhost:8080" 上運行
    And migration 0018 已執行
    And messages table 是空的

  # --- POST /api/claude/skip ---

  @skip @happy
  Scenario: skill 標記 D 類訊息成功
    Given 一筆訊息 message_id="msg_001" 存在於 messages 表
    When 發送 POST /api/claude/skip with body:
      """json
      { "message_id": "msg_001", "reason": "pure-ack", "by": "skill" }
      """
    Then response status should be 200
    And response body should contain:
      | field        | value     |
      | message_id   | msg_001   |
      | skip_reason  | pure-ack  |
      | skipped_by   | skill     |
    And response.skipped_at should not be null
    And messages 表中 message_id="msg_001" 的 skipped_at 不為 NULL

  @skip @idempotent
  Scenario: 重複 skip 同一 message 不覆寫 skipped_at
    Given message_id="msg_002" 已被 skip，skipped_at="2026-05-07T03:00:00Z"
    When 發送 POST /api/claude/skip with body:
      """json
      { "message_id": "msg_002", "reason": "overheard", "by": "skill" }
      """
    Then response status should be 200
    And response.skipped_at should equal "2026-05-07T03:00:00Z"
    And response.skip_reason should equal "pure-ack" or original reason
    # 第二次呼叫不應覆寫首次記錄

  @skip @validation
  Scenario Outline: POST /skip 400 錯誤
    Given message_id="msg_003" 存在
    When 發送 POST /api/claude/skip with body:
      """json
      { "message_id": "msg_003", "reason": "<reason>", "by": "<by>" }
      """
    Then response status should be 400
    And response body code should be "INVALID_INPUT"

    Examples:
      | reason                                                                                                                                                                                                                | by      |
      |                                                                                                                                                                                                                       | skill   |
      | this-reason-is-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-way-too-long-over-200-chars | skill   |
      | ok                                                                                                                                                                                                                    | invalid |

  @skip @notfound
  Scenario: skip 不存在的 message
    When 發送 POST /api/claude/skip with body:
      """json
      { "message_id": "msg_does_not_exist", "reason": "pure-ack" }
      """
    Then response status should be 404
    And response body code should be "NOT_FOUND"

  # --- GET /api/claude/skipped ---

  @list
  Scenario: 列出最近 skip 的訊息
    Given 有 3 筆 skipped messages:
      | message_id | skip_reason     | skipped_by   |
      | msg_a      | pure-ack        | skill        |
      | msg_b      | not-mentioned   | backend_auto |
      | msg_c      | blocked-keyword | backend_auto |
    When 發送 GET /api/claude/skipped?limit=50
    Then response status should be 200
    And response.items should have length 3
    And response.items 應依 skipped_at 降序排列

  @list @filter
  Scenario: 用 by 過濾
    Given 有 3 筆 skipped messages 如前述
    When 發送 GET /api/claude/skipped?by=backend_auto
    Then response status should be 200
    And response.items should have length 2
    And 所有 items.skipped_by 都等於 "backend_auto"

  # --- POST /api/claude/unskip ---

  @unskip
  Scenario: 還原已 skip 的訊息
    Given message_id="msg_undo" 已被 skip
    When 發送 POST /api/claude/unskip with body:
      """json
      { "message_id": "msg_undo" }
      """
    Then response status should be 200
    And response.skipped_at should be null
    And response.skip_reason should be null
    And response.skipped_by should be null
    And messages 表中該 row 三欄都為 NULL

  @unskip @notfound
  Scenario: unskip 不存在的 message
    When 發送 POST /api/claude/unskip with body:
      """json
      { "message_id": "msg_nope" }
      """
    Then response status should be 404

  # --- Pending query 過濾 ---

  @pending @filter
  Scenario: /api/claude/pending 排除 skipped 訊息
    Given messages 表有 5 筆訊息且皆無對應 draft
    And 其中 message_id="msg_skip_1" 與 "msg_skip_2" 已被 skip
    When 發送 GET /api/claude/pending
    Then response status should be 200
    And response.items should have length 3
    And response.items 不應包含 message_id="msg_skip_1"
    And response.items 不應包含 message_id="msg_skip_2"

  @pending @loop
  Scenario: 第二輪 loop 不再看到已 skip 訊息
    Given messages 表有 10 筆訊息
    When 第一輪呼叫 GET /api/claude/pending → 取得 10 筆
    And 對其中 8 筆呼叫 POST /api/claude/skip with by="skill"
    And 第二輪呼叫 GET /api/claude/pending
    Then 第二輪 response.items should have length 2
    # 驗證 loop incremental 行為

  # --- chat_processor 自動 skip ---

  @auto-skip @mention-only
  Scenario: mention-only 模式且未被 mention 的訊息自動 skip
    Given settings.mention_only_enabled = true
    And self user 為 "user_self"
    When chat_processor 收到一則訊息 text="閒聊一下"，無 mention
    Then 訊息寫入 messages 表
    And messages.skipped_at IS NOT NULL
    And messages.skip_reason = "not-mentioned"
    And messages.skipped_by = "backend_auto"

  @auto-skip @blocked-keyword
  Scenario: blocked_keyword 命中自動 skip
    Given settings.blocked_keywords = ["薪水", "離職"]
    When chat_processor 收到一則訊息 text="關於薪水的事"
    Then messages.skipped_at IS NOT NULL
    And messages.skip_reason 開頭為 "blocked-keyword:"
    And messages.skipped_by = "backend_auto"

  @auto-skip @self-sent
  Scenario: 自己送的訊息自動 skip
    Given self user 為 "user_self"
    When chat_processor 收到一則訊息 sender_id="user_self"
    Then messages.skipped_at IS NOT NULL
    And messages.skip_reason = "self-sent"
    And messages.skipped_by = "backend_auto"

  @auto-skip @order
  Scenario: 自動 skip 不阻擋 normal 訊息流
    Given settings.mention_only_enabled = true
    And self user 為 "user_self"
    When chat_processor 收到一則訊息 mentioning self_user，text="幫忙看一下"
    Then messages.skipped_at IS NULL
    And 訊息出現在 GET /api/claude/pending

  # --- Backfill 工具 ---

  @backfill @dry-run
  Scenario: backfill --dry-run 不寫資料庫
    Given messages 表有 20 筆 created_at 都 > 11 分鐘前的訊息且無 draft
    And 其中 12 筆內容為純 ack（如 "好"、"OK"、"收到"）
    When 執行命令 "backfill-skip --dry-run"
    Then 命令輸出包含 "would skip 12 messages"
    And messages 表中 skipped_at IS NULL 的數量仍為 20

  @backfill @apply
  Scenario: backfill --apply 真的標記
    Given 同上
    When 執行命令 "backfill-skip --apply"
    Then 命令 exit code 為 0
    And messages 表中 skipped_by="backfill" 的數量為 12
    And 其餘 8 筆 skipped_at 仍為 NULL

  @backfill @safety
  Scenario: backfill 不處理近 10 分鐘的 message
    Given 一筆訊息 created_at = NOW() - 5 分鐘，內容為 "好"
    When 執行命令 "backfill-skip --apply"
    Then 該訊息的 skipped_at 仍為 NULL
    # 安全機制：剛進來的訊息可能 skill 還沒判，不要搶 skip

  # --- Audit ---

  @audit
  Scenario: skipped_by 區分四種來源
    Given 四筆訊息 msg_x1/msg_x2/msg_x3/msg_x4 分別經由
      | message_id | skipped_by    |
      | msg_x1     | skill         |
      | msg_x2     | backend_auto  |
      | msg_x3     | manual        |
      | msg_x4     | backfill      |
    When 發送 GET /api/claude/skipped?limit=50
    Then 四筆都在 response.items 中
    And 每筆 skipped_by 值正確

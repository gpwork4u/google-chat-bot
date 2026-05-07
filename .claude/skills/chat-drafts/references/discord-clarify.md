# Discord Clarify — 不確定時用 Discord 問使用者

`auto_mode=true` 模式下若直接送 reply 風險太高（會真送出去），對信心不足的訊息改為先在 Discord 問使用者再決定。

## 何時觸發

每則 pending message 評估完 draft 後，給一個 confidence 等級：

- **high**：直接走標準 `/api/claude/reply` 流程（auto_mode 決定送或 pending）
- **medium / low**：**不要 POST `/api/claude/reply`**，改走本檔流程

判斷 medium/low 的訊號（命中任一即降級）：
- 訊息含金錢、承諾、敏感詞且 `safety_flags` 預期會觸發
- 對方在問**事實**而你不確定答案（例：「上次討論的 X 是什麼結論」、「公司地址」）
- 需要承諾交付時間或資源（「你週五前可以給我嗎」）
- 多人討論你只看到片段，不確定該回什麼
- C 類 engineering 但時間盒用完還沒結論
- B 類有明確 owner 但不是自己（避免代答）

## Discord 訊息格式

從本 session 最近的 Discord channel tag 取 `chat_id`（`<channel source="discord" chat_id="..." ...>`），呼叫 `mcp__plugin_discord_discord__reply`：

```
🤔 待確認 chat-drafts #<message_id>

📨 來源：<sender_name> @ <space_name>
原訊息：<原訊息 body 縮排引用>

💭 我想回：
> <draft body>

📋 分類：<A|B|C>  信心：<medium|low>  原因：<為何不確定一句話>

回我：
✅ ok / 送 / yes        → 用此版本送出
✏️ <新內容>             → 改用你寫的內容
❌ skip / no            → 跳過不送
```

例：
```
🤔 待確認 chat-drafts #1548

📨 來源：Alice @ Team #general
原訊息：
> 你好，請問下午有空嗎？

💭 我想回：
> ok 下午 3 點？

📋 分類：B  信心：medium  原因：不確定使用者下午行程
```

## 狀態追蹤

寫入 `.claude/cache/chat-drafts/deferred.json`：

```json
{
  "<message_id>": {
    "asked_at": "2026-05-07T03:15:00Z",
    "discord_chat_id": "1234567890",
    "discord_message_id": "9876543210",
    "draft_body": "ok 下午 3 點？",
    "category": "B",
    "confidence": "medium",
    "reason": "不確定使用者下午行程"
  }
}
```

cache 目錄不存在時 `mkdir -p .claude/cache/chat-drafts/` 再寫。
discord_message_id 從 reply tool 的 response 取（為了之後做 reply 引用）。

## 下一輪 loop：檢查 Discord 回覆

skill 開頭（在拉 pending 之前）：

1. 讀 `.claude/cache/chat-drafts/deferred.json`
2. 對每筆 deferred 紀錄：呼叫 `mcp__plugin_discord_discord__fetch_messages(chat_id=discord_chat_id, limit=20)`
3. 找比 `asked_at` 之後的訊息，對照 sender 是使用者本人（不是 bot 自己）
4. 解析使用者回覆內容：
   - `✅` / `ok` / `送` / `yes`（包含這些字其一，不分大小寫）→ 用 cached `draft_body` 走 `/api/claude/reply`
   - `❌` / `skip` / `no`（包含其一）→ 不送，從 deferred 清掉
   - 其他純文字 → 視為 edit，body 改為使用者文字後送
5. 送出後從 deferred.json 移除對應 entry
6. 沒回的就留著等下一輪

**timeout**：超過 24 小時沒回的 deferred 自動 skip 並清掉，避免 cache 堆積。

## 對應 log 行格式

```
→ [B/deferred] asked #1548 Alice "下午有空嗎" (信心 medium，等 Discord 回覆)
→ [B/discord-yes] sent #1548 (按 Discord 回覆 ✅，body 沿用原 draft)
→ [B/discord-edit] sent #1548 (按 Discord 回覆「下午4點吧」，body 改寫)
→ [B/discord-no] skipped #1548 (按 Discord 回覆 skip)
```

## 邊界情況

- Discord MCP 未掛 / 沒有 active channel：fallback 走原本的 D skip 處理（純文字 log 「需要 clarify 但 Discord 不可用」）
- 同一 message_id 多次 loop 都不確定：以最新 cache 為準（覆寫 deferred entry）
- 使用者 Discord 回覆模糊（不像 yes/no/edit）：再 ping 一次「請回 ✅ / ❌ / 新內容」

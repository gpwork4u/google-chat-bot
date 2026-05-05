# F-008: 安全護欄（金錢偵測）

## 目標
偵測 draft 內含金錢相關內容（金額、轉帳、報價、付款承諾），即使 `auto_mode=ON` 也降級為 draft 等待人工 approve，避免 LLM 誤觸金錢承諾。

## 範圍（Sprint 4）
- **單一規則**：`money`（金錢偵測）
- 未來可擴：promise、first-contact、sensitive-recipients（架構保留 per-rule 結構）

## 偵測策略（混合）
1. **Keyword 預篩**（Go regex，零 LLM cost）：命中視為 candidate
   - 金額 pattern：`\$[\d,]+`、`NT\$[\d,]+`、`¥[\d,]+`、`[\d,]+\s*(元|塊|萬|k|K)`、`(轉帳|匯款|付款|報價|定金|尾款)`
2. **Claude skill 二次確認**（candidate 才呼叫）：呼叫內部 skill `safety-check`，輸入 draft + 命中 keyword，輸出 `{ flagged: true|false, reason: string }`
3. 二次確認 `flagged=true` → 寫入 `safety_flags=["money"]`、`safety_trigger_reason=<reason>`、降級為 draft

## Schema 變更

### Migration 0015：drafts.safety_flags
```sql
ALTER TABLE drafts ADD COLUMN safety_flags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE drafts ADD COLUMN safety_trigger_reason TEXT;
ALTER TABLE drafts ADD COLUMN safety_overridden_by TEXT;  -- audit: 哪個操作放行
```

### Migration 0016：settings.safety_*
```sql
ALTER TABLE settings ADD COLUMN safety_rails_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE settings ADD COLUMN safety_rules JSONB NOT NULL DEFAULT '{"money": true}';
ALTER TABLE space_settings ADD COLUMN safety_rails_override TEXT NOT NULL DEFAULT 'inherit';
-- safety_rails_override: 'inherit' | 'disabled'
```

## API Contract

### `GET /api/safety/rules`
**Response 200**：
```json
{
  "enabled": true,
  "rules": { "money": true }
}
```

### `PATCH /api/safety/rules`
**Request**：
```json
{ "enabled": true, "rules": { "money": true } }
```
**Response 200**：（同 GET 結構）

### `POST /api/safety/check`（internal，由 draft 寫入流程呼叫）
**Request**：
```json
{
  "draft_text": "好的，我會在週五前匯 NT$5000 給你",
  "space_key": "spaces/AAA"
}
```
**Response 200**：
```json
{
  "flagged": true,
  "flags": ["money"],
  "reason": "draft 含明確匯款承諾與金額"
}
```
若全域 disabled / per-space override=disabled / per-rule disabled / keyword 未命中 → `{ "flagged": false, "flags": [], "reason": "" }`

## 攔截點
`internal/httpapi/claude.go` 的 draft 寫入流程：
1. Claude 產 draft 內容
2. 呼叫 `safety.Check(draft_text, space_key)`
3. 若 `flagged=true`：
   - 寫入 `drafts.safety_flags = flags`
   - 寫入 `drafts.safety_trigger_reason = reason`
   - **強制 mode = "draft"**（覆蓋 auto_mode）
4. 廣播 WS UIEvent 帶 safety_flags

## 前端行為
- ApprovalCard：若 `safety_flags` 非空，顯示警示 badge（紅底 ⚠️ + flags 文字 + reason hover tooltip）
- approve 動作呼叫 `/api/drafts/{id}/approve` 時，後端寫入 `safety_overridden_by = "manual_approve"`（audit）

## Settings UI
SettingsPage 全域區新增「安全護欄」section：
- Toggle：「啟用安全護欄」(`safety_rails_enabled`)
- Sub-toggle：「金錢偵測」(`safety_rules.money`)（disabled 時 grey out）
- Per-space：在 ChannelCard 增 toggle「跳過此頻道安全護欄」(`safety_rails_override` 'disabled'/'inherit')

## Acceptance（對應 .feature）
1. money 命中 → draft 帶 flag、強制 draft mode
2. 全域 disable → 不檢查
3. per-space override=disabled → 跳過該 space
4. per-rule money disable → 跳過 money 規則
5. keyword 預篩未命中 → 不呼叫 Claude（驗證透過 mock 計數）
6. keyword 命中但 Claude 二次確認否定 → 不降級
7. auto_mode ON + safety 觸發 → 不直接送出，停在 draft

## 非範圍（後續候選）
- 承諾偵測（promise）
- 首次對話降級（first-contact）
- 高敏感度人物（sensitive-recipients）
- 工作時間外、長度異常、二段式取消

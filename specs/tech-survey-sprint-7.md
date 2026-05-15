# Tech Survey — Sprint 7: Space Facts Mining + Approval

## 調查日期
2026-05-15

## Sprint 範圍
- F-014: Space Facts Mining skill + backend (migrations 0021/0022, 10 個 endpoints, `space-facts-mining` skill)
- F-015: Space Facts Approval UI + chat-drafts skill 整合（SettingsPage section、`/space-facts/candidates`、`/space-facts/{space_key}` 詳情頁、chat-drafts step 1.5 注入）

## Sprint 6 已 ship 部分（避免重做）
| Item | State |
|------|-------|
| Migration 0020 `space_history_sync_jobs` | ✅ #83 (注意：CR 寫 0021，實際落為 0020 — 因 0019 已 merge) |
| Backend endpoints `POST/GET /api/extension/sync-history(/start|/batch|/complete|/status|/progress)` | ✅ #84 |
| WS event `pending_changed` + `/api/claude/pending` `/api/claude/skipped` 加 query params | ✅ #85 |
| `/pending` 頁面 + 篩選 + skip/unskip + WS revalidate | ✅ #86 |
| Popup「Sync all spaces」「Sync this space」按鈕 + 進度 polling + Settings 進入 /pending 入口 | ✅ #87 |
| Extension content.js batchexecute history scan loop | ✅ #88 #93 |
| QA Sprint 6 (f012 + f013 + f004/f011 增補 AC) | ✅ #90 |
| Design Sprint 6 | ✅ #89 |

**結論**：F-012 / F-013 / F-004 / F-011 AC 全部 closed。Sprint 7 純做 F-014 + F-015，**不再需要 F-012 殘餘 issue**。Sprint 7 唯一對既有檔案的微調是 Sprint 6 migration 編號錯位（0020 已被 sync_jobs 占用）→ space_facts migration 編號往後挪到 0021，mining_jobs 挪到 0022（與 spec §4.1/4.3 一致）。

---

## 1. LLM Mining 結構化輸出

### 候選方案
| 方案 | 優點 | 缺點 | 適用情境 |
|------|------|------|---------|
| **Claude 4.5/4.6 native structured outputs (`output_format`)** | Schema-guaranteed JSON、不需要 retry / fallback | 需要 API call，跟現有 architecture (skill-loop via Claude Code) 不一致 | backend 直連 Claude API |
| **Skill loop + XML-tagged prompt + JSON parsing** | 與 chat-drafts skill 同模式、不需新 dep | Claude 偶爾會 wrap 在 markdown ```json fence、需 robust 解析 | ✅ **採用** — 跟 chat-drafts、style-profile 同模式 |
| **Tool use mode** | 強型別 | Skill loop 不易橋接 | ❌ 拒絕 |

### 決策
採用「skill loop + XML-tagged prompt」搭配以下 robust 解析策略：
1. Prompt 強制要求「**只輸出 JSON，無前後文**」並用 `<facts_json>...</facts_json>` XML 包裹
2. Skill 解析時先抓 `<facts_json>...</facts_json>` 區段，再 `JSON.parse`
3. 解析失敗 → 標記 mining-job `failed` + `error_message`，不重試（best-effort，下輪 user 重新 enqueue）

### Prompt 結構（references/prompt.md）
```
<system>
你是 space 上下文萃取助手。閱讀 N 則訊息後，**只**輸出符合以下 schema 的 JSON：

<schema>
{
  "facts": [
    {
      "category": "product" | "my-role" | "glossary" | "pinned-decision" | "relation",
      "content": "<= 200 字中文 sentence",
      "visibility": "public" | "private" | "secret",
      "source_message_ids": [<至少 1 個 message.id>]
    }
  ]
}
</schema>

規則：
1. 只列**有訊息證據**的 fact，每條附 source_message_ids（至少 1）
2. 每類最多 5 條（超過挑最重要）
3. visibility 預設 private；薪資/人事/私密話題用 secret；公開資訊用 public
4. 不臆測，沒證據就不寫

輸出格式（嚴格）：
<facts_json>
{ "facts": [ ... ] }
</facts_json>
</system>

<user>
Local user: {local_user_name}
Space: {space_name} ({space_key})

訊息（共 {N} 則）：
[id=123] Alice (2026-05-01 09:00): ...
[id=124] Bob (2026-05-01 09:05): ...
...
</user>
```

### 參考資料
- [Claude Structured Outputs API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — JSON mode GA on Sonnet 4.5/4.6
- [Increase Output Consistency (JSON mode)](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency) — XML tag fidelity
- [Claude 4.5 JSON Mode Best Practices](https://markaicode.com/claude-45-json-mode-structured-output/) — 兩三層 nesting 內 reliable

---

## 2. PostgreSQL BIGINT[] `source_message_ids` 索引策略

### 需求
- `space_facts.source_message_ids BIGINT[]` 紀錄該 fact 從哪幾筆 `messages.id` 萃取
- 主要查詢路徑：**by `space_key` + `status`**（已建 partial index `idx_space_facts_active`）
- `source_message_ids` 本身**不需要 reverse lookup**（不會問「給我 message 123 對應哪些 facts」）— UI 用前向（fact → messages）

### 決策
**不對 `source_message_ids` 建 GIN 索引**。
- 理由 1：F-015 UI 展開 source messages 是「給 fact 拿 ids → 用 `WHERE id = ANY($1::bigint[])` 拉 messages」，是 `messages` 表的 PK lookup，不需要在 `space_facts` 上反查
- 理由 2：GIN on BIGINT[] 在小資料集（單 user，< 1k facts）的維護成本 > 收益（[boringSQL: hidden cost of arrays](https://boringsql.com/posts/good-bad-arrays/)）
- 理由 3：intarray module 不支援 BIGINT（[runebook](https://runebook.dev/en/docs/postgresql/intarray)），要 GIN 也需 default array ops

如未來需要「給 message_id 反查 facts」（CR-003+）再加 GIN。

### Source messages lazy-load endpoint
F-015 UI 點 toggle 展開時：
```
GET /api/messages?id_in=123,124,130
```
F-014 新增 `/api/messages` 既有 endpoint 時，**同時支援 `id_in` query param**（comma-separated ids → `WHERE id = ANY(...)`），不需要另外開 endpoint。

### 參考資料
- [Tiger Data: Optimizing Array Queries With GIN Indexes](https://www.tigerdata.com/learn/optimizing-array-queries-with-gin-indexes-in-postgresql)
- [boringSQL: hidden cost of arrays](https://boringsql.com/posts/good-bad-arrays/)
- [PostgreSQL 18 intarray docs](https://www.postgresql.org/docs/current/intarray.html)

---

## 3. SWR Optimistic Update — Approve / Reject / Batch Approve

### 候選 pattern
| Pattern | 適用 |
|---------|------|
| `mutate(key, updater, { optimisticData, rollbackOnError: true })` — 單筆 approve | ✅ |
| `Promise.allSettled` + 單一 mutate revalidate — batch approve | ✅ |
| `useSWRMutation` — 寫操作分離 | ⏸ 視 codebase 既有風格決定（既有 ApprovalsPage 用 `mutate` + fetch，沿用） |

### 決策（給 frontend lane 的指引）
1. **單筆 approve / reject**：
   ```ts
   await mutate(
     key,
     async (current) => {
       const next = current.filter(f => f.id !== id)
       await fetch(`/api/space-facts/${id}/approve`, { method: 'POST' })
       return next
     },
     { optimisticData: (cur) => cur.filter(f => f.id !== id), rollbackOnError: true, revalidate: true }
   )
   ```
2. **Batch approve in space**：
   ```ts
   const ids = facts.filter(f => f.space_key === sk).map(f => f.id)
   await mutate(
     key,
     async () => {
       const results = await Promise.allSettled(
         ids.map(id => fetch(`/api/space-facts/${id}/approve`, { method: 'POST' }))
       )
       return facts.filter(f => !ids.includes(f.id))  // optimistic: 全部移除
     },
     {
       optimisticData: facts.filter(f => !ids.includes(f.id)),
       rollbackOnError: false,  // 部分成功時保留實際結果
       revalidate: true,        // 之後 revalidate 真實狀態
     }
   )
   // Toast 用實際 fulfilled 數量
   const ok = results.filter(r => r.status === 'fulfilled').length
   toast.success(TOAST.batchApproveDone.replace('N', String(ok)))
   ```
3. **Reject 確認 dialog**：用既有 `<dialog>` 或現有 component（搭 design 提供的 confirm dialog）

### 參考資料
- [SWR Mutation & Revalidation Docs](https://swr.vercel.app/docs/mutation)
- [SWR Optimistic Updates GitHub Discussion #727](https://github.com/vercel/swr/discussions/727)
- [SWR 2.0 Announcement](https://swr.vercel.app/blog/swr-v2)
- [freeCodeCamp: Optimistic UI with SWR](https://www.freecodecamp.org/news/improve-user-experience-with-optimistic-ui-swr/)

---

## 4. chat-drafts skill 整合 — Facts injection cache

### 需求
- 每輪 loop 第一次遇到某 space → 拉 facts、注入 prompt
- 同 session 後續同 space 的 pending message 重用 cache（不重打 API）
- secret visibility 永遠不出現（backend `GET /api/space-facts` 預設不回 secret，skill 端不需另外過濾）
- private visibility 注入但 prompt 含「不主動洩漏」instruction
- 空 facts 不報錯、不阻塞、不注入 facts section

### 決策
跟既有 `style-profile` / `user_profile_facts` 快取機制一致：
- 在 chat-drafts SKILL.md 加 **「### 1.5 拉 space facts (cache per session)」** section
- Cache key = `space_key`，記憶在 skill 執行的本地檔案或臨時變數（skill 自管，不寫 DB）
- 注入 prompt 區塊位置：system prompt 結尾、user message 之前
- Visibility 處理：
  - public → 直接列；
  - private → 列 + 加註「以下為 private，不主動洩漏」；
  - secret → 不會出現（backend filter）

### 影響檔案
- `.claude/skills/chat-drafts/SKILL.md` — append step 1.5 + visibility 處理段
- 不需新檔案

---

## 5. Skill 結構 — `.claude/skills/space-facts-mining/`

### 與既有 `chat-drafts` skill 對齊
```
.claude/skills/space-facts-mining/
├── SKILL.md                    # description frontmatter + workflow
└── references/
    ├── prompt.md               # LLM prompt template
    └── category-rubric.md      # 5 類定義 + 範例
```

### SKILL.md frontmatter description
> 從 Google Chat space 的歷史訊息萃取 5 類 context（產品 / 我的角色 / 術語 / pinned 決策 / 人物關係）。執行一次會拉 mining queue、對每個 space 跑 LLM 列點、把 candidate 寫進 backend 等 user approve。使用者說「mine space」「整理 space facts」「space mining」時自動啟用。

### Workflow（精簡版，完整見 F-014 spec §Skill Spec）
1. `GET /api/space-facts/mining-queue?status=pending&limit=3`
2. 對每個 space：`PATCH {status: running}` → `GET /api/messages?space_key=...&limit=200[&since=last_mined_at]` → 空訊息 short circuit → LLM 結構化萃取 → 逐筆 `POST /api/space-facts` (status=candidate) → `PATCH {status: completed, last_mined_message_id, candidates_generated}`
3. 失敗：`PATCH {status: failed, error_message}` 繼續下一個（best-effort）

---

## 6. UI 元件選型（給 ui-designer 的指引）

### 沿用既有 design system tokens / components
F-013 PendingPage 已建立的 component pattern：
- Tab bar、Filter chips、Row card with expand toggle、Confirm dialog、Toast
- 用同樣的 color tokens / spacing / radius

### 新元件
- **CategoryBadge**（5 色，對應 product/my-role/glossary/pinned-decision/relation）
- **VisibilitySelect**（dropdown，public/private/secret — secret 用 lock icon）
- **InlineEditableContent**（textarea + Save/Cancel，markdown 預覽可選）
- **SourceMessageList**（lazy-load，每筆 message 顯示 sender / observed_at / body）

### Confirm dialog（Reject、Delete）
Reject / Delete 都是不可復原操作，用同一個 `<ConfirmDialog>` 元件，要求 user 顯式點「確定」。

---

## 7. 依賴圖譜（Sprint 7）

```
F-014-be1 (migration 0021/0022 + space_facts CRUD endpoints)
   ├── F-014-be2 (mining-queue endpoints + /api/messages?id_in support)
   │      ├── F-014-pipe1 (space-facts-mining skill)
   │      └── F-015-fe1 (/space-facts/candidates 頁) ── 需 candidates GET + approve/reject endpoints
   ├── F-015-fe2 (SettingsPage Space facts section + /space-facts/{space_key} 詳情頁) ── 需 GET /api/space-facts + POST manual create + DELETE
   └── F-015-pipe1 (chat-drafts SKILL.md step 1.5) ── 需 GET /api/space-facts?status=approved 

Design (ui-designer) → 平行於 F-014-be1，產出 component spec 後 F-015-fe1 / F-015-fe2 才動工

QA Sprint 7 → 平行寫 f014.feature / f015.feature step definitions，待 backend / frontend ship 後跑
```

### Wave 排程
- **Wave 0**（並行起跑）：F-014-be1（backend lane）、Design（ui lane）、QA Sprint 7 開始寫 .feature step skeleton（qa lane）
- **Wave 1**（F-014-be1 merge 後）：F-014-be2（backend）、F-015-pipe1（pipeline，可在 be1 後立即動 — 只依賴 GET /api/space-facts 已存在）
- **Wave 2**（F-014-be2 + Design merge 後）：F-014-pipe1 skill（pipeline）、F-015-fe1（frontend）、F-015-fe2（frontend，**循序在 fe1 後**因都是 frontend lane 同 1 個 engineer）
- **Wave 3**：QA 跑 e2e、verifier

---

## 8. Migration 編號決策

CR-002 §4.1 寫 `0020_space_facts` / §4.2 `0021_space_history_sync_jobs` / §4.3 `0022_space_facts_mining_jobs`。Sprint 6 實際落為 `0020_space_history_sync_jobs`（因 0019 已 merge）。

**Sprint 7 重新編號**：
- `0021_space_facts.sql` / `.down.sql`
- `0022_space_facts_mining_jobs.sql` / `.down.sql`

（F-014 issue body 需顯式註明此編號偏移，避免 engineer 照 CR 字面 0020。）

---

## 9. Contract 變更（Sprint 7 必須先寫死）

### `specs/contracts/api.md` 新增
- `GET /api/space-facts` （含 query: `space_key`, `category`, `status`, `visibility`, `include_secret`）
- `GET /api/space-facts/candidates`
- `POST /api/space-facts`
- `PATCH /api/space-facts/{id}`
- `DELETE /api/space-facts/{id}`
- `POST /api/space-facts/{id}/approve`
- `POST /api/space-facts/{id}/reject`
- `POST /api/space-facts/mining-queue`
- `GET /api/space-facts/mining-queue`
- `PATCH /api/space-facts/mining-queue/{space_key}`
- `GET /api/messages?space_key=...&limit=...&before_id=...&since=...&id_in=1,2,3`

### `specs/contracts/dom.md` 新增 testids
（見 F-015 §DOM Contract — 共 27 個）

### `specs/contracts/ux-text.md` 新增
（見 F-015 §UX Text Contract — 共 ~20 條 TOAST + LABEL + BUTTON）

### `web/src/contracts.ts` 新增 const
- `TESTIDS.SPACE_FACTS_*`（27 個）
- `API_PATHS.SPACE_FACTS_*`（11 個 endpoint paths）
- `TOAST.FACT_*` / `LABEL.*` / `BUTTON.*`（見 F-015 spec）

---

## 10. 風險與緩解

| 風險 | 緩解 |
|------|------|
| LLM 萃取空泛 / 重複 | 第一輪在 high-traffic space 試點；提供 prompt 中要求「**有訊息證據才寫**」；user approve rate < 50% 則調 prompt |
| Migration 編號錯位（CR 寫 0020 但實際 0021） | 在 F-014-be1 issue body 顯式註明 |
| `/api/messages` endpoint 既有 schema 與 spec 不對齊 | F-014-be2 先 audit 既有 `messages.go` query helpers；若無 list-by-space 路徑需新增 |
| Cache invalidation in chat-drafts skill | Skill 是 per-session（每次 `/loop` 重啟）→ 不需跨 session cache；簡化處理 |
| Batch approve 50 筆同時打 → server overload | 用 `Promise.allSettled` + 前端 throttle（每 5 並發 batch），backend 不需特別處理 |
| Secret visibility leak via UI | UI 預設不帶 `include_secret=1`；只在 per-space 詳情頁的 settings 子頁需要時才顯式帶（本 sprint 暫不做 secret 管理 UI） |

---

## 11. 不在 Sprint 7 範圍（後續候選）

- 自動 enqueue mining job（依 message count threshold）
- Bulk import facts from CSV
- Fact embeddings / 語義搜尋
- Cross-space fact 合併
- Secret facts 的專屬管理 UI
- WS event for fact_changed（目前 SWR mutate 即可）
- chat-drafts skill 整合的 e2e 自動測試（manual smoke 即可，e2e 不強制）

---

## 12. 參考資料

### LLM JSON output
- [Claude Structured Outputs API Docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Increase Output Consistency (JSON mode)](https://docs.claude.com/en/docs/test-and-evaluate/strengthen-guardrails/increase-consistency)
- [Claude 4.5 JSON Mode Best Practices (Markaicode)](https://markaicode.com/claude-45-json-mode-structured-output/)
- [Structured Output Prompting Guide 2026 (SurePrompts)](https://sureprompts.com/blog/structured-output-prompting-guide)

### PostgreSQL array indexing
- [Tiger Data: Optimizing Array Queries With GIN Indexes](https://www.tigerdata.com/learn/optimizing-array-queries-with-gin-indexes-in-postgresql)
- [boringSQL: hidden cost of arrays](https://boringsql.com/posts/good-bad-arrays/)
- [PostgreSQL 18 intarray docs](https://www.postgresql.org/docs/current/intarray.html)

### SWR optimistic updates
- [SWR Mutation & Revalidation](https://swr.vercel.app/docs/mutation)
- [SWR Optimistic Updates GitHub Discussion #727](https://github.com/vercel/swr/discussions/727)
- [SWR 2.0 Announcement](https://swr.vercel.app/blog/swr-v2)
- [freeCodeCamp: Optimistic UI with SWR](https://www.freecodecamp.org/news/improve-user-experience-with-optimistic-ui-swr/)

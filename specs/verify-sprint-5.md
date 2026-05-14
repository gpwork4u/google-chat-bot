# Sprint 5 驗證報告 — CR-001 D-skip Mark Mechanism

## 結論：PASS（靜態驗證）

驗證日期：2026-05-14
Sprint Milestone：Sprint 5: CR-001 D-skip mark
Sprint Issues：#69（be1）、#70（be2）、#71（be3）、#72（pipe1）、#73（QA）— 全部 closed
驗證執行：verifier（靜態 + unit test）

---

## 已合併 PR

| PR | 標題 | 狀態 |
|----|------|------|
| #74 | feat: F-011-pipe1 cmd/backfill-skip 一次性 D-skip 工具 | merged 2026-05-07 |
| #75 | [Feature] F-011-be1: migration 0018 + skip / skipped / unskip endpoints + pending filter | merged 2026-05-07 |
| #77 | [QA] Sprint 5 F-011 step definitions + f002 CR-001 regression | merged 2026-05-07 |
| #78 | [Feature] F-011-be2: chat_processor 自動 skip 三條件 | merged 2026-05-07 |
| #79 | [Feature] F-011-be3: chat-drafts SKILL.md D 類分支改呼叫 POST /api/claude/skip | merged 2026-05-07 |

---

## 三維度結果

### 1. Completeness — PASS

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| 5 個 Sprint 5 issues 全部 closed | ✅ | #69–#73 均 closed |
| Migration 0018（skipped_at / skip_reason / skipped_by 三欄）存在 | ✅ | `internal/store/migrations/0018_messages_skipped.sql` |
| `POST /api/claude/skip` endpoint 實作 | ✅ | `internal/httpapi/claude_skip.go` handleSkip() |
| `GET /api/claude/skipped` endpoint 實作 | ✅ | `internal/httpapi/claude_skip.go` handleListSkipped() |
| `POST /api/claude/unskip` endpoint 實作 | ✅ | `internal/httpapi/claude_skip.go` handleUnskip() |
| `/api/claude/pending` 加 `skipped_at IS NULL` filter | ✅ | `internal/store/claude.go` 第 270 行 |
| chat_processor 自動 skip 三條件（mention-only / blocked / self-sent） | ✅ | `internal/worker/chat_processor.go` autoSkipReason() + autoSkipReasonFromSettings() |
| Skill SKILL.md D 類分支改呼叫 POST /api/claude/skip | ✅ | `.claude/skills/chat-drafts/SKILL.md` §3.5 |
| cmd/backfill-skip 一次性工具（dry-run 預設 + --apply） | ✅ | `cmd/backfill-skip/main.go` |
| go build ./... PASS | ✅ | 零編譯錯誤 |
| Unit tests PASS（httpapi / worker / store） | ✅ | ok 3 packages |

缺失：無。

---

### 2. Correctness — PASS

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| Migration 欄位與 spec 一致（三欄名稱、CHECK constraint、partial index） | ✅ | SQL 完全對應 CR-001 §4.1 定義 |
| `POST /api/claude/skip` Request schema 與 spec 一致（message_id / reason / by） | ✅ | skipReq struct 正確 |
| `POST /api/claude/skip` Response schema 與 spec 一致（message_id / skipped_at / skip_reason / skipped_by） | ✅ | skipResp struct 正確 |
| `POST /api/claude/skip` idempotent 邏輯：已 skip 不覆寫 skipped_at | ✅ | store/skip.go：UPDATE ... WHERE skipped_at IS NULL；若 0 rows 改 SELECT 回現值 |
| `POST /api/claude/skip` 400 INVALID_INPUT（reason 空 / 超 200 字 / by 不在 enum） | ✅ | handleSkip() 三段驗證 |
| `POST /api/claude/skip` 404 NOT_FOUND（message_id 不存在） | ✅ | errors.Is(err, store.ErrNotFound) |
| `GET /api/claude/skipped` query params（limit / since / by）正確處理 | ✅ | handleListSkipped() 對應 ListSkippedOptions |
| `POST /api/claude/unskip` 清空三欄回 NULL | ✅ | DB.UnskipMessage() SET skipped_at=NULL, skip_reason=NULL, skipped_by=NULL |
| `POST /api/claude/unskip` 回傳 unskipResp（三欄均為 nil pointer） | ✅ | unskipResp 正確 |
| chat_processor 自動 skip 順序（self-sent > blocked-keyword > not-mentioned） | ✅ | autoSkipReasonFromSettings() 判斷順序正確 |
| blocked-keyword reason 格式 `blocked-keyword:<keyword>` | ✅ | return "blocked-keyword:" + kw, "backend_auto" |
| SKILL.md D 類 reason enum 與 spec 一致（pure-ack / overheard / policy-redline / not-targeted / low-info） | ✅ | SKILL.md §3.5 表格完整 |
| backfill-skip dry-run 預設 + --apply flag + --max flag | ✅ | flag.Bool("apply") flag.Int("max") |
| `go test ./internal/httpapi/...` | ✅ | PASS |
| `go test ./internal/worker/...` | ✅ | PASS |
| `go test ./internal/store/...` | ✅ | PASS |

偏差：無。

---

### 3. Coherence — PASS（一項 WARNING）

| 檢查項 | 結果 | 詳情 |
|--------|------|------|
| migration CHECK constraint（`skipped_by IN ('skill','backend_auto','manual','backfill')`）與 httpapi allowedSkippedBy map 一致 | ✅ | 兩者完全吻合 |
| store/skip.go 欄位掃描順序與 SELECT 欄位順序一致 | ✅ | message_key, skipped_at, skip_reason, skipped_by |
| store/messages.go 新訊息 INSERT 支援 skip-aware path（SkippedAt != nil 時一次寫入三欄） | ✅ | INSERT ... skipped_at, skip_reason, skipped_by |
| SKILL.md reason enum 字串與 CR-001 §4.5 定義一致 | ✅ | pure-ack / overheard / policy-redline / not-targeted / low-info |
| backend auto-skip reason 格式與 CR-001 §4.4 定義一致 | ✅ | not-mentioned / blocked-keyword:<keyword> / self-sent |
| `specs/contracts/api.md` 已更新含 skip 三支 endpoints | ⚠️ WARNING | api.md 尚未含 POST /api/claude/skip、GET /api/claude/skipped、POST /api/claude/unskip。Contract 文件落後於實作 |
| `specs/contracts.ts` 已含 skip API 路徑常數 | ⚠️ WARNING | contracts.ts 未見 SKIP / UNSKIP / SKIPPED 路徑常數（F-011 為純 backend + skill 使用，無 frontend 消費；影響有限，但違反 contract-first 原則） |

問題：
- `specs/contracts/api.md` 未補 F-011 三支 endpoints。此為文件一致性問題，不影響執行正確性，但下次 tech-lead survey 或新 lane 加入時可能混淆。建議補齊。

---

## Issues 發現

### CRITICAL（必須修復）
無。

### WARNING（建議修復）
- **api.md contract 未更新**：`specs/contracts/api.md` 缺少 `POST /api/claude/skip`、`GET /api/claude/skipped`、`POST /api/claude/unskip` 三支 endpoint 定義。實作與 spec 內容均已正確，僅 contract 文件落後。建議在下個 sprint 開始前補齊（可一個 chore PR）。

### SUGGESTION（可改善）
- **contracts.ts 未增 skip 路徑常數**：目前 skill（bash script）直接 hardcode `http://localhost:8080/api/claude/skip`，未走 contracts.ts。本 sprint 無 frontend 消費此 API，影響有限；但若未來 UI 需 unskip 功能，建議屆時補入常數。
- **backfill-skip 無 unit test**：工具本身邏輯（classify.go / scan.go）雖功能明確但無 test files。屬一次性工具，可接受，建議加 README 使用說明更新即可。

---

## AC 覆蓋總結

CR-001 完成標準逐項確認：

| 完成標準 | 狀態 |
|---------|------|
| Migration 0018 跑得起來、rollback 也行 | ✅（up + down SQL 均存在） |
| `/api/claude/skip` / `/skipped` / `/unskip` 三個 endpoint 通過 unit test | ✅ |
| Pending query 排除 skipped（`AND m.skipped_at IS NULL`） | ✅ |
| Backend auto-skip 三類正確命中（self-sent / blocked-keyword / not-mentioned） | ✅ |
| Skill 改寫後 D 類走 POST /api/claude/skip | ✅ |
| Backfill `--dry-run` 預設；`--apply` 真正執行 | ✅ |

---

## 結論

Sprint 5 三大交付目標全部達成：
- ✅ Migration 0018（skip 三欄 + partial index）
- ✅ 三支 skip API endpoints（skip / skipped / unskip），idempotent + 正確錯誤碼
- ✅ Backend auto-skip 三條件 + pending filter + skill D 類分支改寫 + backfill 工具

靜態驗證 PASS，unit tests PASS，`go build ./...` 零錯誤。
唯一 WARNING 為 `specs/contracts/api.md` 未補 F-011 endpoints，不阻擋 release。

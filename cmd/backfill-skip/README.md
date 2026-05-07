# cmd/backfill-skip — 一次性 D-skip Backfill 工具

## 用途

Sprint 5 CR-001 上線後，舊的 pending 訊息（skill 已判過 D 類但 backend 不知道）
仍會出現在 `/api/claude/pending`，造成下一輪 loop 重複判斷。

這個工具掃描現存 pending list，對本地 heuristic 確定是 D 類的訊息呼叫
`POST /api/claude/skip`，讓它們從 pending list 消失。

**執行一次即可，不需要常駐。**

---

## 快速上手

```bash
# 1. 確認 backend 服務在 localhost:8080 已啟動
make dev           # 或 docker compose up

# 2. dry-run（預設）：列出將會 skip 的訊息，不寫 DB
make backfill-skip
# 或
go run ./cmd/backfill-skip

# 3. 確認輸出沒問題後，真的執行
make backfill-skip-apply
# 或
go run ./cmd/backfill-skip --apply
```

---

## flags

| Flag | 預設 | 說明 |
|------|------|------|
| `--apply` | `false` | 真的呼叫 POST /api/claude/skip；未指定時為 dry-run |
| `--max=N` | `0`（不限）| 最多處理幾筆訊息 |
| `--api=URL` | `http://localhost:8080` | backend base URL |
| `--cooldown-minutes=N` | `10` | 只處理 created_at < NOW()-N 分鐘的訊息（安全閘） |

---

## 輸出格式

**dry-run 模式**
```
scanned=50
skipped_by_cooldown=3（created_at 在 10 分鐘內，不處理）
would skip: 12345 reason=pure-ack body="好"
would skip: 12346 reason=low-info body="👍"
would_skip=2
```

**apply 模式**
```
scanned=50
skipped_by_cooldown=3（created_at 在 10 分鐘內，不處理）
skipped: 12345 reason=pure-ack
skipped: 12346 reason=low-info
skipped=2 errors=0
```

---

## Exit codes

| Code | 說明 |
|------|------|
| 0 | 成功（dry-run 永遠 0） |
| 1 | apply 模式但有 errors > 0 |
| 2 | Fatal 錯誤（DB 連線失敗、API 無法連線） |

---

## D 類判定規則（本地 heuristic）

工具採用**保守策略**：只對高確定性的 D 類訊息標記 skip，
不確定的情形一律略過留給 skill 處理。

| reason | 條件 |
|--------|------|
| `pure-ack` | trim 後長度 ≤ 4，或符合「好/收到/OK/謝謝/thx」等常見 ack 詞彙 |
| `low-info` | 全文都是 emoji，無文字資訊 |
| `policy-redline:money:<keyword>` | 命中金錢相關 regex（$金額、NT$、轉帳、匯款、付款等） |
| `policy-redline:contract:<keyword>` | 命中合約相關關鍵字（合約、NDA、授權、簽約等） |

`overheard`、`not-targeted` 等需要 context 的判斷**不在此工具範圍**，交由 skill 判定。

---

## 安全注意事項

1. **10 分鐘安全閘**（`--cooldown-minutes=10`）：剛進來的訊息可能 skill 還沒判，
   不要搶先 skip。如有需要可調整，但**不建議設為 0**。

2. **先 dry-run 後 apply**：正式執行前一定要先跑 dry-run 確認輸出，
   確保不會誤 skip 重要訊息。

3. **Idempotent**：同一 message_id 重複呼叫 POST /skip 是安全的，
   backend 不會覆寫首次 skipped_at（保留首次時間供稽核）。

4. **僅走 HTTP endpoint**：工具不直連 DB，所有操作都經過 backend API，
   確保 skip 邏輯與 backend 一致。

---

## 依賴

- **F-011-be1（#69）**：`POST /api/claude/skip` endpoint 必須已 merge 並啟動。
- migration 0018（`messages.skipped_at` 欄位）必須已執行。

---

## 相關 Issue

- Issue: #72 F-011-pipe1
- 依賴: #69 F-011-be1
- CR: CR-001 D-skip mark

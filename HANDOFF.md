# Handoff — 2026-05-31

接續這份的 session 直接讀這頁即可。

## 這段做了什麼

把專案從「Postgres + docker + extension 跑業務邏輯」改成「SQLite 檔 + 純 Go binary + extension 當 dumb XHR proxy」，並加了一整套 ID → name 解析 API。

**架構**
- Extension 只剩：`chrome.cookies` 取 cookie / WS link / `proxyFetch()` 一個 primitive / 被動觀察 xsrf / boq / emoji catalog
- Backend 接管所有 Chat payload 組裝 + response 解析（`update_reaction` / `create_message` / `batchexecute` 等）
- Postgres → SQLite（`./data/chatbot.db`，`modernc.org/sqlite` pure Go 無 cgo）
- raw_events 從 DB 搬到 50k in-memory ring buffer
- 砍 `docker-compose.yml`，`make dev` 不再啟 docker

**新增 API**
| Endpoint | 用途 |
|---|---|
| `POST /api/reactions` | emoji 反應（custom / unicode / alias 都吃，`action=add\|remove`）|
| `POST /api/messages/send` | 新 topic 或回覆 thread |
| `POST /api/spaces/sync-history` | 走 extension `handleSyncHistoryScan` 抓歷史 |
| `GET /api/space-directory` | space_key → display_name |
| `POST /api/space-directory/refresh` | 即時 fire jfcZG 灌進來 |
| `GET /api/chat-members` | sender_id → display_name + email |
| `GET\|POST /api/lookup` | 任意 ID 批次反查 |
| `GET /api/me` | 本地 user 狀態 + 各 directory counts |
| `GET /api/messages`（升級） | 多了 `space_name` + `sender_is_me` 欄位 |
| `GET\|POST /api/ext/auth-state` | extension push 完整 auth snapshot |
| `GET\|POST /api/ext/emoji-catalog` | extension push frecent_emojis 解析後的 catalog |

**SQLite 相容性修補**
- `translatePlaceholders`: `$N → ?N`、strip `::cast`、`NOW() → CURRENT_TIMESTAMP`、`ILIKE → LIKE`、`NOW()±INTERVAL → datetime(...)`
- `rewritePgDDL` 在 migration apply 時轉：`JSONB→TEXT`、`TIMESTAMPTZ→TIMESTAMP`、`BIGSERIAL→INTEGER PK AUTOINCREMENT`、`BOOLEAN→INTEGER`、`DEFAULT TRUE/FALSE→1/0`、strip `ADD COLUMN IF NOT EXISTS` / `COMMENT ON` / `CREATE EXTENSION` / `UPDATE…FROM`，展開多 ADD COLUMN
- `parseSQLiteTime` 用在 aggregate 時間欄位（`MAX(observed_at)`）— 多 layout 嘗試
- `InsertOrGetMessage` 砍掉 `(xmax = 0)` trick，改成 INSERT ON CONFLICT DO NOTHING + 後備 UPDATE
- `ListSpaces` / `ListClaudePending` / `MessageContext` / `StyleProfile` 等手動 rewrite（LATERAL → 相關子查詢、array → text、`position(in)→instr()`）

**Commits this session（main 上）**
```
5975a53 feat(api): GET /api/me — local user identity + ingest-state counters
92441e4 feat(api): ID→name resolution endpoints + space_name on /api/messages
d11c629 feat(api): GET /api/space-directory + POST /api/space-directory/refresh
71db403 fix(store): SQLite time-scan handling + DSN _time_format
6abd46d fix(store): SQLite-port the rest of the Postgres-specific SQL
b5f025a fix(store+web): finish SQLite porting for /api/settings /api/spaces + UI bundle
4e75093 fix(store): preserve $N param ordering when translating to SQLite
6872150 chore: refresh .specflow/state.json
70cece3 [Refactor] Backend-driven proxy + SQLite + in-memory raw_events
```

## 怎麼跑

```bash
make dev              # 直接 go run，沒 docker
# server on :8090, DB at ./data/chatbot.db
```

Extension 第一次裝：`chrome://extensions/` → 開「開發者模式」→「載入未封裝項目」選 `extension/`。
之後變更：`chrome://extensions/` 點 reload，再 F5 chat tab。

## 目前狀態（剛剛 curl 的）

```
local_user_id:     1
chat_user_id:      ""                ← 未 ingest（需要 Chat tab fire get_user_settings）
auth_state_alive:  false              ← Chat tab WS 沒連
chat_members:      0                  ← 同上 + 需要打開 Members 面板才會灌
emoji_catalog:     63
space_directory:   4
```

## 還沒解 / TODO

1. **`chat_user_id` 未 ingest**：worker 等 `/api/get_user_settings` XHR。Chat web service worker 常常 cache 著不重打。Hard-reload (⌘⇧R) chat tab 強迫 refire。一旦 set 起來，新 ingest 的訊息會帶 `sender_is_me=1`。
2. **chat_members 大量空**：要打開 Chat「成員管理面板」一次 fire UIgx0，worker 才會 ingest 整個 org directory。或單一 space 開個 message 也會慢慢累積。
3. **sync-history 抓不到新訊息**：`oGiIKf` batchexecute 似乎被 Google 換掉了，現在 SPA 用 REST `/api/list_topics`（~100-slot positional body 沒逆向）。`/api/spaces/sync-history` lifecycle 正確但 `scanned=0`。需要逆向新 endpoint 或接受「靠 webchannel push 累積」。
4. **`/api/reactions` 仍依賴 in-memory catalog**：server restart 後 catalog 清空。F5 chat tab 觸發 `get_frecent_emojis_v2` 重灌（已驗證 work）。
5. **SQLite 殘餘 bug 風險**：剩下大概有十幾個小角落 PG-only SQL（測試 / mining / safety 等）沒測過。撞到的時候 grep 一下：

```bash
grep -rnE "::(jsonb|timestamp)|INTERVAL '|array_|EXTRACT\(|RETURNING.*xmax" internal/store/*.go
```

## 下一個 session 接續做什麼，建議優先序

1. **驗證 reactions / send / sync-history 全 path** — 真的測過 self-message 標記、看 UI Inbox 是否正常 render
2. **逆向新 `/api/list_topics` body shape**（Chat web 啟動就 fire 那個，從 raw_events 撈下來看）→ backend 直接 driver sync history
3. **加 `POST /api/me/refresh`** 用 proxy 強驅動 `get_user_settings`（需要逆向 body — 大概是 `[]` 之類）
4. **掃完 SQLite 殘餘 bug**（grep 上面那行掃 PG-only SQL）

## 開發環境

- Go 1.x（`go.mod`）
- Vite + React（`web/`，新版 build 用 `cd web && npx vite build` 跳過 tsc，因為 test 檔有 pre-existing TS 錯誤）
- SQLite 在 `./data/chatbot.db`（gitignored）
- Server `:8090`（從 8080 改的，避開 kubectl port-forward 衝突）
- `.env` 已改 DATABASE_URL 為 `./data/chatbot.db`

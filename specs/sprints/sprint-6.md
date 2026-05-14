# Sprint 6: CR-002 Space Facts + Pending Viewer (foundation)

## Milestone
GitHub Milestone #6 — `Sprint 6: CR-002 Space Facts + Pending Viewer`

## Scope (features included in `run-sprint-tests.sh`)

- **F-012**: Extension sync history（backend endpoints + extension popup + content.js batchexecute）
- **F-013**: Pending message viewer（frontend page + backend query params + WS `pending_changed`）
- **F-004 AC append**: Settings 頁 / popup 加 Sync history 入口（CR-002 §5.1）
- **F-011 AC append**: Pending viewer 走同樣 skip endpoint（CR-002 §5.2）

> Sprint 7 (F-014 Space Facts Mining + F-015 Approval UI + chat-drafts injection) **not in scope** — 留下個 sprint 規劃。

## Feature IDs (sprint-test 解析用)
- f012
- f013
- f004
- f011

## Out of scope
- Migration 0021 (`space_facts`) / 0022 (`space_facts_mining_jobs`)
- `space-facts-mining` skill
- `/space-facts/candidates` 頁
- chat-drafts step 1.5 facts injection
- WS push sync progress（Sprint 6 用 polling）

## Migration 編號實務修正
CR-002 §4 spec 把 `space_history_sync_jobs` 寫成 0021；但實際 next migration number 是 0020（0019 為 drop oauth columns，已 merge 入 main）。**本 sprint 採 sequential：sync_jobs migration 編號改為 0020**。Sprint 7 的 `space_facts` / `space_facts_mining_jobs` 連續分配 0021 / 0022。

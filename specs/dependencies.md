# Sprint 1 依賴圖譜

## 依賴關係

```
Design Sprint 1 (UI tokens + ApprovalCard 元件規格)
    │
    ├─→ F-001 (Vite + React 骨架)
    │       │
    │       └─→ F-002 (Approval Queue 頁)
    │
    └─→ F-002 (直接消費 ApprovalCard 規格)

QA Sprint 1 (step definitions)
    │
    └─→ 平行：可在 F-001 / F-002 開發中同時撰寫，最終跑測試需等 F-001 + F-002 都進 main
```

## 依賴判斷依據

| Edge | 理由 |
|------|------|
| Design → F-001 | F-001 需 Tailwind tokens 接入 `@theme`、layout 用 design 提供的 nav 規格 |
| Design → F-002 | F-002 卡片 UI 的視覺、互動（hover / focus / keyboard）由 design issue 定 |
| F-001 → F-002 | F-002 需 `/approvals` route、`WebSocketProvider`、`api/client.ts` 都在 F-001 建立 |
| QA 平行 | step definitions 撰寫只需 .feature 檔（已 ready），不依賴實作；最終 run 才需 F-001 + F-002 merged |

## 拓撲排序（並行策略）

### Wave 0（即可開始，並行）
- **Design Sprint 1** — ui-designer 產出 `design/tokens/` + `design/components/ApprovalCard.md` + nav layout 規格
- **QA Sprint 1** — qa-engineer 撰寫 step definitions（features 已 freeze）

### Wave 1（Design 完成後）
- **F-001** — frontend engineer 建立骨架，套用 design tokens 與 layout 規格

### Wave 2（F-001 merge 後）
- **F-002** — frontend engineer 在骨架上實作 Approval Queue

### Wave 3（F-002 merge 後）
- 觸發 `sprint-test.yml`，跑完整 BDD
- verifier 三維度檢查 → 關閉 milestone

## 風險

- **Design 是 Wave 0 唯一阻塞點**。若 design issue 拖慢，F-001 不能開工。建議 ui-designer 先產出 minimum tokens（color / spacing / typography）即可解鎖 F-001，ApprovalCard 元件規格可在 F-001 進行中產出，趕上 F-002 開工時間。
- **API contract 一致性**：F-002 spec 預期 `/api/inbox` 回傳 `{drafts: [...]}` 含 space_name / sender_name 等 join 後欄位。engineer 在 F-001/F-002 過程中需確認既有 endpoint 是否符合，不符就同時改 backend（仍在 frontend lane，因為是配合前端展示）。

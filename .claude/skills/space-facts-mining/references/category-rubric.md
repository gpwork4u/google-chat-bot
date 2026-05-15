# Category Rubric — 5 類 Space Facts 定義與範例

## 總覽

Space Facts 將 Google Chat space 的長期記憶分成 5 類，每類最多 5 條。分類依據是「這條資訊在未來回覆此 space 的訊息時，最需要哪個維度的 context」。

| Category | 中文名 | 核心問題 | 典型 Visibility |
|----------|--------|----------|----------------|
| `product` | 產品 | 這個 space 在討論什麼？ | public / private |
| `my-role` | 我的角色 | 我在這個 space 是做什麼的？ | private |
| `glossary` | 術語 | 這個 space 有哪些內部術語？ | public / private |
| `pinned-decision` | 決議 | 這個 space 達成了哪些共識？ | private |
| `relation` | 人物 | 這個 space 的人是誰、做什麼的？ | public / private |

---

## 1. product — 產品 / 系統

### 定義

此 space 主要討論的**產品、系統、服務、repo 或工作領域**，包含：
- 名稱（正式名稱 / 縮寫 / 代號）
- 核心功能 / 技術架構（簡述）
- 與此 space 相關的主要議題（不是全部，只記最常出現的）

### 使用場景

chat-drafts skill 處理此 space 的訊息時，「product」fact 幫助正確使用術語、理解問題背景。

### 好的範例

- "此 space 主要討論 fedflow K8s controller，重點在 reconciler queue 效能優化（p99 latency + throughput）"
- "此 space 負責維護 taipei-transit-api 公共交通資料服務，主要消費者是 MRT + 公車 app"
- "此 space 是 fedgpt-flowise 的開發討論區，使用 LangChain + Flowise 搭建 RAG pipeline"

### 壞的範例（不要寫）

- "這個 space 在討論技術問題" — 太空泛
- "可能是在做某個 AI 產品" — 臆測
- "工程師在聊天" — 沒有 fact value

### Visibility 規則

- `public`：產品是公開的（有公開文件 / GitHub repo / 官網）
- `private`：內部產品或還未公開

---

## 2. my-role — 我的角色

### 定義

Local user（系統配置的「使用者」）在此 space 的**角色與職責**：
- 技術角色（owner / contributor / reviewer / SRE / PM / 旁聽...）
- 互動模式（主動發起 / 被動回應 / 旁觀 / 負責 oncall...）
- 負責的具體工作（review PR / 寫文件 / 決策 / 協調...）

### 判斷方法

從訊息中找 local user 的發言模式與他人的交互方式：
- local user 主動發問 → contributor 或 owner
- local user 被 @ 且回答技術問題 → subject matter expert / contributor
- local user 只 ack / 回「好」「了解」→ 可能是旁聽 / 被 cc
- local user 完全沒發言 → 不寫 my-role（無證據）

### 好的範例

- "我在此 space 擔任 code reviewer，主要 review backend API 相關 PR"
- "我在此 space 是 SRE 值班輪替成員，負責 on-call 時段 incident 回應"
- "我在此 space 是資訊接收方，Alice 的 team 負責實作，我主要追進度"
- "我在此 space 幾乎只有閱讀，偶爾被 @ 時提供 infra 相關意見"

### 壞的範例（不要寫）

- "我是 GP Wang" — 廢話
- "我負責很多事" — 太空泛
- "我可能是 PM" — 不確定就不寫

### Visibility 規則

- 通常 `private`（工作角色分配不一定需要外部知道）
- 若是公開的 OSS maintainer 職位 → `public`

---

## 3. glossary — 術語 / 縮寫

### 定義

此 space 常出現且**有明確定義或解釋**的術語、縮寫、內部代號：
- 縮寫的全稱（NFR = Non-Functional Requirement）
- 內部代號的含義（「那個 V2 計畫」→ fedflow K8s v2.x rewrite）
- 領域術語的 space-specific 定義（「壓測」在這裡指什麼規模的測試）

### 判斷標準：只記「有定義」的術語

- 有人在訊息中明確解釋了縮寫或術語 → 記
- 訊息中出現縮寫但完全沒人解釋 → 不記（不要臆測定義）

### 好的範例

- "NFR = Non-Functional Requirement，此 space 重點追 latency + throughput"
- "SLO 在此 team 定義為：p99 API latency < 200ms（production 環境）"
- "fedflow 在這裡指 fedgpt-flowise 的簡稱，不是 Federated Learning 相關產品"
- "PR review window = 工作天 2 日內必須有至少 1 個 LGTM"

### 壞的範例（不要寫）

- "K8s" — 通用術語，不需要解釋
- "API" — 同上
- "NFR" — 只出現縮寫，但訊息中完全沒人解釋是什麼（不要猜）

### Visibility 規則

- `public`：行業通用術語的 space-specific 定義，可分享
- `private`：內部代號 / 機密計畫名稱
- 大多數 glossary fact 可以是 `public`

---

## 4. pinned-decision — 決議

### 定義

此 space 在歷史討論中**已達成共識、不再爭議**的決定：
- 技術選型（「決定用 PostgreSQL 而非 MongoDB」）
- 流程規範（「Q3 開始所有 PR 都要有 test coverage ≥ 80%」）
- 方向確認（「已決定 EOL IE11，Q4 移除相關 polyfill」）

### 判斷標準：只記「已決定」不記「在討論」

必須有明確的決議語氣：
- 有：「已決定」「確認」「一致同意」「定案」「我們會」「從下個 sprint 開始」
- 無：「我建議」「可以考慮」「有人覺得」「還在討論」「要不要...？」

### 好的範例

- "Q3 已定案不再支援 IE11，相關 polyfill 在 Q4 sprint 移除"
- "所有 API 文件改用 OpenAPI 3.0 格式，Swagger 2 不再更新（2026-04 決議）"
- "Reconciler queue 的 retry 策略確認採 exponential backoff，最多重試 5 次"
- "已決定 on-call rotation 每 2 週輪一次，Alice → Bob → Carol 順序"

### 壞的範例（不要寫）

- "Bob 提議用 Redis 做 cache" — 提議不是決議
- "大家都覺得應該加測試" — 模糊，沒有決定
- "可能會改版" — 不確定

### Visibility 規則

- 通常 `private`（內部決策流程）
- 若是已公告 EOL / 公開決策 → `public`

---

## 5. relation — 人物關係

### 定義

此 space 中**主要成員的角色與職銜**：
- 人名 + 職銜（「Alice 是此 team 的 PM，負責 roadmap」）
- 人名 + 負責領域（「Bob 是 SRE lead，on-call escalation 找他」）
- 重要的跨 team 關係（「Carol 是 Alice team 的 stakeholder，來自 data team」）

### 判斷標準

- 訊息中**明確說明**某人的角色 → 記
- 從訊息行為推測（Bob 總是回答 infra 問題 → 推測是 SRE？）→ 不記，寧可少
- 只記**此 space 的人**，不要記外部提到的陌生人名

### 好的範例

- "Alice 是此 space 的 PM，負責 F-014 feature roadmap 決策"
- "Bob 是 SRE lead，負責 on-call escalation 與 infra capacity planning"
- "Carol 是 data team 的 stakeholder，每次 sprint review 都會在場"
- "Jordan 是 frontend engineer，主要負責 React 元件開發"

### 壞的範例（不要寫）

- "Alice 負責很多事" — 太空泛
- "可能 Bob 是 PM？" — 不確定就不寫
- "有個叫 Dave 的人在外部系統" — 無關 space 成員

### Visibility 規則

- `public`：公開的職銜 / 公開角色（如 OSS maintainer）
- `private`（預設）：組織內部職稱 / 分工
- `secret`：涉及 HR / 績效 / 薪資的人事資訊（非常罕見）

---

## 各類判斷流程圖

```
閱讀一則訊息後問：

1. 這則訊息提到什麼產品/系統/服務？
   → 有且具體 → product candidate
   
2. local user 在這則訊息的行為是什麼？（發問/回答/review/旁聽）
   → 有明確行為 → my-role candidate
   
3. 這則訊息解釋了某個縮寫或術語嗎？
   → 有明確定義 → glossary candidate
   
4. 這則訊息宣布了一個決定嗎？（而不只是提議）
   → 有決議語氣 → pinned-decision candidate
   
5. 這則訊息明確說明某人的角色嗎？
   → 有明確描述 → relation candidate
```

---

## Visibility 決策樹

```
這條 fact 的內容性質是？

├── 薪資 / 人事決策 / 績效 / 機密合約
│   └── → secret
│
├── 工作內部資訊（大多數工作相關的 fact）
│   └── → private（預設）
│
└── 公開資訊（OSS 文件 / 公告 / 公開職銜）
    └── → public
```

**原則**：不確定時用 `private`，讓 user 在 approve 時再調整。

---

## Quality Checklist（LLM 自我審查）

在輸出前，對每條 fact 確認：

- [ ] 有至少 1 個 source_message_id，且該訊息確實支撐這條 fact
- [ ] content 是一句完整中文，不超過 200 字
- [ ] category 是 5 個 enum 之一
- [ ] visibility 是 public / private / secret 之一（不確定選 private）
- [ ] 這條 fact 不是臆測，是訊息中明確出現的資訊
- [ ] 同類的 fact 不超過 5 條（超過的話只保留最重要的）

# LLM Prompt 模板 — Space Facts Mining

## 設計原則

- 使用 XML tag `<schema>` 明確告知 JSON 結構
- 強制 LLM 把輸出包在 `<facts_json>...</facts_json>` 內，方便 skill 正則解析
- 明確要求「只在有訊息證據時才寫 fact」，避免臆測
- 每類最多 5 條，visibility 預設 private

---

## System Prompt

```
你是 space 上下文萃取助手。閱讀提供的 Google Chat 訊息後，**只**輸出符合以下 schema 的 JSON，不要有任何其他文字、解釋或 markdown：

<schema>
{
  "facts": [
    {
      "category": "product" | "my-role" | "glossary" | "pinned-decision" | "relation",
      "content": "一句完整中文描述，最多 200 字",
      "visibility": "public" | "private" | "secret",
      "source_message_ids": [<至少 1 個訊息 id，使用整數>]
    }
  ]
}
</schema>

## 5 類事實定義

1. **product**：此 space 主要討論的產品 / 系統 / repo / 服務名稱與核心功能
   - 例：「此 space 主要討論 fedflow K8s controller，重點在 reconciler queue 的效能優化」
   - 只記錄**明確提到的產品名稱與技術細節**，不要猜

2. **my-role**：local user（以下稱「我」）在此 space 的角色與職責
   - 例：「我在此 space 是 contributor，負責 backend API PR review」
   - 依訊息中 local user 的實際行為判斷（提 PR、回答問題、旁聽、聯絡等）
   - 若訊息中看不出 local user 的角色，跳過此類

3. **glossary**：此 space 常出現的術語 / 縮寫 / 內部代號（含定義）
   - 例：「NFR = Non-Functional Requirement，指效能/安全/可靠度需求」
   - 只記錄**有明確定義或解釋的術語**

4. **pinned-decision**：此 space 達成的共識 / 決議（已確認、不再爭議的）
   - 例：「Q3 已決定不再支援 IE11，相關 polyfill 在下版本移除」
   - 需要有明確的決議語氣（「決定」「確認」「一致同意」等），不要記錄討論中的提案

5. **relation**：此 space 中的人物關係（角色 / 職銜 / 負責領域）
   - 例：「Alice 是此 space 的 PM，負責 roadmap 決策」
   - 只記錄**明確提及**的人物身份，不要推測

## 重要規則

1. **只列有訊息證據的 fact**：每條 fact 必須有至少 1 個 `source_message_ids`，且該 id 的訊息確實能支撐此 fact
2. **每類最多 5 條**：若同類有超過 5 個候選，挑最重要、最有代表性的
3. **visibility 判斷**：
   - `public`：公開資訊，可自由引用（產品名稱、公開決議、公開角色）
   - `private`（預設）：工作內部資訊，可看不主動外洩（大多數 fact 用 private）
   - `secret`：敏感話題（薪資、人事決策、績效、私人事務、保密合約等）
4. **不臆測**：沒有明確訊息證據就不寫，寧可少寫也不要寫錯
5. **content 字數**：每條不超過 200 字，一句話說清楚
6. **輸出格式嚴格**：只輸出 `<facts_json>...</facts_json>` 包裹的 JSON，不要有 markdown fence、不要有前後說明文字

## 輸出格式（嚴格遵守）

<facts_json>
{ "facts": [ ... ] }
</facts_json>
```

---

## User Prompt 模板

```
Local user: {local_user_name}
Space: {space_name} (key={space_key})

訊息（共 {N} 則，按時間排序）：
{formatted_messages}
```

其中 `{formatted_messages}` 的格式為每則一行：

```
[id=123] Alice (2026-05-01 09:00): 這個 PR 已 merge，fedflow controller v2.1 正式上線
[id=124] Bob (2026-05-01 09:05): 讚，我來更新 runbook
[id=125] Carol (2026-05-01 09:10): @GP Wang 你 review 一下新的 admission webhook 邏輯？
[id=126] GP Wang (2026-05-01 09:15): 好，下午我看完回
```

---

## 完整範例對話

### Input

**System prompt**：（如上）

**User prompt**：
```
Local user: GP Wang 王鈞平
Space: fedflow-team (key=spaces/AAQA...)

訊息（共 4 則，按時間排序）：
[id=101] Alice (2026-05-01 09:00): fedflow K8s controller v2.1 已 merge，reconciler queue 效能提升 40%
[id=102] Bob (2026-05-01 09:05): 很棒！NFR 的 p99 latency 要在這個 sprint 達標
[id=103] Carol (2026-05-01 09:10): NFR = Non-Functional Requirement，我們 Q2 決定重點追 latency 跟 throughput
[id=104] GP Wang (2026-05-01 09:15): @Alice 那個 reconciler queue 的 PR 我已經 review 完，LGTM
```

### Expected Output

```xml
<facts_json>
{
  "facts": [
    {
      "category": "product",
      "content": "此 space 主要討論 fedflow K8s controller，v2.1 版重點在 reconciler queue 效能優化（p99 latency + throughput）",
      "visibility": "private",
      "source_message_ids": [101, 102]
    },
    {
      "category": "my-role",
      "content": "我（GP Wang）在此 space 擔任 code reviewer，負責 review PR 並給出 LGTM",
      "visibility": "private",
      "source_message_ids": [104]
    },
    {
      "category": "glossary",
      "content": "NFR = Non-Functional Requirement，指效能 / 可靠度需求（此 space 重點追 latency + throughput）",
      "visibility": "public",
      "source_message_ids": [102, 103]
    },
    {
      "category": "pinned-decision",
      "content": "Q2 決定重點追 NFR 指標：p99 latency + throughput，此 sprint 內達標",
      "visibility": "private",
      "source_message_ids": [102, 103]
    }
  ]
}
</facts_json>
```

---

## 解析策略（給 skill 實作參考）

```python
import re, json

def extract_facts(llm_response: str) -> list:
    # 1. 抓 <facts_json>...</facts_json>
    match = re.search(r'<facts_json>(.*?)</facts_json>', llm_response, re.DOTALL)
    if not match:
        raise ValueError("parse error: 找不到 <facts_json> tag")
    
    raw_json = match.group(1).strip()
    
    # 2. Parse JSON
    data = json.loads(raw_json)
    
    # 3. Validate
    if 'facts' not in data or not isinstance(data['facts'], list):
        raise ValueError("parse error: facts 不是陣列")
    
    return data['facts']
```

Shell 版（用 grep + jq）：

```bash
# 從 LLM output 抓 facts_json 區段
extract_facts_json() {
  local response="$1"
  echo "$response" | \
    grep -oP '(?<=<facts_json>)[\s\S]*?(?=</facts_json>)' | \
    jq '.facts'
}
```

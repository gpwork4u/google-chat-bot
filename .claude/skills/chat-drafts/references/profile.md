# Profile — 拉使用者個人資訊

當訊息問個人相關的事（家在哪、公司在哪、幾點下班、寵物叫什麼、會不會騎車...），先查使用者自己留在 backend 的 profile facts，再決定怎麼回。

## API

```bash
# 拿所有 skill 看得到的 facts（public + private；secret 不會回）
curl -s "http://localhost:8080/api/claude/profile"

# 拿單一 fact
curl -s "http://localhost:8080/api/claude/profile?key=home_city"

# 使用者自己維護 (skill 不寫，留給使用者 CLI 操作)
curl -s -X PUT http://localhost:8080/api/claude/profile \
  -H 'Content-Type: application/json' \
  -d '{"key":"home_city","value":"台北","visibility":"private","note":"只在家人群或熟同事問才說"}'
```

Response (list)：
```json
{
  "facts": [
    {"key":"employer","value":"Taiwan AI Labs","visibility":"public","note":"","updated_at":"..."},
    {"key":"home_city","value":"台北","visibility":"private","note":"只在家人群或熟同事","updated_at":"..."},
    {"key":"pet","value":"有一隻貓叫 mochi","visibility":"public","note":"","updated_at":"..."}
  ]
}
```

## Visibility 語意

| visibility | API 回傳 | 何時可主動用 |
|-----------|---------|-------------|
| `public`  | ✅       | 任何場合都可以講（例：工作、公司、興趣大方向） |
| `private` | ✅       | **skill 要判斷 sender / space 關係**，只在合理情境才說（例：家人群問住哪） |
| `secret`  | ❌ 永遠不回 | 使用者自己留存，AI 完全看不到（精確住址、身份證、密碼） |

**關鍵**：拿到 `private` fact **不等於可以說**。backend 不強制，skill 要做 judgment。

## 判斷要不要用 private fact

拉到 ticket 前 / 起草前，依 context：

1. **sender 是誰？** 從 thread / around / space_name 推（家人群、朋友群、同事群、生人）
2. **space 性質？** `space_name` 像「哪時候去日本」、「家人」、「xxx 家族」= 家人；有公司名、頻道名 = 工作；陌生 1-on-1 = 需保守
3. **對方為何問？** 是閒聊 / 確認已知資訊 / 第一次問
4. **fact 的 note 欄位** 通常會寫使用者意圖（「只在家人群或熟同事才說」），**以 note 為最終判準**

若不確定就用**最模糊的粒度**或 fallback：
- fact value 是「台北市信義區 XX 路 N 號」→ 只說「台北」或「信義區」
- 或直接「晚點跟你說」讓使用者自己講

## 典型場景

### 1. 對方問「你家在哪」
```
→ GET /api/claude/profile
→ 找 home_city / home_area / home_address（越精確 visibility 越嚴）
→ home_city=private + 家人群 → 可說「台北」
→ home_address=secret → API 根本拿不到 → fallback「晚點跟你說」
```

### 2. 對方問「你在哪上班」
```
→ 找 employer / workplace
→ employer=public → 直接回「Taiwan AI Labs」
→ office_address=private + 同事群 → 可說；陌生群 → 模糊化「台北 office」
```

### 3. 對方問「你養什麼」
```
→ 找 pet
→ public → 直接說（可愛的事通常 public）
```

### 4. 查不到對應 fact
```
→ 沒存 → AI 真的不知道 → 「不知道欸，晚點跟你說」或追問
→ 不要瞎編
```

## 何時拉 profile

**不用每則都拉**。觸發條件：

- 對方訊息含「你 / 你的」+ 個人名詞（家、住、公司、電話、寵物、年紀、生日、車、老婆、小孩...）
- 或訊息是直接問（「你家在哪」、「幾點下班」、「週末去哪玩」）

一次 skill run 拉一次快取起來（跟 style profile 一樣），之後查 key 就好。

## 與時間盒的關係

- `GET /api/claude/profile`（list）算 1 tool call
- 建議在 step 0 跟 style profile 一起拉（並列執行不算額外輪次）
- 單則訊息若還要 `?key=<k>` 查，再加 1 call

## 不要做的事

- **不要**在 chat reply 裡把 `note` 欄位內容 echo 給對方（那是給 AI 的操作 hint）
- **不要**代使用者 PUT / DELETE profile（只有使用者本人手動 curl 或 UI 操作）
- **不要**把 `private` fact 原文貼到 reasoning 欄位（reasoning 只寫判斷邏輯，不貼 value）
- **不要**猜 secret — API 拿不到的就是拿不到，fallback 就好

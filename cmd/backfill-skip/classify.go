// classify.go — 本地 heuristic D 類判定（不呼叫 LLM）。
//
// 採用保守策略：寧可漏判不誤判。只有高確定性的 D 類訊息才標記 skip。
// 三種 D 類原因（reason）：
//  1. pure-ack     — 訊息 trim 後長度 ≤ 4，或符合常見純 ack 詞彙
//  2. low-info     — 純 emoji，無語義資訊
//  3. policy-redline — 命中金錢/合約等政策紅線關鍵字
//
// 其他情形（如 overheard、not-targeted 等需 context 才能判斷）不在此判定，
// 留給 skill（LLM）處理。
package main

import (
	"regexp"
	"strings"
	"unicode"
)

// classify 判斷訊息是否為 D 類，回傳 reason 字串。
// ok=false 表示不確定，不 skip。
func classify(m PendingMessage) (reason string, ok bool) {
	text := strings.TrimSpace(m.Body)

	// ── 1. 純 ack（短訊息 / 常見回應詞）────────────────────────────────
	if isPureAck(text) {
		return "pure-ack", true
	}

	// ── 2. 純 emoji（無文字資訊）────────────────────────────────────────
	if isPureEmoji(text) {
		return "low-info", true
	}

	// ── 3. 政策紅線（金錢/合約關鍵字）──────────────────────────────────
	if reason, hit := policyRedline(text); hit {
		return reason, true
	}

	// 其他情形保守略過
	return "", false
}

// ── Pure-Ack ─────────────────────────────────────────────────────────────────

// ackPhrases 列出常見的純 ack 詞彙（case-insensitive）。
var ackPhrases = []string{
	// 中文
	"好", "好的", "收到", "了解", "知道了", "知道", "OK", "ok", "好喔",
	"好啊", "嗯", "嗯嗯", "嗯啊", "恩", "恩恩", "okok", "okk",
	"謝謝", "謝", "感謝", "thx", "thanks", "thank you", "ty",
	"👍", "👌", "🙏", "❤", "❤️",
	// 短 emoji-only 串（單個 emoji）已由 isPureEmoji 處理
}

func isPureAck(text string) bool {
	// 長度 ≤ 4 rune（含空白）幾乎一定是 ack
	if len([]rune(text)) <= 4 {
		return true
	}

	lower := strings.ToLower(text)
	for _, phrase := range ackPhrases {
		if lower == strings.ToLower(phrase) {
			return true
		}
	}
	return false
}

// ── Pure-Emoji ────────────────────────────────────────────────────────────────

// emojiRanges 列出常見 emoji Unicode block 範圍。
// 不求完整，只需涵蓋常見 emoji 即可（誤漏可接受）。
var emojiRanges = []struct{ lo, hi rune }{
	{0x1F300, 0x1FAFF}, // Misc Symbols and Pictographs, Emoticons, etc.
	{0x2600, 0x26FF},   // Misc Symbols
	{0x2700, 0x27BF},   // Dingbats
	{0xFE00, 0xFE0F},   // Variation Selectors
	{0x1F1E0, 0x1F1FF}, // Regional indicators (旗幟)
	{0x200D, 0x200D},   // Zero-width joiner
}

func isEmojiRune(r rune) bool {
	if unicode.IsSpace(r) {
		return true // 允許 emoji 之間有空白
	}
	for _, rng := range emojiRanges {
		if r >= rng.lo && r <= rng.hi {
			return true
		}
	}
	return false
}

func isPureEmoji(text string) bool {
	if text == "" {
		return false
	}
	for _, r := range text {
		if !isEmojiRune(r) {
			return false
		}
	}
	return true
}

// ── Policy Redline ────────────────────────────────────────────────────────────

// moneyPatterns 來自 internal/safety/money.go 的規則。
// 在 cmd 工具中複製一份（避免引入 internal 套件），保持工具自給自足。
var moneyPatterns = []*regexp.Regexp{
	// 美元符號金額，例如 $1,000 / $50000
	regexp.MustCompile(`\$[\d,]+`),
	// 台幣符號金額，例如 NT$5000 / NT$1,000
	regexp.MustCompile(`NT\$[\d,]+`),
	// 日圓符號金額，例如 ¥5000 / ¥1,000
	regexp.MustCompile(`¥[\d,]+`),
	// 數字 + 中文量詞，例如 5000元、3塊、1萬、50k、50K
	regexp.MustCompile(`[\d,]+\s*(?:元|塊|萬|k|K)`),
	// 金融動詞關鍵字
	regexp.MustCompile(`(?:轉帳|匯款|付款|報價|定金|尾款)`),
}

// contractPatterns 合約相關關鍵字
var contractPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?:合約|契約|合同|協議|授權|簽約|NDA|合作條款)`),
}

func policyRedline(text string) (reason string, hit bool) {
	for _, re := range moneyPatterns {
		if loc := re.FindString(text); loc != "" {
			return "policy-redline:money:" + loc, true
		}
	}
	for _, re := range contractPatterns {
		if loc := re.FindString(text); loc != "" {
			return "policy-redline:contract:" + loc, true
		}
	}
	return "", false
}

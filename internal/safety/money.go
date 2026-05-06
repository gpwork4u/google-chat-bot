// Package safety implements the safety-rails feature (F-008).
// It detects money-related content in draft messages and flags them for
// human review, preventing LLM from accidentally making financial commitments.
package safety

import "regexp"

// moneyPatterns lists all regex patterns used for keyword pre-screening.
// The pre-screen is intentionally broad (low cost) — a later Claude skill
// call provides the precision filter.
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

// KeywordMatched returns true if text contains any money-related keyword
// or pattern. This is a cheap pre-screen; caller should follow up with
// ClaudeCheck only when this returns true.
func KeywordMatched(text string) bool {
	for _, re := range moneyPatterns {
		if re.MatchString(text) {
			return true
		}
	}
	return false
}

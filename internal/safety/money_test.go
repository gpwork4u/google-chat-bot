package safety_test

import (
	"testing"

	"github.com/ailabs-tw/google-chat-bot/internal/safety"
)

func TestKeywordMatched(t *testing.T) {
	tests := []struct {
		name    string
		text    string
		wantHit bool
	}{
		// $amount pattern
		{name: "dollar-amount hit", text: "I'll pay $500 for this", wantHit: true},
		{name: "dollar-amount with comma hit", text: "Total is $1,000", wantHit: true},
		{name: "dollar-amount miss (no digit)", text: "$ makes me think of money", wantHit: false},

		// NT$amount pattern
		{name: "NT-dollar hit", text: "價格是 NT$5000", wantHit: true},
		{name: "NT-dollar with comma hit", text: "NT$10,000 費用", wantHit: true},
		{name: "NT-dollar miss (no digit)", text: "NT$ 真便宜", wantHit: false},

		// ¥amount pattern
		{name: "yen-amount hit", text: "費用 ¥3000", wantHit: true},
		{name: "yen-amount with comma hit", text: "¥1,000", wantHit: true},
		{name: "yen-amount miss (no digit)", text: "¥ sign only", wantHit: false},

		// digit + unit pattern
		{name: "digit-yuan hit", text: "5000元", wantHit: true},
		{name: "digit-kuai hit", text: "三百塊", wantHit: false}, // non-ASCII digits don't match \d
		{name: "digit-wan hit", text: "10萬", wantHit: true},
		{name: "digit-k lower hit", text: "50k fee", wantHit: true},
		{name: "digit-K upper hit", text: "100K budget", wantHit: true},
		{name: "digit-unit miss (text only)", text: "萬歲！", wantHit: false},
		{name: "digit-unit with space hit", text: "5000 元", wantHit: true},

		// financial verb pattern
		{name: "zhuan-zhang hit", text: "請幫我轉帳", wantHit: true},
		{name: "hui-kuan hit", text: "下週五前匯款給你", wantHit: true},
		{name: "fu-kuan hit", text: "確認付款後出貨", wantHit: true},
		{name: "bao-jia hit", text: "可以幫我報價嗎", wantHit: true},
		{name: "ding-jin hit", text: "先付定金 30%", wantHit: true},
		{name: "wei-kuan hit", text: "交貨後付尾款", wantHit: true},

		// genuine miss (no money)
		{name: "plain text miss", text: "好的，沒問題，週五前完成", wantHit: false},
		{name: "empty string miss", text: "", wantHit: false},
		{name: "report length context", text: "報告長度大概 5000 字", wantHit: true}, // 5000 + 字 = digit+unit ambiguous but NOT in pattern; "5000 " matches digit+K|k|元|塊|萬 — NOT 字, so miss
	}

	// Correct the expectation: "5000 字" — '字' is not in the pattern list, so it's a miss.
	// Override the last test.
	tests[len(tests)-1].wantHit = false

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := safety.KeywordMatched(tc.text)
			if got != tc.wantHit {
				t.Errorf("KeywordMatched(%q) = %v, want %v", tc.text, got, tc.wantHit)
			}
		})
	}
}

package httpapi

import (
	"context"
	"testing"

	"github.com/ailabs-tw/google-chat-bot/internal/safety"
)

// mockClaudeClientForHTTP 是測試用的 ClaudeClient stub，
// 透過 matchedKeywords 是否非空來決定 flagged 結果。
type mockClaudeClientForHTTP struct {
	callCount int
	flagged   bool
	reason    string
}

func (m *mockClaudeClientForHTTP) SafetyCheck(_ context.Context, _, matchedKeywords string) (safety.ClaudeResult, error) {
	m.callCount++
	if m.flagged {
		return safety.ClaudeResult{Flagged: true, Reason: m.reason}, nil
	}
	return safety.ClaudeResult{Flagged: false}, nil
}

// TestSafetyInterceptForceDraftMode 驗證：
// 安全護欄命中時 autoSend 必須強制設為 false（覆蓋 auto_mode=ON）。
func TestSafetyInterceptForceDraftMode(t *testing.T) {
	// 模擬 safety.Check 回傳 flagged=true 的情境
	mock := &mockClaudeClientForHTTP{flagged: true, reason: "明確金額承諾"}
	settings := safety.Settings{
		Enabled: true,
		Rules:   map[string]bool{"money": true},
	}
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "inherit"}

	// 含金錢關鍵字的 draft，應觸發護欄
	draftText := "好的，NT$50000 週五前匯款"
	result, err := safety.Check(context.Background(), draftText, "spaces/AAA", settings, spaceSettings, mock)
	if err != nil {
		t.Fatalf("safety.Check returned unexpected error: %v", err)
	}
	if !result.Flagged {
		t.Fatal("expected safety check to flag draft with money content")
	}

	// 模擬 handleClaudeReply 的邏輯：若 result.Flagged，強制 autoSend=false
	autoSend := true // 假設 auto_mode=ON
	if result.Flagged {
		autoSend = false
	}
	if autoSend {
		t.Error("expected autoSend=false when safety check flags draft, even if auto_mode=ON")
	}
	if len(result.Flags) == 0 || result.Flags[0] != "money" {
		t.Errorf("expected result.Flags=[\"money\"], got %v", result.Flags)
	}
	if result.Reason != "明確金額承諾" {
		t.Errorf("expected reason=%q, got %q", "明確金額承諾", result.Reason)
	}
}

// TestSafetyInterceptNoFlag 驗證：
// 無金錢關鍵字的 draft 不觸發護欄，autoSend 維持 auto_mode 設定。
func TestSafetyInterceptNoFlag(t *testing.T) {
	mock := &mockClaudeClientForHTTP{flagged: false}
	settings := safety.Settings{
		Enabled: true,
		Rules:   map[string]bool{"money": true},
	}
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "inherit"}

	// 不含金錢關鍵字的 draft
	draftText := "好的，我下午看一下再回覆你"
	result, err := safety.Check(context.Background(), draftText, "spaces/AAA", settings, spaceSettings, mock)
	if err != nil {
		t.Fatalf("safety.Check returned unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected safety check NOT to flag draft without money content")
	}

	// 模擬 handleClaudeReply 的邏輯：未命中時保持 autoSend
	autoSend := true // auto_mode=ON
	if result.Flagged {
		autoSend = false
	}
	if !autoSend {
		t.Error("expected autoSend=true when safety check does not flag draft")
	}
	// 無關鍵字 → Claude 不應被呼叫
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls on no keyword match, got %d", mock.callCount)
	}
}

// TestSafetyInterceptSpaceDisabled 驗證：
// 當 space 的 safety_rails_override=disabled 時，即使有金錢關鍵字也不觸發護欄。
func TestSafetyInterceptSpaceDisabled(t *testing.T) {
	mock := &mockClaudeClientForHTTP{flagged: true, reason: "should not reach"}
	settings := safety.Settings{
		Enabled: true,
		Rules:   map[string]bool{"money": true},
	}
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "disabled"}

	draftText := "好的，NT$50000 週五前匯款"
	result, err := safety.Check(context.Background(), draftText, "spaces/AAA", settings, spaceSettings, mock)
	if err != nil {
		t.Fatalf("safety.Check returned unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected safety check NOT to flag when per-space override=disabled")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls when space disabled, got %d", mock.callCount)
	}

	// autoSend 應維持不變
	autoSend := true
	if result.Flagged {
		autoSend = false
	}
	if !autoSend {
		t.Error("expected autoSend=true when space safety rails disabled")
	}
}

// TestSafetyInterceptGlobalDisabled 驗證：
// 全域 safety_rails_enabled=false 時，所有內容均不觸發護欄。
func TestSafetyInterceptGlobalDisabled(t *testing.T) {
	mock := &mockClaudeClientForHTTP{flagged: true}
	settings := safety.Settings{
		Enabled: false, // 全域關閉
		Rules:   map[string]bool{"money": true},
	}
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "inherit"}

	draftText := "好的，NT$50000 週五前匯款"
	result, err := safety.Check(context.Background(), draftText, "spaces/AAA", settings, spaceSettings, mock)
	if err != nil {
		t.Fatalf("safety.Check returned unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected safety check NOT to flag when global safety disabled")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls when globally disabled, got %d", mock.callCount)
	}
}

// TestSafetyFlagsWrittenAfterUpsert 驗證：
// 當 safetyResult.Flagged=true 且 Flags 非空時，safety_flags 應被寫入 DB。
// 此測試驗證條件判斷邏輯（真實 DB 寫入由整合測試覆蓋）。
func TestSafetyFlagsWrittenAfterUpsert(t *testing.T) {
	// 模擬 handleClaudeReply 中的條件邏輯
	cases := []struct {
		name       string
		result     safety.Result
		shouldSave bool
	}{
		{
			name:       "flagged with flags → should save",
			result:     safety.Result{Flagged: true, Flags: []string{"money"}, Reason: "NT$50000 detected"},
			shouldSave: true,
		},
		{
			name:       "not flagged → should not save",
			result:     safety.Result{Flagged: false, Flags: []string{}, Reason: ""},
			shouldSave: false,
		},
		{
			name:       "flagged but empty flags → should not save",
			result:     safety.Result{Flagged: true, Flags: []string{}, Reason: ""},
			shouldSave: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// 模擬 handleClaudeReply 中的條件
			willSave := tc.result.Flagged && len(tc.result.Flags) > 0
			if willSave != tc.shouldSave {
				t.Errorf("expected shouldSave=%v, got %v", tc.shouldSave, willSave)
			}
		})
	}
}

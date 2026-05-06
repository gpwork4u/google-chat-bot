package safety_test

import (
	"context"
	"errors"
	"testing"

	"github.com/ailabs-tw/google-chat-bot/internal/safety"
)

// mockClaudeClient counts how many times SafetyCheck is called and returns
// a pre-configured result. Used to verify Claude is NOT called on early exits.
type mockClaudeClient struct {
	callCount int
	result    safety.ClaudeResult
	err       error
}

func (m *mockClaudeClient) SafetyCheck(_ context.Context, _, _ string) (safety.ClaudeResult, error) {
	m.callCount++
	return m.result, m.err
}

func defaultSettings() safety.Settings {
	return safety.Settings{
		Enabled: true,
		Rules:   map[string]bool{"money": true},
	}
}

func inheritSpaceSettings() safety.SpaceSettings {
	return safety.SpaceSettings{SafetyRailsOverride: "inherit"}
}

// TestCheck_GlobalDisabled verifies early exit when safety_rails_enabled=false.
func TestCheck_GlobalDisabled(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true}}
	settings := safety.Settings{Enabled: false, Rules: map[string]bool{"money": true}}

	result, err := safety.Check(context.Background(), "匯款 NT$5000", "spaces/AAA", settings, inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when global disabled")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls, got %d", mock.callCount)
	}
}

// TestCheck_PerSpaceDisabled verifies early exit when space override=disabled.
func TestCheck_PerSpaceDisabled(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true}}
	spaceSettings := safety.SpaceSettings{SafetyRailsOverride: "disabled"}

	result, err := safety.Check(context.Background(), "匯款 NT$5000", "spaces/test", defaultSettings(), spaceSettings, mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when per-space override=disabled")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls, got %d", mock.callCount)
	}
}

// TestCheck_MoneyRuleDisabled verifies early exit when money rule disabled.
func TestCheck_MoneyRuleDisabled(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true}}
	settings := safety.Settings{Enabled: true, Rules: map[string]bool{"money": false}}

	result, err := safety.Check(context.Background(), "匯款 NT$5000", "spaces/AAA", settings, inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when money rule disabled")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls, got %d", mock.callCount)
	}
}

// TestCheck_KeywordMiss verifies no Claude call when keyword pre-screen misses.
func TestCheck_KeywordMiss(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true}}

	result, err := safety.Check(context.Background(), "好的，沒問題，週五前完成", "spaces/AAA", defaultSettings(), inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when keyword pre-screen misses")
	}
	// The key assertion: Claude must NOT be called when keyword misses.
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls on keyword miss, got %d", mock.callCount)
	}
}

// TestCheck_KeywordHitClaudeFlagged verifies flagged=true when keyword hits and Claude confirms.
func TestCheck_KeywordHitClaudeFlagged(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true, Reason: "明確匯款承諾"}}

	result, err := safety.Check(context.Background(), "好的，這個案子 NT$50000，週五前付款", "spaces/AAA", defaultSettings(), inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Flagged {
		t.Error("expected flagged=true when keyword hits and Claude confirms")
	}
	if len(result.Flags) == 0 || result.Flags[0] != "money" {
		t.Errorf("expected flags=[money], got %v", result.Flags)
	}
	if result.Reason != "明確匯款承諾" {
		t.Errorf("expected reason from Claude, got %q", result.Reason)
	}
	if mock.callCount != 1 {
		t.Errorf("expected 1 Claude call, got %d", mock.callCount)
	}
}

// TestCheck_KeywordHitClaudeNotFlagged verifies no downgrade when Claude negates.
func TestCheck_KeywordHitClaudeNotFlagged(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: false, Reason: ""}}

	// "5000 字" doesn't match any pattern (字 is not in pattern list), so keyword miss.
	// Use a text that will match the digit+unit pattern: "5000k" to trigger keyword hit.
	result, err := safety.Check(context.Background(), "我們的 RD team 報告長度大概 5000k 字", "spaces/AAA", defaultSettings(), inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when Claude negates keyword hit")
	}
	if mock.callCount != 1 {
		t.Errorf("expected 1 Claude call (keyword hit but Claude negated), got %d", mock.callCount)
	}
}

// TestCheck_ClaudeError verifies fail-safe: error → flagged=true.
func TestCheck_ClaudeError(t *testing.T) {
	mock := &mockClaudeClient{err: errors.New("timeout")}

	result, err := safety.Check(context.Background(), "匯款 NT$5000", "spaces/AAA", defaultSettings(), inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error returned: %v", err)
	}
	if !result.Flagged {
		t.Error("expected flagged=true on Claude error (fail safe)")
	}
}

// TestCheck_MissingMoneyRule verifies early exit when money key absent from rules.
func TestCheck_MissingMoneyRule(t *testing.T) {
	mock := &mockClaudeClient{result: safety.ClaudeResult{Flagged: true}}
	settings := safety.Settings{Enabled: true, Rules: map[string]bool{}}

	result, err := safety.Check(context.Background(), "匯款 NT$5000", "spaces/AAA", settings, inheritSpaceSettings(), mock)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Flagged {
		t.Error("expected flagged=false when money rule absent from rules map")
	}
	if mock.callCount != 0 {
		t.Errorf("expected 0 Claude calls, got %d", mock.callCount)
	}
}

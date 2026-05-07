package worker

import (
	"testing"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/parser"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

// newMsg is a helper that returns a minimal ParsedMessage.
func newMsg(body string) parser.ParsedMessage {
	return parser.ParsedMessage{
		MessageID:  "msg-001",
		SpaceKey:   "space:TESTSPACE",
		SenderID:   "user-42",
		SenderName: "Alice",
		SenderEmail: "alice@example.com",
		Body:       body,
		ObservedAt: time.Now(),
	}
}

// defaultSettings returns a UserSettings with all auto-skip features off.
func defaultSettings() *store.UserSettings {
	return &store.UserSettings{
		UserID:                 1,
		BlockedKeywords:        "",
		ReplyOnlyWhenMentioned: false,
	}
}

// TestAutoSkip_SelfSent verifies that sender_is_me=true triggers the self-sent skip.
func TestAutoSkip_SelfSent(t *testing.T) {
	pm := newMsg("Hello everyone")
	settings := defaultSettings()

	reason, by := autoSkipReasonFromSettings(pm, true, "Alice", settings)

	if reason != "self-sent" {
		t.Errorf("want reason=self-sent, got %q", reason)
	}
	if by != "backend_auto" {
		t.Errorf("want by=backend_auto, got %q", by)
	}
}

// TestAutoSkip_BlockedKeyword verifies that a message matching blocked_keywords is skipped.
func TestAutoSkip_BlockedKeyword(t *testing.T) {
	pm := newMsg("Please send 50000 dollars to the account")
	settings := defaultSettings()
	settings.BlockedKeywords = "dollars,bitcoin"

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", settings)

	if reason != "blocked-keyword:dollars" {
		t.Errorf("want reason=blocked-keyword:dollars, got %q", reason)
	}
	if by != "backend_auto" {
		t.Errorf("want by=backend_auto, got %q", by)
	}
}

// TestAutoSkip_NotMentioned verifies that mention-only mode skips messages without @mention.
func TestAutoSkip_NotMentioned(t *testing.T) {
	pm := newMsg("Hey team, please check the dashboard")
	settings := defaultSettings()
	settings.ReplyOnlyWhenMentioned = true

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", settings)

	if reason != "not-mentioned" {
		t.Errorf("want reason=not-mentioned, got %q", reason)
	}
	if by != "backend_auto" {
		t.Errorf("want by=backend_auto, got %q", by)
	}
}

// TestAutoSkip_NormalMentioned verifies that a message mentioning the bot is NOT skipped
// even when mention-only mode is on.
func TestAutoSkip_NormalMentioned(t *testing.T) {
	pm := newMsg("@Bot can you help me with this task?")
	settings := defaultSettings()
	settings.ReplyOnlyWhenMentioned = true

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", settings)

	if reason != "" || by != "" {
		t.Errorf("want no skip, got reason=%q by=%q", reason, by)
	}
}

// TestAutoSkip_NormalMessage verifies that a normal message with no skip conditions passes through.
func TestAutoSkip_NormalMessage(t *testing.T) {
	pm := newMsg("Hey, how are you?")
	settings := defaultSettings()

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", settings)

	if reason != "" || by != "" {
		t.Errorf("want no skip, got reason=%q by=%q", reason, by)
	}
}

// TestAutoSkip_SelfSentPriority verifies that self-sent takes priority over blocked_keywords.
func TestAutoSkip_SelfSentPriority(t *testing.T) {
	pm := newMsg("I want to transfer 1000 dollars")
	settings := defaultSettings()
	settings.BlockedKeywords = "dollars"

	// Even if the message matches blocked_keywords, self-sent takes priority.
	reason, by := autoSkipReasonFromSettings(pm, true, "Me", settings)

	if reason != "self-sent" {
		t.Errorf("want reason=self-sent, got %q", reason)
	}
	if by != "backend_auto" {
		t.Errorf("want by=backend_auto, got %q", by)
	}
}

// TestAutoSkip_BlockedKeywordCaseInsensitive verifies that keyword matching is case-insensitive.
func TestAutoSkip_BlockedKeywordCaseInsensitive(t *testing.T) {
	pm := newMsg("Can you send MONEY to my account?")
	settings := defaultSettings()
	settings.BlockedKeywords = "money"

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", settings)

	if reason != "blocked-keyword:money" {
		t.Errorf("want reason=blocked-keyword:money, got %q", reason)
	}
	if by != "backend_auto" {
		t.Errorf("want by=backend_auto, got %q", by)
	}
}

// TestAutoSkip_NilSettings verifies that nil settings don't panic and pass through.
func TestAutoSkip_NilSettings(t *testing.T) {
	pm := newMsg("Some message")

	reason, by := autoSkipReasonFromSettings(pm, false, "Bot", nil)

	if reason != "" || by != "" {
		t.Errorf("want no skip with nil settings, got reason=%q by=%q", reason, by)
	}
}

// TestMatchBlockedKeywordReturn_MultipleKeywords verifies that the first matching
// keyword in the CSV list is returned.
func TestMatchBlockedKeywordReturn_MultipleKeywords(t *testing.T) {
	kw := matchBlockedKeywordReturn("wire transfer of funds", "transfer,funds,payment")
	if kw != "transfer" {
		t.Errorf("want first matching keyword 'transfer', got %q", kw)
	}
}

// TestMatchBlockedKeywordReturn_NoMatch verifies that an empty string is returned
// when no keyword matches.
func TestMatchBlockedKeywordReturn_NoMatch(t *testing.T) {
	kw := matchBlockedKeywordReturn("hello world", "money,bitcoin,wire")
	if kw != "" {
		t.Errorf("want empty string for no match, got %q", kw)
	}
}

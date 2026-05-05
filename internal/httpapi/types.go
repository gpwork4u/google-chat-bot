// Package httpapi — wire-level DTO types for the React frontend.
//
// This file is the single source of truth for the JSON shapes returned by
// the HTTP API. tygo reads this file to generate web/src/contracts.generated.ts.
//
// Rules:
//   - Every exported field MUST have a `json:"..."` tag.
//   - Fields without a json tag are NOT exported to TypeScript.
//   - Use pointer types (*T) for optional / nullable fields → TS `T | null`.
//   - time.Time is mapped to `string` (ISO 8601) by tygo.yaml configuration.
//
// Run `make contracts` to regenerate web/src/contracts.generated.ts.
package httpapi

import "time"

// Settings is the global per-user configuration returned by GET /api/settings
// and emitted in WebSocket settings_updated events.
type Settings struct {
	AutoMode               bool   `json:"auto_mode"`
	FreshnessWindowMinutes int    `json:"freshness_window_minutes"`
	DebugMode              bool   `json:"debug_mode"`
	BlockedKeywords        string `json:"blocked_keywords"`
	ReplyOnlyWhenMentioned bool   `json:"reply_only_when_mentioned"`
}

// Space is one row returned by GET /api/spaces — a Google Chat space with
// its per-channel settings.
type Space struct {
	SpaceKey         string     `json:"space_key"`
	SpaceName        string     `json:"space_name"`
	Enabled          bool       `json:"enabled"`
	MentionOnly      bool       `json:"mention_only"`
	AutoModeOverride string     `json:"auto_mode_override"` // "inherit" | "always_on" | "always_off"
	BlockedKeywords  []string   `json:"blocked_keywords"`
	MessageCount     int        `json:"message_count"`
	LastMessageAt    *time.Time `json:"last_message_at"`
}

// ContextMessage is a single message in the conversation context bundled with
// a Draft in the approval queue.
type ContextMessage struct {
	SenderName string    `json:"sender_name"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
	IsMe       bool      `json:"is_me"`
}

// DraftDebugInfo carries optional debug information attached to a Draft when
// DebugMode is enabled in Settings.
type DraftDebugInfo struct {
	Reasoning     string   `json:"categorize_reason,omitempty"`
	Confidence    *float32 `json:"confidence,omitempty"`
	ContextSource string   `json:"context_source,omitempty"`
	Model         string   `json:"model,omitempty"`
}

// Draft is one pending approval item returned by GET /api/drafts. It bundles
// the AI-generated reply with enough context (space / sender / original message)
// for the ApprovalsPage to render a complete ApprovalCard.
type Draft struct {
	ID              int64            `json:"id"`
	SpaceID         string           `json:"space_id"`
	SpaceName       string           `json:"space_name"`
	SenderID        string           `json:"sender_id"`
	SenderName      string           `json:"sender_name"`
	OriginalMessage string           `json:"original_message"`
	ContextMessages []ContextMessage `json:"context_messages"`
	DraftContent    string           `json:"draft_content"`
	Category        string           `json:"category"`
	Debug           *DraftDebugInfo  `json:"debug,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
	MessageID       int64            `json:"message_id"`
}

// SentRecord is one row returned by GET /api/sent — a successfully delivered
// message in the Sent Log.
type SentRecord struct {
	ID             string    `json:"id"`
	SpaceID        string    `json:"space_id"`
	SpaceName      string    `json:"space_name"`
	SenderID       string    `json:"sender_id"`
	SenderName     string    `json:"sender_name"`
	TriggerMessage string    `json:"trigger_message"`
	SentContent    string    `json:"sent_content"`
	Mode           string    `json:"mode"`          // "approved" | "auto"
	EditedByUser   bool      `json:"edited_by_user"`
	Category       string    `json:"category"`
	SentAt         time.Time `json:"sent_at"`
}

// ProfileFact is one piece of user-curated personal information the AI skill
// can consult. Returned by GET /api/claude/profile.
type ProfileFact struct {
	ID         int64     `json:"id"`
	Key        string    `json:"key"`
	Value      string    `json:"value"`
	Visibility string    `json:"visibility"` // "public" | "private" | "secret"
	Note       string    `json:"note"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Inbox is one item in the real-time inbox — a message together with its
// latest pending draft (if any). Emitted via WebSocket draft_created events
// and used by the approval queue.
type Inbox struct {
	ID              int64            `json:"id"`
	SpaceID         string           `json:"space_id"`
	SpaceName       string           `json:"space_name"`
	SenderID        string           `json:"sender_id"`
	SenderName      string           `json:"sender_name"`
	OriginalMessage string           `json:"original_message"`
	ContextMessages []ContextMessage `json:"context_messages"`
	DraftContent    string           `json:"draft_content"`
	Category        string           `json:"category"`
	Debug           *DraftDebugInfo  `json:"debug,omitempty"`
	CreatedAt       time.Time        `json:"created_at"`
	MessageID       int64            `json:"message_id"`
}

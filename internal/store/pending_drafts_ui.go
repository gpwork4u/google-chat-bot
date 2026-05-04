package store

import (
	"context"
	"time"
)

// DraftForUI is the shape returned by /api/drafts for the React approval UI.
// It bundles the draft with enough context (space/sender name, original message,
// recent context, category) so the UI can render a complete ApprovalCard.
type DraftForUI struct {
	ID             int64              `json:"id"`
	SpaceID        string             `json:"space_id"`
	SpaceName      string             `json:"space_name"`
	SenderID       string             `json:"sender_id"`
	SenderName     string             `json:"sender_name"`
	OriginalMessage string            `json:"original_message"`
	ContextMessages []ContextMessage  `json:"context_messages"`
	DraftContent   string             `json:"draft_content"`
	Category       string             `json:"category"`
	Debug          *DraftDebugInfo    `json:"debug,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
	MessageID      int64              `json:"message_id"`
}

// ContextMessage is a single message in the conversation context.
type ContextMessage struct {
	SenderName string    `json:"sender_name"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
	IsMe       bool      `json:"is_me"`
}

// DraftDebugInfo carries optional debug information attached to a draft.
type DraftDebugInfo struct {
	Reasoning     string   `json:"categorize_reason,omitempty"`
	Confidence    *float32 `json:"confidence,omitempty"`
	ContextSource string   `json:"context_source,omitempty"`
	Model         string   `json:"model,omitempty"`
}

// ListPendingDraftsForUI returns all pending drafts with their context, formatted
// for consumption by the React approval queue.
func (db *DB) ListPendingDraftsForUI(ctx context.Context, userID int64, limit int) ([]DraftForUI, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	const q = `
SELECT
  d.id,
  m.space_key,
  COALESCE(NULLIF(dir.display_name, ''), m.space_name, m.space_key) AS space_name,
  m.sender_id,
  COALESCE(NULLIF(cm.display_name, ''), m.sender_name) AS sender_name,
  m.body AS original_message,
  d.body AS draft_content,
  d.reasoning,
  d.confidence,
  d.model,
  d.created_at,
  m.id AS message_id,
  m.space_key AS msg_space_key,
  m.observed_at
FROM drafts d
JOIN messages m ON m.id = d.message_id` + memberJoin + `
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key
WHERE m.user_id = $1
  AND d.status = 'pending'
ORDER BY d.created_at DESC
LIMIT $2`

	rows, err := db.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type rawRow struct {
		DraftForUI
		reasoning  *string
		confidence *float32
		model      *string
		observedAt time.Time
	}

	var raws []rawRow
	for rows.Next() {
		var r rawRow
		if err := rows.Scan(
			&r.ID,
			&r.SpaceID,
			&r.SpaceName,
			&r.SenderID,
			&r.SenderName,
			&r.OriginalMessage,
			&r.DraftContent,
			&r.reasoning,
			&r.confidence,
			&r.model,
			&r.CreatedAt,
			&r.MessageID,
			&r.SpaceID, // re-scanned for context query (same field)
			&r.observedAt,
		); err != nil {
			return nil, err
		}
		// Build debug info if available.
		if r.reasoning != nil || r.confidence != nil || r.model != nil {
			r.Debug = &DraftDebugInfo{
				Confidence:    r.confidence,
				Model:         deref(r.model),
				Reasoning:     deref(r.reasoning),
				ContextSource: "messages",
			}
			if r.reasoning != nil {
				r.Debug.Reasoning = *r.reasoning
			}
		}
		raws = append(raws, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Enrich each draft with recent context messages from the same space.
	out := make([]DraftForUI, 0, len(raws))
	for _, r := range raws {
		ctx2, err := db.recentSpaceMessages(ctx, userID, r.SpaceID, r.observedAt, 5)
		if err != nil {
			ctx2 = nil
		}
		ctxMsgs := make([]ContextMessage, 0, len(ctx2))
		for _, m := range ctx2 {
			ctxMsgs = append(ctxMsgs, ContextMessage{
				SenderName: m.SenderName,
				Content:    m.Body,
				CreatedAt:  m.ObservedAt,
				IsMe:       m.IsMe,
			})
		}
		r.ContextMessages = ctxMsgs
		out = append(out, r.DraftForUI)
	}
	return out, nil
}

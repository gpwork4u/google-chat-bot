package store

import (
	"context"
	"strings"
	"time"
)

func containsAny(body, csv string) bool {
	body = strings.ToLower(body)
	for _, k := range strings.Split(csv, ",") {
		k = strings.TrimSpace(strings.ToLower(k))
		if k != "" && strings.Contains(body, k) {
			return true
		}
	}
	return false
}

// PendingDraftView is the shape returned by GetPendingDraftsNeedingGeneration.
// It bundles the draft, its source message, recent context in the same space,
// and a handful of the user's own past messages for tone calibration.
type PendingDraftView struct {
	DraftID     int64          `json:"draft_id"`
	SpaceKey    string         `json:"space_key"`
	Message     MessageBrief   `json:"message"`
	SpaceRecent []MessageBrief `json:"space_recent"`
	UserStyle   []MessageBrief `json:"user_style_samples"`
}

type MessageBrief struct {
	SenderName string    `json:"sender_name"`
	IsMe       bool      `json:"is_me"`
	Body       string    `json:"body"`
	ObservedAt time.Time `json:"observed_at"`
}

// GetPendingDraftsNeedingGeneration returns drafts whose body is still the
// stub placeholder, along with context to help a follow-up process generate
// a real reply.
func (db *DB) GetPendingDraftsNeedingGeneration(ctx context.Context, userID int64, limit int) ([]PendingDraftView, error) {
	listQ := `
SELECT d.id, m.id, m.space_key,
       ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at
FROM drafts d
JOIN messages m ON m.id = d.message_id` + memberJoin + `
WHERE m.user_id = $1
  AND d.status = 'pending'
  AND d.model = 'stub'
ORDER BY m.observed_at DESC
LIMIT $2`
	rows, err := db.Query(ctx, listQ, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type shell struct {
		draftID    int64
		messageID  int64
		spaceKey   string
		senderName string
		senderIsMe bool
		body       string
		observedAt time.Time
	}
	var shells []shell
	for rows.Next() {
		var s shell
		if err := rows.Scan(&s.draftID, &s.messageID, &s.spaceKey, &s.senderName, &s.senderIsMe, &s.body, &s.observedAt); err != nil {
			return nil, err
		}
		shells = append(shells, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// User style samples: most recent messages sent by the user, across all spaces.
	styleSamples, err := db.recentUserStyleSamples(ctx, userID, 10)
	if err != nil {
		return nil, err
	}

	out := make([]PendingDraftView, 0, len(shells))
	for _, s := range shells {
		recent, err := db.recentSpaceMessages(ctx, userID, s.spaceKey, s.observedAt, 15)
		if err != nil {
			return nil, err
		}
		out = append(out, PendingDraftView{
			DraftID:  s.draftID,
			SpaceKey: s.spaceKey,
			Message: MessageBrief{
				SenderName: s.senderName,
				IsMe:       s.senderIsMe,
				Body:       s.body,
				ObservedAt: s.observedAt,
			},
			SpaceRecent: recent,
			UserStyle:   styleSamples,
		})
	}
	return out, nil
}

func (db *DB) recentUserStyleSamples(ctx context.Context, userID int64, limit int) ([]MessageBrief, error) {
	q := `
SELECT ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at
FROM messages m` + memberJoin + `
WHERE m.user_id = $1 AND m.sender_is_me = TRUE AND length(m.body) > 2
ORDER BY m.observed_at DESC
LIMIT $2`
	rows, err := db.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MessageBrief
	for rows.Next() {
		var m MessageBrief
		if err := rows.Scan(&m.SenderName, &m.IsMe, &m.Body, &m.ObservedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (db *DB) recentSpaceMessages(ctx context.Context, userID int64, spaceKey string, beforeOrAt time.Time, limit int) ([]MessageBrief, error) {
	q := `
SELECT ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at
FROM messages m` + memberJoin + `
WHERE m.user_id = $1 AND m.space_key = $2 AND m.observed_at <= $3
ORDER BY m.observed_at DESC
LIMIT $4`
	rows, err := db.Query(ctx, q, userID, spaceKey, beforeOrAt, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []MessageBrief
	for rows.Next() {
		var m MessageBrief
		if err := rows.Scan(&m.SenderName, &m.IsMe, &m.Body, &m.ObservedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	// Reverse so the list reads oldest → newest for natural context.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}

// PatchDraftRequest carries fields the draft-generation tool can update.
type PatchDraftRequest struct {
	Body       string
	Reasoning  string
	Confidence *float32
	Model      string
}

// PatchDraftGeneration fills in body/reasoning/confidence/model on a pending
// draft. If the user is in auto_mode and the draft isn't blocked, it is
// simultaneously promoted to 'approved' so the extension can send it.
func (db *DB) PatchDraftGeneration(ctx context.Context, draftID int64, req PatchDraftRequest) (newStatus string, autoSent bool, err error) {
	// Load current draft + user settings + message body for blocked-keyword check.
	const loadQ = `
SELECT m.user_id, m.body, us.auto_mode, us.blocked_keywords
FROM drafts d
JOIN messages m ON m.id = d.message_id
LEFT JOIN user_settings us ON us.user_id = m.user_id
WHERE d.id = $1`
	var userID int64
	var msgBody string
	var autoMode *bool
	var blockedCSV *string
	if err := db.QueryRow(ctx, loadQ, draftID).Scan(&userID, &msgBody, &autoMode, &blockedCSV); err != nil {
		return "", false, err
	}

	status := "pending"
	autoSentNow := false
	if autoMode != nil && *autoMode {
		blocked := false
		if blockedCSV != nil {
			blocked = containsAny(msgBody, *blockedCSV)
		}
		conf := float32(0)
		if req.Confidence != nil {
			conf = *req.Confidence
		}
		if !blocked && conf >= 0.7 {
			status = "approved"
			autoSentNow = true
		}
	}

	const updQ = `
UPDATE drafts SET
  body = $2,
  model = COALESCE(NULLIF($3, ''), model),
  reasoning = $4,
  confidence = $5,
  status = $6,
  auto_sent = auto_sent OR $7,
  updated_at = NOW()
WHERE id = $1`
	if _, err := db.Exec(ctx, updQ,
		draftID, req.Body, req.Model, req.Reasoning, req.Confidence, status, autoSentNow,
	); err != nil {
		return "", false, err
	}
	_ = userID
	return status, autoSentNow, nil
}

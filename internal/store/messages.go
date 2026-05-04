package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

type Message struct {
	ID         int64
	UserID     int64
	SpaceKey   string
	SpaceName  string
	ThreadKey  string
	MessageKey string
	SenderID   string // Google numeric user id — FK-ish into chat_members.member_id
	SenderName string // legacy fallback; real name is joined via chat_members.display_name
	SenderIsMe bool
	Body       string
	ObservedAt time.Time
	CreatedAt  time.Time
}

type Draft struct {
	ID         int64
	MessageID  int64
	Body       string
	Model      string
	SendMode   string
	Status     string
	AutoSent   bool
	Confidence *float32
	Reasoning  string
	Error      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	SentAt     *time.Time
}

// InsertOrGetMessage inserts a message, or returns the existing row on (user_id, message_key) conflict.
// The `inserted` bool tells the caller whether this is the first sighting (and therefore worth drafting).
//
// On conflict we also fill in sender_id if the incoming row carries one
// and the existing row doesn't yet — lets a later ingest path (e.g.
// list_topics replay) enrich a row first inserted by webchannel.
func (db *DB) InsertOrGetMessage(ctx context.Context, m *Message) (inserted bool, err error) {
	const q = `
INSERT INTO messages (user_id, space_key, space_name, thread_key, message_key, sender_id, sender_name, sender_is_me, body, observed_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
ON CONFLICT (user_id, message_key) DO UPDATE SET
    sender_id = CASE
        WHEN messages.sender_id = '' AND EXCLUDED.sender_id <> '' THEN EXCLUDED.sender_id
        ELSE messages.sender_id
    END
RETURNING id, created_at, (xmax = 0) AS inserted`
	return inserted, db.QueryRow(ctx, q,
		m.UserID, m.SpaceKey, m.SpaceName, m.ThreadKey, m.MessageKey,
		m.SenderID, m.SenderName, m.SenderIsMe, m.Body, m.ObservedAt,
	).Scan(&m.ID, &m.CreatedAt, &inserted)
}

type InboxRow struct {
	Message Message
	Draft   *Draft
}

// memberJoin resolves sender_name at read time via chat_members.display_name.
// Shared by every query returning Message rows so stale names on the
// messages row (written at ingest before the directory was populated)
// get transparently replaced with whatever the directory now holds.
const memberJoin = `
LEFT JOIN chat_members cm
  ON cm.user_id = m.user_id AND cm.member_id = m.sender_id`

// senderNameExpr is the display-time fallback chain used in SELECT lists.
const senderNameExpr = `COALESCE(NULLIF(cm.display_name, ''), m.sender_name)`

// RecentInbox returns the most-recent N messages with their latest draft (if any).
func (db *DB) RecentInbox(ctx context.Context, userID int64, limit int) ([]InboxRow, error) {
	const q = `
SELECT
  m.id, m.user_id, m.space_key,
  COALESCE(NULLIF(dir.display_name, ''), m.space_name) AS space_name,
  m.thread_key, m.message_key,
  m.sender_id,
  ` + senderNameExpr + ` AS sender_name,
  m.sender_is_me, m.body, m.observed_at, m.created_at,
  d.id, d.body, d.send_mode, d.status, d.auto_sent, d.confidence, d.reasoning, d.error,
  d.created_at, d.updated_at, d.sent_at
FROM messages m
LEFT JOIN spaces_directory dir
  ON dir.user_id = m.user_id AND dir.space_key = m.space_key` + memberJoin + `
LEFT JOIN LATERAL (
  SELECT * FROM drafts WHERE drafts.message_id = m.id ORDER BY id DESC LIMIT 1
) d ON TRUE
WHERE m.user_id = $1
ORDER BY m.observed_at DESC
LIMIT $2`
	rows, err := db.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []InboxRow
	for rows.Next() {
		var row InboxRow
		var did *int64
		var dbody, dsendMode, dstatus, dreasoning, derror *string
		var dautosent *bool
		var dconf *float32
		var dcreated, dupdated, dsentat *time.Time
		if err := rows.Scan(
			&row.Message.ID, &row.Message.UserID, &row.Message.SpaceKey, &row.Message.SpaceName,
			&row.Message.ThreadKey, &row.Message.MessageKey,
			&row.Message.SenderID, &row.Message.SenderName, &row.Message.SenderIsMe, &row.Message.Body,
			&row.Message.ObservedAt, &row.Message.CreatedAt,
			&did, &dbody, &dsendMode, &dstatus, &dautosent, &dconf, &dreasoning, &derror,
			&dcreated, &dupdated, &dsentat,
		); err != nil {
			return nil, err
		}
		if did != nil {
			row.Draft = &Draft{
				ID: *did, MessageID: row.Message.ID, Body: deref(dbody), SendMode: deref(dsendMode), Status: deref(dstatus),
				AutoSent: derefBool(dautosent), Confidence: dconf, Reasoning: deref(dreasoning), Error: deref(derror),
				CreatedAt: derefTime(dcreated), UpdatedAt: derefTime(dupdated), SentAt: dsentat,
			}
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// ContextBundle is the conversation around a single message: the full
// thread it belongs to, plus nearby messages in the same space that live
// in other threads (useful when a Chat channel interleaves several topics
// and you want to see what else was happening when this one landed).
type ContextBundle struct {
	Anchor *Message   `json:"anchor"`
	Thread []Message  `json:"thread"`
	Around []Message  `json:"around"`
}

// MessageContext returns the bundle described above for the given message
// id. aroundWindow bounds how far before/after the anchor we'll pull from
// other threads in the same space; aroundLimit caps how many "around" rows
// we return (anchor-adjacent rows are preferred via symmetric ordering).
func (db *DB) MessageContext(ctx context.Context, userID, messageID int64, aroundWindow time.Duration, aroundLimit int) (*ContextBundle, error) {
	anchor, err := db.GetMessage(ctx, userID, messageID)
	if err != nil || anchor == nil {
		return nil, err
	}

	out := &ContextBundle{Anchor: anchor}

	// Thread view: every message with the same thread_key. When thread_key
	// is empty we have no way to group reliably, so we just return the
	// anchor alone.
	if anchor.ThreadKey != "" {
		qThread := `
SELECT m.id, m.user_id, m.space_key, m.space_name, m.thread_key, m.message_key,
       m.sender_id, ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at, m.created_at
FROM messages m` + memberJoin + `
WHERE m.user_id = $1 AND m.space_key = $2 AND m.thread_key = $3
ORDER BY m.observed_at ASC`
		rows, err := db.Query(ctx, qThread, userID, anchor.SpaceKey, anchor.ThreadKey)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var m Message
			if err := rows.Scan(&m.ID, &m.UserID, &m.SpaceKey, &m.SpaceName, &m.ThreadKey, &m.MessageKey,
				&m.SenderID, &m.SenderName, &m.SenderIsMe, &m.Body, &m.ObservedAt, &m.CreatedAt); err != nil {
				rows.Close()
				return nil, err
			}
			out.Thread = append(out.Thread, m)
		}
		rows.Close()
	} else {
		out.Thread = []Message{*anchor}
	}

	// Around view: same space, different thread, within ±aroundWindow of
	// the anchor. Ordered by closeness to the anchor (smallest absolute
	// delta first) and limited, then re-sorted by time for display.
	if aroundLimit <= 0 {
		aroundLimit = 20
	}
	qAround := `
SELECT m.id, m.user_id, m.space_key, m.space_name, m.thread_key, m.message_key,
       m.sender_id, ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at, m.created_at
FROM messages m` + memberJoin + `
WHERE m.user_id = $1 AND m.space_key = $2
  AND COALESCE(m.thread_key, '') <> COALESCE($3, '')
  AND m.observed_at BETWEEN ($4::timestamptz - $5::interval) AND ($4::timestamptz + $5::interval)
ORDER BY ABS(EXTRACT(EPOCH FROM (m.observed_at - $4::timestamptz)))
LIMIT $6`
	interval := fmt.Sprintf("%d seconds", int(aroundWindow.Seconds()))
	rows, err := db.Query(ctx, qAround, userID, anchor.SpaceKey, anchor.ThreadKey, anchor.ObservedAt, interval, aroundLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.UserID, &m.SpaceKey, &m.SpaceName, &m.ThreadKey, &m.MessageKey,
			&m.SenderID, &m.SenderName, &m.SenderIsMe, &m.Body, &m.ObservedAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		out.Around = append(out.Around, m)
	}
	// Re-sort around by time ascending for display.
	sort.Slice(out.Around, func(i, j int) bool {
		return out.Around[i].ObservedAt.Before(out.Around[j].ObservedAt)
	})
	return out, nil
}

// GetMessage fetches one message by id, scoped to the local user.
func (db *DB) GetMessage(ctx context.Context, userID, messageID int64) (*Message, error) {
	q := `
SELECT m.id, m.user_id, m.space_key, m.space_name, m.thread_key, m.message_key,
       m.sender_id, ` + senderNameExpr + `, m.sender_is_me, m.body, m.observed_at, m.created_at
FROM messages m` + memberJoin + `
WHERE m.id = $1 AND m.user_id = $2`
	var m Message
	err := db.QueryRow(ctx, q, messageID, userID).Scan(
		&m.ID, &m.UserID, &m.SpaceKey, &m.SpaceName, &m.ThreadKey, &m.MessageKey,
		&m.SenderID, &m.SenderName, &m.SenderIsMe, &m.Body, &m.ObservedAt, &m.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &m, err
}

// UpsertDraftForMessage inserts or updates the actionable draft for a
// given message: if there is already one in pending / approved state,
// its body / reasoning / send_mode get overwritten and the status is
// re-evaluated. Already-sent or rejected drafts are left alone and a
// new row is inserted instead. Used by /api/claude/reply so the skill
// can re-run idempotently without stacking up stale pending drafts.
func (db *DB) UpsertDraftForMessage(ctx context.Context, messageID int64, body, model, sendMode, reasoning string, autoSend bool) (draftID int64, status string, err error) {
	status = "pending"
	if autoSend {
		status = "approved"
	}
	// Find the most recent actionable row, if any.
	var existingID int64
	err = db.QueryRow(ctx,
		`SELECT id FROM drafts WHERE message_id=$1 AND status IN ('pending','approved') ORDER BY id DESC LIMIT 1`,
		messageID).Scan(&existingID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, "", err
	}
	if existingID > 0 {
		_, err = db.Exec(ctx,
			`UPDATE drafts SET body=$2, model=$3, send_mode=$4, reasoning=$5, status=$6, auto_sent=$7, error='', updated_at=NOW()
             WHERE id=$1`,
			existingID, body, model, sendMode, reasoning, status, autoSend)
		if err != nil {
			return 0, "", err
		}
		return existingID, status, nil
	}
	// No actionable draft → insert fresh.
	d := &Draft{
		MessageID: messageID,
		Body:      body,
		Model:     model,
		SendMode:  sendMode,
		Status:    status,
		AutoSent:  autoSend,
		Reasoning: reasoning,
	}
	if err := db.InsertDraft(ctx, d); err != nil {
		return 0, "", err
	}
	return d.ID, status, nil
}

func (db *DB) InsertDraft(ctx context.Context, d *Draft) error {
	const q = `
INSERT INTO drafts (message_id, body, model, send_mode, status, auto_sent, confidence, reasoning)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, created_at, updated_at`
	return db.QueryRow(ctx, q, d.MessageID, d.Body, d.Model, d.SendMode, d.Status, d.AutoSent, d.Confidence, d.Reasoning).
		Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt)
}

func (db *DB) UpdateDraftStatus(ctx context.Context, draftID int64, newStatus string, errText string) error {
	const q = `
UPDATE drafts SET
  status = $2,
  error = $3,
  updated_at = NOW(),
  sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
WHERE id = $1`
	ct, err := db.Exec(ctx, q, draftID, newStatus, errText)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("draft not found")
	}
	return nil
}

// UpdateDraftBody overwrites the draft body (for UI-side edits before approve).
func (db *DB) UpdateDraftBody(ctx context.Context, draftID int64, body string) error {
	const q = `
UPDATE drafts SET
  body = $2,
  updated_at = NOW()
WHERE id = $1`
	ct, err := db.Exec(ctx, q, draftID, body)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("draft not found")
	}
	return nil
}

func (db *DB) UpdateDraftSendMode(ctx context.Context, draftID int64, sendMode string) error {
	const q = `
UPDATE drafts SET
  send_mode = $2,
  updated_at = NOW()
WHERE id = $1`
	ct, err := db.Exec(ctx, q, draftID, sendMode)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return errors.New("draft not found")
	}
	return nil
}

// MarkMessageAsMine flips sender_is_me=TRUE on an existing row. Used by
// the style-corpus sync path: anything returned by the sender-ldap search
// RPC is by definition sent by us, so mis-flagged historical rows get
// corrected here (preventing /api/claude/pending and ingestMessage from
// treating them as replies from "someone else").
func (db *DB) MarkMessageAsMine(ctx context.Context, userID int64, messageKey string) error {
	_, err := db.Exec(ctx,
		`UPDATE messages SET sender_is_me = TRUE WHERE user_id=$1 AND message_key=$2 AND sender_is_me = FALSE`,
		userID, messageKey)
	return err
}

func (db *DB) UpdateSpaceName(ctx context.Context, userID int64, spaceKey, spaceName string) error {
	const q = `
UPDATE messages
SET space_name = $3
WHERE user_id = $1
  AND space_key = $2
  AND (
    space_name = '' OR
    space_name = space_key OR
    space_name LIKE 'space:%'
  )`
	_, err := db.Exec(ctx, q, userID, spaceKey, spaceName)
	return err
}

type PendingSend struct {
	DraftID   int64           `json:"draft_id"`
	MessageID int64           `json:"message_id"`
	SpaceKey  string          `json:"space_key"`
	ThreadKey string          `json:"thread_key"`
	Body      string          `json:"body"`
	SendMode  string          `json:"send_mode"`
	SpaceRef  json.RawMessage `json:"space_ref,omitempty"`
}

// ListApprovedPending returns drafts ready to send by the extension.
//
// thread_key falls back to message_key when the stored thread_key is empty:
// in Google Chat every top-level message is its own thread anchored by the
// message's own key, so replying "in-thread" to a top-level message means
// using that message's key as the thread anchor. Without this fallback,
// replies to messages ingested via paths that don't populate thread_key
// (e.g. sender-search, style sync) would fail with "thread key required"
// or be forced down the new_topic path (which isn't space-safe).
func (db *DB) ListApprovedPending(ctx context.Context, userID int64, limit int) ([]PendingSend, error) {
	const q = `
SELECT d.id, d.message_id, m.space_key,
       COALESCE(NULLIF(m.thread_key, ''), m.message_key) AS thread_key,
       d.body, d.send_mode
FROM drafts d
JOIN messages m ON m.id = d.message_id
WHERE m.user_id = $1 AND d.status = 'approved'
ORDER BY d.updated_at ASC
LIMIT $2`
	rows, err := db.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PendingSend
	for rows.Next() {
		var p PendingSend
		if err := rows.Scan(&p.DraftID, &p.MessageID, &p.SpaceKey, &p.ThreadKey, &p.Body, &p.SendMode); err != nil {
			return nil, err
		}
		if ref, err := db.ResolveCreateTopicSpaceRef(ctx, userID, p.SpaceKey, p.ThreadKey); err == nil && len(ref) > 0 {
			p.SpaceRef = ref
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (db *DB) GetDraft(ctx context.Context, id int64) (*Draft, error) {
	const q = `SELECT id, message_id, body, model, send_mode, status, auto_sent, confidence, reasoning, error, created_at, updated_at, sent_at FROM drafts WHERE id=$1`
	var d Draft
	err := db.QueryRow(ctx, q, id).Scan(
		&d.ID, &d.MessageID, &d.Body, &d.Model, &d.SendMode, &d.Status, &d.AutoSent,
		&d.Confidence, &d.Reasoning, &d.Error, &d.CreatedAt, &d.UpdatedAt, &d.SentAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return &d, err
}

// --- settings ---

type UserSettings struct {
	UserID                 int64
	AutoMode               bool
	BlockedKeywords        string
	ReplyOnlyWhenMentioned bool
}

func (db *DB) GetUserSettings(ctx context.Context, userID int64) (*UserSettings, error) {
	const q = `SELECT user_id, auto_mode, blocked_keywords, reply_only_when_mentioned FROM user_settings WHERE user_id=$1`
	var s UserSettings
	err := db.QueryRow(ctx, q, userID).Scan(&s.UserID, &s.AutoMode, &s.BlockedKeywords, &s.ReplyOnlyWhenMentioned)
	if errors.Is(err, pgx.ErrNoRows) {
		// Create a default row.
		_, err := db.Exec(ctx, `INSERT INTO user_settings(user_id) VALUES ($1) ON CONFLICT DO NOTHING`, userID)
		if err != nil {
			return nil, err
		}
		return db.GetUserSettings(ctx, userID)
	}
	return &s, err
}

func (db *DB) SetAutoMode(ctx context.Context, userID int64, on bool) error {
	const q = `
INSERT INTO user_settings (user_id, auto_mode) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET auto_mode = EXCLUDED.auto_mode, updated_at = NOW()`
	_, err := db.Exec(ctx, q, userID, on)
	return err
}

func (db *DB) SetReplyOnlyWhenMentioned(ctx context.Context, userID int64, on bool) error {
	const q = `
INSERT INTO user_settings (user_id, reply_only_when_mentioned) VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE SET reply_only_when_mentioned = EXCLUDED.reply_only_when_mentioned, updated_at = NOW()`
	_, err := db.Exec(ctx, q, userID, on)
	return err
}

// --- helpers ---

func deref[T any](p *T) T {
	var z T
	if p == nil {
		return z
	}
	return *p
}

func derefBool(p *bool) bool {
	if p == nil {
		return false
	}
	return *p
}

func derefTime(p *time.Time) time.Time {
	if p == nil {
		return time.Time{}
	}
	return *p
}

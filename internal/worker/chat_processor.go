// Package worker pulls raw Chat API responses out of the raw_events table,
// parses them, and inserts resulting messages + pending drafts.
package worker

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/ailabs-tw/google-chat-bot/internal/parser"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

const (
	pollInterval    = 3 * time.Second
	batchSize       = 200
	urlChatAPILK    = "%/api/%"
	urlGetGroupLK   = "%get_group%"
)

type ChatProcessor struct {
	db        *store.DB
	lastID    int64
	userEmail string
	userName  string
	userID    int64
}

const defaultLocalUserName = "Local Extension User"

func NewChatProcessor(db *store.DB, localUserEmail, localUserName string) *ChatProcessor {
	return &ChatProcessor{
		db:        db,
		userEmail: strings.ToLower(localUserEmail),
		userName:  localUserName,
	}
}

func (p *ChatProcessor) Run(ctx context.Context) {
	if err := p.ensureUser(ctx); err != nil {
		slog.Error("chat processor init failed", "err", err)
		return
	}

	if err := p.backfillSpaceNames(ctx); err != nil {
		slog.Warn("space-name backfill failed", "err", err)
	}

	// Start from 0 and let InsertOrGetMessage dedupe by message_key. This way
	// historical responses already in raw_events get backfilled on first run.
	p.lastID = 0
	slog.Info("chat processor started", "starting_from_id", p.lastID)

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("chat processor stopped")
			return
		case <-ticker.C:
			if err := p.tick(ctx); err != nil {
				slog.Error("worker tick", "err", err)
			}
		}
	}
}

func (p *ChatProcessor) ensureUser(ctx context.Context) error {
	if p.userID == 0 {
		u, err := p.db.EnsureLocalUser(ctx, p.userEmail, p.userName)
		if err != nil || u == nil {
			return err
		}
		if p.userEmail == "" {
			p.userEmail = strings.ToLower(u.Email)
		}
		p.userID = u.ID
	}
	return nil
}

func (p *ChatProcessor) backfillSpaceNames(ctx context.Context) error {
	var lastID int64
	var updated int
	for {
		rows, err := p.db.RawEventsSince(ctx, lastID, urlGetGroupLK, batchSize)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			break
		}
		for _, row := range rows {
			if row.ID > lastID {
				lastID = row.ID
			}
			space, err := parser.ParseGetGroupResponse(row.RespText)
			if err != nil {
				slog.Warn("parse get_group", "raw_event_id", row.ID, "err", err)
				continue
			}
			if space == nil || space.SpaceKey == "" || space.SpaceName == "" {
				continue
			}
			if err := p.db.UpdateSpaceName(ctx, p.userID, space.SpaceKey, space.SpaceName); err != nil {
				slog.Warn("update space name", "raw_event_id", row.ID, "space_key", space.SpaceKey, "err", err)
				continue
			}
			updated++
		}
	}
	slog.Info("space-name backfill completed", "raw_events_scanned_through", lastID, "updates_attempted", updated)
	return nil
}

func (p *ChatProcessor) tick(ctx context.Context) error {
	if err := p.ensureUser(ctx); err != nil {
		return err
	}

	rows, err := p.db.RawEventsSince(ctx, p.lastID, urlChatAPILK, batchSize)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return nil
	}

	var maxSeen int64
	var inserted, drafted int
	for _, row := range rows {
		if row.ID > maxSeen {
			maxSeen = row.ID
		}
		if strings.Contains(row.URL, "list_topics") {
			parsed, err := parser.ParseListTopicsResponse(row.RespText)
			if err != nil {
				slog.Warn("parse list_topics", "raw_event_id", row.ID, "err", err)
				continue
			}
			for _, m := range parsed {
				inserted2, drafted2 := p.ingestMessage(ctx, m)
				inserted += inserted2
				drafted += drafted2
			}
			continue
		}

		if strings.Contains(row.URL, "get_group") {
			space, err := parser.ParseGetGroupResponse(row.RespText)
			if err != nil {
				slog.Warn("parse get_group", "raw_event_id", row.ID, "err", err)
				continue
			}
			if space != nil && space.SpaceKey != "" && space.SpaceName != "" {
				if err := p.db.UpdateSpaceName(ctx, p.userID, space.SpaceKey, space.SpaceName); err != nil {
					slog.Warn("update space name", "raw_event_id", row.ID, "space_key", space.SpaceKey, "err", err)
				}
			}
		}
	}
	p.lastID = maxSeen
	slog.Info("worker tick processed",
		"raw_events", len(rows),
		"messages_inserted", inserted,
		"drafts_created", drafted,
		"high_watermark", p.lastID)
	return nil
}

// ingestMessage inserts/dedups a parsed message and creates a pending draft
// when it's both new and from someone other than the authed user.
// Returns (messagesInserted, draftsCreated) — 0 or 1 each.
func (p *ChatProcessor) ingestMessage(ctx context.Context, pm parser.ParsedMessage) (int, int) {
	senderIsMe := strings.EqualFold(pm.SenderEmail, p.userEmail)
	if !senderIsMe && hasUsableLocalUserName(p.userName) {
		senderIsMe = strings.EqualFold(strings.TrimSpace(pm.SenderName), strings.TrimSpace(p.userName))
	}
	if !senderIsMe {
		recentlySent, err := p.db.WasRecentlySentDraft(ctx, p.userID, pm.SpaceKey, pm.Body, pm.ObservedAt)
		if err != nil {
			slog.Warn("match recently sent draft", "err", err, "msg_id", pm.MessageID)
		} else if recentlySent {
			senderIsMe = true
			if hasUsableDiscoveredSenderName(pm.SenderName) && !strings.EqualFold(strings.TrimSpace(pm.SenderName), strings.TrimSpace(p.userName)) {
				p.userName = strings.TrimSpace(pm.SenderName)
				if _, err := p.db.EnsureLocalUser(ctx, p.userEmail, p.userName); err != nil {
					slog.Warn("persist local user name", "err", err, "name", p.userName)
				}
			}
		}
	}

	msg := &store.Message{
		UserID:     p.userID,
		SpaceKey:   pm.SpaceKey,
		SpaceName:  pm.SpaceKey, // name will be backfilled from list_members later
		ThreadKey:  pm.TopicID,
		MessageKey: pm.MessageID,
		SenderName: pm.SenderName,
		SenderIsMe: senderIsMe,
		Body:       pm.Body,
		ObservedAt: pm.ObservedAt,
	}
	insertedNow, err := p.db.InsertOrGetMessage(ctx, msg)
	if err != nil {
		slog.Warn("insert message", "err", err, "msg_id", pm.MessageID)
		return 0, 0
	}
	if !insertedNow || senderIsMe {
		if insertedNow {
			return 1, 0
		}
		return 0, 0
	}

	// Respect per-space opt-out: skip drafting but keep the message.
	if disabled, _ := p.db.IsSpaceDisabled(ctx, p.userID, pm.SpaceKey); disabled {
		return 1, 0
	}

	settings, err := p.db.GetUserSettings(ctx, p.userID)
	if err != nil {
		slog.Warn("get settings", "err", err)
		settings = &store.UserSettings{UserID: p.userID}
	}

	draft := &store.Draft{
		MessageID: msg.ID,
		Body:      "[stub draft] 收到「" + truncate(pm.Body, 40) + "」",
		Model:     "stub",
		SendMode:  "new_topic",
		Status:    "pending",
		Reasoning: "Claude 未接上，之後會生成真實 draft",
	}
	if settings.AutoMode && !matchesBlockedKeyword(pm.Body, settings.BlockedKeywords) {
		draft.Status = "approved"
		draft.AutoSent = true
		draft.Reasoning = "auto-mode approved (stub)"
	}
	if err := p.db.InsertDraft(ctx, draft); err != nil {
		slog.Warn("insert draft", "err", err)
		return 1, 0
	}
	return 1, 1
}

func matchesBlockedKeyword(body, csv string) bool {
	body = strings.ToLower(body)
	for _, k := range strings.Split(csv, ",") {
		k = strings.TrimSpace(strings.ToLower(k))
		if k == "" {
			continue
		}
		if strings.Contains(body, k) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func hasUsableLocalUserName(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !strings.EqualFold(name, defaultLocalUserName)
}

func hasUsableDiscoveredSenderName(name string) bool {
	name = strings.TrimSpace(name)
	return name != "" && !strings.EqualFold(name, "google chat")
}

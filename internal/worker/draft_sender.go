package worker

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	chatapi "google.golang.org/api/chat/v1"

	"github.com/ailabs-tw/google-chat-bot/internal/config"
	"github.com/ailabs-tw/google-chat-bot/internal/googleapi"
	"github.com/ailabs-tw/google-chat-bot/internal/store"
)

const sendPollInterval = 3 * time.Second

type DraftSender struct {
	cfg *config.Config
	db  *store.DB
}

func NewDraftSender(cfg *config.Config, db *store.DB) *DraftSender {
	return &DraftSender{cfg: cfg, db: db}
}

func (s *DraftSender) Run(ctx context.Context) {
	ticker := time.NewTicker(sendPollInterval)
	defer ticker.Stop()

	slog.Info("draft sender started")
	for {
		select {
		case <-ctx.Done():
			slog.Info("draft sender stopped")
			return
		case <-ticker.C:
			if err := s.tick(ctx); err != nil {
				slog.Error("draft sender tick", "err", err)
			}
		}
	}
}

func (s *DraftSender) tick(ctx context.Context) error {
	localUser, err := s.db.EnsureLocalUser(ctx, s.cfg.LocalUserEmail, s.cfg.LocalUserName)
	if err != nil {
		return err
	}
	authUser, err := s.db.GetAuthorizedUser(ctx)
	if err != nil {
		return err
	}
	if authUser == nil {
		return nil
	}

	pending, err := s.db.ListApprovedPending(ctx, localUser.ID, 20)
	if err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	ts, err := googleapi.TokenSourceForUser(ctx, s.cfg, s.db, authUser)
	if err != nil {
		return err
	}
	svc, err := googleapi.NewChatService(ctx, ts)
	if err != nil {
		return err
	}

	for _, p := range pending {
		if err := s.sendOne(ctx, svc, p); err != nil {
			slog.Warn("send approved draft failed", "draft_id", p.DraftID, "err", err)
			_ = s.db.UpdateDraftStatus(ctx, p.DraftID, "failed", err.Error())
			continue
		}
		if err := s.db.UpdateDraftStatus(ctx, p.DraftID, "sent", ""); err != nil {
			slog.Warn("mark draft sent failed", "draft_id", p.DraftID, "err", err)
		}
	}
	return nil
}

func (s *DraftSender) sendOne(ctx context.Context, svc *chatapi.Service, p store.PendingSend) error {
	parent, err := chatParentFromSpaceKey(p.SpaceKey)
	if err != nil {
		return err
	}
	msg := &chatapi.Message{
		Text: p.Body,
	}
	_, err = svc.Spaces.Messages.Create(parent, msg).Context(ctx).Do()
	if err != nil {
		return err
	}
	return nil
}

func chatParentFromSpaceKey(spaceKey string) (string, error) {
	raw := strings.TrimSpace(spaceKey)
	if raw == "" {
		return "", fmt.Errorf("empty space key")
	}
	if strings.HasPrefix(raw, "spaces/") {
		return raw, nil
	}
	parts := strings.SplitN(raw, ":", 2)
	if len(parts) != 2 || parts[1] == "" {
		return "", fmt.Errorf("unsupported space key %q", spaceKey)
	}
	return "spaces/" + parts[1], nil
}

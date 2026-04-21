package googleapi

import (
	"context"

	"golang.org/x/oauth2"
	chat "google.golang.org/api/chat/v1"
	"google.golang.org/api/option"
)

// NewChatService builds a Chat API client authenticated as the user (via token source).
func NewChatService(ctx context.Context, ts oauth2.TokenSource) (*chat.Service, error) {
	return chat.NewService(ctx, option.WithTokenSource(ts))
}

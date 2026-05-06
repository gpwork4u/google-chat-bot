package safety

import "context"

// ClaudeResult is the response from the Claude safety-check skill.
type ClaudeResult struct {
	Flagged bool   `json:"flagged"`
	Reason  string `json:"reason"`
}

// ClaudeClient is the interface for the safety-check Claude skill.
// The production implementation will call the internal Claude client with the
// "safety-check" skill; the stub is used until that integration is ready.
type ClaudeClient interface {
	SafetyCheck(ctx context.Context, draftText, matchedKeywords string) (ClaudeResult, error)
}

// StubClaudeClient is a stub that always returns flagged=true when there are
// matched keywords. Replace with a real ClaudeClient once the skill is
// integrated.
//
// TODO: integrate real Claude safety-check skill via internal/claude client.
type StubClaudeClient struct{}

// SafetyCheck implements ClaudeClient using a stub.
// It treats any non-empty matchedKeywords string as confirmation that the draft
// is money-related (regex match is treated as sufficient evidence by the stub).
func (s *StubClaudeClient) SafetyCheck(_ context.Context, _, matchedKeywords string) (ClaudeResult, error) {
	if matchedKeywords != "" {
		return ClaudeResult{
			Flagged: true,
			Reason:  "regex match: " + matchedKeywords,
		}, nil
	}
	return ClaudeResult{Flagged: false}, nil
}

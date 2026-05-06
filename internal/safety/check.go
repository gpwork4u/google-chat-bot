package safety

import (
	"context"
	"strings"
)

// Result is the output of a safety check.
type Result struct {
	// Flagged indicates the draft should be held for human review.
	Flagged bool `json:"flagged"`
	// Flags contains the rule names that triggered (e.g. ["money"]).
	Flags []string `json:"flags"`
	// Reason is a human-readable explanation from the Claude skill (or "").
	Reason string `json:"reason"`
}

// Settings holds global safety configuration fetched from user_settings.
type Settings struct {
	Enabled bool
	// Rules maps rule name → enabled. Currently only "money" is supported.
	Rules map[string]bool
}

// SpaceSettings holds per-space safety overrides from space_settings.
type SpaceSettings struct {
	// SafetyRailsOverride is "inherit" or "disabled".
	SafetyRailsOverride string
}

// Check runs the full safety-rails pipeline:
//  1. Global enabled gate — if false, return {flagged:false} immediately.
//  2. Per-space override gate — if "disabled", skip for this space.
//  3. Per-rule gate — if money rule disabled, skip money check.
//  4. Keyword pre-screen — no hit → return {flagged:false} (no Claude call).
//  5. Claude skill — only called on keyword hit; result determines final flag.
//
// The client parameter allows injection of a real or stub ClaudeClient.
func Check(ctx context.Context, draftText, spaceKey string, settings Settings, spaceSettings SpaceSettings, client ClaudeClient) (Result, error) {
	empty := Result{Flagged: false, Flags: []string{}, Reason: ""}

	// 1. Global enabled gate.
	if !settings.Enabled {
		return empty, nil
	}

	// 2. Per-space override gate.
	if spaceSettings.SafetyRailsOverride == "disabled" {
		return empty, nil
	}

	// 3. Per-rule gate: money.
	moneyEnabled, ok := settings.Rules["money"]
	if !ok || !moneyEnabled {
		return empty, nil
	}

	// 4. Keyword pre-screen — cheap regex, no LLM cost.
	if !KeywordMatched(draftText) {
		return empty, nil
	}

	// Collect matched keyword patterns for context passed to Claude.
	matchedPatterns := collectMatchedPatterns(draftText)

	// 5. Claude skill — only reached when a keyword matched.
	claudeResult, err := client.SafetyCheck(ctx, draftText, strings.Join(matchedPatterns, ", "))
	if err != nil {
		// On error, fail safe: treat as flagged to avoid accidental auto-send.
		return Result{
			Flagged: true,
			Flags:   []string{"money"},
			Reason:  "safety check error: " + err.Error(),
		}, nil
	}

	if !claudeResult.Flagged {
		return empty, nil
	}

	return Result{
		Flagged: true,
		Flags:   []string{"money"},
		Reason:  claudeResult.Reason,
	}, nil
}

// collectMatchedPatterns returns a deduplicated list of matched pattern labels.
func collectMatchedPatterns(text string) []string {
	type namedPattern struct {
		name string
		re   interface{ MatchString(string) bool }
	}
	labeled := []namedPattern{
		{"$amount", moneyPatterns[0]},
		{"NT$amount", moneyPatterns[1]},
		{"¥amount", moneyPatterns[2]},
		{"digit+unit", moneyPatterns[3]},
		{"financial-verb", moneyPatterns[4]},
	}
	var matched []string
	for _, lp := range labeled {
		if lp.re.MatchString(text) {
			matched = append(matched, lp.name)
		}
	}
	return matched
}

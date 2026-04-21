package parser

import (
	"os"
	"strings"
	"testing"
)

func TestParseListTopicsResponse(t *testing.T) {
	raw, err := os.ReadFile("testdata/list_topics_sample.txt")
	if err != nil {
		t.Fatal(err)
	}
	msgs, err := ParseListTopicsResponse(string(raw))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(msgs) == 0 {
		t.Fatalf("expected at least 1 message; got 0")
	}
	for i, m := range msgs {
		if m.MessageID == "" {
			t.Errorf("msg %d: empty MessageID", i)
		}
		if m.Body == "" {
			t.Errorf("msg %d: empty Body", i)
		}
		t.Logf("#%d  id=%s  space=%s  from=%s <%s>  at=%s\n    body=%s",
			i, m.MessageID, m.SpaceKey, m.SenderName, m.SenderEmail,
			m.ObservedAt.Format("2006-01-02 15:04:05"),
			truncate(m.Body, 60))
	}
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func TestParseListTopicsResponse_NotListTopics(t *testing.T) {
	raw := `)]}'
[["something.else",[]]]`
	msgs, err := ParseListTopicsResponse(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 0 {
		t.Errorf("expected empty for non-list_topics; got %d", len(msgs))
	}
}

func TestParseListTopicsResponse_Empty(t *testing.T) {
	for _, s := range []string{"", ")]}'", "   ", "\n\n"} {
		msgs, err := ParseListTopicsResponse(s)
		if err != nil {
			t.Errorf("%q: %v", s, err)
		}
		if msgs != nil {
			t.Errorf("%q: expected nil, got %d", s, len(msgs))
		}
	}
	// Strip xssi prefix
	_ = strings.TrimPrefix
}

package store

import (
	"testing"
	"time"
)

func TestEncodeCursorRoundTrip(t *testing.T) {
	original := SentCursor{
		SentAt: time.Date(2026, 5, 4, 10, 0, 0, 0, time.UTC),
		ID:     12345,
	}
	encoded := EncodeCursor(original)
	if encoded == "" {
		t.Fatal("encoded cursor is empty")
	}
	decoded, err := DecodeCursor(encoded)
	if err != nil {
		t.Fatalf("DecodeCursor error: %v", err)
	}
	if !decoded.SentAt.Equal(original.SentAt) {
		t.Errorf("SentAt mismatch: got %v, want %v", decoded.SentAt, original.SentAt)
	}
	if decoded.ID != original.ID {
		t.Errorf("ID mismatch: got %d, want %d", decoded.ID, original.ID)
	}
}

func TestDecodeCursorInvalid(t *testing.T) {
	cases := []string{"", "notbase64!!!", "dGVzdA=="}
	for _, c := range cases {
		_, err := DecodeCursor(c)
		if err == nil {
			t.Errorf("expected error for input %q, got nil", c)
		}
	}
}

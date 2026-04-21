package parser

import (
	"encoding/json"
	"os"
	"testing"
)

func loadFrame(t *testing.T, name string) json.RawMessage {
	t.Helper()
	b, err := os.ReadFile("testdata/webchannel/" + name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return json.RawMessage(b)
}

func TestParseWebchannelFrame_NewMessage(t *testing.T) {
	out, err := ParseWebchannelFrame(loadFrame(t, "msg_create_test.json"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 message, got %d: %+v", len(out), out)
	}
	m := out[0]
	if m.Body != "test" {
		t.Errorf("body = %q, want %q", m.Body, "test")
	}
	if m.MessageID != "TP8oyN9nLzU" {
		t.Errorf("message id = %q, want %q", m.MessageID, "TP8oyN9nLzU")
	}
	if m.SpaceKey != "space:AAQAtHR3g_s" {
		t.Errorf("space key = %q, want %q", m.SpaceKey, "space:AAQAtHR3g_s")
	}
	if m.SenderID != "116580689619284141616" {
		t.Errorf("sender id = %q, want %q", m.SenderID, "116580689619284141616")
	}
	if m.ObservedAt.IsZero() {
		t.Errorf("observed_at is zero")
	}
}

func TestParseWebchannelFrame_SecondSample(t *testing.T) {
	out, err := ParseWebchannelFrame(loadFrame(t, "msg_create_testes.json"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("want 1 message, got %d", len(out))
	}
	if out[0].Body != "testes" {
		t.Errorf("body = %q, want %q", out[0].Body, "testes")
	}
	if out[0].MessageID != "K8aX5ieuMrc" {
		t.Errorf("message id = %q", out[0].MessageID)
	}
}

func TestParseWebchannelFrame_Noop(t *testing.T) {
	out, err := ParseWebchannelFrame(loadFrame(t, "noop.json"))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("noop frame yielded %d messages, want 0: %+v", len(out), out)
	}
}

func TestParseWebchannelFrame_Empty(t *testing.T) {
	out, err := ParseWebchannelFrame(nil)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(out) != 0 {
		t.Errorf("empty frame yielded %d messages", len(out))
	}
}

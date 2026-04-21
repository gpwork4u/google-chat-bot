package parser

import (
	"encoding/json"
	"fmt"
	"strconv"
	"testing"
)

// buildBatchExecuteResponse wraps a synthetic inner[] in the exact wire
// shape Chat's batchexecute endpoint uses, so we can unit-test the parser
// without needing a real captured response (which would contain private
// message content and should not be committed).
func buildBatchExecuteResponse(t *testing.T, inner []any) []byte {
	t.Helper()
	innerBytes, err := json.Marshal(inner)
	if err != nil {
		t.Fatalf("marshal inner: %v", err)
	}
	envelope := []any{
		[]any{"wrb.fr", "SBNmJb", string(innerBytes), nil, nil, nil, "3"},
	}
	envBytes, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("marshal envelope: %v", err)
	}
	// Length header value is ignored by our parser (json.Decoder skips the
	// stray numeric tokens), so a dummy integer is fine.
	return []byte(fmt.Sprintf(")]}'\n\n%d\n%s\n27\n[[\"e\",4,null,null,%d]]",
		len(envBytes), string(envBytes), len(envBytes)))
}

// makePayload builds a message payload array at the positions our parser
// reads (1 message_key, 2 space box, 4 sender box, 5 body, 16 created_ms).
// All other slots are null.
func makePayload(msgKey, spaceID, senderID, body string, createdMs int64) []any {
	p := make([]any, 48)
	p[1] = msgKey
	p[2] = []any{"space/" + spaceID, spaceID, 2}
	p[4] = []any{senderID, "", "", "", nil, nil, nil, 1}
	p[5] = body
	p[11] = strconv.FormatInt(createdMs*1000, 10) // μs string
	p[16] = json.Number(strconv.FormatInt(createdMs, 10))
	return p
}

func TestParseBatchExecuteSBNmJb_Basic(t *testing.T) {
	inner := []any{
		"opaque-token", json.Number("20"), nil,
		"A61A3392-39D1-470D-AB37-D91E68A2F76F",
		[]any{}, // spaces
		json.Number("1776789348600"),
		"chunping",
		nil, nil,
		[]any{
			[]any{makePayload("KEY1", "AAQAtHR3g_s", "116580689619284141616", "hello", 1776788461538), json.Number("2")},
			[]any{makePayload("KEY2", "AAQAX", "116580689619284141616", "世界", 1776788461600), json.Number("1")},
			// empty-body record: should be dropped
			[]any{makePayload("EMPTY", "AAQAX", "116580689619284141616", "", 1776788461700), json.Number("1")},
		},
	}
	body := buildBatchExecuteResponse(t, inner)
	page, err := ParseBatchExecuteSBNmJb(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if page.LdapFilter != "chunping" {
		t.Errorf("ldap filter = %q, want %q", page.LdapFilter, "chunping")
	}
	if len(page.Messages) != 2 {
		t.Fatalf("want 2 messages (empty body dropped), got %d", len(page.Messages))
	}
	m0 := page.Messages[0]
	if m0.MessageKey != "KEY1" {
		t.Errorf("msg[0] key = %q", m0.MessageKey)
	}
	if m0.SpaceKey != "space:AAQAtHR3g_s" {
		t.Errorf("msg[0] space key = %q", m0.SpaceKey)
	}
	if m0.SenderID != "116580689619284141616" {
		t.Errorf("msg[0] sender id = %q", m0.SenderID)
	}
	if m0.Body != "hello" {
		t.Errorf("msg[0] body = %q", m0.Body)
	}
	if m0.ObservedAt.UnixMilli() != 1776788461538 {
		t.Errorf("msg[0] ts = %d", m0.ObservedAt.UnixMilli())
	}
	if page.Messages[1].Body != "世界" {
		t.Errorf("msg[1] body = %q, want utf-8 preserved", page.Messages[1].Body)
	}
}

func TestParseBatchExecuteSBNmJb_EmptyResults(t *testing.T) {
	inner := []any{
		"", json.Number("0"), nil, "UUID",
		[]any{}, json.Number("0"), "chunping",
		nil, nil, []any{}, // empty results
	}
	body := buildBatchExecuteResponse(t, inner)
	page, err := ParseBatchExecuteSBNmJb(body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(page.Messages) != 0 {
		t.Errorf("want 0 messages, got %d", len(page.Messages))
	}
}

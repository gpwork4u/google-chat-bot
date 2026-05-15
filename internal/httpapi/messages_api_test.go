package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestParseIDList tests the CSV integer parsing helper.
func TestParseIDList(t *testing.T) {
	cases := []struct {
		raw     string
		want    []int64
		wantErr bool
	}{
		{"100,101,102", []int64{100, 101, 102}, false},
		{"42", []int64{42}, false},
		{"", []int64{}, false},
		{"1, 2, 3", []int64{1, 2, 3}, false},     // spaces trimmed
		{"abc", nil, true},
		{"1,abc,3", nil, true},
	}
	for _, tc := range cases {
		got, err := parseIDList(tc.raw)
		if (err != nil) != tc.wantErr {
			t.Errorf("parseIDList(%q): wantErr=%v got err=%v", tc.raw, tc.wantErr, err)
			continue
		}
		if tc.wantErr {
			continue
		}
		if len(got) != len(tc.want) {
			t.Errorf("parseIDList(%q): got %v, want %v", tc.raw, got, tc.want)
			continue
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("parseIDList(%q)[%d]: got %d, want %d", tc.raw, i, got[i], tc.want[i])
			}
		}
	}
}

// TestGetMessagesValidation tests query-parameter validation in handleGetMessages.
// The handler exits early with 400 before touching the DB for invalid inputs,
// so we pass nil DB to confirm only the validation path is exercised.
func TestGetMessagesValidation(t *testing.T) {
	cases := []struct {
		name       string
		url        string
		wantStatus int
		wantCode   string
	}{
		{
			name:       "missing both space_key and id_in",
			url:        "/api/messages",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "space_key and id_in mutually exclusive",
			url:        "/api/messages?space_key=spaces/AAA&id_in=1,2,3",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "limit too small",
			url:        "/api/messages?space_key=spaces/AAA&limit=0",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "limit too large",
			url:        "/api/messages?space_key=spaces/AAA&limit=501",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "limit not a number",
			url:        "/api/messages?space_key=spaces/AAA&limit=abc",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "before_id not a number",
			url:        "/api/messages?space_key=spaces/AAA&before_id=xyz",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "before_id zero",
			url:        "/api/messages?space_key=spaces/AAA&before_id=0",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "since not RFC3339",
			url:        "/api/messages?space_key=spaces/AAA&since=2026-01-01",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
		{
			name:       "id_in with non-integer",
			url:        "/api/messages?id_in=100,abc",
			wantStatus: http.StatusBadRequest,
			wantCode:   "INVALID_INPUT",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.url, nil)
			w := httptest.NewRecorder()
			// Pass nil DB and cfg — handler returns 400 before reaching DB calls.
			handleGetMessages(w, req, nil, nil)

			if w.Code != tc.wantStatus {
				t.Errorf("status: got %d, want %d", w.Code, tc.wantStatus)
			}
			var body map[string]string
			if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
				t.Fatalf("decode body: %v", err)
			}
			if tc.wantCode != "" && body["code"] != tc.wantCode {
				t.Errorf("code: got %q, want %q", body["code"], tc.wantCode)
			}
		})
	}
}

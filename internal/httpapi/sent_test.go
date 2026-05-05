package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestHandleListSentLimitValidation ensures limit>100 returns 400 INVALID_PARAM.
// This happens before auth, so a nil db is fine.
func TestHandleListSentLimitValidation(t *testing.T) {
	mux := http.NewServeMux()
	sentRoutes(mux, nil, nil)

	req := httptest.NewRequest("GET", "/api/sent?limit=200", nil)
	rw := httptest.NewRecorder()
	mux.ServeHTTP(rw, req)

	if rw.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for limit=200, got %d (body: %s)", rw.Code, rw.Body.String())
	}
}

// TestHandleListSentInvalidFromTo ensures from>to returns 400.
// This also happens before auth.
func TestHandleListSentInvalidFromTo(t *testing.T) {
	mux := http.NewServeMux()
	sentRoutes(mux, nil, nil)

	req := httptest.NewRequest("GET", "/api/sent?from=2026-05-10T00:00:00Z&to=2026-05-01T00:00:00Z", nil)
	rw := httptest.NewRecorder()
	mux.ServeHTTP(rw, req)

	if rw.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for from>to, got %d (body: %s)", rw.Code, rw.Body.String())
	}
}

// TestHandleListSentLimitZero ensures limit=0 is rejected.
func TestHandleListSentLimitZero(t *testing.T) {
	mux := http.NewServeMux()
	sentRoutes(mux, nil, nil)

	req := httptest.NewRequest("GET", "/api/sent?limit=0", nil)
	rw := httptest.NewRecorder()
	mux.ServeHTTP(rw, req)

	if rw.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for limit=0, got %d (body: %s)", rw.Code, rw.Body.String())
	}
}

package platform

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPBoundaryPreservesValidCorrelationID(t *testing.T) {
	var contextID string
	handler := withHTTPBoundary(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contextID = currentCorrelationID(r.Context())
		if got := r.Header.Get("X-Correlation-ID"); got != "release-123" {
			t.Fatalf("expected request correlation ID, got %q", got)
		}
		w.WriteHeader(http.StatusAccepted)
	}))

	request := httptest.NewRequest(http.MethodPost, "/v1/quotes", nil)
	request.Header.Set("X-Correlation-ID", "release-123")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusAccepted {
		t.Fatalf("expected status 202, got %d", response.Code)
	}
	if got := response.Header().Get("X-Correlation-ID"); got != "release-123" {
		t.Fatalf("expected response correlation ID, got %q", got)
	}
	if contextID != "release-123" {
		t.Fatalf("expected context correlation ID, got %q", contextID)
	}
}

func TestSafeRequestPathRedactsGanapWebhookSecret(t *testing.T) {
	got := safeRequestPath("/internal/connectors/ganap/webhooks/sensitive-path-secret")
	if got != "/internal/connectors/ganap/webhooks/[redacted]" {
		t.Fatalf("webhook path was not redacted: %q", got)
	}
	if got := safeRequestPath("/v1/funding-checkouts"); got != "/v1/funding-checkouts" {
		t.Fatalf("ordinary path changed: %q", got)
	}
}

func TestHTTPBoundaryReplacesInvalidCorrelationIDAndSetsSecurityHeaders(t *testing.T) {
	handler := withHTTPBoundary(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("receipt"))
	}))

	request := httptest.NewRequest(http.MethodGet, "/v1/transfers/demo/receipt", nil)
	request.Header.Set("X-Correlation-ID", "invalid identifier")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	correlationID := response.Header().Get("X-Correlation-ID")
	if !correlationIDPattern.MatchString(correlationID) || correlationID == "invalid identifier" {
		t.Fatalf("expected a generated correlation ID, got %q", correlationID)
	}
	checks := map[string]string{
		"Cache-Control":                     "no-store",
		"Content-Security-Policy":           "default-src 'none'; frame-ancestors 'none'; sandbox",
		"Content-Type":                      "application/pdf",
		"Permissions-Policy":                "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
		"Referrer-Policy":                   "no-referrer",
		"Strict-Transport-Security":         "max-age=31536000",
		"X-Content-Type-Options":            "nosniff",
		"X-Frame-Options":                   "DENY",
		"X-Permitted-Cross-Domain-Policies": "none",
	}
	for name, expected := range checks {
		if got := response.Header().Get(name); got != expected {
			t.Errorf("expected %s=%q, got %q", name, expected, got)
		}
	}
}

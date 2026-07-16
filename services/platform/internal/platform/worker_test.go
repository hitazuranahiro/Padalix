package platform

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRetryDelayIsBounded(t *testing.T) {
	cases := map[int]time.Duration{
		1:  1 * time.Second,
		2:  2 * time.Second,
		5:  16 * time.Second,
		20: 5 * time.Minute,
	}
	for attempt, expected := range cases {
		if actual := retryDelay(attempt); actual != expected {
			t.Fatalf("attempt %d delay = %s, want %s", attempt, actual, expected)
		}
	}
}

func TestWorkerEmailConfigFailsClosed(t *testing.T) {
	t.Setenv("EMAIL_DELIVERY_ENABLED", "true")
	t.Setenv("EMAIL_PROVIDER_URL", "http://email.invalid/send")
	t.Setenv("EMAIL_PROVIDER_TOKEN", "secret")
	t.Setenv("EMAIL_FROM", "notifications@padalix.com")
	if _, err := WorkerConfigFromEnv(); err == nil {
		t.Fatal("expected non-HTTPS email provider to be rejected")
	}
}

func TestNotificationProviderReceivesIdempotencyKey(t *testing.T) {
	var idempotencyKey string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		idempotencyKey = r.Header.Get("Idempotency-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"provider-message-1"}`))
	}))
	defer server.Close()

	worker := &Worker{
		config: WorkerConfig{
			EmailProviderURL:   server.URL,
			EmailProviderToken: "provider-token",
			EmailFrom:          "notifications@padalix.com",
		},
		http: server.Client(),
	}
	providerID, err := worker.sendNotification(context.Background(), notificationJob{
		Recipient: "member@example.com", Category: "security", TemplateKey: "verify_email_v1",
		Payload: map[string]any{"url": "https://app.padalix.com/verify"}, IdempotencyKey: "auth:verify:123",
	})
	if err != nil {
		t.Fatal(err)
	}
	if providerID != "provider-message-1" || idempotencyKey != "auth:verify:123" {
		t.Fatalf("provider id %q and idempotency key %q were not preserved", providerID, idempotencyKey)
	}
}

package platform

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sesv2"
)

type fakeSESClient struct {
	input *sesv2.SendEmailInput
}

func (f *fakeSESClient) SendEmail(_ context.Context, input *sesv2.SendEmailInput, _ ...func(*sesv2.Options)) (*sesv2.SendEmailOutput, error) {
	f.input = input
	return &sesv2.SendEmailOutput{MessageId: aws.String("ses-message-1")}, nil
}

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

	sender := &webhookEmailSender{
		client: server.Client(), url: server.URL, token: "provider-token", from: "notifications@padalix.com",
	}
	providerID, err := sender.Send(context.Background(), notificationJob{
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

func TestWorkerSESConfigRequiresRegion(t *testing.T) {
	t.Setenv("EMAIL_DELIVERY_ENABLED", "true")
	t.Setenv("EMAIL_PROVIDER", "ses")
	t.Setenv("EMAIL_FROM", "notifications@padalix.com")
	t.Setenv("AWS_REGION", "")
	if _, err := WorkerConfigFromEnv(); err == nil || !strings.Contains(err.Error(), "AWS_REGION") {
		t.Fatalf("expected missing SES region error, got %v", err)
	}
}

func TestSESSenderBuildsTransactionalEmail(t *testing.T) {
	client := &fakeSESClient{}
	sender := &sesEmailSender{client: client, from: "Padalix <notifications@padalix.com>"}
	providerID, err := sender.Send(context.Background(), notificationJob{
		Recipient: "member@example.com", Category: "transactional", TemplateKey: "stellar_transfer_confirmed_v1",
		Payload:        map[string]any{"reference": "PDX-123", "amount": "100.00", "unsafe": "<script>"},
		IdempotencyKey: "stellar-confirmed:123",
	})
	if err != nil {
		t.Fatal(err)
	}
	if providerID != "ses-message-1" || client.input == nil {
		t.Fatalf("unexpected provider result %q", providerID)
	}
	if got := aws.ToString(client.input.Content.Simple.Subject.Data); got != "Your Padalix transfer is confirmed" {
		t.Fatalf("unexpected subject %q", got)
	}
	htmlBody := aws.ToString(client.input.Content.Simple.Body.Html.Data)
	if strings.Contains(htmlBody, "<script>") || !strings.Contains(htmlBody, "&lt;script&gt;") {
		t.Fatalf("email payload was not HTML escaped: %s", htmlBody)
	}
	if len(client.input.EmailTags) != 1 || aws.ToString(client.input.EmailTags[0].Value) == "stellar-confirmed:123" {
		t.Fatal("SES idempotency tag must be present and hashed")
	}
}

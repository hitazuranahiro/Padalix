package platform

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const testGanapWebhookSecret = "test-webhook-path-secret-at-least-32-characters"

func TestGanapCreateCheckoutSendsAuthenticatedRequest(t *testing.T) {
	var receivedHeader string
	var received map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" {
			t.Fatalf("unexpected request method or content type")
		}
		receivedHeader = r.Header.Get("sk")
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &received); err != nil {
			t.Fatalf("invalid provider request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"externalId":"PDX-GNP-1","referenceNumber":"BYD-123","checkoutUrl":"https://checkout.ganap.example/BYD-123","status":"pending"}}`))
	}))
	defer server.Close()

	connector := newTestGanapConnector(t, server.URL, server.Client(), "")
	result, err := connector.CreateCheckout(context.Background(), GanapCheckoutRequest{
		ExternalID: "PDX-GNP-1", Amount: "200", PayerEmail: "member@example.com", PayerName: "Member Name",
		SuccessRedirectURL: "https://app.padalix.test/funding/success",
		FailureRedirectURL: "https://app.padalix.test/funding/failed",
	})
	if err != nil {
		t.Fatalf("create checkout: %v", err)
	}
	if receivedHeader != "test-provider-secret" {
		t.Fatal("provider secret header was not sent")
	}
	if received["externalId"] != "PDX-GNP-1" || received["amount"].(float64) != 200 {
		t.Fatalf("unexpected provider payload: %#v", received)
	}
	if result.ReferenceNumber != "BYD-123" || result.CheckoutURL != "https://checkout.ganap.example/BYD-123" {
		t.Fatalf("unexpected provider response: %#v", result)
	}
}

func TestGanapCreateCheckoutRejectsProviderMismatch(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"externalId":"different","checkoutURL":"https://checkout.ganap.example/session"}`))
	}))
	defer server.Close()
	connector := newTestGanapConnector(t, server.URL, server.Client(), "")
	_, err := connector.CreateCheckout(context.Background(), GanapCheckoutRequest{
		ExternalID: "expected", Amount: "200", PayerEmail: "member@example.com", PayerName: "Member",
		SuccessRedirectURL: "https://app.padalix.test/success", FailureRedirectURL: "https://app.padalix.test/failed",
	})
	if err == nil {
		t.Fatal("expected mismatched external ID to fail")
	}
}

func TestGanapCreateCheckoutDoesNotFollowRedirects(t *testing.T) {
	redirectReached := false
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/redirected" {
			redirectReached = true
			w.WriteHeader(http.StatusOK)
			return
		}
		http.Redirect(w, r, "/redirected", http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	connector := newTestGanapConnector(t, server.URL, server.Client(), "")
	_, err := connector.CreateCheckout(context.Background(), GanapCheckoutRequest{
		ExternalID: "PDX-GNP-1", Amount: "200", PayerEmail: "member@example.com", PayerName: "Member",
		SuccessRedirectURL: "https://app.padalix.test/success", FailureRedirectURL: "https://app.padalix.test/failed",
	})
	if err == nil || redirectReached {
		t.Fatal("expected provider redirect to be rejected without forwarding credentials")
	}
}

func TestGanapAmountLimits(t *testing.T) {
	tests := map[string]bool{
		"0": true, "0.00": true, "199.99": false, "200": true,
		"50000": true, "50000.01": false, "-1": false, "invalid": false,
		"200.1234567": true, "200.12345678": false, "1/2": false,
	}
	for amount, expected := range tests {
		if got := validGanapAmount(amount); got != expected {
			t.Errorf("amount %q: expected %t, got %t", amount, expected, got)
		}
	}
}

func TestGanapRedirectAllowlistUsesOrigin(t *testing.T) {
	connector := newTestGanapConnector(t, "https://api.ganap.test/checkout", &http.Client{Timeout: time.Second}, "")
	if err := connector.ValidateRedirect("https://app.padalix.test/payment/success?checkout=1"); err != nil {
		t.Fatalf("expected allowlisted redirect: %v", err)
	}
	for _, raw := range []string{
		"https://evil.example/payment/success",
		"http://app.padalix.test/payment/success",
		"https://app.padalix.test.evil.example/payment/success",
	} {
		if err := connector.ValidateRedirect(raw); err == nil {
			t.Errorf("expected redirect %q to be rejected", raw)
		}
	}
}

func TestGanapWebhookRequiresSecretsAndValidatesPayload(t *testing.T) {
	connector := newTestGanapConnector(t, "https://api.ganap.test/checkout", &http.Client{Timeout: time.Second}, "webhook-header-secret-at-least-32-characters")
	body := []byte(`{"status":"success","externalId":"PDX-GNP-1","referenceNumber":"BYD-123","amount":200}`)
	headers := make(http.Header)
	headers.Set("X-Ganap-Webhook-Secret", "webhook-header-secret-at-least-32-characters")

	event, err := connector.VerifyWebhook(testGanapWebhookSecret, headers, body)
	if err != nil {
		t.Fatalf("verify webhook: %v", err)
	}
	if event.Status != "success" || event.ExternalID != "PDX-GNP-1" || len(event.PayloadDigest) != 64 {
		t.Fatalf("unexpected webhook: %#v", event)
	}
	if connector.WebhookAuthenticationMethod() != "shared_secret_header" {
		t.Fatal("expected shared secret header authentication metadata")
	}
	if _, err := connector.VerifyWebhook("wrong-secret", headers, body); err == nil {
		t.Fatal("expected path secret failure")
	}
	headers.Set("X-Ganap-Webhook-Secret", "wrong-secret")
	if _, err := connector.VerifyWebhook(testGanapWebhookSecret, headers, body); err == nil {
		t.Fatal("expected header secret failure")
	}
}

func TestGanapWebhookRejectsAmountOutsideCheckoutLimits(t *testing.T) {
	connector := newTestGanapConnector(t, "https://api.ganap.test/checkout", &http.Client{Timeout: time.Second}, "")
	body := []byte(`{"status":"success","externalId":"PDX-GNP-1","referenceNumber":"BYD-123","amount":199}`)
	if _, err := connector.VerifyWebhook(testGanapWebhookSecret, nil, body); err == nil {
		t.Fatal("expected invalid amount to fail")
	}
}

func newTestGanapConnector(t *testing.T, endpoint string, client *http.Client, headerSecret string) *GanapCheckoutConnector {
	t.Helper()
	config := GanapCheckoutConfig{
		Enabled: true, CheckoutURL: endpoint, SecretKey: "test-provider-secret",
		WebhookPathSecret:      testGanapWebhookSecret,
		RedirectAllowedOrigins: []string{"https://app.padalix.test"}, Timeout: time.Second,
	}
	if headerSecret != "" {
		config.WebhookHeaderName = "X-Ganap-Webhook-Secret"
		config.WebhookHeaderSecret = headerSecret
	}
	connector, err := NewGanapCheckoutConnector(config, client)
	if err != nil {
		t.Fatalf("new connector: %v", err)
	}
	return connector
}

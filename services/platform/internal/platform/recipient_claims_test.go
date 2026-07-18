package platform

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRecipientClaimTokenRoundTrip(t *testing.T) {
	claimID := "a3b4379e-298f-43a9-b2e1-7387cb9358e7"
	token, storedHash, err := newRecipientClaimToken(claimID)
	if err != nil {
		t.Fatal(err)
	}
	parsedID, suppliedHash, ok := parseRecipientClaimToken(token)
	if !ok || parsedID != claimID {
		t.Fatalf("unexpected parsed token: id=%q ok=%v", parsedID, ok)
	}
	if !bytes.Equal(storedHash, suppliedHash) {
		t.Fatal("token hash did not round trip")
	}
	if token == claimID || bytes.Contains(storedHash, []byte(token)) {
		t.Fatal("claim secret was not separated from its stored digest")
	}
}

func TestRecipientClaimTokenRejectsMalformedValues(t *testing.T) {
	values := []string{"", "not-a-token", "short.secret", "a3b4379e-298f-43a9-b2e1-7387cb9358e7.bad"}
	for _, value := range values {
		if _, _, ok := parseRecipientClaimToken(value); ok {
			t.Fatalf("accepted malformed token %q", value)
		}
	}
}

func TestRecipientClaimAttemptsLockAtConfiguredLimit(t *testing.T) {
	attempts, status := nextClaimFailureState(3, 5)
	if attempts != 4 || status != "active" {
		t.Fatalf("expected fourth attempt to remain active, got attempts=%d status=%q", attempts, status)
	}
	attempts, status = nextClaimFailureState(attempts, 5)
	if attempts != 5 || status != "locked" {
		t.Fatalf("expected fifth attempt to lock, got attempts=%d status=%q", attempts, status)
	}
}

func TestRedeemRecipientClaimValidatesBeforeDatabaseAccess(t *testing.T) {
	service := &Service{}
	handler := service.Handler()

	for _, test := range []struct {
		name  string
		idem  string
		token string
		want  int
	}{
		{name: "missing idempotency key", token: "invalid", want: http.StatusBadRequest},
		{name: "malformed token", idem: "claim-attempt-001", token: "invalid", want: http.StatusUnauthorized},
	} {
		t.Run(test.name, func(t *testing.T) {
			body, _ := json.Marshal(map[string]string{"claimToken": test.token})
			request := httptest.NewRequest(http.MethodPost, "/v1/recipient-claims/redeem", bytes.NewReader(body))
			request.Header.Set("Idempotency-Key", test.idem)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.want {
				t.Fatalf("expected %d, got %d: %s", test.want, response.Code, response.Body.String())
			}
		})
	}
}

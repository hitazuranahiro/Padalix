package platform

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

func TestStellarBalancesReadsHorizonAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/accounts/GTEST" {
			http.Error(w, "unexpected path", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"balances":[{"balance":"125.5000000","asset_type":"native"},{"balance":"7.0000000","asset_type":"credit_alphanum4","asset_code":"USDC","asset_issuer":"GISSUER"}]}`))
	}))
	defer server.Close()

	network := &rpcStellarPaymentNetwork{horizonURL: server.URL, httpClient: server.Client()}
	balances, err := network.Balances(context.Background(), "GTEST")
	if err != nil {
		t.Fatal(err)
	}
	if len(balances) != 2 || balances[0].AssetCode != "XLM" || balances[0].Balance != "125.5000000" {
		t.Fatalf("unexpected balances: %#v", balances)
	}
	if balances[1].AssetCode != "USDC" || balances[1].Issuer != "GISSUER" {
		t.Fatalf("unexpected credit balance: %#v", balances[1])
	}
}

func TestStellarBalancesClassifiesUnfundedAccount(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "not found", http.StatusNotFound)
	}))
	defer server.Close()

	network := &rpcStellarPaymentNetwork{horizonURL: server.URL, httpClient: server.Client()}
	_, err := network.Balances(context.Background(), "GTEST")
	if !errors.Is(err, errStellarAccountNotFunded) {
		t.Fatalf("expected an unfunded account error, got %v", err)
	}
}

func TestStellarBalancesPreservesHorizonFailureStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "rate limited", http.StatusTooManyRequests)
	}))
	defer server.Close()

	network := &rpcStellarPaymentNetwork{horizonURL: server.URL, httpClient: server.Client()}
	_, err := network.Balances(context.Background(), "GTEST")
	var horizonErr *stellarHorizonError
	if !errors.As(err, &horizonErr) || horizonErr.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("expected a typed Horizon 429, got %v", err)
	}
}

func TestStellarBalancesRejectsMalformedAndTimedOutResponses(t *testing.T) {
	t.Run("malformed JSON", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"balances":`))
		}))
		defer server.Close()

		network := &rpcStellarPaymentNetwork{horizonURL: server.URL, httpClient: server.Client()}
		if _, err := network.Balances(context.Background(), "GTEST"); err == nil {
			t.Fatal("expected malformed Horizon JSON to fail")
		}
	})

	t.Run("timeout", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			time.Sleep(50 * time.Millisecond)
			_, _ = w.Write([]byte(`{"balances":[]}`))
		}))
		defer server.Close()

		client := server.Client()
		client.Timeout = 5 * time.Millisecond
		network := &rpcStellarPaymentNetwork{horizonURL: server.URL, httpClient: client}
		if _, err := network.Balances(context.Background(), "GTEST"); err == nil {
			t.Fatal("expected a timed-out Horizon request to fail")
		}
	})
}

func testStellarPaymentConfig() StellarPaymentConfig {
	return StellarPaymentConfig{
		Enabled:    true,
		Network:    "testnet",
		RPCURL:     "https://soroban-testnet.stellar.org",
		HorizonURL: "https://horizon-testnet.stellar.org",
		AssetCode:  "XLM",
	}
}

func TestStellarPaymentConfigFailsClosedOutsideTestnet(t *testing.T) {
	config := testStellarPaymentConfig()
	config.Network = "mainnet"
	if err := validateStellarPaymentConfig(config); err == nil {
		t.Fatal("expected enabled mainnet payment configuration to fail")
	}

	config.Enabled = false
	if err := validateStellarPaymentConfig(config); err != nil {
		t.Fatalf("disabled mainnet configuration should remain inert: %v", err)
	}
}

func TestNormalizeStellarPaymentAmount(t *testing.T) {
	for input, expected := range map[string]string{
		"1":         "1.0000000",
		"0.0000001": "0.0000001",
		"42.25":     "42.2500000",
	} {
		actual, err := normalizeStellarPaymentAmount(input)
		if err != nil || actual != expected {
			t.Fatalf("normalize %q = %q, %v; want %q", input, actual, err, expected)
		}
	}
	for _, input := range []string{"0", "-1", "1000.0000001", "1.00000001"} {
		if _, err := normalizeStellarPaymentAmount(input); err == nil {
			t.Fatalf("expected %q to be rejected", input)
		}
	}
}

func TestPreparedStellarPaymentRequiresMatchingSourceSignature(t *testing.T) {
	source, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	destination, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	account := txnbuild.NewSimpleAccount(source.Address(), 10)
	tx, unsignedXDR, hash, err := buildStellarPaymentTransaction(
		&account,
		destination.Address(),
		"2.5000000",
		"PDX-2026-123456",
		testStellarPaymentConfig(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(unsignedXDR, "AAAA") {
		t.Fatal("expected an encoded transaction envelope")
	}
	if err := validateSignedStellarPayment(unsignedXDR, hash, source.Address()); err == nil {
		t.Fatal("expected unsigned transaction to be rejected")
	}

	signed, err := tx.Sign(network.TestNetworkPassphrase, source)
	if err != nil {
		t.Fatal(err)
	}
	signedXDR, err := signed.Base64()
	if err != nil {
		t.Fatal(err)
	}
	if err := validateSignedStellarPayment(signedXDR, hash, source.Address()); err != nil {
		t.Fatalf("expected source-signed transaction to pass: %v", err)
	}
	if err := validateSignedStellarPayment(signedXDR, strings.Repeat("0", 64), source.Address()); err == nil {
		t.Fatal("expected mismatched prepared hash to be rejected")
	}
}

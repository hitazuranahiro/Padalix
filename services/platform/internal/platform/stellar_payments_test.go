package platform

import (
	"strings"
	"testing"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

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

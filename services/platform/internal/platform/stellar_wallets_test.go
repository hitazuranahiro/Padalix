package platform

import (
	"errors"
	"testing"
	"time"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

func TestStellarSEP10ChallengeRoundTrip(t *testing.T) {
	auth, client := testStellarWalletAuth(t, "testnet")
	challenge, err := auth.BuildChallenge(client.Address())
	if err != nil {
		t.Fatal(err)
	}
	if challenge.Network != "testnet" || challenge.NetworkPassphrase != network.TestNetworkPassphrase {
		t.Fatalf("unexpected network response: %#v", challenge)
	}

	signed := signStellarChallenge(t, challenge.Transaction, network.TestNetworkPassphrase, client)
	if err := auth.VerifySignedChallenge(signed, client.Address(), challenge.TransactionHash); err != nil {
		t.Fatalf("valid signed challenge rejected: %v", err)
	}
}

func TestStellarSEP10ChallengeRejectsWrongSigner(t *testing.T) {
	auth, client := testStellarWalletAuth(t, "testnet")
	wrongSigner, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	challenge, err := auth.BuildChallenge(client.Address())
	if err != nil {
		t.Fatal(err)
	}
	signed := signStellarChallenge(t, challenge.Transaction, network.TestNetworkPassphrase, wrongSigner)
	if err := auth.VerifySignedChallenge(signed, client.Address(), challenge.TransactionHash); err == nil {
		t.Fatal("expected a signature from the wrong key to be rejected")
	}
}

func TestStellarSEP10ChallengeRejectsWrongIssuedHash(t *testing.T) {
	auth, client := testStellarWalletAuth(t, "testnet")
	challenge, err := auth.BuildChallenge(client.Address())
	if err != nil {
		t.Fatal(err)
	}
	signed := signStellarChallenge(t, challenge.Transaction, network.TestNetworkPassphrase, client)
	if err := auth.VerifySignedChallenge(signed, client.Address(), string(make([]byte, 64))); err == nil {
		t.Fatal("expected an unissued transaction hash to be rejected")
	}
}

func TestStellarSEP10ChallengeIsNetworkBound(t *testing.T) {
	testnetAuth, client := testStellarWalletAuth(t, "testnet")
	challenge, err := testnetAuth.BuildChallenge(client.Address())
	if err != nil {
		t.Fatal(err)
	}
	signed := signStellarChallenge(t, challenge.Transaction, network.TestNetworkPassphrase, client)

	mainnetAuth, err := NewStellarWalletAuth(StellarWalletConfig{
		Network:        "mainnet",
		HomeDomain:     "padalix.com",
		WebAuthDomain:  "api.padalix.com",
		SigningSeed:    testnetAuth.signingSeed,
		MainnetEnabled: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := mainnetAuth.VerifySignedChallenge(signed, client.Address(), challenge.TransactionHash); err == nil {
		t.Fatal("expected a testnet challenge to be rejected under mainnet")
	}
}

func TestStellarMainnetFailsClosed(t *testing.T) {
	_, err := NewStellarWalletAuth(StellarWalletConfig{
		Network:       "mainnet",
		HomeDomain:    "padalix.com",
		WebAuthDomain: "api.padalix.com",
	})
	if err == nil {
		t.Fatal("expected mainnet configuration without explicit enablement to fail")
	}
}

func TestValidateStellarChallengeState(t *testing.T) {
	now := time.Now().UTC()
	base := stellarChallengeRecord{
		AccountID: "account-a", Network: "testnet", ExpiresAt: now.Add(time.Minute),
	}
	if err := validateStellarChallenge(base, "account-a", "testnet", now); err != nil {
		t.Fatalf("valid challenge rejected: %v", err)
	}

	consumedAt := now.Add(-time.Second)
	consumed := base
	consumed.ConsumedAt = &consumedAt
	if err := validateStellarChallenge(consumed, "account-a", "testnet", now); !errors.Is(err, errStellarChallengeConsumed) {
		t.Fatalf("expected replay rejection, got %v", err)
	}

	expired := base
	expired.ExpiresAt = now
	if err := validateStellarChallenge(expired, "account-a", "testnet", now); !errors.Is(err, errStellarChallengeExpired) {
		t.Fatalf("expected expiry rejection, got %v", err)
	}
	if err := validateStellarChallenge(base, "account-b", "testnet", now); !errors.Is(err, errStellarChallengeAccount) {
		t.Fatalf("expected account binding rejection, got %v", err)
	}
	if err := validateStellarChallenge(base, "account-a", "mainnet", now); !errors.Is(err, errStellarChallengeNetwork) {
		t.Fatalf("expected network binding rejection, got %v", err)
	}
}

func testStellarWalletAuth(t *testing.T, networkName string) (*StellarWalletAuth, *keypair.Full) {
	t.Helper()
	server, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	client, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	auth, err := NewStellarWalletAuth(StellarWalletConfig{
		Network:        networkName,
		HomeDomain:     "padalix.com",
		WebAuthDomain:  "api.padalix.com",
		SigningSeed:    server.Seed(),
		MainnetEnabled: networkName == "mainnet",
	})
	if err != nil {
		t.Fatal(err)
	}
	return auth, client
}

func signStellarChallenge(t *testing.T, transaction, passphrase string, signer *keypair.Full) string {
	t.Helper()
	parsed, err := txnbuild.TransactionFromXDR(transaction)
	if err != nil {
		t.Fatal(err)
	}
	tx, ok := parsed.Transaction()
	if !ok {
		t.Fatal("SEP-10 challenge unexpectedly parsed as a fee-bump transaction")
	}
	tx, err = tx.Sign(passphrase, signer)
	if err != nil {
		t.Fatal(err)
	}
	signed, err := tx.Base64()
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

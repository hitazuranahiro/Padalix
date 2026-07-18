package platform

import (
	"regexp"
	"testing"

	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

func TestBuildStellarClaimableBalanceTransaction(t *testing.T) {
	source, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	claimant, err := keypair.Random()
	if err != nil {
		t.Fatal(err)
	}
	account := &txnbuild.SimpleAccount{AccountID: source.Address(), Sequence: 41}
	transaction, xdr, hash, balanceID, err := buildStellarClaimableBalanceTransaction(account, claimant.Address(), "2.5000000", "PDX-2026-001001", StellarPaymentConfig{Enabled: true, Network: "testnet", AssetCode: "XLM"})
	if err != nil {
		t.Fatal(err)
	}
	if xdr == "" || len(hash) != 64 {
		t.Fatalf("invalid transaction encoding or hash: xdr=%t hash=%q", xdr != "", hash)
	}
	if !regexp.MustCompile(`^00000000[0-9a-f]{64}$`).MatchString(balanceID) {
		t.Fatalf("invalid claimable balance id %q", balanceID)
	}
	derived, err := transaction.ClaimableBalanceID(0)
	if err != nil || derived != balanceID {
		t.Fatalf("balance id is not deterministic: %q %v", derived, err)
	}
	operations := transaction.Operations()
	if len(operations) != 1 {
		t.Fatalf("expected one operation, got %d", len(operations))
	}
	operation, ok := operations[0].(*txnbuild.CreateClaimableBalance)
	if !ok {
		t.Fatalf("unexpected operation %T", operations[0])
	}
	if len(operation.Destinations) != 2 || operation.Destinations[0].Destination != claimant.Address() || operation.Destinations[1].Destination != source.Address() {
		t.Fatalf("unexpected claimants %#v", operation.Destinations)
	}
}

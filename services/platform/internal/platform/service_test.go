package platform

import (
	"math/big"
	"regexp"
	"testing"
)

func TestDecimalUsesExactRounding(t *testing.T) {
	amount := new(big.Rat).SetFrac64(251, 2)
	fee := new(big.Rat).Quo(amount, new(big.Rat).SetInt64(100))
	if got := decimal(fee, 2); got != "1.26" {
		t.Fatalf("expected 1.26, got %s", got)
	}
	if got := decimal(fee, 7); got != "1.2550000" {
		t.Fatalf("expected storage precision, got %s", got)
	}
}

func TestNewIDProducesUUIDv4Shape(t *testing.T) {
	pattern := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	first, second := newID(), newID()
	if !pattern.MatchString(first) || !pattern.MatchString(second) {
		t.Fatalf("unexpected UUID shape: %q %q", first, second)
	}
	if first == second {
		t.Fatal("expected unique identifiers")
	}
}

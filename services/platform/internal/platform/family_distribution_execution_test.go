package platform

import "testing"

func TestAmountUnitsPreservesSevenDecimalPlaces(t *testing.T) {
	units, err := amountUnits("123.4567890", 10_000)
	if err != nil {
		t.Fatal(err)
	}
	if got := unitsDecimal(units); got != "123.4567890" {
		t.Fatalf("unexpected normalized amount %q", got)
	}
}

func TestAmountUnitsRejectsPrecisionAndBounds(t *testing.T) {
	for _, value := range []string{"0", "10000.0000001", "1.00000001", "not-a-number"} {
		if _, err := amountUnits(value, 10_000); err == nil {
			t.Fatalf("expected %q to fail", value)
		}
	}
}

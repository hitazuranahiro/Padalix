package platform

import (
	"strings"
	"testing"
)

func TestValidateFamilyDistributionAcceptsExactAllocation(t *testing.T) {
	input := familyDistributionInput{
		Name: "  Household essentials  ",
		Allocations: []familyDistributionAllocationInput{
			{RecipientID: "recipient-a", ShareBasisPoints: 6000},
			{RecipientID: "recipient-b", ShareBasisPoints: 4000},
		},
	}
	if err := validateFamilyDistribution(&input); err != nil {
		t.Fatalf("valid family distribution rejected: %v", err)
	}
	if input.Name != "Household essentials" {
		t.Fatalf("expected a normalized name, got %q", input.Name)
	}
}

func TestValidateFamilyDistributionRejectsInvalidAllocations(t *testing.T) {
	tests := []struct {
		name  string
		input familyDistributionInput
		want  string
	}{
		{
			name: "too few recipients",
			input: familyDistributionInput{Name: "Family", Allocations: []familyDistributionAllocationInput{
				{RecipientID: "recipient-a", ShareBasisPoints: 10000},
			}},
			want: "between 2 and 20",
		},
		{
			name: "duplicate recipient",
			input: familyDistributionInput{Name: "Family", Allocations: []familyDistributionAllocationInput{
				{RecipientID: "recipient-a", ShareBasisPoints: 5000},
				{RecipientID: "recipient-a", ShareBasisPoints: 5000},
			}},
			want: "unique",
		},
		{
			name: "zero share",
			input: familyDistributionInput{Name: "Family", Allocations: []familyDistributionAllocationInput{
				{RecipientID: "recipient-a", ShareBasisPoints: 10000},
				{RecipientID: "recipient-b", ShareBasisPoints: 0},
			}},
			want: "between 1 and 10000",
		},
		{
			name: "incorrect total",
			input: familyDistributionInput{Name: "Family", Allocations: []familyDistributionAllocationInput{
				{RecipientID: "recipient-a", ShareBasisPoints: 5000},
				{RecipientID: "recipient-b", ShareBasisPoints: 4999},
			}},
			want: "total 10000",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateFamilyDistribution(&test.input)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected error containing %q, got %v", test.want, err)
			}
		})
	}
}

func TestFamilyDistributionFingerprintIsAllocationOrderIndependent(t *testing.T) {
	first := familyDistributionInput{
		Name: "Family",
		Allocations: []familyDistributionAllocationInput{
			{RecipientID: "recipient-a", ShareBasisPoints: 6000},
			{RecipientID: "recipient-b", ShareBasisPoints: 4000},
		},
	}
	second := familyDistributionInput{
		Name: "Family",
		Allocations: []familyDistributionAllocationInput{
			{RecipientID: "recipient-b", ShareBasisPoints: 4000},
			{RecipientID: "recipient-a", ShareBasisPoints: 6000},
		},
	}
	if familyDistributionFingerprint(first) != familyDistributionFingerprint(second) {
		t.Fatal("allocation order should not change the request fingerprint")
	}

	second.Allocations[0].ShareBasisPoints = 3999
	if familyDistributionFingerprint(first) == familyDistributionFingerprint(second) {
		t.Fatal("a changed share should change the request fingerprint")
	}
}

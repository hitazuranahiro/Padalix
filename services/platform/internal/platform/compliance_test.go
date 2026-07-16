package platform

import (
	"context"
	"encoding/json"
	"math/big"
	"testing"
)

func TestStaticWatchlistAdapterCreatesPotentialMatchOnly(t *testing.T) {
	adapter := StaticWatchlistAdapter{SourceVersion: "ofac-2026-07-16", Records: []WatchlistRecord{
		{ExternalID: "entry-1", Kind: "sanctions", Name: "Juan Dela Cruz", Aliases: []string{"Juan Cruz"}},
	}}
	result, err := adapter.Screen(context.Background(), ScreeningRequest{FullName: "Cruz, Juan Dela"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "potential_match" || len(result.Matches) != 1 {
		t.Fatalf("unexpected screening result: %#v", result)
	}
	if result.Matches[0].ExternalID != "entry-1" || result.Matches[0].Confidence != "1.0000" {
		t.Fatalf("unexpected match: %#v", result.Matches[0])
	}
}

func TestManualReviewAdapterFailsToHumanReview(t *testing.T) {
	result, err := (ManualReviewScreeningAdapter{}).Screen(context.Background(), ScreeningRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "manual_review" || len(result.ReasonCodes) != 1 {
		t.Fatalf("unexpected fallback result: %#v", result)
	}
}

func TestEmptyWatchlistCannotProduceClearResult(t *testing.T) {
	result, err := (StaticWatchlistAdapter{SourceVersion: "missing"}).Screen(context.Background(), ScreeningRequest{FullName: "Member Name"})
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != "manual_review" || result.ReasonCodes[0] != "WATCHLIST_SOURCE_EMPTY" {
		t.Fatalf("empty source must fail to review: %#v", result)
	}
}

func TestScreeningFingerprintIsStableAndDoesNotExposePII(t *testing.T) {
	left := ScreeningInputFingerprint(ScreeningRequest{MemberID: "member-1", FullName: "Juan Dela Cruz", Country: "ph", BirthDate: "1990-01-01", Purpose: "onboarding", Policy: "v1"})
	right := ScreeningInputFingerprint(ScreeningRequest{MemberID: "member-1", FullName: "CRUZ, JUAN DELA", Country: "PH", BirthDate: "1990-01-01", Purpose: "onboarding", Policy: "v1"})
	if left != right || len(left) != 64 || left == "Juan Dela Cruz" {
		t.Fatalf("unexpected fingerprints: %q %q", left, right)
	}
}

func TestMonitoringRulesFlagAndGateDeterministically(t *testing.T) {
	rules := []MonitoringRule{
		{ID: "amount", Code: "single_transfer_amount", RuleType: "single_amount", Action: "flag", Severity: "medium", Parameters: json.RawMessage(`{"amount":"2500.00"}`)},
		{ID: "velocity", Code: "hourly_transfer_count", RuleType: "velocity_count", Action: "review", Severity: "high", Parameters: json.RawMessage(`{"count":5}`)},
	}
	decision, err := EvaluateMonitoringRules(rules, MonitoringFacts{
		TransferAmount: big.NewRat(3000, 1), HourlyTransferCount: 4,
		DailyTransferAmount: big.NewRat(100, 1), WeeklyRecipientCount: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if decision.Allowed || len(decision.Findings) != 2 {
		t.Fatalf("unexpected monitoring decision: %#v", decision)
	}
	if decision.Findings[1].Outcome != "review" || decision.Findings[1].RiskPoints != 70 {
		t.Fatalf("unexpected review finding: %#v", decision.Findings[1])
	}
}

func TestMonitoringRuleRejectsInvalidConfiguration(t *testing.T) {
	_, err := EvaluateMonitoringRules([]MonitoringRule{{
		ID: "bad", Code: "bad", RuleType: "velocity_amount", Action: "block", Severity: "critical",
		Parameters: json.RawMessage(`{"amount":"not-a-number"}`),
	}}, MonitoringFacts{TransferAmount: big.NewRat(1, 1), DailyTransferAmount: big.NewRat(0, 1)})
	if err == nil {
		t.Fatal("expected invalid rule configuration to fail closed")
	}
}

func TestMonitoringRulesRequireCompleteFacts(t *testing.T) {
	_, err := EvaluateMonitoringRules([]MonitoringRule{{
		ID: "amount", Code: "single_transfer_amount", RuleType: "single_amount", Action: "flag", Severity: "medium",
		Parameters: json.RawMessage(`{"amount":"10"}`),
	}}, MonitoringFacts{})
	if err == nil {
		t.Fatal("expected incomplete facts to fail closed")
	}
}

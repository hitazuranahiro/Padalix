package platform

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5"
)

// ScreeningAdapter keeps vendor-specific transport and payloads outside the
// compliance domain. Adapter results are triage inputs, never adverse decisions.
type ScreeningAdapter interface {
	Key() string
	Version() string
	Screen(context.Context, ScreeningRequest) (ScreeningResult, error)
}

type ScreeningRequest struct {
	MemberID   string
	FullName   string
	Country    string
	BirthDate  string
	Purpose    string
	Policy     string
	ExternalID string
}

type ScreeningResult struct {
	Status      string
	ReasonCodes []string
	Matches     []ScreeningCandidate
}

type ScreeningCandidate struct {
	ExternalID    string
	Kind          string
	Confidence    string
	MatchedFields []string
	SourceVersion string
}

type RecordedScreening struct {
	RunID  string
	Status string
	Cases  []string
}

type ManualReviewScreeningAdapter struct{}

func (ManualReviewScreeningAdapter) Key() string     { return "manual_review" }
func (ManualReviewScreeningAdapter) Version() string { return "1" }
func (ManualReviewScreeningAdapter) Screen(context.Context, ScreeningRequest) (ScreeningResult, error) {
	return ScreeningResult{Status: "manual_review", ReasonCodes: []string{"SCREENING_PROVIDER_NOT_CONFIGURED"}}, nil
}

type WatchlistRecord struct {
	ExternalID string
	Kind       string
	Name       string
	Aliases    []string
	Version    string
}

// StaticWatchlistAdapter supports controlled, versioned list imports. It emits
// potential matches only; a trained reviewer must disposition every match.
type StaticWatchlistAdapter struct {
	SourceVersion string
	Records       []WatchlistRecord
}

func (a StaticWatchlistAdapter) Key() string { return "internal_watchlist" }
func (a StaticWatchlistAdapter) Version() string {
	if strings.TrimSpace(a.SourceVersion) == "" {
		return "unversioned"
	}
	return a.SourceVersion
}

func (a StaticWatchlistAdapter) Screen(_ context.Context, request ScreeningRequest) (ScreeningResult, error) {
	if len(a.Records) == 0 {
		return ScreeningResult{Status: "manual_review", ReasonCodes: []string{"WATCHLIST_SOURCE_EMPTY"}}, nil
	}
	query := normalizeScreeningName(request.FullName)
	if query == "" {
		return ScreeningResult{Status: "manual_review", ReasonCodes: []string{"SCREENING_NAME_MISSING"}}, nil
	}
	result := ScreeningResult{Status: "clear"}
	for _, record := range a.Records {
		best := screeningNameSimilarity(query, normalizeScreeningName(record.Name))
		for _, alias := range record.Aliases {
			if score := screeningNameSimilarity(query, normalizeScreeningName(alias)); score > best {
				best = score
			}
		}
		if best < 0.85 {
			continue
		}
		result.Status = "potential_match"
		result.Matches = append(result.Matches, ScreeningCandidate{
			ExternalID: record.ExternalID, Kind: record.Kind,
			Confidence: fmt.Sprintf("%.4f", best), MatchedFields: []string{"name"}, SourceVersion: record.Version,
		})
	}
	if result.Status == "potential_match" {
		result.ReasonCodes = []string{"WATCHLIST_POTENTIAL_MATCH"}
	}
	return result, nil
}

func (s *Service) LoadInternalWatchlistAdapter(ctx context.Context) (StaticWatchlistAdapter, error) {
	rows, err := s.db.Query(ctx, `select e.external_id,s.list_kind,e.primary_name,e.aliases,s.version
		from compliance.watchlist_entry e join compliance.watchlist_source s on s.id=e.source_id
		where e.active and s.status='active' and s.effective_at <= now() and (s.expires_at is null or s.expires_at > now())
		order by s.source_key,e.external_id`)
	if err != nil {
		return StaticWatchlistAdapter{}, err
	}
	defer rows.Close()
	records := make([]WatchlistRecord, 0)
	versions := make(map[string]struct{})
	for rows.Next() {
		var record WatchlistRecord
		var aliases []byte
		if err := rows.Scan(&record.ExternalID, &record.Kind, &record.Name, &aliases, &record.Version); err != nil {
			return StaticWatchlistAdapter{}, err
		}
		if err := json.Unmarshal(aliases, &record.Aliases); err != nil {
			return StaticWatchlistAdapter{}, fmt.Errorf("watchlist entry %s aliases: %w", record.ExternalID, err)
		}
		records = append(records, record)
		versions[record.Version] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return StaticWatchlistAdapter{}, err
	}
	versionList := make([]string, 0, len(versions))
	for version := range versions {
		versionList = append(versionList, version)
	}
	sort.Strings(versionList)
	return StaticWatchlistAdapter{SourceVersion: strings.Join(versionList, "+"), Records: records}, nil
}

func ScreeningInputFingerprint(request ScreeningRequest) string {
	parts := []string{
		request.MemberID, normalizeScreeningName(request.FullName), strings.ToUpper(strings.TrimSpace(request.Country)),
		strings.TrimSpace(request.BirthDate), strings.TrimSpace(request.Purpose), strings.TrimSpace(request.Policy),
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

// ExecuteScreening persists the adapter result, potential matches, risk
// signals, review cases, and audit trail in one transaction. Callers should
// pass only server-derived member identifiers and an approved adapter.
func (s *Service) ExecuteScreening(ctx context.Context, request ScreeningRequest, adapter ScreeningAdapter) (RecordedScreening, error) {
	if adapter == nil {
		return RecordedScreening{}, errors.New("screening adapter is required")
	}
	if strings.TrimSpace(request.MemberID) == "" || strings.TrimSpace(request.Policy) == "" {
		return RecordedScreening{}, errors.New("member and policy are required")
	}
	if request.Purpose != "onboarding" && request.Purpose != "ongoing" && request.Purpose != "pre_transaction" && request.Purpose != "manual_review" {
		return RecordedScreening{}, errors.New("invalid screening purpose")
	}
	result, adapterErr := adapter.Screen(ctx, request)
	if adapterErr != nil {
		result = ScreeningResult{Status: "error", ReasonCodes: []string{"SCREENING_ADAPTER_ERROR"}}
	}
	if !oneOf(result.Status, "clear", "potential_match", "confirmed_match", "manual_review", "error") {
		return RecordedScreening{}, errors.New("screening adapter returned an invalid status")
	}
	tx, beginErr := s.db.Begin(ctx)
	if beginErr != nil {
		return RecordedScreening{}, beginErr
	}
	defer tx.Rollback(ctx)
	var memberExists bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from identity.member where id=$1)`, request.MemberID).Scan(&memberExists); err != nil {
		return RecordedScreening{}, err
	}
	if !memberExists {
		return RecordedScreening{}, errors.New("screening member not found")
	}
	runID := newID()
	reasons, _ := json.Marshal(result.ReasonCodes)
	status := result.Status
	if _, err := tx.Exec(ctx, `insert into compliance.screening_run(
		id,member_id,purpose,adapter_key,adapter_version,policy_version,input_fingerprint,source_versions,status,reason_codes,completed_at
	) values($1,$2,$3,$4,$5,$6,$7,jsonb_build_object($4,$5),$8,$9::jsonb,now())`, runID, request.MemberID, request.Purpose,
		adapter.Key(), adapter.Version(), request.Policy, ScreeningInputFingerprint(request), status, string(reasons)); err != nil {
		return RecordedScreening{}, err
	}
	caseIDs := make([]string, 0)
	for _, candidate := range result.Matches {
		if !oneOf(candidate.Kind, "sanctions", "pep", "adverse_media", "law_enforcement", "internal") {
			return RecordedScreening{}, fmt.Errorf("invalid screening match kind %q", candidate.Kind)
		}
		var entryID string
		sourceVersion := candidate.SourceVersion
		if sourceVersion == "" {
			sourceVersion = adapter.Version()
		}
		entryErr := tx.QueryRow(ctx, `select e.id from compliance.watchlist_entry e join compliance.watchlist_source s on s.id=e.source_id
			where e.external_id=$1 and s.version=$2 and e.active and s.status='active' order by s.effective_at desc limit 1`,
			candidate.ExternalID, sourceVersion).Scan(&entryID)
		if entryErr != nil && !errors.Is(entryErr, pgx.ErrNoRows) {
			return RecordedScreening{}, entryErr
		}
		matchID := newID()
		if _, err := tx.Exec(ctx, `insert into compliance.screening_match(
			id,screening_run_id,watchlist_entry_id,external_match_reference,match_kind,confidence,matched_fields,status
		) values($1,$2,nullif($3,''),$4,$5,nullif($6,'')::numeric,$7,'potential')`, matchID, runID, entryID,
			candidate.ExternalID, candidate.Kind, candidate.Confidence, candidate.MatchedFields); err != nil {
			return RecordedScreening{}, err
		}
		signalID := newID()
		signalCode := "SCREENING_" + strings.ToUpper(candidate.Kind) + "_POTENTIAL_MATCH"
		if err := tx.QueryRow(ctx, `insert into compliance.risk_signal(
			id,deduplication_key,member_id,screening_run_id,signal_code,category,severity,risk_points,evidence,source
		) values($1,$2,$3,$4,$5,$6,$7,$8,jsonb_build_object('matchId',$9),$10)
		on conflict(deduplication_key) do update set deduplication_key=excluded.deduplication_key returning id`,
			signalID, "screening:"+runID+":"+candidate.ExternalID, request.MemberID, runID, signalCode,
			screeningCategory(candidate.Kind), screeningSeverity(candidate.Kind), screeningRiskPoints(candidate.Kind), matchID,
			"screening_adapter:"+adapter.Key()).Scan(&signalID); err != nil {
			return RecordedScreening{}, err
		}
		caseID, err := attachScreeningSignalToAMLCase(ctx, tx, request.MemberID, signalID, signalCode, screeningSeverity(candidate.Kind))
		if err != nil {
			return RecordedScreening{}, err
		}
		caseIDs = append(caseIDs, caseID)
	}
	if status == "manual_review" || status == "error" {
		signalID := newID()
		signalCode := "SCREENING_" + strings.ToUpper(status)
		if err := tx.QueryRow(ctx, `insert into compliance.risk_signal(
			id,deduplication_key,member_id,screening_run_id,signal_code,category,severity,risk_points,evidence,source
		) values($1,$2,$3,$4,$5,'identity','medium',40,jsonb_build_object('reasonCodes',$6::jsonb),$7)
		on conflict(deduplication_key) do update set deduplication_key=excluded.deduplication_key returning id`,
			signalID, "screening:"+runID+":"+status, request.MemberID, runID, signalCode, string(reasons),
			"screening_adapter:"+adapter.Key()).Scan(&signalID); err != nil {
			return RecordedScreening{}, err
		}
		caseID, err := attachScreeningSignalToAMLCase(ctx, tx, request.MemberID, signalID, signalCode, "medium")
		if err != nil {
			return RecordedScreening{}, err
		}
		caseIDs = append(caseIDs, caseID)
	}
	if _, err := tx.Exec(ctx, `insert into compliance.control_audit_event(
		event_id,actor_type,actor_id,event_type,resource_type,resource_id,reason_code,metadata
	) values($1,'system','platform-api','screening.completed','screening_run',$2,$3,
		jsonb_build_object('adapter',$4,'status',$5,'matchCount',$6))`,
		"screening:"+runID, runID, firstReason(result.ReasonCodes), adapter.Key(), status, len(result.Matches)); err != nil {
		return RecordedScreening{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return RecordedScreening{}, err
	}
	if adapterErr != nil {
		return RecordedScreening{RunID: runID, Status: status, Cases: caseIDs}, fmt.Errorf("screening adapter: %w", adapterErr)
	}
	return RecordedScreening{RunID: runID, Status: status, Cases: caseIDs}, nil
}

func firstReason(reasons []string) string {
	if len(reasons) == 0 {
		return "SCREENING_COMPLETED"
	}
	return reasons[0]
}

func screeningSeverity(kind string) string {
	if kind == "sanctions" || kind == "law_enforcement" {
		return "critical"
	}
	return "high"
}

func screeningRiskPoints(kind string) int {
	if kind == "sanctions" || kind == "law_enforcement" {
		return 100
	}
	return 70
}

func screeningCategory(kind string) string {
	if kind == "sanctions" || kind == "pep" || kind == "adverse_media" {
		return kind
	}
	return "manual"
}

func normalizeScreeningName(value string) string {
	words := strings.FieldsFunc(strings.ToLower(strings.TrimSpace(value)), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsNumber(r)
	})
	sort.Strings(words)
	return strings.Join(words, " ")
}

func screeningNameSimilarity(left, right string) float64 {
	if left == "" || right == "" {
		return 0
	}
	if left == right {
		return 1
	}
	a, b := stringSet(left), stringSet(right)
	intersection := 0
	for token := range a {
		if _, ok := b[token]; ok {
			intersection++
		}
	}
	return float64(2*intersection) / float64(len(a)+len(b))
}

func stringSet(value string) map[string]struct{} {
	result := make(map[string]struct{})
	for _, token := range strings.Fields(value) {
		result[token] = struct{}{}
	}
	return result
}

type MonitoringRule struct {
	ID         string
	Code       string
	Version    int
	RuleType   string
	Action     string
	Severity   string
	Parameters json.RawMessage
}

type MonitoringFacts struct {
	TransferAmount       *big.Rat
	HourlyTransferCount  int
	DailyTransferAmount  *big.Rat
	WeeklyRecipientCount int
}

type MonitoringFinding struct {
	RuleID     string
	RuleCode   string
	Action     string
	Severity   string
	Outcome    string
	ReasonCode string
	Observed   map[string]any
	RiskPoints int
}

type ComplianceDecision struct {
	Allowed  bool
	Findings []MonitoringFinding
}

func EvaluateMonitoringRules(rules []MonitoringRule, facts MonitoringFacts) (ComplianceDecision, error) {
	if facts.TransferAmount == nil || facts.DailyTransferAmount == nil {
		return ComplianceDecision{}, errors.New("monitoring amount facts are required")
	}
	decision := ComplianceDecision{Allowed: true, Findings: make([]MonitoringFinding, 0)}
	for _, rule := range rules {
		finding, triggered, err := evaluateMonitoringRule(rule, facts)
		if err != nil {
			return ComplianceDecision{}, fmt.Errorf("rule %s: %w", rule.Code, err)
		}
		if !triggered {
			continue
		}
		decision.Findings = append(decision.Findings, finding)
		if rule.Action == "review" || rule.Action == "block" {
			decision.Allowed = false
		}
	}
	return decision, nil
}

func evaluateMonitoringRule(rule MonitoringRule, facts MonitoringFacts) (MonitoringFinding, bool, error) {
	var parameters struct {
		Amount string `json:"amount"`
		Count  int    `json:"count"`
	}
	if err := json.Unmarshal(rule.Parameters, &parameters); err != nil {
		return MonitoringFinding{}, false, errors.New("invalid parameters")
	}
	finding := MonitoringFinding{
		RuleID: rule.ID, RuleCode: rule.Code, Action: rule.Action, Severity: rule.Severity,
		Outcome: actionOutcome(rule.Action), ReasonCode: "AML_" + strings.ToUpper(rule.Code),
		RiskPoints: severityPoints(rule.Severity), Observed: make(map[string]any),
	}
	switch rule.RuleType {
	case "single_amount":
		threshold, err := parsePositiveAmount(parameters.Amount)
		if err != nil {
			return MonitoringFinding{}, false, err
		}
		finding.Observed["amount"] = facts.TransferAmount.FloatString(7)
		return finding, facts.TransferAmount.Cmp(threshold) >= 0, nil
	case "velocity_count":
		if parameters.Count <= 0 {
			return MonitoringFinding{}, false, errors.New("count must be positive")
		}
		finding.Observed["countIncludingCandidate"] = facts.HourlyTransferCount + 1
		return finding, facts.HourlyTransferCount+1 >= parameters.Count, nil
	case "velocity_amount":
		threshold, err := parsePositiveAmount(parameters.Amount)
		if err != nil {
			return MonitoringFinding{}, false, err
		}
		total := new(big.Rat).Add(facts.DailyTransferAmount, facts.TransferAmount)
		finding.Observed["amountIncludingCandidate"] = total.FloatString(7)
		return finding, total.Cmp(threshold) >= 0, nil
	case "recipient_count":
		if parameters.Count <= 0 {
			return MonitoringFinding{}, false, errors.New("count must be positive")
		}
		finding.Observed["distinctRecipientCount"] = facts.WeeklyRecipientCount
		return finding, facts.WeeklyRecipientCount >= parameters.Count, nil
	default:
		return MonitoringFinding{}, false, fmt.Errorf("unsupported rule type %q", rule.RuleType)
	}
}

func parsePositiveAmount(value string) (*big.Rat, error) {
	amount, ok := new(big.Rat).SetString(value)
	if !ok || amount.Sign() <= 0 {
		return nil, errors.New("amount must be a positive decimal")
	}
	return amount, nil
}

func actionOutcome(action string) string {
	switch action {
	case "block":
		return "blocked"
	case "review":
		return "review"
	default:
		return "flagged"
	}
}

func severityPoints(severity string) int {
	switch severity {
	case "critical":
		return 100
	case "high":
		return 70
	case "medium":
		return 40
	default:
		return 10
	}
}

func (s *Service) assessTransferCompliance(ctx context.Context, tx pgx.Tx, acct account, commandID, amount string) (ComplianceDecision, error) {
	transferAmount, err := parsePositiveAmount(amount)
	if err != nil {
		return ComplianceDecision{}, err
	}
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1,0))`, acct.ID); err != nil {
		return ComplianceDecision{}, err
	}
	var hourlyCount, weeklyRecipients int
	var dailyAmount string
	if err := tx.QueryRow(ctx, `select
		count(*) filter (where created_at >= now()-interval '1 hour'),
		coalesce(sum(source_amount) filter (where created_at >= now()-interval '24 hours'),0)::text,
		count(distinct recipient_id) filter (where created_at >= now()-interval '168 hours' and recipient_id is not null)
		from platform.transfer where account_id=$1 and status not in ('failed','cancelled')`, acct.ID).
		Scan(&hourlyCount, &dailyAmount, &weeklyRecipients); err != nil {
		return ComplianceDecision{}, err
	}
	daily, ok := new(big.Rat).SetString(dailyAmount)
	if !ok {
		return ComplianceDecision{}, errors.New("invalid aggregate amount")
	}
	rows, err := tx.Query(ctx, `select distinct on (rule_code) id,rule_code,version,rule_type,action,severity,parameters
		from compliance.monitoring_rule where event_type='pre_transfer' and enabled and effective_at <= now()
		and (retired_at is null or retired_at > now()) order by rule_code,version desc`)
	if err != nil {
		return ComplianceDecision{}, err
	}
	defer rows.Close()
	rules := make([]MonitoringRule, 0)
	for rows.Next() {
		var rule MonitoringRule
		if err := rows.Scan(&rule.ID, &rule.Code, &rule.Version, &rule.RuleType, &rule.Action, &rule.Severity, &rule.Parameters); err != nil {
			return ComplianceDecision{}, err
		}
		rules = append(rules, rule)
	}
	if err := rows.Err(); err != nil {
		return ComplianceDecision{}, err
	}
	decision, err := EvaluateMonitoringRules(rules, MonitoringFacts{
		TransferAmount: transferAmount, HourlyTransferCount: hourlyCount,
		DailyTransferAmount: daily, WeeklyRecipientCount: weeklyRecipients,
	})
	if err != nil {
		return ComplianceDecision{}, err
	}
	for _, finding := range decision.Findings {
		evaluationID := newID()
		err := tx.QueryRow(ctx, `insert into compliance.monitoring_evaluation(
			id,member_id,command_id,rule_id,outcome,observed,reason_codes
		) values($1,$2,$3,$4,$5,$6,jsonb_build_array($7))
		on conflict(command_id,rule_id) do update set command_id=excluded.command_id returning id`,
			evaluationID, acct.MemberID, commandID, finding.RuleID, finding.Outcome, finding.Observed, finding.ReasonCode).Scan(&evaluationID)
		if err != nil {
			return ComplianceDecision{}, err
		}
		signalID := newID()
		deduplicationKey := commandID + ":" + finding.RuleID
		if err := tx.QueryRow(ctx, `insert into compliance.risk_signal(
			id,deduplication_key,member_id,evaluation_id,signal_code,category,severity,risk_points,evidence,source
		) values($1,$2,$3,$4,$5,'transaction',$6,$7,$8,$9)
		on conflict(deduplication_key) do update set deduplication_key=excluded.deduplication_key returning id`,
			signalID, deduplicationKey, acct.MemberID, evaluationID, finding.ReasonCode,
			finding.Severity, finding.RiskPoints, finding.Observed, "monitoring_rule:"+finding.RuleCode).Scan(&signalID); err != nil {
			return ComplianceDecision{}, err
		}
		if _, err := tx.Exec(ctx, `insert into compliance.control_audit_event(
			event_id,actor_type,actor_id,event_type,resource_type,resource_id,correlation_id,reason_code,metadata
		) values($1,'system','platform-api','monitoring.rule_triggered','member',$2,$3,$4,$5)
			on conflict(event_id) do nothing`, "monitor:"+deduplicationKey, acct.MemberID, commandID, finding.ReasonCode, finding.Observed); err != nil {
			return ComplianceDecision{}, err
		}
		if finding.Action == "review" || finding.Action == "block" {
			if err := attachSignalToAMLCase(ctx, tx, acct.MemberID, signalID, finding); err != nil {
				return ComplianceDecision{}, err
			}
		}
	}
	var screeningStatus string
	var activeScreeningRisk bool
	if err := tx.QueryRow(ctx, `select
		coalesce((select status from compliance.screening_run where member_id=$1
			and (expires_at is null or expires_at > now()) order by created_at desc limit 1),'missing'),
		exists(select 1 from compliance.risk_signal where member_id=$1 and status in ('active','under_review')
			and category in ('sanctions','pep','adverse_media') and severity in ('high','critical'))`, acct.MemberID).
		Scan(&screeningStatus, &activeScreeningRisk); err != nil {
		return ComplianceDecision{}, err
	}
	if acct.AccountStatus != "active" || screeningStatus != "clear" || activeScreeningRisk {
		decision.Allowed = false
		if _, err := tx.Exec(ctx, `insert into compliance.control_audit_event(
			event_id,actor_type,actor_id,event_type,resource_type,resource_id,correlation_id,reason_code,metadata
		) values($1,'system','platform-api','compliance.pre_transfer_gate','member',$2,$3,'COMPLIANCE_REVIEW_REQUIRED',
			jsonb_build_object('accountStatus',$4,'screeningStatus',$5,'activeScreeningRisk',$6))
		on conflict(event_id) do nothing`, "gate:"+commandID, acct.MemberID, commandID,
			acct.AccountStatus, screeningStatus, activeScreeningRisk); err != nil {
			return ComplianceDecision{}, err
		}
	}
	return decision, nil
}

func attachSignalToAMLCase(ctx context.Context, tx pgx.Tx, memberID, signalID string, finding MonitoringFinding) error {
	var caseID string
	err := tx.QueryRow(ctx, `select id from compliance.aml_case where member_id=$1 and case_type='transaction_monitoring'
		and summary_code=$2 and status <> 'closed' order by opened_at desc limit 1 for update`, memberID, finding.ReasonCode).Scan(&caseID)
	if errors.Is(err, pgx.ErrNoRows) {
		caseID = newID()
		var sequence int64
		if err := tx.QueryRow(ctx, `select nextval('compliance.aml_case_reference_seq')`).Scan(&sequence); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `insert into compliance.aml_case(
			id,reference,member_id,case_type,severity,summary_code,due_at
		) values($1,$2,$3,'transaction_monitoring',$4,$5,
			case when $4 in ('critical','high') then now()+interval '4 hours' else now()+interval '1 day' end)`,
			caseID, fmt.Sprintf("AML-%06d", sequence), memberID, finding.Severity, finding.ReasonCode)
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into compliance.aml_case_signal(case_id,signal_id) values($1,$2) on conflict do nothing`, caseID, signalID)
	return err
}

func attachScreeningSignalToAMLCase(ctx context.Context, tx pgx.Tx, memberID, signalID, summaryCode, severity string) (string, error) {
	var caseID string
	err := tx.QueryRow(ctx, `select id from compliance.aml_case where member_id=$1 and case_type='screening'
		and summary_code=$2 and status <> 'closed' order by opened_at desc limit 1 for update`, memberID, summaryCode).Scan(&caseID)
	if errors.Is(err, pgx.ErrNoRows) {
		caseID = newID()
		var sequence int64
		if err := tx.QueryRow(ctx, `select nextval('compliance.aml_case_reference_seq')`).Scan(&sequence); err != nil {
			return "", err
		}
		_, err = tx.Exec(ctx, `insert into compliance.aml_case(
			id,reference,member_id,case_type,severity,summary_code,due_at
		) values($1,$2,$3,'screening',$4,$5,
			case when $4 in ('critical','high') then now()+interval '4 hours' else now()+interval '1 day' end)`,
			caseID, fmt.Sprintf("AML-%06d", sequence), memberID, severity, summaryCode)
	}
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `insert into compliance.aml_case_signal(case_id,signal_id) values($1,$2) on conflict do nothing`, caseID, signalID)
	return caseID, err
}

package platform

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	minimumFamilyDistributionMembers = 2
	maximumFamilyDistributionMembers = 20
	totalBasisPoints                 = 10000
)

type familyDistributionAllocationInput struct {
	RecipientID      string `json:"recipientId"`
	ShareBasisPoints int    `json:"shareBasisPoints"`
}

type familyDistributionInput struct {
	Name        string                              `json:"name"`
	Allocations []familyDistributionAllocationInput `json:"allocations"`
}

type familyDistributionMember struct {
	RecipientID           string `json:"recipientId"`
	RecipientName         string `json:"recipientName"`
	ShareBasisPoints      int    `json:"shareBasisPoints"`
	PayoutMethod          string `json:"payoutMethod"`
	PayoutReferenceMasked string `json:"payoutReferenceMasked"`
}

type familyDistributionPlan struct {
	ID          string                     `json:"id"`
	Name        string                     `json:"name"`
	Status      string                     `json:"status"`
	Allocations []familyDistributionMember `json:"allocations"`
	CreatedAt   time.Time                  `json:"createdAt"`
	UpdatedAt   time.Time                  `json:"updatedAt"`
}

func validateFamilyDistribution(input *familyDistributionInput) error {
	input.Name = strings.TrimSpace(input.Name)
	if len(input.Name) < 2 || len(input.Name) > 100 {
		return errors.New("name must be between 2 and 100 characters")
	}
	if len(input.Allocations) < minimumFamilyDistributionMembers || len(input.Allocations) > maximumFamilyDistributionMembers {
		return errors.New("a plan requires between 2 and 20 recipients")
	}

	seen := make(map[string]struct{}, len(input.Allocations))
	total := 0
	for index := range input.Allocations {
		allocation := &input.Allocations[index]
		allocation.RecipientID = strings.TrimSpace(allocation.RecipientID)
		if allocation.RecipientID == "" {
			return errors.New("recipient id is required")
		}
		if _, exists := seen[allocation.RecipientID]; exists {
			return errors.New("recipients must be unique")
		}
		seen[allocation.RecipientID] = struct{}{}
		if allocation.ShareBasisPoints < 1 || allocation.ShareBasisPoints > totalBasisPoints {
			return errors.New("each share must be between 1 and 10000 basis points")
		}
		total += allocation.ShareBasisPoints
	}
	if total != totalBasisPoints {
		return errors.New("shares must total 10000 basis points")
	}
	return nil
}

func familyDistributionFingerprint(input familyDistributionInput) string {
	canonical := input
	canonical.Allocations = append([]familyDistributionAllocationInput(nil), input.Allocations...)
	sort.Slice(canonical.Allocations, func(i, j int) bool {
		return canonical.Allocations[i].RecipientID < canonical.Allocations[j].RecipientID
	})
	encoded, _ := json.Marshal(canonical)
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:])
}

func (s *Service) createFamilyDistribution(w http.ResponseWriter, r *http.Request) {
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}

	var input familyDistributionInput
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid family distribution request")
		return
	}
	if err := validateFamilyDistribution(&input); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	fingerprint := familyDistributionFingerprint(input)

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}
	defer tx.Rollback(r.Context())

	var existingID, existingFingerprint string
	err = tx.QueryRow(r.Context(), `select id,request_fingerprint from platform.family_distribution_plan where account_id=$1 and idempotency_key=$2`, acct.ID, idempotencyKey).Scan(&existingID, &existingFingerprint)
	if err == nil {
		if existingFingerprint != fingerprint {
			writeError(w, http.StatusConflict, "idempotency key was already used for a different request")
			return
		}
		plan, loadErr := familyDistributionFor(r.Context(), tx, acct.ID, existingID)
		if loadErr != nil {
			writeError(w, http.StatusInternalServerError, "family distribution unavailable")
			return
		}
		writeJSON(w, http.StatusOK, plan)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}

	recipientIDs := make([]string, 0, len(input.Allocations))
	for _, allocation := range input.Allocations {
		recipientIDs = append(recipientIDs, allocation.RecipientID)
	}
	var ownedRecipientCount int
	if err := tx.QueryRow(r.Context(), `select count(*) from platform.recipient where account_id=$1 and id=any($2)`, acct.ID, recipientIDs).Scan(&ownedRecipientCount); err != nil {
		writeError(w, http.StatusInternalServerError, "recipients unavailable")
		return
	}
	if ownedRecipientCount != len(recipientIDs) {
		writeError(w, http.StatusBadRequest, "one or more recipients are unavailable")
		return
	}

	planID := newID()
	tag, err := tx.Exec(r.Context(), `insert into platform.family_distribution_plan(id,account_id,name,idempotency_key,request_fingerprint) values($1,$2,$3,$4,$5) on conflict(account_id,idempotency_key) do nothing`, planID, acct.ID, input.Name, idempotencyKey, fingerprint)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution could not be saved")
		return
	}
	if tag.RowsAffected() == 0 {
		if err := tx.QueryRow(r.Context(), `select id,request_fingerprint from platform.family_distribution_plan where account_id=$1 and idempotency_key=$2`, acct.ID, idempotencyKey).Scan(&existingID, &existingFingerprint); err != nil {
			writeError(w, http.StatusInternalServerError, "family distribution unavailable")
			return
		}
		if existingFingerprint != fingerprint {
			writeError(w, http.StatusConflict, "idempotency key was already used for a different request")
			return
		}
		plan, loadErr := familyDistributionFor(r.Context(), tx, acct.ID, existingID)
		if loadErr != nil {
			writeError(w, http.StatusInternalServerError, "family distribution unavailable")
			return
		}
		writeJSON(w, http.StatusOK, plan)
		return
	}
	for position, allocation := range input.Allocations {
		if _, err := tx.Exec(r.Context(), `insert into platform.family_distribution_member(plan_id,account_id,recipient_id,share_basis_points,position) values($1,$2,$3,$4,$5)`, planID, acct.ID, allocation.RecipientID, allocation.ShareBasisPoints, position); err != nil {
			writeError(w, http.StatusInternalServerError, "family distribution could not be saved")
			return
		}
	}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'family_distribution.created','family_distribution',$2,$3,$4)`, acct.ID, planID, "Family distribution plan created", map[string]any{"name": input.Name, "recipientCount": len(input.Allocations)}); err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution could not be recorded")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution could not be saved")
		return
	}

	plan, err := s.familyDistributionForAccount(r.Context(), acct.ID, planID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, plan)
}

type familyDistributionQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func familyDistributionFor(ctx context.Context, db familyDistributionQuerier, accountID, planID string) (familyDistributionPlan, error) {
	var plan familyDistributionPlan
	err := db.QueryRow(ctx, `select id,name,status,created_at,updated_at from platform.family_distribution_plan where id=$1 and account_id=$2`, planID, accountID).Scan(&plan.ID, &plan.Name, &plan.Status, &plan.CreatedAt, &plan.UpdatedAt)
	if err != nil {
		return plan, err
	}

	rows, err := db.Query(ctx, `select m.recipient_id,r.display_name,m.share_basis_points,r.payout_method,r.payout_reference_masked from platform.family_distribution_member m join platform.recipient r on r.id=m.recipient_id where m.plan_id=$1 order by m.position`, planID)
	if err != nil {
		return plan, err
	}
	defer rows.Close()
	plan.Allocations = make([]familyDistributionMember, 0)
	for rows.Next() {
		var member familyDistributionMember
		if err := rows.Scan(&member.RecipientID, &member.RecipientName, &member.ShareBasisPoints, &member.PayoutMethod, &member.PayoutReferenceMasked); err != nil {
			return plan, err
		}
		plan.Allocations = append(plan.Allocations, member)
	}
	return plan, rows.Err()
}

func (s *Service) familyDistributionForAccount(ctx context.Context, accountID, planID string) (familyDistributionPlan, error) {
	return familyDistributionFor(ctx, s.db, accountID, planID)
}

func (s *Service) getFamilyDistribution(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	plan, err := s.familyDistributionForAccount(r.Context(), acct.ID, r.PathValue("planID"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "family distribution not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}
	writeJSON(w, http.StatusOK, plan)
}

func (s *Service) listFamilyDistributions(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	rows, err := s.db.Query(r.Context(), `select id from platform.family_distribution_plan where account_id=$1 order by created_at desc`, acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distributions unavailable")
		return
	}
	planIDs := make([]string, 0)
	for rows.Next() {
		var planID string
		if err := rows.Scan(&planID); err != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "family distributions unavailable")
			return
		}
		planIDs = append(planIDs, planID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeError(w, http.StatusInternalServerError, "family distributions unavailable")
		return
	}
	rows.Close()

	plans := make([]familyDistributionPlan, 0, len(planIDs))
	for _, planID := range planIDs {
		plan, err := s.familyDistributionForAccount(r.Context(), acct.ID, planID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "family distributions unavailable")
			return
		}
		plans = append(plans, plan)
	}
	writeJSON(w, http.StatusOK, map[string]any{"familyDistributions": plans})
}

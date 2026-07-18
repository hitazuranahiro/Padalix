package platform

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type familyExecutionItem struct {
	TransferID        string `json:"transferId"`
	Reference         string `json:"reference"`
	RecipientID       string `json:"recipientId"`
	RecipientName     string `json:"recipientName"`
	ShareBasisPoints  int    `json:"shareBasisPoints"`
	SourceAmount      string `json:"sourceAmount"`
	DestinationAmount string `json:"destinationAmount"`
	FeeAmount         string `json:"feeAmount"`
}

type familyExecution struct {
	ID                  string                `json:"id"`
	PlanID              string                `json:"planId"`
	PlanName            string                `json:"planName"`
	Status              string                `json:"status"`
	SourceAsset         string                `json:"sourceAsset"`
	DestinationCurrency string                `json:"destinationCurrency"`
	SourceAmount        string                `json:"sourceAmount"`
	FeeAmount           string                `json:"feeAmount"`
	Items               []familyExecutionItem `json:"items"`
	CreatedAt           time.Time             `json:"createdAt"`
	ConfirmedAt         *time.Time            `json:"confirmedAt,omitempty"`
}

type familyExecutionAllocation struct {
	RecipientID, RecipientName string
	ShareBasisPoints, Position int
}

func amountUnits(value string, maximum int64) (*big.Int, error) {
	amount, ok := new(big.Rat).SetString(strings.TrimSpace(value))
	if !ok || amount.Sign() <= 0 || amount.Cmp(new(big.Rat).SetInt64(maximum)) > 0 {
		return nil, fmt.Errorf("amount must be greater than zero and no more than %d", maximum)
	}
	scaled := new(big.Rat).Mul(amount, new(big.Rat).SetInt64(10_000_000))
	if !scaled.IsInt() {
		return nil, errors.New("amount supports at most seven decimal places")
	}
	return new(big.Int).Set(scaled.Num()), nil
}

func unitsDecimal(units *big.Int) string {
	negative := units.Sign() < 0
	abs := new(big.Int).Abs(new(big.Int).Set(units))
	whole, fraction := new(big.Int), new(big.Int)
	whole.QuoRem(abs, big.NewInt(10_000_000), fraction)
	prefix := ""
	if negative {
		prefix = "-"
	}
	return fmt.Sprintf("%s%s.%07d", prefix, whole.String(), fraction.Int64())
}

func (s *Service) executeFamilyDistribution(w http.ResponseWriter, r *http.Request) {
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}
	var input struct {
		Amount string `json:"amount"`
	}
	if decode(r, &input) != nil {
		writeError(w, http.StatusBadRequest, "invalid family distribution execution")
		return
	}
	totalUnits, err := amountUnits(input.Amount, 10_000)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	if !oneOf(acct.VerificationLevel, "verified", "enhanced", "business") {
		writeError(w, http.StatusForbidden, "verified account required")
		return
	}
	planID := strings.TrimSpace(r.PathValue("planID"))
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}
	defer tx.Rollback(r.Context())

	var existingID, existingAmount string
	err = tx.QueryRow(r.Context(), `select id,source_amount::text from platform.family_distribution_execution where account_id=$1 and idempotency_key=$2`, acct.ID, idempotencyKey).Scan(&existingID, &existingAmount)
	if err == nil {
		if existingAmount != unitsDecimal(totalUnits) {
			writeError(w, http.StatusConflict, "idempotency key already used with different execution parameters")
			return
		}
		execution, loadErr := familyExecutionFor(r.Context(), tx, acct.ID, existingID)
		if loadErr != nil {
			writeError(w, http.StatusInternalServerError, "family distribution unavailable")
			return
		}
		writeJSON(w, http.StatusOK, execution)
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "family distribution unavailable")
		return
	}

	var planName, planStatus string
	err = tx.QueryRow(r.Context(), `select name,status from platform.family_distribution_plan where id=$1 and account_id=$2 for update`, planID, acct.ID).Scan(&planName, &planStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "family distribution not found")
		return
	}
	if err != nil || planStatus != "active" {
		writeError(w, http.StatusConflict, "family distribution is not active")
		return
	}
	rows, err := tx.Query(r.Context(), `select m.recipient_id,r.display_name,m.share_basis_points,m.position from platform.family_distribution_member m join platform.recipient r on r.id=m.recipient_id and r.account_id=m.account_id where m.plan_id=$1 and m.account_id=$2 order by m.position`, planID, acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution members unavailable")
		return
	}
	allocations := make([]familyExecutionAllocation, 0)
	for rows.Next() {
		var allocation familyExecutionAllocation
		if rows.Scan(&allocation.RecipientID, &allocation.RecipientName, &allocation.ShareBasisPoints, &allocation.Position) != nil {
			rows.Close()
			writeError(w, http.StatusInternalServerError, "family distribution members unavailable")
			return
		}
		allocations = append(allocations, allocation)
	}
	rows.Close()
	if len(allocations) < minimumFamilyDistributionMembers {
		writeError(w, http.StatusConflict, "family distribution has insufficient recipients")
		return
	}

	type computedAllocation struct {
		familyExecutionAllocation
		source, destination, fee *big.Int
	}
	computed := make([]computedAllocation, 0, len(allocations))
	allocated := big.NewInt(0)
	totalFees := big.NewInt(0)
	for index, allocation := range allocations {
		share := new(big.Int)
		if index == len(allocations)-1 {
			share.Sub(totalUnits, allocated)
		} else {
			share.Mul(totalUnits, big.NewInt(int64(allocation.ShareBasisPoints)))
			share.Quo(share, big.NewInt(totalBasisPoints))
			allocated.Add(allocated, share)
		}
		if share.Sign() <= 0 {
			writeError(w, http.StatusBadRequest, "amount is too small for every recipient allocation")
			return
		}
		destination := new(big.Int).Mul(new(big.Int).Set(share), big.NewInt(57))
		fee := new(big.Int).Quo(new(big.Int).Add(new(big.Int).Set(share), big.NewInt(50)), big.NewInt(100))
		totalFees.Add(totalFees, fee)
		computed = append(computed, computedAllocation{familyExecutionAllocation: allocation, source: share, destination: destination, fee: fee})
	}
	debit := new(big.Int).Add(new(big.Int).Set(totalUnits), totalFees)
	var balance string
	err = tx.QueryRow(r.Context(), `update platform.wallet set available_balance=available_balance-$2::numeric,updated_at=now() where account_id=$1 and asset_code='USDC' and network='sandbox' and available_balance >= $2::numeric returning available_balance::text`, acct.ID, unitsDecimal(debit)).Scan(&balance)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusConflict, "insufficient sandbox balance")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "wallet update failed")
		return
	}

	executionID := newID()
	_, err = tx.Exec(r.Context(), `insert into platform.family_distribution_execution(id,plan_id,account_id,idempotency_key,source_amount,fee_amount,status,confirmed_at) values($1,$2,$3,$4,$5,$6,'processing',null)`, executionID, planID, acct.ID, idempotencyKey, unitsDecimal(totalUnits), unitsDecimal(totalFees))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution could not be recorded")
		return
	}
	for _, allocation := range computed {
		var sequence int64
		if tx.QueryRow(r.Context(), `select nextval('platform.transfer_reference_seq')`).Scan(&sequence) != nil {
			writeError(w, http.StatusInternalServerError, "transfer reference unavailable")
			return
		}
		reference := fmt.Sprintf("PDX-%d-%06d", time.Now().UTC().Year(), sequence)
		quoteID, transferID := newID(), newID()
		sourceAmount, destinationAmount, feeAmount := unitsDecimal(allocation.source), unitsDecimal(allocation.destination), unitsDecimal(allocation.fee)
		_, err = tx.Exec(r.Context(), `insert into platform.quote(id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,status,expires_at) values($1,$2,'USDC','PHP',$3,$4,$5,'57','consumed',now()+interval '5 minutes')`, quoteID, acct.ID, sourceAmount, destinationAmount, feeAmount)
		if err == nil {
			_, err = tx.Exec(r.Context(), `insert into platform.transfer(id,reference,account_id,quote_id,recipient_id,recipient_name,source_asset,destination_currency,source_amount,destination_amount,fee_amount,status,idempotency_key,settlement_mode,confirmed_at) values($1,$2,$3,$4,$5,$6,'USDC','PHP',$7,$8,$9,'confirmed',$10,'sandbox',now())`, transferID, reference, acct.ID, quoteID, allocation.RecipientID, allocation.RecipientName, sourceAmount, destinationAmount, feeAmount, idempotencyKey+":"+allocation.RecipientID)
		}
		if err == nil {
			_, err = tx.Exec(r.Context(), `insert into platform.transfer_evidence_event(id,transfer_id,evidence_type,provider_key,provider_environment,provider_transaction_id,provider_reference,provider_status,recorded_at) values($1,$2,'provider_receipt','padalix_sandbox','sandbox',$2,$3,'confirmed',now())`, newID(), transferID, reference)
		}
		if err == nil {
			_, err = tx.Exec(r.Context(), `insert into platform.family_distribution_execution_item(execution_id,recipient_id,transfer_id,share_basis_points,source_amount,destination_amount,fee_amount,position) values($1,$2,$3,$4,$5,$6,$7,$8)`, executionID, allocation.RecipientID, transferID, allocation.ShareBasisPoints, sourceAmount, destinationAmount, feeAmount, allocation.Position)
		}
		if err == nil {
			err = postSandboxFamilyLedger(r.Context(), tx, acct.ID, transferID, reference, allocation.source, allocation.fee)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "family distribution transfer failed")
			return
		}
	}
	_, err = tx.Exec(r.Context(), `update platform.family_distribution_execution set status='confirmed',confirmed_at=now() where id=$1`, executionID)
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'family_distribution.confirmed','family_distribution_execution',$2,$3,$4)`, acct.ID, executionID, "Family distribution executed", map[string]any{"planId": planID, "planName": planName, "recipientCount": len(computed), "sourceAmount": unitsDecimal(totalUnits), "balance": balance})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "family distribution could not be confirmed")
		return
	}
	execution, err := familyExecutionFor(r.Context(), s.db, acct.ID, executionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "family distribution receipt unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, execution)
}

func postSandboxFamilyLedger(ctx context.Context, tx pgx.Tx, accountID, transferID, reference string, source, fee *big.Int) error {
	ledgerID := newID()
	if _, err := tx.Exec(ctx, `insert into platform.ledger_transaction(id,reference,transfer_id) values($1,$2,$3)`, ledgerID, reference, transferID); err != nil {
		return err
	}
	var walletLedgerID string
	if err := tx.QueryRow(ctx, `select id from platform.ledger_account where account_id=$1 and code=$2`, accountID, "wallet:"+accountID+":usdc").Scan(&walletLedgerID); err != nil {
		return err
	}
	debit := new(big.Int).Add(new(big.Int).Set(source), fee)
	for index, posting := range []struct {
		accountID string
		amount    *big.Int
	}{{walletLedgerID, new(big.Int).Neg(debit)}, {"system-usdc-settlement", source}, {"system-usdc-fees", fee}} {
		if posting.amount.Sign() == 0 {
			continue
		}
		if _, err := tx.Exec(ctx, `insert into platform.ledger_posting(id,transaction_id,ledger_account_id,amount) values($1,$2,$3,$4)`, ledgerPostingID(ledgerID, index), ledgerID, posting.accountID, unitsDecimal(posting.amount)); err != nil {
			return err
		}
	}
	return nil
}

type familyExecutionQuerier interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

func familyExecutionFor(ctx context.Context, db familyExecutionQuerier, accountID, executionID string) (familyExecution, error) {
	var execution familyExecution
	err := db.QueryRow(ctx, `select e.id,e.plan_id,p.name,e.status,e.source_asset,e.destination_currency,e.source_amount::text,e.fee_amount::text,e.created_at,e.confirmed_at from platform.family_distribution_execution e join platform.family_distribution_plan p on p.id=e.plan_id where e.id=$1 and e.account_id=$2`, executionID, accountID).Scan(&execution.ID, &execution.PlanID, &execution.PlanName, &execution.Status, &execution.SourceAsset, &execution.DestinationCurrency, &execution.SourceAmount, &execution.FeeAmount, &execution.CreatedAt, &execution.ConfirmedAt)
	if err != nil {
		return execution, err
	}
	rows, err := db.Query(ctx, `select i.transfer_id,t.reference,i.recipient_id,r.display_name,i.share_basis_points,i.source_amount::text,i.destination_amount::text,i.fee_amount::text from platform.family_distribution_execution_item i join platform.transfer t on t.id=i.transfer_id join platform.recipient r on r.id=i.recipient_id where i.execution_id=$1 order by i.position`, executionID)
	if err != nil {
		return execution, err
	}
	defer rows.Close()
	execution.Items = make([]familyExecutionItem, 0)
	for rows.Next() {
		var item familyExecutionItem
		if err := rows.Scan(&item.TransferID, &item.Reference, &item.RecipientID, &item.RecipientName, &item.ShareBasisPoints, &item.SourceAmount, &item.DestinationAmount, &item.FeeAmount); err != nil {
			return execution, err
		}
		execution.Items = append(execution.Items, item)
	}
	return execution, rows.Err()
}

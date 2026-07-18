package platform

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

const (
	stellarClaimableReconcileTopic = "stellar.claimable.reconcile"
	claimableReclaimAfterSeconds   = int64((7 * 24 * time.Hour) / time.Second)
)

type stellarClaimableBalanceRecord struct {
	ID, AccountID, TransferID, Reference, WalletLinkID string
	Source, Claimant, AssetCode, AssetIssuer, Amount   string
	FeeAmount, UnsignedXDR, TransactionHash, BalanceID string
	Status, SubmissionStatus                           string
	ReclaimAfterSeconds, Ledger                        int64
	ExpiresAt                                          time.Time
	SubmittedAt, ConfirmedAt                           *time.Time
}

func buildStellarClaimableBalanceTransaction(account txnbuild.Account, claimant, amount, reference string, config StellarPaymentConfig) (*txnbuild.Transaction, string, string, string, error) {
	reclaimPredicate := txnbuild.NotPredicate(txnbuild.BeforeRelativeTimePredicate(claimableReclaimAfterSeconds))
	transaction, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        account,
		IncrementSequenceNum: true,
		Operations: []txnbuild.Operation{&txnbuild.CreateClaimableBalance{
			Amount: amount,
			Asset:  stellarPaymentAsset(config),
			Destinations: []txnbuild.Claimant{
				txnbuild.NewClaimant(claimant, nil),
				txnbuild.NewClaimant(account.GetAccountID(), &reclaimPredicate),
			},
		}},
		BaseFee:       txnbuild.MinBaseFee,
		Memo:          txnbuild.MemoText(reference),
		Preconditions: txnbuild.Preconditions{TimeBounds: txnbuild.NewTimeout(int64(stellarPaymentTTL.Seconds()))},
	})
	if err != nil {
		return nil, "", "", "", err
	}
	xdr, err := transaction.Base64()
	if err != nil {
		return nil, "", "", "", err
	}
	hash, err := transaction.HashHex(network.TestNetworkPassphrase)
	if err != nil {
		return nil, "", "", "", err
	}
	balanceID, err := transaction.ClaimableBalanceID(0)
	if err != nil {
		return nil, "", "", "", err
	}
	return transaction, xdr, strings.ToLower(hash), strings.ToLower(balanceID), nil
}

func (s *Service) prepareStellarClaimableBalance(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idempotencyKey) < 8 || len(idempotencyKey) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}
	var input struct {
		WalletID string `json:"walletId"`
		Claimant string `json:"claimant"`
		Amount   string `json:"amount"`
	}
	if decode(r, &input) != nil {
		writeError(w, http.StatusBadRequest, "invalid claimable balance request")
		return
	}
	input.WalletID, input.Claimant = strings.TrimSpace(input.WalletID), strings.TrimSpace(input.Claimant)
	if _, err := keypair.ParseAddress(input.Claimant); err != nil {
		writeError(w, http.StatusBadRequest, "claimant must be a valid Stellar public account")
		return
	}
	amount, err := normalizeStellarPaymentAmount(input.Amount)
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
	if existing, findErr := s.stellarClaimableByIdempotency(r.Context(), acct.ID, idempotencyKey); findErr == nil {
		if existing.WalletLinkID != input.WalletID || existing.Claimant != input.Claimant || existing.Amount != amount {
			writeError(w, http.StatusConflict, "idempotency key already used with different claimable balance parameters")
			return
		}
		writeJSON(w, http.StatusOK, stellarClaimableResponse(existing))
		return
	} else if !errors.Is(findErr, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "claimable balance unavailable")
		return
	}
	var source string
	err = s.db.QueryRow(r.Context(), `select public_key from platform.stellar_wallet_link where id=$1 and account_id=$2 and network='testnet' and unlinked_at is null`, input.WalletID, acct.ID).Scan(&source)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "verified testnet wallet required")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar wallet unavailable")
		return
	}
	if source == input.Claimant {
		writeError(w, http.StatusBadRequest, "source and claimant accounts must be different")
		return
	}
	sourceAccount, err := s.stellarPayments.network.LoadAccount(r.Context(), source)
	if err != nil {
		writeError(w, http.StatusBadGateway, "source account is not funded on Stellar testnet")
		return
	}
	var sequence int64
	if s.db.QueryRow(r.Context(), `select nextval('platform.transfer_reference_seq')`).Scan(&sequence) != nil {
		writeError(w, http.StatusInternalServerError, "claimable balance unavailable")
		return
	}
	reference := fmt.Sprintf("PDX-%d-%06d", time.Now().UTC().Year(), sequence)
	transaction, unsignedXDR, transactionHash, balanceID, err := buildStellarClaimableBalanceTransaction(sourceAccount, input.Claimant, amount, reference, s.stellarPayments.config)
	if err != nil {
		writeError(w, http.StatusBadGateway, "claimable balance transaction could not be prepared")
		return
	}
	feeAmount := decimal(new(big.Rat).SetFrac(big.NewInt(transaction.MaxFee()), big.NewInt(10_000_000)), 7)
	expiresAt := time.Now().UTC().Add(stellarPaymentTTL)
	quoteID, transferID, intentID := newID(), newID(), newID()
	recipientName := "Stellar claimant " + input.Claimant[:8] + "..." + input.Claimant[len(input.Claimant)-6:]
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claimable balance unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `insert into platform.quote(id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,status,expires_at) values($1,$2,$3,$3,$4,$4,$5,'1','consumed',$6)`, quoteID, acct.ID, s.stellarPayments.config.AssetCode, amount, feeAmount, expiresAt)
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into platform.transfer(id,reference,account_id,quote_id,recipient_name,source_asset,destination_currency,source_amount,destination_amount,fee_amount,status,idempotency_key,settlement_mode) values($1,$2,$3,$4,$5,$6,$6,$7,$7,$8,'prepared',$9,'stellar_claimable_testnet')`, transferID, reference, acct.ID, quoteID, recipientName, s.stellarPayments.config.AssetCode, amount, feeAmount, idempotencyKey)
	}
	if err == nil {
		var issuer any
		if s.stellarPayments.config.Issuer != "" {
			issuer = s.stellarPayments.config.Issuer
		}
		_, err = tx.Exec(r.Context(), `insert into platform.stellar_claimable_balance_intent(id,account_id,transfer_id,wallet_link_id,network,source_public_key,claimant_public_key,asset_code,asset_issuer,amount,unsigned_xdr,transaction_hash,claimable_balance_id,reclaim_after_seconds,expires_at) values($1,$2,$3,$4,'testnet',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, intentID, acct.ID, transferID, input.WalletID, source, input.Claimant, s.stellarPayments.config.AssetCode, issuer, amount, unsignedXDR, transactionHash, balanceID, claimableReclaimAfterSeconds, expiresAt)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'claimable_balance.prepared','stellar_claimable_balance',$2,'Stellar claimable balance prepared',$3)`, acct.ID, intentID, map[string]string{"reference": reference, "claimableBalanceId": balanceID})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		if existing, findErr := s.stellarClaimableByIdempotency(r.Context(), acct.ID, idempotencyKey); findErr == nil {
			writeJSON(w, http.StatusOK, stellarClaimableResponse(existing))
			return
		}
		writeError(w, http.StatusInternalServerError, "claimable balance could not be recorded")
		return
	}
	writeJSON(w, http.StatusCreated, stellarClaimableResponse(stellarClaimableBalanceRecord{ID: intentID, AccountID: acct.ID, TransferID: transferID, Reference: reference, WalletLinkID: input.WalletID, Source: source, Claimant: input.Claimant, AssetCode: s.stellarPayments.config.AssetCode, AssetIssuer: s.stellarPayments.config.Issuer, Amount: amount, FeeAmount: feeAmount, UnsignedXDR: unsignedXDR, TransactionHash: transactionHash, BalanceID: balanceID, ReclaimAfterSeconds: claimableReclaimAfterSeconds, Status: "prepared", ExpiresAt: expiresAt}))
}

func (s *Service) submitStellarClaimableBalance(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	var input struct {
		Transaction string `json:"transaction"`
	}
	if decode(r, &input) != nil || strings.TrimSpace(input.Transaction) == "" {
		writeError(w, http.StatusBadRequest, "signed Stellar transaction required")
		return
	}
	record, err := s.stellarClaimableByID(r.Context(), acct.ID, strings.TrimSpace(r.PathValue("intentID")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "claimable balance not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claimable balance unavailable")
		return
	}
	if record.Status != "prepared" {
		writeJSON(w, http.StatusOK, stellarClaimableResponse(record))
		return
	}
	if !time.Now().Before(record.ExpiresAt) {
		s.expireStellarClaimable(r.Context(), record)
		writeError(w, http.StatusConflict, "prepared claimable balance expired")
		return
	}
	if err := validateSignedStellarPayment(input.Transaction, record.TransactionHash, record.Source); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	submission, err := s.stellarPayments.network.Submit(r.Context(), input.Transaction)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Stellar RPC submission unavailable")
		return
	}
	switch strings.ToUpper(submission.Status) {
	case "PENDING", "DUPLICATE":
		tx, beginErr := s.db.Begin(r.Context())
		if beginErr != nil {
			writeError(w, http.StatusInternalServerError, "claimable balance submission could not be recorded")
			return
		}
		defer tx.Rollback(r.Context())
		_, err = tx.Exec(r.Context(), `update platform.stellar_claimable_balance_intent set status='submitted',submission_status=$1,submitted_at=coalesce(submitted_at,now()),updated_at=now() where id=$2 and account_id=$3 and status='prepared'`, submission.Status, record.ID, acct.ID)
		if err == nil {
			_, err = tx.Exec(r.Context(), `update platform.transfer set status='submitted' where id=$1 and account_id=$2 and status='prepared'`, record.TransferID, acct.ID)
		}
		if err == nil {
			_, err = tx.Exec(r.Context(), `insert into platform.outbox_job(id,topic,aggregate_type,aggregate_id,idempotency_key,payload,status,max_attempts) values($1,$2,'stellar_claimable_balance',$3,$4,$5,'pending',12) on conflict(idempotency_key) do nothing`, newID(), stellarClaimableReconcileTopic, record.ID, "stellar-claimable-reconcile:"+record.ID, map[string]string{"claimableBalanceIntentId": record.ID, "transactionHash": record.TransactionHash})
		}
		if err != nil || tx.Commit(r.Context()) != nil {
			writeError(w, http.StatusInternalServerError, "claimable balance submission could not be recorded")
			return
		}
		record.Status, record.SubmissionStatus = "submitted", submission.Status
		now := time.Now().UTC()
		record.SubmittedAt = &now
		writeJSON(w, http.StatusAccepted, stellarClaimableResponse(record))
	case "TRY_AGAIN_LATER":
		writeError(w, http.StatusServiceUnavailable, "Stellar RPC is busy; retry the same signed transaction")
	default:
		_ = failStellarClaimableContext(r.Context(), s.db, record, "rpc_rejected")
		writeError(w, http.StatusUnprocessableEntity, "Stellar rejected the transaction")
	}
}

func (s *Service) getStellarClaimableBalance(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	record, err := s.stellarClaimableByID(r.Context(), acct.ID, strings.TrimSpace(r.PathValue("intentID")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "claimable balance not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "claimable balance unavailable")
		return
	}
	if record.Status == "prepared" && !time.Now().Before(record.ExpiresAt) {
		s.expireStellarClaimable(r.Context(), record)
		record.Status = "expired"
	}
	if record.Status == "submitted" {
		result, lookupErr := s.stellarPayments.network.Transaction(r.Context(), record.TransactionHash)
		if lookupErr != nil {
			writeError(w, http.StatusBadGateway, "Stellar transaction status unavailable")
			return
		}
		switch strings.ToUpper(result.Status) {
		case "SUCCESS":
			if err := confirmStellarClaimableContext(r.Context(), s.db, record, int64(result.Ledger)); err != nil {
				slog.Error("claimable balance confirmation persistence failed", "intent_id", record.ID, "error", err)
				writeError(w, http.StatusInternalServerError, "claimable balance confirmation could not be recorded")
				return
			}
			record.Status, record.SubmissionStatus, record.Ledger = "confirmed", "SUCCESS", int64(result.Ledger)
			now := time.Now().UTC()
			record.ConfirmedAt = &now
		case "FAILED":
			_ = failStellarClaimableContext(r.Context(), s.db, record, "stellar_failed")
			record.Status = "failed"
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, stellarClaimableResponse(record))
}

const stellarClaimableSelect = `select i.id,i.account_id,i.transfer_id,t.reference,i.wallet_link_id,i.source_public_key,i.claimant_public_key,i.asset_code,coalesce(i.asset_issuer,''),i.amount::text,t.fee_amount::text,i.unsigned_xdr,i.transaction_hash,i.claimable_balance_id,i.reclaim_after_seconds,i.status,coalesce(i.submission_status,''),coalesce(i.ledger,0),i.expires_at,i.submitted_at,i.confirmed_at from platform.stellar_claimable_balance_intent i join platform.transfer t on t.id=i.transfer_id`

func (s *Service) stellarClaimableByID(ctx context.Context, accountID, id string) (stellarClaimableBalanceRecord, error) {
	return scanStellarClaimableRow(s.db.QueryRow(ctx, stellarClaimableSelect+` where i.account_id=$1 and i.id=$2`, accountID, id))
}

func (s *Service) stellarClaimableByIdempotency(ctx context.Context, accountID, key string) (stellarClaimableBalanceRecord, error) {
	return scanStellarClaimableRow(s.db.QueryRow(ctx, stellarClaimableSelect+` where i.account_id=$1 and t.idempotency_key=$2`, accountID, key))
}

func scanStellarClaimableRow(row rowScanner) (stellarClaimableBalanceRecord, error) {
	var record stellarClaimableBalanceRecord
	err := row.Scan(&record.ID, &record.AccountID, &record.TransferID, &record.Reference, &record.WalletLinkID, &record.Source, &record.Claimant, &record.AssetCode, &record.AssetIssuer, &record.Amount, &record.FeeAmount, &record.UnsignedXDR, &record.TransactionHash, &record.BalanceID, &record.ReclaimAfterSeconds, &record.Status, &record.SubmissionStatus, &record.Ledger, &record.ExpiresAt, &record.SubmittedAt, &record.ConfirmedAt)
	return record, err
}

func stellarClaimableResponse(record stellarClaimableBalanceRecord) map[string]any {
	return map[string]any{"id": record.ID, "reference": record.Reference, "status": record.Status, "network": "testnet", "networkPassphrase": network.TestNetworkPassphrase, "source": record.Source, "claimant": record.Claimant, "assetCode": record.AssetCode, "assetIssuer": record.AssetIssuer, "amount": record.Amount, "transaction": record.UnsignedXDR, "transactionHash": record.TransactionHash, "claimableBalanceId": record.BalanceID, "reclaimAfterSeconds": record.ReclaimAfterSeconds, "submissionStatus": record.SubmissionStatus, "ledger": record.Ledger, "expiresAt": record.ExpiresAt, "submittedAt": record.SubmittedAt, "confirmedAt": record.ConfirmedAt, "receiptUrl": func() string {
		if record.Status == "confirmed" {
			return "/receipts/" + record.Reference
		}
		return ""
	}(), "explorerUrl": "https://stellar.expert/explorer/testnet/tx/" + record.TransactionHash}
}

func (s *Service) expireStellarClaimable(ctx context.Context, record stellarClaimableBalanceRecord) {
	_, _ = s.db.Exec(ctx, `update platform.stellar_claimable_balance_intent set status='expired',failure_code='expired',updated_at=now() where id=$1 and account_id=$2 and status='prepared'`, record.ID, record.AccountID)
	_, _ = s.db.Exec(ctx, `update platform.transfer set status='failed' where id=$1 and account_id=$2 and status='prepared'`, record.TransferID, record.AccountID)
}

func failStellarClaimableContext(ctx context.Context, db *pgxpool.Pool, record stellarClaimableBalanceRecord, code string) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `update platform.stellar_claimable_balance_intent set status='failed',failure_code=$1,reconciliation_status='matched',reconciled_at=now(),updated_at=now() where id=$2 and account_id=$3 and status not in ('failed','confirmed')`, code, record.ID, record.AccountID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, `update platform.transfer set status='failed' where id=$1 and account_id=$2 and status <> 'confirmed'`, record.TransferID, record.AccountID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'claimable_balance.failed','stellar_claimable_balance',$2,'Stellar claimable balance failed',$3)`, record.AccountID, record.ID, map[string]string{"reference": record.Reference, "failureCode": code})
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func confirmStellarClaimableContext(ctx context.Context, db *pgxpool.Pool, record stellarClaimableBalanceRecord, ledger int64) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `update platform.stellar_claimable_balance_intent set status='confirmed',submission_status='SUCCESS',ledger=$1,confirmed_at=coalesce(confirmed_at,now()),reconciliation_status='matched',reconciled_at=now(),updated_at=now() where id=$2 and account_id=$3 and status <> 'confirmed'`, ledger, record.ID, record.AccountID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, `update platform.transfer set status='confirmed',confirmed_at=coalesce(confirmed_at,now()) where id=$1 and account_id=$2`, record.TransferID, record.AccountID); err != nil {
		return err
	}
	var issuer any
	if record.AssetIssuer != "" {
		issuer = record.AssetIssuer
	}
	_, err = tx.Exec(ctx, `insert into platform.transfer_evidence_event(id,transfer_id,evidence_type,provider_key,provider_environment,provider_transaction_id,provider_reference,provider_status,stellar_network,stellar_transaction_hash,stellar_ledger,stellar_source_account,stellar_destination_account,stellar_asset_code,stellar_asset_issuer,stellar_memo_type,stellar_memo,provider_more_info_url,recorded_at) values($1,$2,'stellar_transaction','stellar_testnet','testnet',$3,$4,'confirmed','testnet',$3::char(64),$5,$6,$7,$8,$9,'text',$10,$11,now()) on conflict do nothing`, newID(), record.TransferID, record.TransactionHash, record.BalanceID, ledger, record.Source, record.Claimant, record.AssetCode, issuer, record.Reference, "https://stellar.expert/explorer/testnet/tx/"+record.TransactionHash)
	if err != nil {
		return err
	}
	paymentRecord := stellarPaymentRecord{ID: record.ID, AccountID: record.AccountID, TransferID: record.TransferID, Reference: record.Reference, Source: record.Source, Destination: record.Claimant, AssetCode: record.AssetCode, AssetIssuer: record.AssetIssuer, Amount: record.Amount, FeeAmount: record.FeeAmount}
	if err = postStellarLedger(ctx, tx, paymentRecord); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'claimable_balance.confirmed','stellar_claimable_balance',$2,'Stellar claimable balance created',$3)`, record.AccountID, record.ID, map[string]string{"reference": record.Reference, "claimableBalanceId": record.BalanceID, "transactionHash": record.TransactionHash})
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

package platform

import (
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
)

type stellarPaymentRecord struct {
	ID               string
	AccountID        string
	TransferID       string
	Reference        string
	WalletLinkID     string
	Source           string
	Destination      string
	AssetCode        string
	AssetIssuer      string
	Amount           string
	UnsignedXDR      string
	TransactionHash  string
	Status           string
	SubmissionStatus string
	Ledger           int64
	ExpiresAt        time.Time
	SubmittedAt      *time.Time
	ConfirmedAt      *time.Time
}

func (s *Service) stellarPaymentConfig(w http.ResponseWriter, r *http.Request) {
	if s.stellarPayments == nil {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "network": "testnet", "assetCode": "XLM"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":   s.stellarPayments.Enabled(),
		"network":   s.stellarPayments.config.Network,
		"assetCode": s.stellarPayments.config.AssetCode,
		"issuer":    s.stellarPayments.config.Issuer,
	})
}

func (s *Service) stellarWalletBalances(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	walletID := strings.TrimSpace(r.PathValue("walletID"))
	var publicKey string
	err = s.db.QueryRow(r.Context(), `select public_key from platform.stellar_wallet_link
		where id=$1 and account_id=$2 and network='testnet' and unlinked_at is null`, walletID, acct.ID).Scan(&publicKey)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Stellar wallet not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar wallet unavailable")
		return
	}
	balances, err := s.stellarPayments.network.Balances(r.Context(), publicKey)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Stellar balance unavailable")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"publicKey": publicKey, "network": "testnet", "balances": balances})
}

func (s *Service) prepareStellarPayment(w http.ResponseWriter, r *http.Request) {
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
		WalletID    string `json:"walletId"`
		Destination string `json:"destination"`
		Amount      string `json:"amount"`
	}
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid Stellar payment request")
		return
	}
	input.WalletID = strings.TrimSpace(input.WalletID)
	input.Destination = strings.TrimSpace(input.Destination)
	if _, err := keypair.ParseAddress(input.Destination); err != nil {
		writeError(w, http.StatusBadRequest, "destination must be a valid Stellar public account")
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

	if existing, findErr := s.stellarPaymentByIdempotency(r, acct.ID, idempotencyKey); findErr == nil {
		writeJSON(w, http.StatusOK, stellarPaymentResponse(existing))
		return
	} else if !errors.Is(findErr, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "Stellar payment unavailable")
		return
	}

	var source string
	err = s.db.QueryRow(r.Context(), `select public_key from platform.stellar_wallet_link
		where id=$1 and account_id=$2 and network='testnet' and unlinked_at is null`, input.WalletID, acct.ID).Scan(&source)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "verified testnet wallet required")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar wallet unavailable")
		return
	}
	if source == input.Destination {
		writeError(w, http.StatusBadRequest, "source and destination accounts must be different")
		return
	}

	sourceAccount, err := s.stellarPayments.network.LoadAccount(r.Context(), source)
	if err != nil {
		writeError(w, http.StatusBadGateway, "source account is not funded on Stellar testnet")
		return
	}
	if _, err := s.stellarPayments.network.LoadAccount(r.Context(), input.Destination); err != nil {
		writeError(w, http.StatusBadRequest, "destination account is not funded on Stellar testnet")
		return
	}

	var sequence int64
	if err := s.db.QueryRow(r.Context(), `select nextval('platform.transfer_reference_seq')`).Scan(&sequence); err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar payment unavailable")
		return
	}
	reference := fmt.Sprintf("PDX-%d-%06d", time.Now().UTC().Year(), sequence)
	transaction, unsignedXDR, transactionHash, err := buildStellarPaymentTransaction(
		sourceAccount,
		input.Destination,
		amount,
		reference,
		s.stellarPayments.config,
	)
	if err != nil {
		writeError(w, http.StatusBadGateway, "Stellar transaction could not be prepared")
		return
	}
	feeAmount := decimal(new(big.Rat).SetFrac(big.NewInt(transaction.MaxFee()), big.NewInt(10_000_000)), 7)
	expiresAt := time.Now().UTC().Add(stellarPaymentTTL)
	quoteID, transferID, paymentID := newID(), newID(), newID()
	recipientName := "Stellar " + input.Destination[:8] + "..." + input.Destination[len(input.Destination)-6:]

	dbtx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar payment unavailable")
		return
	}
	defer dbtx.Rollback(r.Context())
	_, err = dbtx.Exec(r.Context(), `insert into platform.quote(
		id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,status,expires_at
	) values($1,$2,$3,$3,$4,$4,$5,'1','consumed',$6)`, quoteID, acct.ID, s.stellarPayments.config.AssetCode, amount, feeAmount, expiresAt)
	if err == nil {
		_, err = dbtx.Exec(r.Context(), `insert into platform.transfer(
			id,reference,account_id,quote_id,recipient_name,source_asset,destination_currency,
			source_amount,destination_amount,fee_amount,status,idempotency_key,settlement_mode
		) values($1,$2,$3,$4,$5,$6,$6,$7,$7,$8,'prepared',$9,'stellar_testnet')`,
			transferID, reference, acct.ID, quoteID, recipientName, s.stellarPayments.config.AssetCode, amount, feeAmount, idempotencyKey)
	}
	if err == nil {
		var issuer any
		if s.stellarPayments.config.Issuer != "" {
			issuer = s.stellarPayments.config.Issuer
		}
		_, err = dbtx.Exec(r.Context(), `insert into platform.stellar_payment_intent(
			id,account_id,transfer_id,wallet_link_id,network,source_public_key,destination_public_key,
			asset_code,asset_issuer,amount,unsigned_xdr,transaction_hash,expires_at
		) values($1,$2,$3,$4,'testnet',$5,$6,$7,$8,$9,$10,$11,$12)`,
			paymentID, acct.ID, transferID, input.WalletID, source, input.Destination,
			s.stellarPayments.config.AssetCode, issuer, amount, unsignedXDR, transactionHash, expiresAt)
	}
	if err == nil {
		_, err = dbtx.Exec(r.Context(), `insert into platform.activity_event(
			account_id,event_type,resource_type,resource_id,summary,metadata
		) values($1,'transfer.prepared','stellar_payment',$2,'Stellar testnet payment prepared',$3)`,
			acct.ID, transferID, map[string]string{"reference": reference, "asset": s.stellarPayments.config.AssetCode, "amount": amount})
	}
	if err != nil || dbtx.Commit(r.Context()) != nil {
		if existing, findErr := s.stellarPaymentByIdempotency(r, acct.ID, idempotencyKey); findErr == nil {
			writeJSON(w, http.StatusOK, stellarPaymentResponse(existing))
			return
		}
		writeError(w, http.StatusInternalServerError, "Stellar payment could not be recorded")
		return
	}

	writeJSON(w, http.StatusCreated, stellarPaymentResponse(stellarPaymentRecord{
		ID: paymentID, AccountID: acct.ID, TransferID: transferID, Reference: reference,
		WalletLinkID: input.WalletID, Source: source, Destination: input.Destination,
		AssetCode: s.stellarPayments.config.AssetCode, AssetIssuer: s.stellarPayments.config.Issuer,
		Amount: amount, UnsignedXDR: unsignedXDR, TransactionHash: transactionHash,
		Status: "prepared", ExpiresAt: expiresAt,
	}))
}

func (s *Service) submitStellarPayment(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	paymentID := strings.TrimSpace(r.PathValue("paymentID"))
	var input struct {
		Transaction string `json:"transaction"`
	}
	if err := decode(r, &input); err != nil || strings.TrimSpace(input.Transaction) == "" {
		writeError(w, http.StatusBadRequest, "signed Stellar transaction required")
		return
	}
	record, err := s.stellarPaymentByID(r, acct.ID, paymentID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Stellar payment not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar payment unavailable")
		return
	}
	if record.Status != "prepared" {
		writeJSON(w, http.StatusOK, stellarPaymentResponse(record))
		return
	}
	if !time.Now().Before(record.ExpiresAt) {
		s.expireStellarPayment(r, record)
		writeError(w, http.StatusConflict, "prepared Stellar payment expired")
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
		_, err = s.db.Exec(r.Context(), `update platform.stellar_payment_intent set
			status='submitted',submission_status=$1,submitted_at=coalesce(submitted_at,now()),updated_at=now()
			where id=$2 and account_id=$3 and status='prepared'`, submission.Status, record.ID, acct.ID)
		if err == nil {
			_, err = s.db.Exec(r.Context(), `update platform.transfer set status='submitted' where id=$1 and account_id=$2 and status='prepared'`, record.TransferID, acct.ID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "Stellar submission could not be recorded")
			return
		}
		record.Status = "submitted"
		record.SubmissionStatus = submission.Status
		now := time.Now().UTC()
		record.SubmittedAt = &now
		writeJSON(w, http.StatusAccepted, stellarPaymentResponse(record))
	case "TRY_AGAIN_LATER":
		writeError(w, http.StatusServiceUnavailable, "Stellar RPC is busy; retry the same signed transaction")
	default:
		s.failStellarPayment(r, record, "rpc_rejected")
		writeError(w, http.StatusUnprocessableEntity, "Stellar rejected the transaction")
	}
}

func (s *Service) getStellarPayment(w http.ResponseWriter, r *http.Request) {
	if !s.stellarPayments.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "Stellar testnet payments are disabled")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	record, err := s.stellarPaymentByID(r, acct.ID, strings.TrimSpace(r.PathValue("paymentID")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Stellar payment not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Stellar payment unavailable")
		return
	}
	if record.Status == "prepared" && !time.Now().Before(record.ExpiresAt) {
		s.expireStellarPayment(r, record)
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
			if err := s.confirmStellarPayment(r, record, int64(result.Ledger)); err != nil {
				slog.Error("Stellar confirmation persistence failed", "payment_id", record.ID, "transfer_id", record.TransferID, "error", err)
				writeError(w, http.StatusInternalServerError, "Stellar confirmation could not be recorded")
				return
			}
			record.Status = "confirmed"
			record.SubmissionStatus = "SUCCESS"
			record.Ledger = int64(result.Ledger)
			now := time.Now().UTC()
			record.ConfirmedAt = &now
		case "FAILED":
			s.failStellarPayment(r, record, "stellar_failed")
			record.Status = "failed"
		}
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, stellarPaymentResponse(record))
}

func (s *Service) stellarPaymentByIdempotency(r *http.Request, accountID, idempotencyKey string) (stellarPaymentRecord, error) {
	return s.scanStellarPayment(s.db.QueryRow(r.Context(), stellarPaymentSelect+` where i.account_id=$1 and t.idempotency_key=$2`, accountID, idempotencyKey))
}

func (s *Service) stellarPaymentByID(r *http.Request, accountID, paymentID string) (stellarPaymentRecord, error) {
	return s.scanStellarPayment(s.db.QueryRow(r.Context(), stellarPaymentSelect+` where i.account_id=$1 and i.id=$2`, accountID, paymentID))
}

const stellarPaymentSelect = `select
	i.id,i.account_id,i.transfer_id,t.reference,i.wallet_link_id,i.source_public_key,i.destination_public_key,
	i.asset_code,coalesce(i.asset_issuer,''),i.amount::text,i.unsigned_xdr,i.transaction_hash,i.status,
	coalesce(i.submission_status,''),coalesce(i.ledger,0),i.expires_at,i.submitted_at,i.confirmed_at
from platform.stellar_payment_intent i join platform.transfer t on t.id=i.transfer_id`

func (s *Service) scanStellarPayment(row rowScanner) (stellarPaymentRecord, error) {
	var record stellarPaymentRecord
	err := row.Scan(
		&record.ID, &record.AccountID, &record.TransferID, &record.Reference, &record.WalletLinkID,
		&record.Source, &record.Destination, &record.AssetCode, &record.AssetIssuer, &record.Amount,
		&record.UnsignedXDR, &record.TransactionHash, &record.Status, &record.SubmissionStatus,
		&record.Ledger, &record.ExpiresAt, &record.SubmittedAt, &record.ConfirmedAt,
	)
	return record, err
}

func stellarPaymentResponse(record stellarPaymentRecord) map[string]any {
	return map[string]any{
		"id": record.ID, "reference": record.Reference, "status": record.Status,
		"network": "testnet", "networkPassphrase": network.TestNetworkPassphrase,
		"source": record.Source, "destination": record.Destination,
		"assetCode": record.AssetCode, "assetIssuer": record.AssetIssuer, "amount": record.Amount,
		"transaction": record.UnsignedXDR, "transactionHash": record.TransactionHash,
		"submissionStatus": record.SubmissionStatus, "ledger": record.Ledger,
		"expiresAt": record.ExpiresAt, "submittedAt": record.SubmittedAt, "confirmedAt": record.ConfirmedAt,
		"receiptUrl": func() string {
			if record.Status == "confirmed" {
				return "/receipts/" + record.Reference
			}
			return ""
		}(),
		"explorerUrl": "https://stellar.expert/explorer/testnet/tx/" + record.TransactionHash,
	}
}

func (s *Service) expireStellarPayment(r *http.Request, record stellarPaymentRecord) {
	_, _ = s.db.Exec(r.Context(), `update platform.stellar_payment_intent set status='expired',failure_code='expired',updated_at=now()
		where id=$1 and account_id=$2 and status='prepared'`, record.ID, record.AccountID)
	_, _ = s.db.Exec(r.Context(), `update platform.transfer set status='failed' where id=$1 and account_id=$2 and status='prepared'`, record.TransferID, record.AccountID)
}

func (s *Service) failStellarPayment(r *http.Request, record stellarPaymentRecord, code string) {
	tag, _ := s.db.Exec(r.Context(), `update platform.stellar_payment_intent set status='failed',failure_code=$1,updated_at=now()
		where id=$2 and account_id=$3 and status <> 'failed'`, code, record.ID, record.AccountID)
	_, _ = s.db.Exec(r.Context(), `update platform.transfer set status='failed' where id=$1 and account_id=$2 and status <> 'confirmed'`, record.TransferID, record.AccountID)
	if tag.RowsAffected() > 0 {
		_, _ = s.db.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
			values($1,'transfer.failed','stellar_payment',$2,'Stellar testnet payment failed',$3)`, record.AccountID, record.TransferID, map[string]string{"reference": record.Reference, "failureCode": code})
	}
}

func (s *Service) confirmStellarPayment(r *http.Request, record stellarPaymentRecord, ledger int64) error {
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(r.Context())
	tag, err := tx.Exec(r.Context(), `update platform.stellar_payment_intent set
		status='confirmed',submission_status='SUCCESS',ledger=$1,confirmed_at=coalesce(confirmed_at,now()),updated_at=now()
		where id=$2 and account_id=$3 and status <> 'confirmed'`, ledger, record.ID, record.AccountID)
	if err != nil {
		return fmt.Errorf("update payment intent: %w", err)
	}
	if tag.RowsAffected() == 0 {
		if err := tx.Commit(r.Context()); err != nil {
			return fmt.Errorf("commit existing confirmation: %w", err)
		}
		return nil
	}
	if _, err = tx.Exec(r.Context(), `update platform.transfer set status='confirmed',confirmed_at=coalesce(confirmed_at,now())
		where id=$1 and account_id=$2`, record.TransferID, record.AccountID); err != nil {
		return fmt.Errorf("update transfer: %w", err)
	}
	var issuer any
	if record.AssetIssuer != "" {
		issuer = record.AssetIssuer
	}
	_, err = tx.Exec(r.Context(), `insert into platform.transfer_evidence_event(
		id,transfer_id,evidence_type,provider_key,provider_environment,provider_transaction_id,
		provider_reference,provider_status,stellar_network,stellar_transaction_hash,stellar_ledger,
		stellar_source_account,stellar_destination_account,stellar_asset_code,stellar_asset_issuer,
		stellar_memo_type,stellar_memo,provider_more_info_url,recorded_at
	) values($1,$2,'stellar_transaction','stellar_testnet','testnet',$3::text,$4,'confirmed','testnet',$3::char(64),$5,$6,$7,$8,$9,'text',$4,$10,now())
		on conflict do nothing`, newID(), record.TransferID, record.TransactionHash, record.Reference, ledger,
		record.Source, record.Destination, record.AssetCode, issuer,
		"https://stellar.expert/explorer/testnet/tx/"+record.TransactionHash)
	if err != nil {
		return fmt.Errorf("insert transaction evidence: %w", err)
	}
	_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'transfer.confirmed','transfer',$2,'Stellar testnet payment confirmed',$3)`, record.AccountID, record.TransferID,
		map[string]string{"reference": record.Reference, "transactionHash": record.TransactionHash, "amount": record.Amount, "asset": record.AssetCode})
	if err != nil {
		return fmt.Errorf("insert confirmation activity: %w", err)
	}
	if err := tx.Commit(r.Context()); err != nil {
		return fmt.Errorf("commit confirmation: %w", err)
	}
	return nil
}

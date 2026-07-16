package platform

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const transferReceiptSelect = `select
	t.id,t.reference,t.status,t.recipient_name,t.source_asset,t.source_amount::text,
	t.destination_currency,t.destination_amount::text,t.fee_amount::text,q.rate::text,
	t.created_at,coalesce(t.confirmed_at,t.created_at),
	coalesce(e.provider_key,'padalix_sandbox'),coalesce(pc.display_name,'Padalix Sandbox'),
	coalesce(e.provider_environment,'sandbox'),coalesce(e.provider_transaction_id,''),
	coalesce(e.provider_reference,''),coalesce(e.provider_status,t.status),
	coalesce(e.stellar_network,''),coalesce(e.stellar_transaction_hash,''),
	coalesce(e.stellar_ledger,0),coalesce(e.stellar_source_account,''),
	coalesce(e.stellar_destination_account,''),coalesce(e.stellar_asset_code,''),
	coalesce(e.stellar_asset_issuer,''),coalesce(e.stellar_memo_type,''),
	coalesce(e.stellar_memo,''),coalesce(e.provider_more_info_url,''),e.recorded_at
from platform.transfer t
join platform.quote q on q.id=t.quote_id
left join lateral (
	select * from platform.transfer_evidence_event evidence
	where evidence.transfer_id=t.id order by evidence.recorded_at desc limit 1
) e on true
left join platform.payment_connector pc on pc.provider_key=e.provider_key`

type transferReceipt struct {
	Version                   int        `json:"version"`
	ReceiptNumber             string     `json:"receiptNumber"`
	TransferID                string     `json:"transferId"`
	Reference                 string     `json:"reference"`
	Status                    string     `json:"status"`
	RecipientName             string     `json:"recipientName"`
	SourceAsset               string     `json:"sourceAsset"`
	SourceAmount              string     `json:"sourceAmount"`
	DestinationCurrency       string     `json:"destinationCurrency"`
	DestinationAmount         string     `json:"destinationAmount"`
	FeeAmount                 string     `json:"feeAmount"`
	Rate                      string     `json:"rate"`
	CreatedAt                 time.Time  `json:"createdAt"`
	ConfirmedAt               time.Time  `json:"confirmedAt"`
	ProviderKey               string     `json:"providerKey"`
	ProviderName              string     `json:"providerName"`
	ProviderEnvironment       string     `json:"providerEnvironment"`
	ProviderTransactionID     string     `json:"providerTransactionId,omitempty"`
	ProviderReference         string     `json:"providerReference,omitempty"`
	ProviderStatus            string     `json:"providerStatus"`
	ProviderMoreInfoURL       string     `json:"providerMoreInfoUrl,omitempty"`
	StellarNetwork            string     `json:"stellarNetwork,omitempty"`
	StellarTransactionHash    string     `json:"stellarTransactionHash,omitempty"`
	StellarLedger             int64      `json:"stellarLedger,omitempty"`
	StellarSourceAccount      string     `json:"stellarSourceAccount,omitempty"`
	StellarDestinationAccount string     `json:"stellarDestinationAccount,omitempty"`
	StellarAssetCode          string     `json:"stellarAssetCode,omitempty"`
	StellarAssetIssuer        string     `json:"stellarAssetIssuer,omitempty"`
	StellarMemoType           string     `json:"stellarMemoType,omitempty"`
	StellarMemo               string     `json:"stellarMemo,omitempty"`
	StellarExplorerURL        string     `json:"stellarExplorerUrl,omitempty"`
	StellarHorizonURL         string     `json:"stellarHorizonUrl,omitempty"`
	EvidenceRecordedAt        *time.Time `json:"evidenceRecordedAt,omitempty"`
	Digest                    string     `json:"digest"`
}

type rowScanner interface{ Scan(...any) error }

func scanTransferReceipt(row rowScanner) (transferReceipt, error) {
	receipt := transferReceipt{Version: 1}
	err := row.Scan(
		&receipt.TransferID, &receipt.Reference, &receipt.Status, &receipt.RecipientName,
		&receipt.SourceAsset, &receipt.SourceAmount, &receipt.DestinationCurrency,
		&receipt.DestinationAmount, &receipt.FeeAmount, &receipt.Rate, &receipt.CreatedAt,
		&receipt.ConfirmedAt, &receipt.ProviderKey, &receipt.ProviderName,
		&receipt.ProviderEnvironment, &receipt.ProviderTransactionID,
		&receipt.ProviderReference, &receipt.ProviderStatus, &receipt.StellarNetwork,
		&receipt.StellarTransactionHash, &receipt.StellarLedger, &receipt.StellarSourceAccount,
		&receipt.StellarDestinationAccount, &receipt.StellarAssetCode,
		&receipt.StellarAssetIssuer, &receipt.StellarMemoType, &receipt.StellarMemo,
		&receipt.ProviderMoreInfoURL, &receipt.EvidenceRecordedAt,
	)
	if err != nil {
		return transferReceipt{}, err
	}
	receipt.ReceiptNumber = receipt.Reference
	if receipt.StellarTransactionHash != "" {
		explorerNetwork := "testnet"
		horizonOrigin := "https://horizon-testnet.stellar.org"
		if receipt.StellarNetwork == "mainnet" {
			explorerNetwork = "public"
			horizonOrigin = "https://horizon.stellar.org"
		}
		receipt.StellarExplorerURL = fmt.Sprintf("https://stellar.expert/explorer/%s/tx/%s", explorerNetwork, receipt.StellarTransactionHash)
		receipt.StellarHorizonURL = fmt.Sprintf("%s/transactions/%s", horizonOrigin, receipt.StellarTransactionHash)
	}
	receipt.Digest = receiptDigest(receipt)
	return receipt, nil
}

func receiptDigest(receipt transferReceipt) string {
	receipt.Digest = ""
	payload, _ := json.Marshal(receipt)
	digest := sha256.Sum256(payload)
	return hex.EncodeToString(digest[:])
}

func (s *Service) receiptFor(ctx context.Context, accountID, reference string) (transferReceipt, error) {
	return scanTransferReceipt(s.db.QueryRow(ctx, transferReceiptSelect+` where t.account_id=$1 and t.reference=$2`, accountID, reference))
}

func (s *Service) receiptsFor(ctx context.Context, accountID string) ([]transferReceipt, error) {
	rows, err := s.db.Query(ctx, transferReceiptSelect+` where t.account_id=$1 order by t.created_at desc limit 1000`, accountID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	receipts := make([]transferReceipt, 0)
	for rows.Next() {
		receipt, scanErr := scanTransferReceipt(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		receipts = append(receipts, receipt)
	}
	return receipts, rows.Err()
}

func (s *Service) listTransfers(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	receipts, err := s.receiptsFor(r.Context(), acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transfers unavailable")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"transfers": receipts})
}

func (s *Service) getTransfer(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	receipt, err := s.receiptFor(r.Context(), acct.ID, strings.TrimSpace(r.PathValue("reference")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "transfer not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transfer unavailable")
		return
	}
	w.Header().Set("Cache-Control", "private, no-store")
	writeJSON(w, http.StatusOK, map[string]any{"receipt": receipt})
}

func (s *Service) exportTransferReceipt(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	receipt, err := s.receiptFor(r.Context(), acct.ID, strings.TrimSpace(r.PathValue("reference")))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "transfer not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "receipt unavailable")
		return
	}
	format := exportFormat(r)
	recordExport(r.Context(), s, acct.ID, receipt.TransferID, format, "receipt", 1)
	writeReceiptExport(w, format, []transferReceipt{receipt}, receipt.Reference)
}

func (s *Service) exportTransfers(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	receipts, err := s.receiptsFor(r.Context(), acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "export unavailable")
		return
	}
	format := exportFormat(r)
	recordExport(r.Context(), s, acct.ID, "", format, "ledger", len(receipts))
	writeReceiptExport(w, format, receipts, "padalix-transfers")
}

func exportFormat(r *http.Request) string {
	if strings.EqualFold(r.URL.Query().Get("format"), "csv") {
		return "csv"
	}
	return "json"
}

func recordExport(ctx context.Context, s *Service, accountID, resourceID, format, scope string, count int) {
	if resourceID == "" {
		resourceID = accountID
	}
	_, _ = s.db.Exec(ctx, `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'transfer.exported','transfer_export',$2,'Transfer data exported',$3)`, accountID, resourceID, map[string]any{"format": format, "scope": scope, "count": count})
}

func writeReceiptExport(w http.ResponseWriter, format string, receipts []transferReceipt, filename string) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.%s"`, filename, format))
	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		writer := csv.NewWriter(w)
		_ = writer.Write([]string{"reference", "status", "created_at", "confirmed_at", "recipient", "source_amount", "source_asset", "fee_amount", "destination_amount", "destination_currency", "rate", "provider", "provider_environment", "provider_transaction_id", "provider_reference", "provider_status", "stellar_network", "stellar_transaction_hash", "stellar_ledger", "stellar_asset_issuer", "stellar_memo", "receipt_digest"})
		for _, receipt := range receipts {
			_ = writer.Write([]string{receipt.Reference, receipt.Status, receipt.CreatedAt.Format(time.RFC3339), receipt.ConfirmedAt.Format(time.RFC3339), receipt.RecipientName, receipt.SourceAmount, receipt.SourceAsset, receipt.FeeAmount, receipt.DestinationAmount, receipt.DestinationCurrency, receipt.Rate, receipt.ProviderName, receipt.ProviderEnvironment, receipt.ProviderTransactionID, receipt.ProviderReference, receipt.ProviderStatus, receipt.StellarNetwork, receipt.StellarTransactionHash, strconv.FormatInt(receipt.StellarLedger, 10), receipt.StellarAssetIssuer, receipt.StellarMemo, receipt.Digest})
		}
		writer.Flush()
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(map[string]any{"schemaVersion": 1, "generatedAt": time.Now().UTC(), "count": len(receipts), "transfers": receipts})
}

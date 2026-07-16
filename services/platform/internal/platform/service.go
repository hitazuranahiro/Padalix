package platform

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	db                 *pgxpool.Pool
	internalToken      string
	stellarWalletAuth  *StellarWalletAuth
	stellarPayments    *StellarPaymentService
	complianceEnforced bool
}

type identity struct {
	Subject string
	Email   string
	Name    string
}

type account struct {
	ID                string `json:"id"`
	MemberID          string `json:"memberId"`
	Name              string `json:"name"`
	Email             string `json:"email"`
	VerificationLevel string `json:"verificationLevel"`
	AccountStatus     string `json:"accountStatus"`
	Balance           string `json:"balance"`
	Asset             string `json:"asset"`
	Network           string `json:"network"`
	KYCReference      string `json:"kycReference,omitempty"`
	KYCStatus         string `json:"kycStatus,omitempty"`
}

type contextKey string

const identityKey contextKey = "identity"

func New(db *pgxpool.Pool, internalToken string) *Service {
	auth, _ := NewStellarWalletAuth(StellarWalletConfig{
		Network: "testnet", HomeDomain: "padalix.com", WebAuthDomain: "api.padalix.com",
	})
	return NewWithStellarWalletAuth(db, internalToken, auth)
}

func NewWithStellarWalletAuth(db *pgxpool.Pool, internalToken string, auth *StellarWalletAuth) *Service {
	return NewWithStellarServices(db, internalToken, auth, nil)
}

func NewWithStellarServices(db *pgxpool.Pool, internalToken string, auth *StellarWalletAuth, payments *StellarPaymentService) *Service {
	return &Service{
		db: db, internalToken: internalToken, stellarWalletAuth: auth, stellarPayments: payments,
		complianceEnforced: strings.EqualFold(strings.TrimSpace(os.Getenv("COMPLIANCE_ENFORCEMENT_ENABLED")), "true"),
	}
}

func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /health/worker", s.workerHealth)
	mux.HandleFunc("GET /internal/operations/metrics", s.operationalMetrics)
	mux.Handle("GET /v1/account", s.authenticate(http.HandlerFunc(s.getAccount)))
	mux.Handle("GET /v1/dashboard", s.authenticate(http.HandlerFunc(s.getDashboard)))
	mux.Handle("GET /v1/payment-methods", s.authenticate(http.HandlerFunc(s.listPaymentMethods)))
	mux.Handle("GET /v1/activity", s.authenticate(http.HandlerFunc(s.getActivity)))
	mux.Handle("GET /v1/recipients", s.authenticate(http.HandlerFunc(s.getRecipients)))
	mux.Handle("POST /v1/recipients", s.authenticate(http.HandlerFunc(s.createRecipient)))
	mux.Handle("POST /v1/quotes", s.authenticate(http.HandlerFunc(s.createQuote)))
	mux.Handle("POST /v1/transfers", s.authenticate(http.HandlerFunc(s.createTransfer)))
	mux.Handle("GET /v1/transfers", s.authenticate(http.HandlerFunc(s.listTransfers)))
	mux.Handle("GET /v1/transfers/{reference}", s.authenticate(http.HandlerFunc(s.getTransfer)))
	mux.Handle("GET /v1/transfers/{reference}/receipt", s.authenticate(http.HandlerFunc(s.exportTransferReceipt)))
	mux.Handle("GET /v1/exports/transfers", s.authenticate(http.HandlerFunc(s.exportTransfers)))
	mux.Handle("POST /v1/stellar-wallets/challenge", s.authenticate(http.HandlerFunc(s.createStellarWalletChallenge)))
	mux.Handle("POST /v1/stellar-wallets/verify", s.authenticate(http.HandlerFunc(s.verifyStellarWalletChallenge)))
	mux.Handle("GET /v1/stellar-wallets", s.authenticate(http.HandlerFunc(s.listStellarWallets)))
	mux.Handle("DELETE /v1/stellar-wallets/{walletID}", s.authenticate(http.HandlerFunc(s.unlinkStellarWallet)))
	mux.Handle("GET /v1/stellar-wallets/{walletID}/balances", s.authenticate(http.HandlerFunc(s.stellarWalletBalances)))
	mux.Handle("GET /v1/stellar-payments/config", s.authenticate(http.HandlerFunc(s.stellarPaymentConfig)))
	mux.Handle("POST /v1/stellar-payments/prepare", s.authenticate(http.HandlerFunc(s.prepareStellarPayment)))
	mux.Handle("POST /v1/stellar-payments/{paymentID}/submit", s.authenticate(http.HandlerFunc(s.submitStellarPayment)))
	mux.Handle("GET /v1/stellar-payments/{paymentID}", s.authenticate(http.HandlerFunc(s.getStellarPayment)))
	return withHTTPBoundary(mux)
}

func (s *Service) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "padalix-platform"})
}

func (s *Service) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if len(supplied) != len(s.internalToken) || subtle.ConstantTimeCompare([]byte(supplied), []byte(s.internalToken)) != 1 {
			writeError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		id := identity{
			Subject: strings.TrimSpace(r.Header.Get("X-Padalix-Subject")),
			Email:   strings.ToLower(strings.TrimSpace(r.Header.Get("X-Padalix-Email"))),
			Name:    strings.TrimSpace(r.Header.Get("X-Padalix-Name")),
		}
		if id.Subject == "" || id.Name == "" || !strings.Contains(id.Email, "@") {
			writeError(w, http.StatusUnauthorized, "invalid identity")
			return
		}
		if _, err := s.ensureAccount(r.Context(), id); err != nil {
			writeError(w, http.StatusInternalServerError, "account initialization failed")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey, id)))
	})
}

func (s *Service) ensureAccount(ctx context.Context, id identity) (string, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)

	memberID := newID()
	if err := tx.QueryRow(ctx, `insert into identity.member(id,auth_subject,email,full_name,email_verified,account_status)
		values($1,$2,$3,$4,false,'active') on conflict(auth_subject) do update set email=excluded.email,full_name=excluded.full_name,updated_at=now() returning id`, memberID, id.Subject, id.Email, id.Name).Scan(&memberID); err != nil {
		return "", err
	}
	accountID := newID()
	tag, err := tx.Exec(ctx, `insert into platform.account(id,auth_subject,member_id) values($1,$2,$3) on conflict(auth_subject) do nothing`, accountID, id.Subject, memberID)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		if err := tx.QueryRow(ctx, `select id from platform.account where auth_subject=$1`, id.Subject).Scan(&accountID); err != nil {
			return "", err
		}
	}
	if _, err := tx.Exec(ctx, `insert into platform.wallet(id,account_id,asset_code,network) values($1,$2,'USDC','sandbox') on conflict(account_id,asset_code,network) do nothing`, newID(), accountID); err != nil {
		return "", err
	}
	if _, err := tx.Exec(ctx, `insert into platform.ledger_account(id,account_id,code,asset_code) values($1,$2,$3,'USDC') on conflict(code) do nothing`, newID(), accountID, "wallet:"+accountID+":usdc"); err != nil {
		return "", err
	}
	if tag.RowsAffected() > 0 {
		_, err = tx.Exec(ctx, `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary) values($1,'account.created','account',$1,'Sandbox account opened')`, accountID)
		if err != nil {
			return "", err
		}
	}
	return accountID, tx.Commit(ctx)
}

func (s *Service) accountFor(ctx context.Context, subject string) (account, error) {
	var result account
	err := s.db.QueryRow(ctx, `select a.id,m.id,m.full_name,m.email,m.verification_level,m.account_status,w.available_balance::text,w.asset_code,w.network,
		coalesce(k.reference,''),coalesce(k.status,'') from platform.account a join identity.member m on m.id=a.member_id
		join platform.wallet w on w.account_id=a.id and w.asset_code='USDC' and w.network='sandbox'
		left join lateral(select reference,status from compliance.kyc_case where member_id=m.id order by created_at desc limit 1) k on true where a.auth_subject=$1`, subject).Scan(
		&result.ID, &result.MemberID, &result.Name, &result.Email, &result.VerificationLevel, &result.AccountStatus, &result.Balance, &result.Asset, &result.Network, &result.KYCReference, &result.KYCStatus)
	return result, err
}

func (s *Service) getAccount(w http.ResponseWriter, r *http.Request) {
	result, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type activityItem struct {
	EventType    string         `json:"eventType"`
	ResourceType string         `json:"resourceType"`
	ResourceID   string         `json:"resourceId"`
	Summary      string         `json:"summary"`
	Metadata     map[string]any `json:"metadata"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func (s *Service) activityFor(ctx context.Context, accountID string, limit int) ([]activityItem, error) {
	rows, err := s.db.Query(ctx, `select event_type,resource_type,resource_id,summary,metadata,created_at from platform.activity_event where account_id=$1 order by created_at desc limit $2`, accountID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]activityItem, 0)
	for rows.Next() {
		var item activityItem
		if err := rows.Scan(&item.EventType, &item.ResourceType, &item.ResourceID, &item.Summary, &item.Metadata, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Service) getDashboard(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dashboard unavailable")
		return
	}
	activity, err := s.activityFor(r.Context(), acct.ID, 4)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "dashboard unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"account": acct, "activity": activity})
}

func (s *Service) getActivity(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity unavailable")
		return
	}
	items, err := s.activityFor(r.Context(), acct.ID, 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "activity unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"activity": items})
}

func (s *Service) getRecipients(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "recipients unavailable")
		return
	}
	rows, err := s.db.Query(r.Context(), `select id,display_name,country_code,payout_method,payout_reference_masked,created_at from platform.recipient where account_id=$1 order by created_at desc`, acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "recipients unavailable")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, name, country, method, masked string
		var createdAt time.Time
		if err := rows.Scan(&id, &name, &country, &method, &masked, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "recipients unavailable")
			return
		}
		items = append(items, map[string]any{"id": id, "name": name, "countryCode": country, "payoutMethod": method, "payoutReferenceMasked": masked, "createdAt": createdAt})
	}
	writeJSON(w, http.StatusOK, map[string]any{"recipients": items})
}

func (s *Service) createRecipient(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	var input struct{ Name, CountryCode, PayoutMethod, PaymentMethodID, PayoutReference string }
	if err := decode(r, &input); err != nil || len(strings.TrimSpace(input.Name)) < 2 || len(input.CountryCode) != 2 || !oneOf(input.PayoutMethod, "bank", "wallet", "stellar_wallet", "cash_pickup") || len(strings.TrimSpace(input.PayoutReference)) < 4 {
		writeError(w, http.StatusBadRequest, "invalid recipient")
		return
	}
	input.CountryCode = strings.ToUpper(input.CountryCode)
	var paymentMethodID, payoutType, countryCode string
	if input.PaymentMethodID != "" {
		err = s.db.QueryRow(r.Context(), `select m.id,m.payout_type,m.country_code from platform.payment_method m join platform.payment_connector c on c.id=m.connector_id where m.id=$1 and m.status='active' and c.status='active'`, input.PaymentMethodID).Scan(&paymentMethodID, &payoutType, &countryCode)
	} else {
		// Temporary compatibility for clients deployed before the catalog endpoint.
		err = s.db.QueryRow(r.Context(), `select m.id,m.payout_type,m.country_code from platform.payment_method m join platform.payment_connector c on c.id=m.connector_id where m.payout_type=$1 and m.country_code=$2 and m.status='active' and c.connector_kind='sandbox' and c.status='active' order by m.display_name limit 1`, input.PayoutMethod, input.CountryCode).Scan(&paymentMethodID, &payoutType, &countryCode)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "payout method unavailable")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "payout method unavailable")
		return
	}
	if payoutType != input.PayoutMethod || countryCode != input.CountryCode {
		writeError(w, http.StatusBadRequest, "payout method unavailable")
		return
	}
	id := newID()
	masked := "•••• " + lastFour(strings.TrimSpace(input.PayoutReference))
	_, err = s.db.Exec(r.Context(), `insert into platform.recipient(id,account_id,display_name,country_code,payout_method,payout_reference_masked,payment_method_id) values($1,$2,$3,$4,$5,$6,$7)`, id, acct.ID, strings.TrimSpace(input.Name), input.CountryCode, input.PayoutMethod, masked, paymentMethodID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "recipient could not be saved")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": id, "name": strings.TrimSpace(input.Name), "payoutReferenceMasked": masked})
}

func (s *Service) createQuote(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	var input struct{ Amount, DestinationCurrency string }
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid quote request")
		return
	}
	amount, ok := new(big.Rat).SetString(input.Amount)
	maximum := new(big.Rat).SetInt64(10000)
	if !ok || amount.Sign() <= 0 || amount.Cmp(maximum) > 0 {
		writeError(w, http.StatusBadRequest, "amount must be between 0 and 10000")
		return
	}
	if input.DestinationCurrency == "" {
		input.DestinationCurrency = "PHP"
	}
	if input.DestinationCurrency != "PHP" {
		writeError(w, http.StatusBadRequest, "unsupported destination currency")
		return
	}
	rate := new(big.Rat).SetInt64(57)
	fee := new(big.Rat).Quo(amount, new(big.Rat).SetInt64(100))
	destination := new(big.Rat).Mul(amount, rate)
	id := newID()
	expiresAt := time.Now().UTC().Add(5 * time.Minute)
	amountText, feeText, destinationText := decimal(amount, 7), decimal(fee, 7), decimal(destination, 7)
	_, err = s.db.Exec(r.Context(), `insert into platform.quote(id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,expires_at) values($1,$2,'USDC',$3,$4,$5,$6,'57', $7)`, id, acct.ID, input.DestinationCurrency, amountText, destinationText, feeText, expiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "quote could not be created")
		return
	}
	_, _ = s.db.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'quote.created','quote',$2,'Sandbox quote created',$3)`, acct.ID, id, map[string]string{"sourceAmount": decimal(amount, 2), "destinationAmount": decimal(destination, 2), "destinationCurrency": input.DestinationCurrency})
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "sourceAsset": "USDC", "destinationCurrency": input.DestinationCurrency, "sourceAmount": decimal(amount, 2), "destinationAmount": decimal(destination, 2), "feeAmount": decimal(fee, 2), "rate": "57.00", "expiresAt": expiresAt})
}

func (s *Service) createTransfer(w http.ResponseWriter, r *http.Request) {
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idem) < 8 || len(idem) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}
	var input struct{ QuoteID, RecipientID, RecipientName string }
	if err := decode(r, &input); err != nil || input.QuoteID == "" || len(strings.TrimSpace(input.RecipientName)) < 2 {
		writeError(w, http.StatusBadRequest, "invalid transfer request")
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

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transfer unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var existingReference, existingStatus string
	err = tx.QueryRow(r.Context(), `select reference,status from platform.transfer where account_id=$1 and idempotency_key=$2`, acct.ID, idem).Scan(&existingReference, &existingStatus)
	if err == nil {
		writeJSON(w, http.StatusOK, map[string]string{"reference": existingReference, "status": existingStatus})
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "transfer unavailable")
		return
	}

	var sourceAsset, destinationCurrency, sourceAmount, destinationAmount, feeAmount, quoteStatus string
	var expiresAt time.Time
	err = tx.QueryRow(r.Context(), `select source_asset,destination_currency,source_amount::text,destination_amount::text,fee_amount::text,status,expires_at from platform.quote where id=$1 and account_id=$2 for update`, input.QuoteID, acct.ID).Scan(&sourceAsset, &destinationCurrency, &sourceAmount, &destinationAmount, &feeAmount, &quoteStatus, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "quote not found")
		return
	}
	if err != nil || quoteStatus != "active" || time.Now().After(expiresAt) {
		writeError(w, http.StatusConflict, "quote is no longer active")
		return
	}
	complianceDecision, err := s.assessTransferCompliance(r.Context(), tx, acct, acct.ID+":"+idem, sourceAmount)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "compliance controls unavailable")
		return
	}
	if s.complianceEnforced && !complianceDecision.Allowed {
		if err := tx.Commit(r.Context()); err != nil {
			writeError(w, http.StatusInternalServerError, "compliance review could not be recorded")
			return
		}
		writeError(w, http.StatusForbidden, "transfer requires compliance review")
		return
	}
	var balance string
	err = tx.QueryRow(r.Context(), `update platform.wallet set available_balance=available_balance-$2::numeric-$3::numeric,updated_at=now() where account_id=$1 and asset_code='USDC' and network='sandbox' and available_balance >= $2::numeric+$3::numeric returning available_balance::text`, acct.ID, sourceAmount, feeAmount).Scan(&balance)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusConflict, "insufficient sandbox balance")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "wallet update failed")
		return
	}
	var sequence int64
	if err := tx.QueryRow(r.Context(), `select nextval('platform.transfer_reference_seq')`).Scan(&sequence); err != nil {
		writeError(w, http.StatusInternalServerError, "transfer unavailable")
		return
	}
	transferID := newID()
	reference := fmt.Sprintf("PDX-%d-%06d", time.Now().UTC().Year(), sequence)
	_, err = tx.Exec(r.Context(), `insert into platform.transfer(id,reference,account_id,quote_id,recipient_id,recipient_name,source_asset,destination_currency,source_amount,destination_amount,fee_amount,status,idempotency_key,confirmed_at) values($1,$2,$3,$4,nullif($5,''),$6,$7,$8,$9,$10,$11,'confirmed',$12,now())`, transferID, reference, acct.ID, input.QuoteID, input.RecipientID, strings.TrimSpace(input.RecipientName), sourceAsset, destinationCurrency, sourceAmount, destinationAmount, feeAmount, idem)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transfer could not be recorded")
		return
	}
	if _, err := tx.Exec(r.Context(), `insert into platform.transfer_evidence_event(
		id,transfer_id,evidence_type,provider_key,provider_environment,provider_transaction_id,
		provider_reference,provider_status,recorded_at
	) values($1,$2,'provider_receipt','padalix_sandbox','sandbox',$3,$4,'confirmed',now())`, newID(), transferID, transferID, reference); err != nil {
		writeError(w, http.StatusInternalServerError, "transfer evidence could not be recorded")
		return
	}
	if _, err := tx.Exec(r.Context(), `update platform.quote set status='consumed' where id=$1`, input.QuoteID); err != nil {
		writeError(w, http.StatusInternalServerError, "quote update failed")
		return
	}
	ledgerTransactionID := newID()
	if _, err := tx.Exec(r.Context(), `insert into platform.ledger_transaction(id,reference,transfer_id) values($1,$2,$3)`, ledgerTransactionID, reference, transferID); err != nil {
		writeError(w, http.StatusInternalServerError, "ledger transaction failed")
		return
	}
	var walletLedgerID string
	if err := tx.QueryRow(r.Context(), `select id from platform.ledger_account where account_id=$1 and code=$2`, acct.ID, "wallet:"+acct.ID+":usdc").Scan(&walletLedgerID); err != nil {
		writeError(w, http.StatusInternalServerError, "wallet ledger unavailable")
		return
	}
	sourceRat, sourceOK := new(big.Rat).SetString(sourceAmount)
	feeRat, feeOK := new(big.Rat).SetString(feeAmount)
	if !sourceOK || !feeOK {
		writeError(w, http.StatusInternalServerError, "ledger amount invalid")
		return
	}
	debitRat := new(big.Rat).Neg(new(big.Rat).Add(sourceRat, feeRat))
	postings := []struct{ accountID, amount string }{
		{walletLedgerID, decimal(debitRat, 7)},
		{"system-usdc-settlement", sourceAmount},
		{"system-usdc-fees", feeAmount},
	}
	for _, posting := range postings {
		if _, err := tx.Exec(r.Context(), `insert into platform.ledger_posting(id,transaction_id,ledger_account_id,amount) values($1,$2,$3,$4)`, newID(), ledgerTransactionID, posting.accountID, posting.amount); err != nil {
			writeError(w, http.StatusInternalServerError, "ledger posting failed")
			return
		}
	}
	metadata := map[string]string{"reference": reference, "sourceAmount": sourceAmount, "sourceAsset": sourceAsset, "destinationAmount": destinationAmount, "destinationCurrency": destinationCurrency, "recipient": strings.TrimSpace(input.RecipientName)}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata) values($1,'transfer.confirmed','transfer',$2,$3,$4)`, acct.ID, transferID, "Sandbox transfer to "+strings.TrimSpace(input.RecipientName), metadata); err != nil {
		writeError(w, http.StatusInternalServerError, "activity record failed")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "transfer commit failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"id": transferID, "reference": reference, "status": "confirmed", "balance": balance})
}

func currentIdentity(r *http.Request) identity { return r.Context().Value(identityKey).(identity) }

func decode(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decimal(value *big.Rat, scale int) string { return value.FloatString(scale) }
func oneOf(value string, allowed ...string) bool {
	for _, item := range allowed {
		if value == item {
			return true
		}
	}
	return false
}
func lastFour(value string) string {
	if len(value) <= 4 {
		return value
	}
	return value[len(value)-4:]
}
func newID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		panic(err)
	}
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	hexValue := hex.EncodeToString(bytes)
	return hexValue[0:8] + "-" + hexValue[8:12] + "-" + hexValue[12:16] + "-" + hexValue[16:20] + "-" + hexValue[20:32]
}

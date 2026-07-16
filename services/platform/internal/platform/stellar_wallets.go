package platform

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

const stellarChallengeTTL = 5 * time.Minute

var (
	errStellarChallengeConsumed = errors.New("stellar challenge already consumed")
	errStellarChallengeExpired  = errors.New("stellar challenge expired")
	errStellarChallengeAccount  = errors.New("stellar challenge belongs to another account")
	errStellarChallengeNetwork  = errors.New("stellar challenge belongs to another network")
)

type StellarWalletConfig struct {
	Network        string
	HomeDomain     string
	WebAuthDomain  string
	SigningSeed    string
	MainnetEnabled bool
}

type StellarWalletAuth struct {
	networkName       string
	networkPassphrase string
	homeDomain        string
	webAuthDomain     string
	signingSeed       string
	serverPublicKey   string
}

type stellarChallenge struct {
	Transaction       string
	TransactionHash   string
	Network           string
	NetworkPassphrase string
	ServerPublicKey   string
	HomeDomain        string
	WebAuthDomain     string
	ExpiresAt         time.Time
}

type stellarChallengeRecord struct {
	AccountID       string
	PublicKey       string
	Network         string
	TransactionHash string
	ExpiresAt       time.Time
	ConsumedAt      *time.Time
}

func StellarWalletConfigFromEnv() (StellarWalletConfig, error) {
	config := StellarWalletConfig{
		Network:        envValue("STELLAR_NETWORK", "testnet"),
		HomeDomain:     envValue("STELLAR_HOME_DOMAIN", "padalix.com"),
		WebAuthDomain:  envValue("STELLAR_WEB_AUTH_DOMAIN", "api.padalix.com"),
		SigningSeed:    strings.TrimSpace(os.Getenv("STELLAR_WEB_AUTH_SIGNING_SEED")),
		MainnetEnabled: os.Getenv("STELLAR_MAINNET_ENABLED") == "true",
	}
	_, err := NewStellarWalletAuth(config)
	return config, err
}

func NewStellarWalletAuth(config StellarWalletConfig) (*StellarWalletAuth, error) {
	config.Network = strings.ToLower(strings.TrimSpace(config.Network))
	config.HomeDomain = strings.ToLower(strings.TrimSpace(config.HomeDomain))
	config.WebAuthDomain = strings.ToLower(strings.TrimSpace(config.WebAuthDomain))

	var passphrase string
	switch config.Network {
	case "testnet":
		passphrase = network.TestNetworkPassphrase
	case "mainnet":
		if !config.MainnetEnabled {
			return nil, errors.New("stellar mainnet requires STELLAR_MAINNET_ENABLED=true")
		}
		passphrase = network.PublicNetworkPassphrase
	default:
		return nil, fmt.Errorf("unsupported stellar network %q", config.Network)
	}
	if !validStellarDomain(config.HomeDomain) || !validStellarDomain(config.WebAuthDomain) {
		return nil, errors.New("stellar home and web auth domains must be hostnames without a scheme or path")
	}

	auth := &StellarWalletAuth{
		networkName:       config.Network,
		networkPassphrase: passphrase,
		homeDomain:        config.HomeDomain,
		webAuthDomain:     config.WebAuthDomain,
		signingSeed:       config.SigningSeed,
	}
	if config.SigningSeed == "" {
		return auth, nil
	}
	signer, err := keypair.ParseFull(config.SigningSeed)
	if err != nil {
		return nil, errors.New("STELLAR_WEB_AUTH_SIGNING_SEED is not a valid Stellar signing seed")
	}
	auth.serverPublicKey = signer.Address()
	return auth, nil
}

func (a *StellarWalletAuth) Enabled() bool {
	return a != nil && a.signingSeed != "" && a.serverPublicKey != ""
}

func (a *StellarWalletAuth) Network() string {
	if a == nil {
		return ""
	}
	return a.networkName
}

func (a *StellarWalletAuth) BuildChallenge(publicKey string) (stellarChallenge, error) {
	if !a.Enabled() {
		return stellarChallenge{}, errors.New("stellar wallet linking is not configured")
	}
	publicKey = strings.TrimSpace(publicKey)
	if _, err := keypair.ParseAddress(publicKey); err != nil {
		return stellarChallenge{}, errors.New("invalid Stellar public key")
	}

	tx, err := txnbuild.BuildChallengeTx(
		a.signingSeed,
		publicKey,
		a.webAuthDomain,
		a.homeDomain,
		a.networkPassphrase,
		stellarChallengeTTL,
		nil,
	)
	if err != nil {
		return stellarChallenge{}, fmt.Errorf("build SEP-10 challenge: %w", err)
	}
	xdr, err := tx.Base64()
	if err != nil {
		return stellarChallenge{}, fmt.Errorf("encode SEP-10 challenge: %w", err)
	}
	hash, err := tx.HashHex(a.networkPassphrase)
	if err != nil {
		return stellarChallenge{}, fmt.Errorf("hash SEP-10 challenge: %w", err)
	}

	return stellarChallenge{
		Transaction:       xdr,
		TransactionHash:   strings.ToLower(hash),
		Network:           a.networkName,
		NetworkPassphrase: a.networkPassphrase,
		ServerPublicKey:   a.serverPublicKey,
		HomeDomain:        a.homeDomain,
		WebAuthDomain:     a.webAuthDomain,
		ExpiresAt:         time.Unix(tx.Timebounds().MaxTime, 0).UTC(),
	}, nil
}

func (a *StellarWalletAuth) VerifySignedChallenge(signedTransaction, publicKey, expectedHash string) error {
	if !a.Enabled() {
		return errors.New("stellar wallet linking is not configured")
	}
	publicKey = strings.TrimSpace(publicKey)
	if _, err := keypair.ParseAddress(publicKey); err != nil {
		return errors.New("invalid Stellar public key")
	}

	tx, clientAccount, _, memo, err := txnbuild.ReadChallengeTx(
		signedTransaction,
		a.serverPublicKey,
		a.networkPassphrase,
		a.webAuthDomain,
		[]string{a.homeDomain},
	)
	if err != nil {
		return fmt.Errorf("read SEP-10 challenge: %w", err)
	}
	if memo != nil || clientAccount != publicKey {
		return errors.New("SEP-10 challenge does not match the requested public key")
	}
	hash, err := tx.HashHex(a.networkPassphrase)
	if err != nil {
		return fmt.Errorf("hash SEP-10 challenge: %w", err)
	}
	if !strings.EqualFold(hash, strings.TrimSpace(expectedHash)) {
		return errors.New("SEP-10 challenge does not match the issued transaction")
	}
	if _, err := txnbuild.VerifyChallengeTxSigners(
		signedTransaction,
		a.serverPublicKey,
		a.networkPassphrase,
		a.webAuthDomain,
		[]string{a.homeDomain},
		publicKey,
	); err != nil {
		return fmt.Errorf("verify SEP-10 signer: %w", err)
	}
	return nil
}

func validateStellarChallenge(record stellarChallengeRecord, accountID, networkName string, now time.Time) error {
	if record.AccountID != accountID {
		return errStellarChallengeAccount
	}
	if record.Network != networkName {
		return errStellarChallengeNetwork
	}
	if record.ConsumedAt != nil {
		return errStellarChallengeConsumed
	}
	if !now.Before(record.ExpiresAt) {
		return errStellarChallengeExpired
	}
	return nil
}

func (s *Service) createStellarWalletChallenge(w http.ResponseWriter, r *http.Request) {
	if !s.stellarWalletAuth.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "stellar wallet linking unavailable")
		return
	}
	var input struct {
		PublicKey string `json:"publicKey"`
		Network   string `json:"network"`
	}
	if err := decode(r, &input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid challenge request")
		return
	}
	input.PublicKey = strings.TrimSpace(input.PublicKey)
	input.Network = strings.ToLower(strings.TrimSpace(input.Network))
	if input.Network == "" {
		input.Network = s.stellarWalletAuth.Network()
	}
	if input.Network != s.stellarWalletAuth.Network() {
		writeError(w, http.StatusBadRequest, "stellar network unavailable")
		return
	}
	if _, err := keypair.ParseAddress(input.PublicKey); err != nil {
		writeError(w, http.StatusBadRequest, "invalid Stellar public key")
		return
	}

	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	challenge, err := s.stellarWalletAuth.BuildChallenge(input.PublicKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar challenge unavailable")
		return
	}
	challengeID := newID()
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar challenge unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `with stale as (
		select id from platform.stellar_wallet_challenge
		where coalesce(consumed_at,expires_at) < now()-interval '7 days'
		order by created_at limit 100
	) delete from platform.stellar_wallet_challenge c using stale where c.id=stale.id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar challenge unavailable")
		return
	}
	_, err = tx.Exec(r.Context(), `insert into platform.stellar_wallet_challenge(id,account_id,public_key,network,transaction_hash,expires_at)
		values($1,$2,$3,$4,$5,$6)
		on conflict(account_id,public_key,network) where consumed_at is null do update set
		id=excluded.id,transaction_hash=excluded.transaction_hash,expires_at=excluded.expires_at,created_at=now()`,
		challengeID, acct.ID, input.PublicKey, challenge.Network, challenge.TransactionHash, challenge.ExpiresAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar challenge unavailable")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar challenge unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"challengeId":       challengeID,
		"transaction":       challenge.Transaction,
		"network":           challenge.Network,
		"networkPassphrase": challenge.NetworkPassphrase,
		"serverPublicKey":   challenge.ServerPublicKey,
		"homeDomain":        challenge.HomeDomain,
		"webAuthDomain":     challenge.WebAuthDomain,
		"expiresAt":         challenge.ExpiresAt,
	})
}

func (s *Service) verifyStellarWalletChallenge(w http.ResponseWriter, r *http.Request) {
	if !s.stellarWalletAuth.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "stellar wallet linking unavailable")
		return
	}
	var input struct {
		ChallengeID string `json:"challengeId"`
		Transaction string `json:"transaction"`
	}
	if err := decode(r, &input); err != nil || strings.TrimSpace(input.ChallengeID) == "" || strings.TrimSpace(input.Transaction) == "" {
		writeError(w, http.StatusBadRequest, "invalid verification request")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
		return
	}
	defer tx.Rollback(r.Context())

	record := stellarChallengeRecord{}
	err = tx.QueryRow(r.Context(), `select account_id,public_key,network,transaction_hash,expires_at,consumed_at
		from platform.stellar_wallet_challenge where id=$1 and account_id=$2 for update`, strings.TrimSpace(input.ChallengeID), acct.ID).Scan(
		&record.AccountID, &record.PublicKey, &record.Network, &record.TransactionHash, &record.ExpiresAt, &record.ConsumedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "stellar challenge not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
		return
	}
	if err := validateStellarChallenge(record, acct.ID, s.stellarWalletAuth.Network(), time.Now().UTC()); err != nil {
		writeError(w, http.StatusConflict, "stellar challenge unavailable")
		return
	}
	if err := s.stellarWalletAuth.VerifySignedChallenge(strings.TrimSpace(input.Transaction), record.PublicKey, record.TransactionHash); err != nil {
		writeError(w, http.StatusBadRequest, "invalid signed Stellar challenge")
		return
	}

	walletID := newID()
	var verifiedAt time.Time
	err = tx.QueryRow(r.Context(), `insert into platform.stellar_wallet_link(id,account_id,public_key,network)
		values($1,$2,$3,$4)
		on conflict(network,public_key) where unlinked_at is null do update
		set verified_at=excluded.verified_at,updated_at=now()
		where platform.stellar_wallet_link.account_id=excluded.account_id
		returning id,verified_at`, walletID, acct.ID, record.PublicKey, record.Network).Scan(&walletID, &verifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, consumeErr := tx.Exec(r.Context(), `update platform.stellar_wallet_challenge set consumed_at=now() where id=$1`, strings.TrimSpace(input.ChallengeID)); consumeErr != nil {
			writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
			return
		}
		if commitErr := tx.Commit(r.Context()); commitErr != nil {
			writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
			return
		}
		writeError(w, http.StatusConflict, "stellar wallet already linked")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallet could not be linked")
		return
	}
	if _, err := tx.Exec(r.Context(), `update platform.stellar_wallet_challenge set consumed_at=now() where id=$1 and consumed_at is null`, strings.TrimSpace(input.ChallengeID)); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
		return
	}
	metadata := map[string]string{"walletId": walletID, "publicKey": record.PublicKey, "network": record.Network}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'stellar_wallet.linked','stellar_wallet',$2,'Stellar wallet ownership verified',$3)`, acct.ID, walletID, metadata); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar verification unavailable")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": walletID, "publicKey": record.PublicKey, "network": record.Network, "verifiedAt": verifiedAt,
	})
}

func (s *Service) listStellarWallets(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	rows, err := s.db.Query(r.Context(), `select id,public_key,network,verified_at from platform.stellar_wallet_link
		where account_id=$1 and unlinked_at is null order by verified_at desc`, acct.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallets unavailable")
		return
	}
	defer rows.Close()
	items := make([]map[string]any, 0)
	for rows.Next() {
		var id, publicKey, networkName string
		var verifiedAt time.Time
		if err := rows.Scan(&id, &publicKey, &networkName, &verifiedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "stellar wallets unavailable")
			return
		}
		items = append(items, map[string]any{"id": id, "publicKey": publicKey, "network": networkName, "verifiedAt": verifiedAt})
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallets unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"wallets": items})
}

func (s *Service) unlinkStellarWallet(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	walletID := strings.TrimSpace(r.PathValue("walletID"))
	if walletID == "" {
		writeError(w, http.StatusBadRequest, "stellar wallet id required")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallet unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var publicKey, networkName string
	err = tx.QueryRow(r.Context(), `update platform.stellar_wallet_link set unlinked_at=now(),updated_at=now()
		where id=$1 and account_id=$2 and unlinked_at is null returning public_key,network`, walletID, acct.ID).Scan(&publicKey, &networkName)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "stellar wallet not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallet could not be unlinked")
		return
	}
	metadata := map[string]string{"walletId": walletID, "publicKey": publicKey, "network": networkName}
	if _, err := tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,'stellar_wallet.unlinked','stellar_wallet',$2,'Stellar wallet unlinked',$3)`, acct.ID, walletID, metadata); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallet could not be unlinked")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "stellar wallet could not be unlinked")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func envValue(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func validStellarDomain(value string) bool {
	if value == "" || strings.ContainsAny(value, "/?#@ \t\r\n") {
		return false
	}
	return strings.Contains(value, ".") || value == "localhost" || strings.HasPrefix(value, "localhost:")
}

package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/stellar/go-stellar-sdk/clients/rpcclient"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/network"
	protocol "github.com/stellar/go-stellar-sdk/protocols/rpc"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

const stellarPaymentTTL = 5 * time.Minute

var stellarAssetCodePattern = regexp.MustCompile(`^[A-Z0-9]{1,12}$`)

var errStellarAccountNotFunded = errors.New("stellar account is not funded")

type stellarHorizonError struct {
	StatusCode int
}

func (e *stellarHorizonError) Error() string {
	return fmt.Sprintf("stellar account lookup returned %d", e.StatusCode)
}

type StellarPaymentConfig struct {
	Enabled    bool
	Network    string
	RPCURL     string
	HorizonURL string
	AssetCode  string
	Issuer     string
}

type stellarBalance struct {
	AssetCode string `json:"assetCode"`
	Issuer    string `json:"issuer,omitempty"`
	Balance   string `json:"balance"`
}

type stellarSubmission struct {
	Hash   string
	Status string
}

type stellarTransactionResult struct {
	Status string
	Hash   string
	Ledger uint32
}

type stellarPaymentNetwork interface {
	LoadAccount(context.Context, string) (txnbuild.Account, error)
	Balances(context.Context, string) ([]stellarBalance, error)
	Submit(context.Context, string) (stellarSubmission, error)
	Transaction(context.Context, string) (stellarTransactionResult, error)
}

type StellarPaymentService struct {
	config  StellarPaymentConfig
	network stellarPaymentNetwork
}

type rpcStellarPaymentNetwork struct {
	rpc        *rpcclient.Client
	horizonURL string
	httpClient *http.Client
}

func StellarPaymentConfigFromEnv() (StellarPaymentConfig, error) {
	config := StellarPaymentConfig{
		Enabled:    strings.EqualFold(strings.TrimSpace(os.Getenv("STELLAR_TESTNET_PAYMENTS_ENABLED")), "true"),
		Network:    strings.ToLower(envValue("STELLAR_NETWORK", "testnet")),
		RPCURL:     envValue("STELLAR_RPC_URL", "https://soroban-testnet.stellar.org"),
		HorizonURL: envValue("STELLAR_HORIZON_URL", "https://horizon-testnet.stellar.org"),
		AssetCode:  strings.ToUpper(envValue("STELLAR_PAYMENT_ASSET_CODE", "XLM")),
		Issuer:     strings.TrimSpace(os.Getenv("STELLAR_PAYMENT_ASSET_ISSUER")),
	}
	return config, validateStellarPaymentConfig(config)
}

func validateStellarPaymentConfig(config StellarPaymentConfig) error {
	if config.Network != "testnet" {
		if config.Enabled {
			return errors.New("real-value Stellar payments are not enabled; the payment service is testnet-only")
		}
		return nil
	}
	if !stellarAssetCodePattern.MatchString(config.AssetCode) {
		return errors.New("STELLAR_PAYMENT_ASSET_CODE must be 1-12 uppercase alphanumeric characters")
	}
	if config.AssetCode == "XLM" && config.Issuer != "" {
		return errors.New("native XLM must not configure an issuer")
	}
	if config.AssetCode != "XLM" {
		if _, err := keypair.ParseAddress(config.Issuer); err != nil {
			return errors.New("non-native Stellar payment asset requires a valid issuer")
		}
	}
	for name, raw := range map[string]string{"STELLAR_RPC_URL": config.RPCURL, "STELLAR_HORIZON_URL": config.HorizonURL} {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
			return fmt.Errorf("%s must be an HTTPS origin", name)
		}
	}
	return nil
}

func NewStellarPaymentService(config StellarPaymentConfig) (*StellarPaymentService, error) {
	if err := validateStellarPaymentConfig(config); err != nil {
		return nil, err
	}
	service := &StellarPaymentService{config: config}
	if !config.Enabled {
		return service, nil
	}
	httpClient := &http.Client{Timeout: 10 * time.Second}
	service.network = &rpcStellarPaymentNetwork{
		rpc:        rpcclient.NewClient(config.RPCURL, httpClient),
		horizonURL: strings.TrimRight(config.HorizonURL, "/"),
		httpClient: httpClient,
	}
	return service, nil
}

func (s *StellarPaymentService) Enabled() bool {
	return s != nil && s.config.Enabled && s.network != nil && s.config.Network == "testnet"
}

func (n *rpcStellarPaymentNetwork) LoadAccount(ctx context.Context, address string) (txnbuild.Account, error) {
	return n.rpc.LoadAccount(ctx, address)
}

func (n *rpcStellarPaymentNetwork) Balances(ctx context.Context, address string) ([]stellarBalance, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, n.horizonURL+"/accounts/"+url.PathEscape(address), nil)
	if err != nil {
		return nil, err
	}
	response, err := n.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return nil, errStellarAccountNotFunded
	}
	if response.StatusCode != http.StatusOK {
		return nil, &stellarHorizonError{StatusCode: response.StatusCode}
	}
	var payload struct {
		Balances []struct {
			Balance   string `json:"balance"`
			AssetType string `json:"asset_type"`
			AssetCode string `json:"asset_code"`
			Issuer    string `json:"asset_issuer"`
		} `json:"balances"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	balances := make([]stellarBalance, 0, len(payload.Balances))
	for _, item := range payload.Balances {
		code := item.AssetCode
		if item.AssetType == "native" {
			code = "XLM"
		}
		balances = append(balances, stellarBalance{AssetCode: code, Issuer: item.Issuer, Balance: item.Balance})
	}
	return balances, nil
}

func (n *rpcStellarPaymentNetwork) Submit(ctx context.Context, transaction string) (stellarSubmission, error) {
	result, err := n.rpc.SendTransaction(ctx, protocol.SendTransactionRequest{Transaction: transaction})
	if err != nil {
		return stellarSubmission{}, err
	}
	return stellarSubmission{Hash: strings.ToLower(result.Hash), Status: result.Status}, nil
}

func (n *rpcStellarPaymentNetwork) Transaction(ctx context.Context, hash string) (stellarTransactionResult, error) {
	result, err := n.rpc.GetTransaction(ctx, protocol.GetTransactionRequest{Hash: hash})
	if err != nil {
		return stellarTransactionResult{}, err
	}
	return stellarTransactionResult{Status: result.Status, Hash: strings.ToLower(result.TransactionHash), Ledger: result.Ledger}, nil
}

func stellarPaymentAsset(config StellarPaymentConfig) txnbuild.Asset {
	if config.AssetCode == "XLM" {
		return txnbuild.NativeAsset{}
	}
	return txnbuild.CreditAsset{Code: config.AssetCode, Issuer: config.Issuer}
}

func normalizeStellarPaymentAmount(value string) (string, error) {
	amount, ok := new(big.Rat).SetString(strings.TrimSpace(value))
	maximum := new(big.Rat).SetInt64(1000)
	if !ok || amount.Sign() <= 0 || amount.Cmp(maximum) > 0 {
		return "", errors.New("amount must be greater than zero and no more than 1000")
	}
	normalized := decimal(amount, 7)
	if parsed, _ := new(big.Rat).SetString(normalized); parsed == nil || parsed.Cmp(amount) != 0 {
		return "", errors.New("amount supports at most seven decimal places")
	}
	return normalized, nil
}

func buildStellarPaymentTransaction(
	account txnbuild.Account,
	destination string,
	amount string,
	reference string,
	config StellarPaymentConfig,
) (*txnbuild.Transaction, string, string, error) {
	tx, err := txnbuild.NewTransaction(txnbuild.TransactionParams{
		SourceAccount:        account,
		IncrementSequenceNum: true,
		Operations: []txnbuild.Operation{&txnbuild.Payment{
			Destination: destination,
			Amount:      amount,
			Asset:       stellarPaymentAsset(config),
		}},
		BaseFee: txnbuild.MinBaseFee,
		Memo:    txnbuild.MemoText(reference),
		Preconditions: txnbuild.Preconditions{
			TimeBounds: txnbuild.NewTimeout(int64(stellarPaymentTTL.Seconds())),
		},
	})
	if err != nil {
		return nil, "", "", err
	}
	xdr, err := tx.Base64()
	if err != nil {
		return nil, "", "", err
	}
	hash, err := tx.HashHex(network.TestNetworkPassphrase)
	if err != nil {
		return nil, "", "", err
	}
	return tx, xdr, strings.ToLower(hash), nil
}

func validateSignedStellarPayment(signedXDR, expectedHash, source string) error {
	generic, err := txnbuild.TransactionFromXDR(strings.TrimSpace(signedXDR))
	if err != nil {
		return errors.New("signed Stellar transaction is invalid")
	}
	tx, ok := generic.Transaction()
	if !ok {
		return errors.New("fee-bump transactions are not accepted for this testnet flow")
	}
	if tx.SourceAccount().AccountID != source {
		return errors.New("signed Stellar transaction uses a different source account")
	}
	hash, err := tx.Hash(network.TestNetworkPassphrase)
	if err != nil || !strings.EqualFold(fmt.Sprintf("%x", hash), expectedHash) {
		return errors.New("signed Stellar transaction does not match the prepared payment")
	}
	publicKey, err := keypair.ParseAddress(source)
	if err != nil {
		return errors.New("payment source account is invalid")
	}
	for _, signature := range tx.Signatures() {
		if signature.Hint == publicKey.Hint() && publicKey.Verify(hash[:], []byte(signature.Signature)) == nil {
			return nil
		}
	}
	return errors.New("signed Stellar transaction is missing the source account signature")
}

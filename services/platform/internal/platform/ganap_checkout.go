package platform

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const ganapConnectorID = "connector-ganap"

var ganapWebhookPathSecretPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{32,128}$`)
var ganapAmountPattern = regexp.MustCompile(`^(0|[0-9]{1,5})(\.[0-9]{1,7})?$`)

type GanapCheckoutConfig struct {
	Enabled                bool
	CheckoutURL            string
	SecretKey              string
	WebhookPathSecret      string
	WebhookHeaderName      string
	WebhookHeaderSecret    string
	RedirectAllowedOrigins []string
	Timeout                time.Duration
}

type GanapCheckoutConnector struct {
	checkoutURL            *url.URL
	secretKey              string
	webhookPathSecret      string
	webhookHeaderName      string
	webhookHeaderSecret    string
	redirectAllowedOrigins map[string]struct{}
	client                 *http.Client
}

type GanapCheckoutRequest struct {
	ExternalID         string
	Amount             string
	SuccessRedirectURL string
	FailureRedirectURL string
	PayerEmail         string
	PayerName          string
}

type GanapCheckoutResponse struct {
	ExternalID      string
	ReferenceNumber string
	CheckoutURL     string
	Status          string
}

type GanapWebhook struct {
	Status          string
	ExternalID      string
	ReferenceNumber string
	Amount          string
	PayloadDigest   string
}

func GanapCheckoutConfigFromEnv() (GanapCheckoutConfig, error) {
	config := GanapCheckoutConfig{
		Enabled:                strings.EqualFold(strings.TrimSpace(os.Getenv("GANAP_CHECKOUT_ENABLED")), "true"),
		CheckoutURL:            strings.TrimSpace(os.Getenv("GANAP_CHECKOUT_URL")),
		SecretKey:              strings.TrimSpace(os.Getenv("GANAP_SECRET_KEY")),
		WebhookPathSecret:      strings.TrimSpace(os.Getenv("GANAP_WEBHOOK_PATH_SECRET")),
		WebhookHeaderName:      strings.TrimSpace(os.Getenv("GANAP_WEBHOOK_HEADER_NAME")),
		WebhookHeaderSecret:    strings.TrimSpace(os.Getenv("GANAP_WEBHOOK_HEADER_SECRET")),
		RedirectAllowedOrigins: splitCSV(os.Getenv("GANAP_REDIRECT_ALLOWED_ORIGINS")),
		Timeout:                10 * time.Second,
	}
	if !config.Enabled {
		return config, nil
	}
	if raw := strings.TrimSpace(os.Getenv("GANAP_TIMEOUT_SECONDS")); raw != "" {
		seconds, err := strconv.Atoi(raw)
		if err != nil || seconds < 3 || seconds > 30 {
			return GanapCheckoutConfig{}, errors.New("GANAP_TIMEOUT_SECONDS must be between 3 and 30")
		}
		config.Timeout = time.Duration(seconds) * time.Second
	}
	if config.CheckoutURL == "" || config.SecretKey == "" || !ganapWebhookPathSecretPattern.MatchString(config.WebhookPathSecret) || len(config.RedirectAllowedOrigins) == 0 {
		return GanapCheckoutConfig{}, errors.New("GANAP_CHECKOUT_URL, GANAP_SECRET_KEY, a 32-128 character URL-safe GANAP_WEBHOOK_PATH_SECRET, and GANAP_REDIRECT_ALLOWED_ORIGINS are required")
	}
	if (config.WebhookHeaderName == "") != (config.WebhookHeaderSecret == "") {
		return GanapCheckoutConfig{}, errors.New("GANAP_WEBHOOK_HEADER_NAME and GANAP_WEBHOOK_HEADER_SECRET must be configured together")
	}
	if config.WebhookHeaderName != "" && len(config.WebhookHeaderSecret) < 32 {
		return GanapCheckoutConfig{}, errors.New("GANAP_WEBHOOK_HEADER_SECRET must contain at least 32 characters")
	}
	return config, nil
}

func NewGanapCheckoutConnector(config GanapCheckoutConfig, client *http.Client) (*GanapCheckoutConnector, error) {
	if !config.Enabled {
		return nil, errors.New("Ganap checkout connector is disabled")
	}
	endpoint, err := url.Parse(config.CheckoutURL)
	if err != nil || endpoint.Scheme != "https" || endpoint.Host == "" || endpoint.User != nil {
		return nil, errors.New("GANAP_CHECKOUT_URL must be an HTTPS URL without user information")
	}
	if strings.TrimSpace(config.SecretKey) == "" || !ganapWebhookPathSecretPattern.MatchString(config.WebhookPathSecret) {
		return nil, errors.New("Ganap checkout and webhook credentials are required")
	}
	if (config.WebhookHeaderName == "") != (config.WebhookHeaderSecret == "") {
		return nil, errors.New("Ganap webhook header configuration is incomplete")
	}
	if config.WebhookHeaderName != "" && len(config.WebhookHeaderSecret) < 32 {
		return nil, errors.New("Ganap webhook header secret must contain at least 32 characters")
	}
	allowed := make(map[string]struct{}, len(config.RedirectAllowedOrigins))
	for _, raw := range config.RedirectAllowedOrigins {
		parsed, parseErr := url.Parse(strings.TrimSpace(raw))
		if parseErr != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, errors.New("Ganap redirect allowlist entries must be origins without paths, queries, or fragments")
		}
		origin, err := normalizedHTTPSOrigin(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid Ganap redirect origin: %w", err)
		}
		allowed[origin] = struct{}{}
	}
	if len(allowed) == 0 {
		return nil, errors.New("at least one Ganap redirect origin is required")
	}
	if client == nil {
		client = &http.Client{Timeout: config.Timeout}
	}
	clientCopy := *client
	if clientCopy.Timeout <= 0 {
		clientCopy.Timeout = config.Timeout
	}
	// Never forward the non-standard provider credential header across redirects.
	clientCopy.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &GanapCheckoutConnector{
		checkoutURL: endpoint, secretKey: config.SecretKey,
		webhookPathSecret: config.WebhookPathSecret,
		webhookHeaderName: config.WebhookHeaderName, webhookHeaderSecret: config.WebhookHeaderSecret,
		redirectAllowedOrigins: allowed, client: &clientCopy,
	}, nil
}

func (c *GanapCheckoutConnector) ValidateRedirect(raw string) error {
	origin, err := normalizedHTTPSOrigin(raw)
	if err != nil {
		return err
	}
	if _, ok := c.redirectAllowedOrigins[origin]; !ok {
		return errors.New("redirect origin is not allowed")
	}
	return nil
}

func (c *GanapCheckoutConnector) CreateCheckout(ctx context.Context, input GanapCheckoutRequest) (GanapCheckoutResponse, error) {
	if strings.TrimSpace(input.ExternalID) == "" || !validGanapAmount(input.Amount) {
		return GanapCheckoutResponse{}, errors.New("invalid Ganap checkout request")
	}
	if err := c.ValidateRedirect(input.SuccessRedirectURL); err != nil {
		return GanapCheckoutResponse{}, fmt.Errorf("invalid success redirect: %w", err)
	}
	if err := c.ValidateRedirect(input.FailureRedirectURL); err != nil {
		return GanapCheckoutResponse{}, fmt.Errorf("invalid failure redirect: %w", err)
	}
	payload, err := json.Marshal(map[string]any{
		"externalId": input.ExternalID, "amount": json.Number(input.Amount),
		"successRedirectURL": input.SuccessRedirectURL, "failureRedirectURL": input.FailureRedirectURL,
		"payerEmail": input.PayerEmail, "payerName": input.PayerName,
	})
	if err != nil {
		return GanapCheckoutResponse{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.checkoutURL.String(), bytes.NewReader(payload))
	if err != nil {
		return GanapCheckoutResponse{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("sk", c.secretKey)

	response, err := c.client.Do(req)
	if err != nil {
		return GanapCheckoutResponse{}, fmt.Errorf("Ganap checkout request failed: %w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 256<<10))
	if err != nil {
		return GanapCheckoutResponse{}, errors.New("Ganap checkout response could not be read")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return GanapCheckoutResponse{}, fmt.Errorf("Ganap checkout returned status %d", response.StatusCode)
	}
	result, err := parseGanapCheckoutResponse(body)
	if err != nil {
		return GanapCheckoutResponse{}, err
	}
	if result.ExternalID != "" && result.ExternalID != input.ExternalID {
		return GanapCheckoutResponse{}, errors.New("Ganap checkout response external ID mismatch")
	}
	result.ExternalID = input.ExternalID
	if result.Status == "" {
		result.Status = "pending"
	}
	return result, nil
}

func (c *GanapCheckoutConnector) VerifyWebhook(pathSecret string, headers http.Header, body []byte) (GanapWebhook, error) {
	if !secureEqual(pathSecret, c.webhookPathSecret) {
		return GanapWebhook{}, errors.New("invalid webhook path secret")
	}
	if c.webhookHeaderName != "" && !secureEqual(headers.Get(c.webhookHeaderName), c.webhookHeaderSecret) {
		return GanapWebhook{}, errors.New("invalid webhook header secret")
	}
	var payload struct {
		Status          string      `json:"status"`
		ExternalID      string      `json:"externalId"`
		ReferenceNumber string      `json:"referenceNumber"`
		Amount          json.Number `json:"amount"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return GanapWebhook{}, errors.New("invalid Ganap webhook payload")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return GanapWebhook{}, errors.New("invalid Ganap webhook payload")
	}
	payload.Status = strings.ToLower(strings.TrimSpace(payload.Status))
	payload.ExternalID = strings.TrimSpace(payload.ExternalID)
	payload.ReferenceNumber = strings.TrimSpace(payload.ReferenceNumber)
	if !oneOf(payload.Status, "success", "failed") || payload.ExternalID == "" || !validGanapAmount(payload.Amount.String()) {
		return GanapWebhook{}, errors.New("invalid Ganap webhook fields")
	}
	if payload.Status == "success" && payload.ReferenceNumber == "" {
		return GanapWebhook{}, errors.New("successful Ganap webhook omitted reference number")
	}
	digest := sha256.Sum256(body)
	return GanapWebhook{
		Status: payload.Status, ExternalID: payload.ExternalID, ReferenceNumber: payload.ReferenceNumber,
		Amount: payload.Amount.String(), PayloadDigest: hex.EncodeToString(digest[:]),
	}, nil
}

func (c *GanapCheckoutConnector) WebhookAuthenticationMethod() string {
	if c.webhookHeaderName != "" {
		return "shared_secret_header"
	}
	return "bearer_path"
}

func (s *Service) SetGanapCheckoutConnector(connector *GanapCheckoutConnector) {
	s.ganapCheckout = connector
}

func (s *Service) createFundingCheckout(w http.ResponseWriter, r *http.Request) {
	if s.ganapCheckout == nil {
		writeError(w, http.StatusServiceUnavailable, "funding checkout unavailable")
		return
	}
	idem := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idem) < 8 || len(idem) > 100 {
		writeError(w, http.StatusBadRequest, "valid idempotency key required")
		return
	}
	var input struct {
		Amount             json.Number `json:"amount"`
		SuccessRedirectURL string      `json:"successRedirectURL"`
		FailureRedirectURL string      `json:"failureRedirectURL"`
	}
	if err := decode(r, &input); err != nil || !validGanapAmount(input.Amount.String()) || s.ganapCheckout.ValidateRedirect(input.SuccessRedirectURL) != nil || s.ganapCheckout.ValidateRedirect(input.FailureRedirectURL) != nil {
		writeError(w, http.StatusBadRequest, "invalid funding checkout request")
		return
	}
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	var connectorStatus string
	if err := s.db.QueryRow(r.Context(), `select status from platform.payment_connector where id=$1`, ganapConnectorID).Scan(&connectorStatus); err != nil || !oneOf(connectorStatus, "pilot", "active") {
		writeError(w, http.StatusServiceUnavailable, "funding checkout unavailable")
		return
	}

	checkoutID, externalID := newID(), "PDX-GNP-"+strings.ToUpper(strings.ReplaceAll(newID(), "-", ""))
	var insertedID string
	err = s.db.QueryRow(r.Context(), `insert into platform.funding_checkout(
		id,connector_id,account_id,idempotency_key,external_id,amount,currency,success_redirect_url,failure_redirect_url,status,provider_status
	) values($1,$2,$3,$4,$5,$6,'PHP',$7,$8,'created','created')
		on conflict(account_id,idempotency_key) do nothing returning id`, checkoutID, ganapConnectorID, acct.ID, idem, externalID, input.Amount.String(), input.SuccessRedirectURL, input.FailureRedirectURL).Scan(&insertedID)
	if errors.Is(err, pgx.ErrNoRows) {
		s.writeExistingFundingCheckout(w, r, acct.ID, idem)
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "funding checkout could not be recorded")
		return
	}

	result, err := s.ganapCheckout.CreateCheckout(r.Context(), GanapCheckoutRequest{
		ExternalID: externalID, Amount: input.Amount.String(),
		SuccessRedirectURL: input.SuccessRedirectURL, FailureRedirectURL: input.FailureRedirectURL,
		PayerEmail: acct.Email, PayerName: acct.Name,
	})
	if err != nil {
		_, _ = s.db.Exec(r.Context(), `update platform.funding_checkout set status='provider_error',provider_status='request_failed',updated_at=now() where id=$1 and status='created'`, checkoutID)
		writeError(w, http.StatusBadGateway, "funding provider unavailable")
		return
	}
	tag, err := s.db.Exec(r.Context(), `update platform.funding_checkout set status='pending',provider_status=$2,
		provider_reference=nullif($3,''),checkout_url=nullif($4,''),updated_at=now()
		where id=$1 and status in ('created','provider_error')`, checkoutID, result.Status, result.ReferenceNumber, result.CheckoutURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "funding checkout could not be updated")
		return
	}
	if tag.RowsAffected() == 0 {
		s.writeExistingFundingCheckout(w, r, acct.ID, idem)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{
		"id": checkoutID, "externalId": externalID, "status": "pending",
		"providerStatus": result.Status, "providerReference": result.ReferenceNumber, "checkoutURL": result.CheckoutURL,
	})
}

func (s *Service) getFundingCheckout(w http.ResponseWriter, r *http.Request) {
	acct, err := s.accountFor(r.Context(), currentIdentity(r).Subject)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "account unavailable")
		return
	}
	var id, externalID, amount, currency, status, providerStatus, providerReference, checkoutURL string
	err = s.db.QueryRow(r.Context(), `select id,external_id,amount::text,currency,status,provider_status,
		coalesce(provider_reference,''),coalesce(checkout_url,'') from platform.funding_checkout where account_id=$1 and external_id=$2`,
		acct.ID, r.PathValue("externalID")).Scan(&id, &externalID, &amount, &currency, &status, &providerStatus, &providerReference, &checkoutURL)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "funding checkout not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "funding checkout unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "externalId": externalID, "amount": amount, "currency": currency, "status": status, "providerStatus": providerStatus, "providerReference": providerReference, "checkoutURL": checkoutURL})
}

func (s *Service) writeExistingFundingCheckout(w http.ResponseWriter, r *http.Request, accountID, idem string) {
	var id, externalID, status, providerStatus, providerReference, checkoutURL string
	err := s.db.QueryRow(r.Context(), `select id,external_id,status,provider_status,coalesce(provider_reference,''),coalesce(checkout_url,'')
		from platform.funding_checkout where account_id=$1 and idempotency_key=$2`, accountID, idem).
		Scan(&id, &externalID, &status, &providerStatus, &providerReference, &checkoutURL)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "funding checkout unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "externalId": externalID, "status": status, "providerStatus": providerStatus, "providerReference": providerReference, "checkoutURL": checkoutURL})
}

func (s *Service) receiveGanapWebhook(w http.ResponseWriter, r *http.Request) {
	if s.ganapCheckout == nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid webhook payload")
		return
	}
	event, err := s.ganapCheckout.VerifyWebhook(r.PathValue("secret"), r.Header, body)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "webhook authentication failed")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var checkoutID, accountID, expectedAmount, currentStatus string
	err = tx.QueryRow(r.Context(), `select id,account_id,amount::text,status from platform.funding_checkout where external_id=$1 for update`, event.ExternalID).Scan(&checkoutID, &accountID, &expectedAmount, &currentStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "checkout not found")
		return
	}
	if err != nil || !equalDecimal(expectedAmount, event.Amount) {
		writeError(w, http.StatusConflict, "webhook does not match checkout")
		return
	}
	providerEventID := event.ExternalID + ":" + event.Status + ":" + event.ReferenceNumber
	var inboxID string
	err = tx.QueryRow(r.Context(), `insert into platform.webhook_inbox(
		id,connector_id,provider_event_id,event_type,payload_digest,signature_verified,authentication_method,status,processed_at
	) values($1,$2,$3,$4,$5,false,$6,'processed',now()) on conflict(connector_id,provider_event_id) do nothing returning id`,
		newID(), ganapConnectorID, providerEventID, "checkout."+event.Status, event.PayloadDigest, s.ganapCheckout.WebhookAuthenticationMethod()).Scan(&inboxID)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "duplicate"})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "webhook could not be recorded")
		return
	}
	if oneOf(currentStatus, "success", "failed") {
		if err := tx.Commit(r.Context()); err != nil {
			writeError(w, http.StatusInternalServerError, "webhook could not be committed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ignored", "reason": "checkout already terminal"})
		return
	}
	_, err = tx.Exec(r.Context(), `update platform.funding_checkout set status=$2,provider_status=$2,
		provider_reference=coalesce(nullif($3,''),provider_reference),webhook_payload_digest=$4,
		completed_at=case when $2 in ('success','failed') then now() else completed_at end,updated_at=now() where id=$1`,
		checkoutID, event.Status, event.ReferenceNumber, event.PayloadDigest)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "checkout could not be updated")
		return
	}
	_, err = tx.Exec(r.Context(), `insert into platform.activity_event(account_id,event_type,resource_type,resource_id,summary,metadata)
		values($1,$2,'funding_checkout',$3,$4,$5)`, accountID, "funding.checkout."+event.Status, checkoutID,
		"Funding checkout "+event.Status, map[string]string{"externalId": event.ExternalID, "providerReference": event.ReferenceNumber})
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "webhook could not be committed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "processed"})
}

func parseGanapCheckoutResponse(body []byte) (GanapCheckoutResponse, error) {
	var root map[string]any
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&root); err != nil {
		return GanapCheckoutResponse{}, errors.New("Ganap checkout returned invalid JSON")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return GanapCheckoutResponse{}, errors.New("Ganap checkout returned invalid JSON")
	}
	data := root
	if nested, ok := root["data"].(map[string]any); ok {
		data = nested
	}
	result := GanapCheckoutResponse{
		ExternalID:      firstString(data, "externalId", "external_id"),
		ReferenceNumber: firstString(data, "referenceNumber", "reference_number", "reference"),
		CheckoutURL:     firstString(data, "checkoutURL", "checkoutUrl", "checkout_url", "paymentURL", "paymentUrl", "url"),
		Status:          strings.ToLower(firstString(data, "status")),
	}
	if result.CheckoutURL != "" {
		parsed, err := url.Parse(result.CheckoutURL)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
			return GanapCheckoutResponse{}, errors.New("Ganap checkout returned an invalid checkout URL")
		}
	}
	return result, nil
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func validGanapAmount(raw string) bool {
	raw = strings.TrimSpace(raw)
	if !ganapAmountPattern.MatchString(raw) {
		return false
	}
	amount, ok := new(big.Rat).SetString(raw)
	if !ok || amount.Sign() < 0 {
		return false
	}
	if amount.Sign() == 0 {
		return true
	}
	return amount.Cmp(new(big.Rat).SetInt64(200)) >= 0 && amount.Cmp(new(big.Rat).SetInt64(50000)) <= 0
}

func equalDecimal(left, right string) bool {
	a, okA := new(big.Rat).SetString(left)
	b, okB := new(big.Rat).SetString(right)
	return okA && okB && a.Cmp(b) == 0
}

func normalizedHTTPSOrigin(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("origin must use HTTPS")
	}
	return parsed.Scheme + "://" + strings.ToLower(parsed.Host), nil
}

func secureEqual(left, right string) bool {
	return len(left) == len(right) && subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func splitCSV(raw string) []string {
	var values []string
	for _, value := range strings.Split(raw, ",") {
		if value = strings.TrimSpace(value); value != "" {
			values = append(values, value)
		}
	}
	return values
}

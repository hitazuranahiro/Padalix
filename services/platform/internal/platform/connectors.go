package platform

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
)

type ConnectorCapability string

const (
	CapabilityQuote     ConnectorCapability = "quote"
	CapabilityPayout    ConnectorCapability = "payout"
	CapabilityReconcile ConnectorCapability = "reconcile"
	CapabilityWebhook   ConnectorCapability = "webhook"
)

type ConnectorMetadata struct {
	Key          string                `json:"key"`
	DisplayName  string                `json:"displayName"`
	Environment  string                `json:"environment"`
	Capabilities []ConnectorCapability `json:"capabilities"`
}

type ConnectorQuoteRequest struct {
	SourceAsset         string
	DestinationCurrency string
	SourceAmount        string
	PaymentMethodID     string
}

type ConnectorQuote struct {
	ProviderReference string
	Rate              string
	FeeAmount         string
	DestinationAmount string
	ExpiresAtUnix     int64
}

type ConnectorTransferRequest struct {
	TransferID        string
	IdempotencyKey    string
	PaymentMethodID   string
	PayoutVaultRef    string
	SourceAsset       string
	SourceAmount      string
	DestinationAsset  string
	DestinationAmount string
}

type ConnectorSubmission struct {
	ProviderReference string
	Status            string
}

type ConnectorSettlement struct {
	ProviderReference string
	Status            string
	FailureCode       string
}

type ConnectorWebhook struct {
	ProviderEventID string
	EventType       string
	PayloadDigest   string
}

// MoneyMovementConnector is the only boundary through which provider-specific
// quote, payout, reconciliation, and webhook behavior may enter the platform.
type MoneyMovementConnector interface {
	Metadata() ConnectorMetadata
	Quote(context.Context, ConnectorQuoteRequest) (ConnectorQuote, error)
	Submit(context.Context, ConnectorTransferRequest) (ConnectorSubmission, error)
	Reconcile(context.Context, string) (ConnectorSettlement, error)
	VerifyWebhook(http.Header, []byte) (ConnectorWebhook, error)
}

type ConnectorRegistry struct {
	connectors map[string]MoneyMovementConnector
}

func NewConnectorRegistry(connectors ...MoneyMovementConnector) (*ConnectorRegistry, error) {
	registry := &ConnectorRegistry{connectors: make(map[string]MoneyMovementConnector, len(connectors))}
	for _, connector := range connectors {
		if connector == nil {
			return nil, errors.New("connector is nil")
		}
		metadata := connector.Metadata()
		key := strings.TrimSpace(metadata.Key)
		if key == "" {
			return nil, errors.New("connector key is required")
		}
		if _, exists := registry.connectors[key]; exists {
			return nil, errors.New("duplicate connector key: " + key)
		}
		registry.connectors[key] = connector
	}
	return registry, nil
}

func (r *ConnectorRegistry) Get(key string) (MoneyMovementConnector, bool) {
	connector, ok := r.connectors[key]
	return connector, ok
}

func (r *ConnectorRegistry) Metadata() []ConnectorMetadata {
	items := make([]ConnectorMetadata, 0, len(r.connectors))
	for _, connector := range r.connectors {
		items = append(items, connector.Metadata())
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Key < items[j].Key })
	return items
}

type paymentMethod struct {
	ID                       string   `json:"id"`
	Code                     string   `json:"code"`
	DisplayName              string   `json:"displayName"`
	PayoutType               string   `json:"payoutType"`
	CountryCode              string   `json:"countryCode"`
	DestinationCurrency      string   `json:"destinationCurrency"`
	DestinationNetwork       string   `json:"destinationNetwork,omitempty"`
	DestinationAsset         string   `json:"destinationAsset,omitempty"`
	MinimumAmount            string   `json:"minimumAmount,omitempty"`
	MaximumAmount            string   `json:"maximumAmount,omitempty"`
	MinimumVerificationLevel string   `json:"minimumVerificationLevel"`
	Capabilities             []string `json:"capabilities"`
	Environment              string   `json:"environment"`
	Provider                 string   `json:"provider"`
}

func (s *Service) listPaymentMethods(w http.ResponseWriter, r *http.Request) {
	country := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("country")))
	currency := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("currency")))
	if country == "" {
		country = "PH"
	}
	if currency == "" {
		currency = "PHP"
	}
	if len(country) != 2 || len(currency) != 3 {
		writeError(w, http.StatusBadRequest, "invalid payment method filter")
		return
	}

	rows, err := s.db.Query(r.Context(), `select m.id,m.method_code,m.display_name,m.payout_type,m.country_code,m.destination_currency,
		coalesce(m.destination_network,''),coalesce(m.destination_asset,''),coalesce(m.minimum_amount::text,''),coalesce(m.maximum_amount::text,''),
		m.minimum_verification_level,m.capabilities::text,c.environment,c.display_name
		from platform.payment_method m join platform.payment_connector c on c.id=m.connector_id
		where m.country_code=$1 and m.destination_currency=$2 and m.status='active' and c.status='active'
		order by m.display_name`, country, currency)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "payment methods unavailable")
		return
	}
	defer rows.Close()

	items := make([]paymentMethod, 0)
	for rows.Next() {
		var item paymentMethod
		var capabilitiesJSON string
		if err := rows.Scan(&item.ID, &item.Code, &item.DisplayName, &item.PayoutType, &item.CountryCode, &item.DestinationCurrency,
			&item.DestinationNetwork, &item.DestinationAsset, &item.MinimumAmount, &item.MaximumAmount,
			&item.MinimumVerificationLevel, &capabilitiesJSON, &item.Environment, &item.Provider); err != nil {
			writeError(w, http.StatusInternalServerError, "payment methods unavailable")
			return
		}
		if err := json.Unmarshal([]byte(capabilitiesJSON), &item.Capabilities); err != nil {
			writeError(w, http.StatusInternalServerError, "payment method configuration invalid")
			return
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, "payment methods unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"countryCode": country, "destinationCurrency": currency, "methods": items})
}

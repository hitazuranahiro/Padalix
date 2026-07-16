package platform

import (
	"context"
	"net/http"
	"testing"
)

type connectorStub struct{ key string }

func (c connectorStub) Metadata() ConnectorMetadata {
	return ConnectorMetadata{Key: c.key, DisplayName: c.key, Environment: "sandbox", Capabilities: []ConnectorCapability{CapabilityQuote}}
}
func (connectorStub) Quote(context.Context, ConnectorQuoteRequest) (ConnectorQuote, error) {
	return ConnectorQuote{}, nil
}
func (connectorStub) Submit(context.Context, ConnectorTransferRequest) (ConnectorSubmission, error) {
	return ConnectorSubmission{}, nil
}
func (connectorStub) Reconcile(context.Context, string) (ConnectorSettlement, error) {
	return ConnectorSettlement{}, nil
}
func (connectorStub) VerifyWebhook(http.Header, []byte) (ConnectorWebhook, error) {
	return ConnectorWebhook{}, nil
}

func TestConnectorRegistryRejectsDuplicateKeys(t *testing.T) {
	if _, err := NewConnectorRegistry(connectorStub{key: "sandbox"}, connectorStub{key: "sandbox"}); err == nil {
		t.Fatal("expected duplicate connector key to fail")
	}
}

func TestConnectorRegistryReturnsSortedMetadata(t *testing.T) {
	registry, err := NewConnectorRegistry(connectorStub{key: "wallet-z"}, connectorStub{key: "bank-a"})
	if err != nil {
		t.Fatal(err)
	}
	items := registry.Metadata()
	if len(items) != 2 || items[0].Key != "bank-a" || items[1].Key != "wallet-z" {
		t.Fatalf("unexpected metadata order: %#v", items)
	}
	if _, ok := registry.Get("bank-a"); !ok {
		t.Fatal("expected connector lookup to succeed")
	}
}

package platform

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func sampleReceipt() transferReceipt {
	createdAt := time.Date(2026, 7, 16, 2, 30, 0, 0, time.UTC)
	return transferReceipt{
		Version:             1,
		ReceiptNumber:       "PDX-2026-000001",
		TransferID:          "transfer-1",
		Reference:           "PDX-2026-000001",
		Status:              "confirmed",
		RecipientName:       "Ada Example",
		SourceAsset:         "USDC",
		SourceAmount:        "10.0000000",
		DestinationCurrency: "PHP",
		DestinationAmount:   "570.0000000",
		FeeAmount:           "0.1000000",
		Rate:                "57.0000000",
		CreatedAt:           createdAt,
		ConfirmedAt:         createdAt.Add(time.Second),
		ProviderKey:         "padalix_sandbox",
		ProviderName:        "Padalix Sandbox",
		ProviderEnvironment: "sandbox",
		ProviderStatus:      "confirmed",
	}
}

func TestReceiptDigestIsStableAndSensitive(t *testing.T) {
	receipt := sampleReceipt()
	first := receiptDigest(receipt)
	second := receiptDigest(receipt)
	if first != second || len(first) != 64 {
		t.Fatalf("expected stable SHA-256 digest, got %q and %q", first, second)
	}

	receipt.DestinationAmount = "571.0000000"
	if changed := receiptDigest(receipt); changed == first {
		t.Fatal("expected receipt amount change to alter digest")
	}
}

func TestWriteReceiptExportJSON(t *testing.T) {
	receipt := sampleReceipt()
	receipt.Digest = receiptDigest(receipt)
	recorder := httptest.NewRecorder()

	writeReceiptExport(recorder, "json", []transferReceipt{receipt}, receipt.Reference)

	if got := recorder.Header().Get("Content-Disposition"); got != `attachment; filename="PDX-2026-000001.json"` {
		t.Fatalf("unexpected content disposition: %q", got)
	}
	var payload struct {
		SchemaVersion int               `json:"schemaVersion"`
		Count         int               `json:"count"`
		Transfers     []transferReceipt `json:"transfers"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode export: %v", err)
	}
	if payload.SchemaVersion != 1 || payload.Count != 1 || payload.Transfers[0].Digest != receipt.Digest {
		t.Fatalf("unexpected export payload: %+v", payload)
	}
}

func TestWriteReceiptExportCSV(t *testing.T) {
	receipt := sampleReceipt()
	receipt.Digest = receiptDigest(receipt)
	recorder := httptest.NewRecorder()

	writeReceiptExport(recorder, "csv", []transferReceipt{receipt}, receipt.Reference)

	body := recorder.Body.String()
	if !strings.Contains(body, "stellar_transaction_hash") || !strings.Contains(body, receipt.Reference) || !strings.Contains(body, receipt.Digest) {
		t.Fatalf("CSV export is missing required evidence fields: %s", body)
	}
}

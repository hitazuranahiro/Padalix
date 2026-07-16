package platform

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stellar/go-stellar-sdk/keypair"
	"github.com/stellar/go-stellar-sdk/txnbuild"
)

type successfulStellarNetwork struct{}

func (successfulStellarNetwork) LoadAccount(context.Context, string) (txnbuild.Account, error) {
	return nil, nil
}

func (successfulStellarNetwork) Balances(context.Context, string) ([]stellarBalance, error) {
	return nil, nil
}

func (successfulStellarNetwork) Submit(context.Context, string) (stellarSubmission, error) {
	return stellarSubmission{}, nil
}

func (successfulStellarNetwork) Transaction(context.Context, string) (stellarTransactionResult, error) {
	return stellarTransactionResult{Status: "SUCCESS", Ledger: 12345}, nil
}

func TestPostStellarLedgerIsBalancedAndIdempotent(t *testing.T) {
	databaseURL := os.Getenv("PADALIX_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("PADALIX_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	tx, err := db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	memberID, accountID, quoteID, transferID := newID(), newID(), newID(), newID()
	reference := "PDX-TEST-" + newID()[:8]
	if _, err = tx.Exec(ctx, `insert into identity.member(id,auth_subject,email,full_name,account_status)
		values($1,$2,$3,'Worker integration test','active')`, memberID, "test:"+memberID, memberID+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `insert into platform.account(id,auth_subject,member_id) values($1,$2,$3)`, accountID, "test:"+memberID, memberID); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `insert into platform.quote(
		id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,status,expires_at
	) values($1,$2,'XLM','XLM',2.5,2.5,0.00001,1,'consumed',$3)`, quoteID, accountID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `insert into platform.transfer(
		id,reference,account_id,quote_id,recipient_name,source_asset,destination_currency,source_amount,
		destination_amount,fee_amount,status,idempotency_key,settlement_mode,confirmed_at
	) values($1,$2,$3,$4,'Stellar test recipient','XLM','XLM',2.5,2.5,0.00001,'confirmed',$5,'stellar_testnet',now())`,
		transferID, reference, accountID, quoteID, "test:"+transferID); err != nil {
		t.Fatal(err)
	}
	record := stellarPaymentRecord{
		AccountID: accountID, TransferID: transferID, Reference: reference,
		AssetCode: "XLM", Amount: "2.5000000", FeeAmount: "0.0000100",
	}
	if err := postStellarLedger(ctx, tx, record); err != nil {
		t.Fatal(err)
	}
	if err := postStellarLedger(ctx, tx, record); err != nil {
		t.Fatalf("idempotent repost failed: %v", err)
	}
	if _, err := tx.Exec(ctx, `set constraints platform.ledger_postings_balanced immediate`); err != nil {
		t.Fatalf("ledger constraint rejected postings: %v", err)
	}
	var count int
	var total string
	if err := tx.QueryRow(ctx, `select count(*),sum(p.amount)::text from platform.ledger_posting p
		join platform.ledger_transaction t on t.id=p.transaction_id where t.transfer_id=$1`, transferID).Scan(&count, &total); err != nil {
		t.Fatal(err)
	}
	if count != 4 || total != "0.0000000" {
		t.Fatalf("got %d postings totaling %s, want 4 totaling 0.0000000", count, total)
	}
}

func TestWorkerReconcilesSubmittedPaymentEndToEnd(t *testing.T) {
	databaseURL := os.Getenv("PADALIX_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("PADALIX_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	memberID, accountID, quoteID := newID(), newID(), newID()
	transferID, walletID, intentID := newID(), newID(), newID()
	reference := "PDX-WORKER-" + newID()[:8]
	source, _ := keypair.Random()
	destination, _ := keypair.Random()
	hash := strings.Repeat("a", 64)
	idempotencyKey := "test:" + transferID
	cleanup := func() {
		_, _ = db.Exec(ctx, `delete from notification.outbox where idempotency_key=$1`, "stellar-confirmed:"+intentID)
		_, _ = db.Exec(ctx, `delete from platform.outbox_job where aggregate_id=$1`, intentID)
		_, _ = db.Exec(ctx, `delete from platform.reconciliation_exception where payment_intent_id=$1`, intentID)
		_, _ = db.Exec(ctx, `delete from platform.transfer_evidence_event where transfer_id=$1`, transferID)
		_, _ = db.Exec(ctx, `delete from platform.ledger_posting where transaction_id in (select id from platform.ledger_transaction where transfer_id=$1)`, transferID)
		_, _ = db.Exec(ctx, `delete from platform.ledger_transaction where transfer_id=$1`, transferID)
		_, _ = db.Exec(ctx, `delete from platform.activity_event where resource_id=$1`, transferID)
		_, _ = db.Exec(ctx, `delete from platform.stellar_payment_intent where id=$1`, intentID)
		_, _ = db.Exec(ctx, `delete from platform.transfer where id=$1`, transferID)
		_, _ = db.Exec(ctx, `delete from platform.quote where id=$1`, quoteID)
		_, _ = db.Exec(ctx, `delete from platform.stellar_wallet_link where id=$1`, walletID)
		_, _ = db.Exec(ctx, `delete from platform.ledger_account where account_id=$1`, accountID)
		_, _ = db.Exec(ctx, `delete from platform.account where id=$1`, accountID)
		_, _ = db.Exec(ctx, `delete from identity.member where id=$1`, memberID)
	}
	defer cleanup()
	cleanup()

	if _, err = db.Exec(ctx, `insert into identity.member(id,auth_subject,email,full_name,account_status)
		values($1,$2,$3,'Worker reconciliation test','active')`, memberID, idempotencyKey, memberID+"@example.invalid"); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `insert into platform.account(id,auth_subject,member_id) values($1,$2,$3)`, accountID, idempotencyKey, memberID); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `insert into platform.stellar_wallet_link(id,account_id,public_key,network) values($1,$2,$3,'testnet')`, walletID, accountID, source.Address()); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `insert into platform.quote(
		id,account_id,source_asset,destination_currency,source_amount,destination_amount,fee_amount,rate,status,expires_at
	) values($1,$2,'XLM','XLM',2.5,2.5,0.00001,1,'consumed',$3)`, quoteID, accountID, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `insert into platform.transfer(
		id,reference,account_id,quote_id,recipient_name,source_asset,destination_currency,source_amount,
		destination_amount,fee_amount,status,idempotency_key,settlement_mode
	) values($1,$2,$3,$4,'Stellar worker recipient','XLM','XLM',2.5,2.5,0.00001,'submitted',$5,'stellar_testnet')`,
		transferID, reference, accountID, quoteID, idempotencyKey); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `insert into platform.stellar_payment_intent(
		id,account_id,transfer_id,wallet_link_id,network,source_public_key,destination_public_key,
		asset_code,amount,unsigned_xdr,transaction_hash,status,expires_at,submitted_at
	) values($1,$2,$3,$4,'testnet',$5,$6,'XLM',2.5,'unsigned-test-envelope',$7,'submitted',$8,now())`,
		intentID, accountID, transferID, walletID, source.Address(), destination.Address(), hash, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	stellar := &StellarPaymentService{config: testStellarPaymentConfig(), network: successfulStellarNetwork{}}
	worker := NewWorker(db, stellar, WorkerConfig{ID: "integration-worker", PollInterval: time.Second, LockTimeout: time.Minute})
	if err := worker.RunOnce(ctx); err != nil {
		t.Fatal(err)
	}
	var intentStatus, reconciliationStatus, jobStatus string
	var ledger int64
	if err := db.QueryRow(ctx, `select status,reconciliation_status,ledger from platform.stellar_payment_intent where id=$1`, intentID).
		Scan(&intentStatus, &reconciliationStatus, &ledger); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `select status from platform.outbox_job where aggregate_id=$1`, intentID).Scan(&jobStatus); err != nil {
		t.Fatal(err)
	}
	var postingTotal string
	if err := db.QueryRow(ctx, `select sum(p.amount)::text from platform.ledger_posting p join platform.ledger_transaction t
		on t.id=p.transaction_id where t.transfer_id=$1`, transferID).Scan(&postingTotal); err != nil {
		t.Fatal(err)
	}
	var notificationCount int
	if err := db.QueryRow(ctx, `select count(*) from notification.outbox where idempotency_key=$1`, "stellar-confirmed:"+intentID).Scan(&notificationCount); err != nil {
		t.Fatal(err)
	}
	if intentStatus != "confirmed" || reconciliationStatus != "matched" || ledger != 12345 || jobStatus != "completed" {
		t.Fatalf("unexpected reconciliation state: intent=%s reconciliation=%s ledger=%d job=%s", intentStatus, reconciliationStatus, ledger, jobStatus)
	}
	if postingTotal != "0.0000000" || notificationCount != 1 {
		t.Fatalf("posting total %s and notification count %d are not idempotent", postingTotal, notificationCount)
	}
}

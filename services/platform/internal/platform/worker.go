package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const stellarReconcileTopic = "stellar.reconcile"

type WorkerConfig struct {
	ID                   string
	PollInterval         time.Duration
	LockTimeout          time.Duration
	EmailDeliveryEnabled bool
	EmailProviderURL     string
	EmailProviderToken   string
	EmailFrom            string
}

type Worker struct {
	db      *pgxpool.Pool
	stellar *StellarPaymentService
	config  WorkerConfig
	http    *http.Client
	now     func() time.Time
}

type outboxJob struct {
	ID          string
	Topic       string
	AggregateID string
	Attempts    int
	MaxAttempts int
}

type notificationJob struct {
	ID             int64
	Category       string
	TemplateKey    string
	Recipient      string
	Payload        map[string]any
	IdempotencyKey string
	Attempts       int
	MaxAttempts    int
}

func WorkerConfigFromEnv() (WorkerConfig, error) {
	poll, err := envDuration("WORKER_POLL_INTERVAL", 2*time.Second)
	if err != nil {
		return WorkerConfig{}, err
	}
	lockTimeout, err := envDuration("WORKER_LOCK_TIMEOUT", 2*time.Minute)
	if err != nil {
		return WorkerConfig{}, err
	}
	config := WorkerConfig{
		ID:                   envValue("WORKER_ID", "worker-"+newID()),
		PollInterval:         poll,
		LockTimeout:          lockTimeout,
		EmailDeliveryEnabled: strings.EqualFold(strings.TrimSpace(os.Getenv("EMAIL_DELIVERY_ENABLED")), "true"),
		EmailProviderURL:     strings.TrimSpace(os.Getenv("EMAIL_PROVIDER_URL")),
		EmailProviderToken:   strings.TrimSpace(os.Getenv("EMAIL_PROVIDER_TOKEN")),
		EmailFrom:            strings.TrimSpace(os.Getenv("EMAIL_FROM")),
	}
	if config.PollInterval < 100*time.Millisecond || config.LockTimeout < time.Second {
		return WorkerConfig{}, errors.New("worker intervals are below the safe minimum")
	}
	if config.EmailDeliveryEnabled && (config.EmailProviderURL == "" || config.EmailProviderToken == "" || config.EmailFrom == "") {
		return WorkerConfig{}, errors.New("EMAIL_PROVIDER_URL, EMAIL_PROVIDER_TOKEN, and EMAIL_FROM are required when email delivery is enabled")
	}
	if config.EmailDeliveryEnabled {
		providerURL, err := url.Parse(config.EmailProviderURL)
		if err != nil || providerURL.Scheme != "https" || providerURL.Host == "" || providerURL.User != nil {
			return WorkerConfig{}, errors.New("EMAIL_PROVIDER_URL must be an HTTPS URL without user information")
		}
	}
	return config, nil
}

func envDuration(key string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be a duration: %w", key, err)
	}
	return value, nil
}

func NewWorker(db *pgxpool.Pool, stellar *StellarPaymentService, config WorkerConfig) *Worker {
	return &Worker{db: db, stellar: stellar, config: config, http: &http.Client{Timeout: 10 * time.Second}, now: time.Now}
}

func (w *Worker) Run(ctx context.Context) error {
	if err := w.RunOnce(ctx); err != nil {
		slog.Error("worker cycle failed", "error", err)
	}
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := w.RunOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				slog.Error("worker cycle failed", "error", err)
			}
		}
	}
}

func (w *Worker) RunOnce(ctx context.Context) error {
	if err := w.recoverStaleLocks(ctx); err != nil {
		return err
	}
	if w.stellar != nil && w.stellar.Enabled() {
		if err := w.enqueueMissingReconciliation(ctx); err != nil {
			return err
		}
		if err := w.processOnePlatformJob(ctx); err != nil {
			return err
		}
	}
	if w.config.EmailDeliveryEnabled {
		if err := w.suppressProductNotifications(ctx); err != nil {
			return err
		}
		if err := w.processOneNotification(ctx); err != nil {
			return err
		}
		if err := w.processOneSupportNotification(ctx); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) recoverStaleLocks(ctx context.Context) error {
	cutoff := w.now().UTC().Add(-w.config.LockTimeout)
	if _, err := w.db.Exec(ctx, `update platform.outbox_job set status='pending',locked_at=null,locked_by=null,
		available_at=least(available_at,now()),updated_at=now() where status='processing' and locked_at < $1`, cutoff); err != nil {
		return fmt.Errorf("recover platform jobs: %w", err)
	}
	if _, err := w.db.Exec(ctx, `update notification.outbox set status='pending',locked_at=null,locked_by=null,
		available_at=least(available_at,now()),updated_at=now() where status='processing' and locked_at < $1`, cutoff); err != nil {
		return fmt.Errorf("recover notification jobs: %w", err)
	}
	if _, err := w.db.Exec(ctx, `update support.notification_outbox set status='pending',locked_at=null,locked_by=null,
		available_at=least(available_at,now()),updated_at=now() where status='processing' and locked_at < $1`, cutoff); err != nil {
		return fmt.Errorf("recover support notification jobs: %w", err)
	}
	return nil
}

func (w *Worker) enqueueMissingReconciliation(ctx context.Context) error {
	_, err := w.db.Exec(ctx, `insert into platform.outbox_job(
		id,topic,aggregate_type,aggregate_id,idempotency_key,payload,status,max_attempts
	) select gen_random_uuid()::text,$1,'stellar_payment',i.id,'stellar-reconcile:'||i.id,
		jsonb_build_object('paymentIntentId',i.id,'transactionHash',i.transaction_hash),'pending',12
	from platform.stellar_payment_intent i where i.status='submitted'
	on conflict(idempotency_key) do nothing`, stellarReconcileTopic)
	if err != nil {
		return fmt.Errorf("enqueue reconciliation: %w", err)
	}
	return nil
}

func (w *Worker) processOnePlatformJob(ctx context.Context) error {
	job, err := w.claimPlatformJob(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if job.Topic != stellarReconcileTopic {
		return w.retryPlatformJob(ctx, job, "unsupported_topic")
	}
	record, err := scanStellarPaymentRow(w.db.QueryRow(ctx, stellarPaymentSelect+` where i.id=$1`, job.AggregateID))
	if errors.Is(err, pgx.ErrNoRows) {
		return w.deadLetterPlatformJob(ctx, job, "payment_not_found")
	}
	if err != nil {
		return w.retryPlatformJob(ctx, job, "payment_load_failed")
	}
	if record.Status == "confirmed" || record.Status == "failed" || record.Status == "expired" {
		return w.completePlatformJob(ctx, job.ID)
	}
	result, err := w.stellar.network.Transaction(ctx, record.TransactionHash)
	if err != nil {
		return w.retryPlatformJob(ctx, job, "stellar_lookup_failed")
	}
	switch strings.ToUpper(result.Status) {
	case "SUCCESS":
		if result.Ledger == 0 {
			return w.retryPlatformJob(ctx, job, "stellar_ledger_missing")
		}
		if err := confirmStellarPaymentContext(ctx, w.db, record, int64(result.Ledger)); err != nil {
			return w.retryPlatformJob(ctx, job, "confirmation_persistence_failed")
		}
		return w.completePlatformJob(ctx, job.ID)
	case "FAILED":
		if err := failStellarPaymentContext(ctx, w.db, record, "stellar_failed"); err != nil {
			return w.retryPlatformJob(ctx, job, "failure_persistence_failed")
		}
		return w.completePlatformJob(ctx, job.ID)
	default:
		return w.retryPlatformJob(ctx, job, "stellar_pending")
	}
}

func (w *Worker) claimPlatformJob(ctx context.Context) (outboxJob, error) {
	var job outboxJob
	err := w.db.QueryRow(ctx, `with candidate as (
		select id from platform.outbox_job where status='pending' and topic=$2 and available_at <= now()
		order by available_at,created_at for update skip locked limit 1
	) update platform.outbox_job j set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=$1,updated_at=now()
	from candidate where j.id=candidate.id returning j.id,j.topic,j.aggregate_id,j.attempts,j.max_attempts`, w.config.ID, stellarReconcileTopic).
		Scan(&job.ID, &job.Topic, &job.AggregateID, &job.Attempts, &job.MaxAttempts)
	return job, err
}

func (w *Worker) completePlatformJob(ctx context.Context, id string) error {
	_, err := w.db.Exec(ctx, `update platform.outbox_job set status='completed',completed_at=now(),locked_at=null,
		locked_by=null,last_error_code=null,updated_at=now() where id=$1 and status='processing' and locked_by=$2`, id, w.config.ID)
	return err
}

func (w *Worker) retryPlatformJob(ctx context.Context, job outboxJob, code string) error {
	if job.Attempts >= job.MaxAttempts {
		return w.deadLetterPlatformJob(ctx, job, code)
	}
	_, err := w.db.Exec(ctx, `update platform.outbox_job set status='pending',available_at=$1,locked_at=null,
		locked_by=null,last_error_code=$2,updated_at=now() where id=$3 and status='processing' and locked_by=$4`,
		w.now().UTC().Add(retryDelay(job.Attempts)), code, job.ID, w.config.ID)
	return err
}

func (w *Worker) deadLetterPlatformJob(ctx context.Context, job outboxJob, code string) error {
	tx, err := w.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `update platform.outbox_job set status='dead_letter',locked_at=null,locked_by=null,
		last_error_code=$1,updated_at=now() where id=$2 and status='processing' and locked_by=$3`, code, job.ID, w.config.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Commit(ctx)
	}
	if job.Topic == stellarReconcileTopic {
		_, err = tx.Exec(ctx, `insert into platform.reconciliation_exception(
			id,transfer_id,payment_intent_id,exception_code,details
		) select $1,transfer_id,id,$2,jsonb_build_object('outboxJobId',$3) from platform.stellar_payment_intent where id=$4
		on conflict(payment_intent_id,exception_code) do nothing`, newID(), code, job.ID, job.AggregateID)
		if err == nil {
			_, err = tx.Exec(ctx, `update platform.stellar_payment_intent set reconciliation_status='exception',updated_at=now() where id=$1`, job.AggregateID)
		}
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func retryDelay(attempt int) time.Duration {
	seconds := math.Pow(2, float64(max(attempt-1, 0)))
	if seconds > 300 {
		seconds = 300
	}
	return time.Duration(seconds) * time.Second
}

func (w *Worker) processOneNotification(ctx context.Context) error {
	job, err := w.claimNotification(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	providerID, err := w.sendNotification(ctx, job)
	if err != nil {
		if job.Attempts >= job.MaxAttempts {
			_, updateErr := w.db.Exec(ctx, `update notification.outbox set status='failed',processed_at=now(),locked_at=null,
				locked_by=null,last_error=$1,updated_at=now() where id=$2 and locked_by=$3`, "delivery_failed", job.ID, w.config.ID)
			return updateErr
		}
		_, updateErr := w.db.Exec(ctx, `update notification.outbox set status='pending',available_at=$1,locked_at=null,
			locked_by=null,last_error=$2,updated_at=now() where id=$3 and locked_by=$4`,
			w.now().UTC().Add(retryDelay(job.Attempts)), "delivery_failed", job.ID, w.config.ID)
		return updateErr
	}
	_, err = w.db.Exec(ctx, `update notification.outbox set status='sent',provider_message_id=$1,processed_at=now(),
		locked_at=null,locked_by=null,last_error=null,updated_at=now() where id=$2 and locked_by=$3`, providerID, job.ID, w.config.ID)
	return err
}

func (w *Worker) suppressProductNotifications(ctx context.Context) error {
	_, err := w.db.Exec(ctx, `update notification.outbox o set status='suppressed',processed_at=now(),
		last_error='product_email_opt_out',updated_at=now()
		where o.status='pending' and o.category='product' and o.available_at <= now()
		and not exists(select 1 from notification.member_preference p where p.member_id=o.member_id and p.product_email)`)
	return err
}

func (w *Worker) claimNotification(ctx context.Context) (notificationJob, error) {
	var job notificationJob
	var payload []byte
	err := w.db.QueryRow(ctx, `with candidate as (
		select o.id from notification.outbox o left join notification.member_preference p on p.member_id=o.member_id
		where o.status='pending' and o.available_at <= now()
		and (o.category <> 'product' or coalesce(p.product_email,false))
		order by o.available_at,o.created_at for update of o skip locked limit 1
	) update notification.outbox o set status='processing',attempts=o.attempts+1,locked_at=now(),locked_by=$1,updated_at=now()
	from candidate where o.id=candidate.id returning o.id,o.category,o.template_key,o.recipient,o.payload,
		coalesce(o.idempotency_key,'notification:'||o.id::text),o.attempts,o.max_attempts`, w.config.ID).
		Scan(&job.ID, &job.Category, &job.TemplateKey, &job.Recipient, &payload, &job.IdempotencyKey, &job.Attempts, &job.MaxAttempts)
	if err == nil {
		err = json.Unmarshal(payload, &job.Payload)
	}
	return job, err
}

func (w *Worker) sendNotification(ctx context.Context, job notificationJob) (string, error) {
	body, err := json.Marshal(map[string]any{
		"from": w.config.EmailFrom, "to": job.Recipient, "category": job.Category,
		"template": job.TemplateKey, "payload": job.Payload,
	})
	if err != nil {
		return "", err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, w.config.EmailProviderURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+w.config.EmailProviderToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", job.IdempotencyKey)
	response, err := w.http.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", fmt.Errorf("email provider returned %d", response.StatusCode)
	}
	var result struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result); err != nil || strings.TrimSpace(result.ID) == "" {
		return "", errors.New("email provider response omitted message id")
	}
	return result.ID, nil
}

func (w *Worker) processOneSupportNotification(ctx context.Context) error {
	job, err := w.claimSupportNotification(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	providerID, err := w.sendNotification(ctx, job)
	if err != nil {
		if job.Attempts >= job.MaxAttempts {
			_, updateErr := w.db.Exec(ctx, `update support.notification_outbox set status='failed',processed_at=now(),locked_at=null,
				locked_by=null,last_error=$1,updated_at=now() where id=$2 and locked_by=$3`, "delivery_failed", job.ID, w.config.ID)
			return updateErr
		}
		_, updateErr := w.db.Exec(ctx, `update support.notification_outbox set status='pending',available_at=$1,locked_at=null,
			locked_by=null,last_error=$2,updated_at=now() where id=$3 and locked_by=$4`,
			w.now().UTC().Add(retryDelay(job.Attempts)), "delivery_failed", job.ID, w.config.ID)
		return updateErr
	}
	_, err = w.db.Exec(ctx, `update support.notification_outbox set status='sent',provider_message_id=$1,processed_at=now(),
		locked_at=null,locked_by=null,last_error=null,updated_at=now() where id=$2 and locked_by=$3`, providerID, job.ID, w.config.ID)
	return err
}

func (w *Worker) claimSupportNotification(ctx context.Context) (notificationJob, error) {
	var job notificationJob
	var payload []byte
	var eventType string
	err := w.db.QueryRow(ctx, `with candidate as (
		select id from support.notification_outbox where status='pending' and available_at <= now()
		order by available_at,created_at for update skip locked limit 1
	) update support.notification_outbox o set status='processing',attempts=o.attempts+1,locked_at=now(),locked_by=$1,updated_at=now()
	from candidate where o.id=candidate.id returning o.id,o.event_type,o.recipient,o.payload,o.idempotency_key,o.attempts,o.max_attempts`, w.config.ID).
		Scan(&job.ID, &eventType, &job.Recipient, &payload, &job.IdempotencyKey, &job.Attempts, &job.MaxAttempts)
	if err == nil {
		job.Category = "transactional"
		job.TemplateKey = "support_" + strings.ReplaceAll(strings.ToLower(eventType), ".", "_") + "_v1"
		err = json.Unmarshal(payload, &job.Payload)
	}
	return job, err
}

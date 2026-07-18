package platform

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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
	ID                    string
	PollInterval          time.Duration
	LockTimeout           time.Duration
	EmailDeliveryEnabled  bool
	EmailProvider         string
	EmailProviderURL      string
	EmailProviderToken    string
	EmailFrom             string
	EmailAWSRegion        string
	EmailConfigurationSet string
}

type Worker struct {
	db           *pgxpool.Pool
	stellar      *StellarPaymentService
	config       WorkerConfig
	http         *http.Client
	email        emailSender
	emailInitErr error
	now          func() time.Time
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
		ID:                    envValue("WORKER_ID", "worker-"+newID()),
		PollInterval:          poll,
		LockTimeout:           lockTimeout,
		EmailDeliveryEnabled:  strings.EqualFold(strings.TrimSpace(os.Getenv("EMAIL_DELIVERY_ENABLED")), "true"),
		EmailProvider:         strings.ToLower(envValue("EMAIL_PROVIDER", "webhook")),
		EmailProviderURL:      strings.TrimSpace(os.Getenv("EMAIL_PROVIDER_URL")),
		EmailProviderToken:    strings.TrimSpace(os.Getenv("EMAIL_PROVIDER_TOKEN")),
		EmailFrom:             strings.TrimSpace(os.Getenv("EMAIL_FROM")),
		EmailAWSRegion:        strings.TrimSpace(os.Getenv("AWS_REGION")),
		EmailConfigurationSet: strings.TrimSpace(os.Getenv("EMAIL_SES_CONFIGURATION_SET")),
	}
	if config.PollInterval < 100*time.Millisecond || config.LockTimeout < time.Second {
		return WorkerConfig{}, errors.New("worker intervals are below the safe minimum")
	}
	if config.EmailDeliveryEnabled && config.EmailFrom == "" {
		return WorkerConfig{}, errors.New("EMAIL_FROM is required when email delivery is enabled")
	}
	if config.EmailDeliveryEnabled && config.EmailProvider == "webhook" {
		if config.EmailProviderURL == "" || config.EmailProviderToken == "" {
			return WorkerConfig{}, errors.New("EMAIL_PROVIDER_URL and EMAIL_PROVIDER_TOKEN are required for the webhook email provider")
		}
		providerURL, err := url.Parse(config.EmailProviderURL)
		if err != nil || providerURL.Scheme != "https" || providerURL.Host == "" || providerURL.User != nil {
			return WorkerConfig{}, errors.New("EMAIL_PROVIDER_URL must be an HTTPS URL without user information")
		}
	}
	if config.EmailDeliveryEnabled && config.EmailProvider == "ses" && config.EmailAWSRegion == "" {
		return WorkerConfig{}, errors.New("AWS_REGION is required for the SES email provider")
	}
	if config.EmailDeliveryEnabled && config.EmailProvider != "webhook" && config.EmailProvider != "ses" {
		return WorkerConfig{}, errors.New("EMAIL_PROVIDER must be webhook or ses")
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

func NewWorker(db *pgxpool.Pool, stellar *StellarPaymentService, config WorkerConfig) (*Worker, error) {
	httpClient := &http.Client{Timeout: 10 * time.Second}
	worker := &Worker{db: db, stellar: stellar, config: config, http: httpClient, now: time.Now}
	if config.EmailDeliveryEnabled {
		worker.email, worker.emailInitErr = newEmailSender(context.Background(), config, httpClient)
		if worker.emailInitErr != nil {
			return nil, worker.emailInitErr
		}
	}
	return worker, nil
}

func (w *Worker) Run(ctx context.Context) error {
	startedAt := w.now().UTC()
	if err := w.recordHeartbeat(ctx, startedAt, startedAt, nil, "starting"); err != nil {
		return fmt.Errorf("initialize worker heartbeat: %w", err)
	}
	w.runCycle(ctx, startedAt)
	ticker := time.NewTicker(w.config.PollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := w.recordHeartbeat(shutdownCtx, startedAt, w.now().UTC(), nil, "stopped"); err != nil {
				slog.Error("worker shutdown heartbeat failed", "error", err, "worker_id", w.config.ID)
			}
			return nil
		case <-ticker.C:
			w.runCycle(ctx, startedAt)
		}
	}
}

func (w *Worker) runCycle(ctx context.Context, workerStartedAt time.Time) {
	cycleStartedAt := w.now().UTC()
	cycleErr := w.RunOnce(ctx)
	status := "ok"
	if cycleErr != nil && !errors.Is(cycleErr, context.Canceled) {
		status = "error"
		slog.Error("worker cycle failed", "error", cycleErr, "worker_id", w.config.ID)
	}
	if err := w.recordHeartbeat(ctx, workerStartedAt, cycleStartedAt, cycleErr, status); err != nil && !errors.Is(err, context.Canceled) {
		slog.Error("worker heartbeat failed", "error", err, "worker_id", w.config.ID)
	}
}

func (w *Worker) recordHeartbeat(ctx context.Context, workerStartedAt, cycleStartedAt time.Time, cycleErr error, status string) error {
	completedAt := w.now().UTC()
	duration := max(int64(0), completedAt.Sub(cycleStartedAt).Milliseconds())
	errorCode := ""
	if cycleErr != nil {
		errorCode = operationalErrorCode(cycleErr)
	}
	_, err := w.db.Exec(ctx, `insert into operations.worker_heartbeat(
		worker_id,service,started_at,last_seen_at,last_cycle_started_at,last_cycle_completed_at,
		last_cycle_duration_ms,last_cycle_status,last_error_code,consecutive_errors,cycles_completed,metadata
	) values($1,'platform-worker',$2,$3,$4,$3,$5,$6,nullif($7,''),case when $6='error' then 1 else 0 end,
		case when $6 in ('ok','error') then 1 else 0 end,jsonb_build_object('pollIntervalMs',$8::bigint))
	on conflict(worker_id) do update set service=excluded.service,started_at=excluded.started_at,
		last_seen_at=excluded.last_seen_at,last_cycle_started_at=excluded.last_cycle_started_at,
		last_cycle_completed_at=excluded.last_cycle_completed_at,last_cycle_duration_ms=excluded.last_cycle_duration_ms,
		last_cycle_status=excluded.last_cycle_status,last_error_code=excluded.last_error_code,
		consecutive_errors=case when excluded.last_cycle_status='error' then operations.worker_heartbeat.consecutive_errors+1 else 0 end,
		cycles_completed=operations.worker_heartbeat.cycles_completed+case when excluded.last_cycle_status in ('ok','error') then 1 else 0 end,
		metadata=excluded.metadata`, w.config.ID, workerStartedAt, completedAt, cycleStartedAt, duration, status,
		errorCode, w.config.PollInterval.Milliseconds())
	return err
}

func operationalErrorCode(err error) string {
	if err == nil {
		return ""
	}
	message := strings.ToLower(err.Error())
	for _, candidate := range []struct{ fragment, code string }{
		{"recover platform jobs", "platform_lock_recovery_failed"},
		{"recover notification jobs", "notification_lock_recovery_failed"},
		{"recover support notification jobs", "support_lock_recovery_failed"},
		{"enqueue reconciliation", "reconciliation_enqueue_failed"},
	} {
		if strings.Contains(message, candidate.fragment) {
			return candidate.code
		}
	}
	return "worker_cycle_failed"
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
	_, err = w.db.Exec(ctx, `insert into platform.outbox_job(
		id,topic,aggregate_type,aggregate_id,idempotency_key,payload,status,max_attempts
	) select gen_random_uuid()::text,$1,'stellar_claimable_balance',i.id,'stellar-claimable-reconcile:'||i.id,
		jsonb_build_object('claimableBalanceIntentId',i.id,'transactionHash',i.transaction_hash),'pending',12
	from platform.stellar_claimable_balance_intent i where i.status='submitted'
	on conflict(idempotency_key) do nothing`, stellarClaimableReconcileTopic)
	if err != nil {
		return fmt.Errorf("enqueue claimable balance reconciliation: %w", err)
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
	switch job.Topic {
	case stellarReconcileTopic:
		return w.processStellarPaymentJob(ctx, job)
	case stellarClaimableReconcileTopic:
		return w.processStellarClaimableJob(ctx, job)
	default:
		return w.retryPlatformJob(ctx, job, "unsupported_topic")
	}
}

func (w *Worker) processStellarPaymentJob(ctx context.Context, job outboxJob) error {
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

func (w *Worker) processStellarClaimableJob(ctx context.Context, job outboxJob) error {
	record, err := scanStellarClaimableRow(w.db.QueryRow(ctx, stellarClaimableSelect+` where i.id=$1`, job.AggregateID))
	if errors.Is(err, pgx.ErrNoRows) {
		return w.deadLetterPlatformJob(ctx, job, "claimable_balance_not_found")
	}
	if err != nil {
		return w.retryPlatformJob(ctx, job, "claimable_balance_load_failed")
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
		if err := confirmStellarClaimableContext(ctx, w.db, record, int64(result.Ledger)); err != nil {
			return w.retryPlatformJob(ctx, job, "confirmation_persistence_failed")
		}
		return w.completePlatformJob(ctx, job.ID)
	case "FAILED":
		if err := failStellarClaimableContext(ctx, w.db, record, "stellar_failed"); err != nil {
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
		select id from platform.outbox_job where status='pending' and topic=any($2::text[]) and available_at <= now()
		order by available_at,created_at for update skip locked limit 1
	) update platform.outbox_job j set status='processing',attempts=j.attempts+1,locked_at=now(),locked_by=$1,updated_at=now()
	from candidate where j.id=candidate.id returning j.id,j.topic,j.aggregate_id,j.attempts,j.max_attempts`, w.config.ID, []string{stellarReconcileTopic, stellarClaimableReconcileTopic}).
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
	} else if job.Topic == stellarClaimableReconcileTopic {
		_, err = tx.Exec(ctx, `insert into platform.reconciliation_exception(
			id,transfer_id,claimable_balance_intent_id,exception_code,details
		) select $1,transfer_id,id,$2,jsonb_build_object('outboxJobId',$3) from platform.stellar_claimable_balance_intent where id=$4
		on conflict(claimable_balance_intent_id,exception_code) where claimable_balance_intent_id is not null do nothing`, newID(), code, job.ID, job.AggregateID)
		if err == nil {
			_, err = tx.Exec(ctx, `update platform.stellar_claimable_balance_intent set reconciliation_status='exception',updated_at=now() where id=$1`, job.AggregateID)
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
	if w.emailInitErr != nil {
		return "", w.emailInitErr
	}
	if w.email == nil {
		return "", errors.New("email provider is not initialized")
	}
	return w.email.Send(ctx, job)
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

package platform

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const workerHeartbeatStaleAfter = 60 * time.Second

type workerHeartbeat struct {
	ID                string     `json:"id"`
	Service           string     `json:"service"`
	StartedAt         time.Time  `json:"startedAt"`
	LastSeenAt        time.Time  `json:"lastSeenAt"`
	LastCycleStarted  *time.Time `json:"lastCycleStartedAt,omitempty"`
	LastCycleFinished *time.Time `json:"lastCycleCompletedAt,omitempty"`
	LastCycleMillis   *int64     `json:"lastCycleDurationMs,omitempty"`
	LastCycleStatus   string     `json:"lastCycleStatus"`
	LastErrorCode     string     `json:"lastErrorCode,omitempty"`
	ConsecutiveErrors int        `json:"consecutiveErrors"`
	CyclesCompleted   int64      `json:"cyclesCompleted"`
	Healthy           bool       `json:"healthy"`
	HeartbeatAge      int64      `json:"heartbeatAgeSeconds"`
}

type queueMetric struct {
	Queue            string `json:"queue"`
	Status           string `json:"status"`
	Count            int64  `json:"count"`
	OldestAgeSeconds int64  `json:"oldestAgeSeconds"`
}

func heartbeatHealthy(lastSeen time.Time, cycleStatus string, now time.Time) bool {
	age := now.Sub(lastSeen)
	return age >= 0 && age <= workerHeartbeatStaleAfter && cycleStatus != "error" && cycleStatus != "stopped"
}

func (s *Service) workerHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	heartbeat, err := s.latestWorkerHeartbeat(ctx)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "worker heartbeat unavailable")
		return
	}
	status := http.StatusOK
	if !heartbeat.Healthy {
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, map[string]any{
		"status":              map[bool]string{true: "ok", false: "unavailable"}[heartbeat.Healthy],
		"service":             "padalix-platform-worker",
		"heartbeatAgeSeconds": heartbeat.HeartbeatAge,
		"lastCycleStatus":     heartbeat.LastCycleStatus,
	})
}

func (s *Service) operationalMetrics(w http.ResponseWriter, r *http.Request) {
	if !s.hasInternalToken(r) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	workers, err := s.workerHeartbeats(ctx)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "worker metrics unavailable")
		return
	}
	queues, err := s.queueMetrics(ctx)
	if err != nil {
		writeError(w, http.StatusServiceUnavailable, "queue metrics unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"generatedAt": time.Now().UTC(),
		"workers":     workers,
		"queues":      queues,
	})
}

func (s *Service) hasInternalToken(r *http.Request) bool {
	supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	return s.internalToken != "" && len(supplied) == len(s.internalToken) &&
		subtle.ConstantTimeCompare([]byte(supplied), []byte(s.internalToken)) == 1
}

func (s *Service) latestWorkerHeartbeat(ctx context.Context) (workerHeartbeat, error) {
	rows, err := s.workerHeartbeats(ctx)
	if err != nil {
		return workerHeartbeat{}, err
	}
	if len(rows) == 0 {
		return workerHeartbeat{}, pgx.ErrNoRows
	}
	return rows[0], nil
}

func (s *Service) workerHeartbeats(ctx context.Context) ([]workerHeartbeat, error) {
	rows, err := s.db.Query(ctx, `select worker_id,service,started_at,last_seen_at,last_cycle_started_at,
		last_cycle_completed_at,last_cycle_duration_ms,last_cycle_status,coalesce(last_error_code,''),
		consecutive_errors,cycles_completed from operations.worker_heartbeat order by last_seen_at desc`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := time.Now().UTC()
	result := make([]workerHeartbeat, 0)
	for rows.Next() {
		var item workerHeartbeat
		if err := rows.Scan(&item.ID, &item.Service, &item.StartedAt, &item.LastSeenAt, &item.LastCycleStarted,
			&item.LastCycleFinished, &item.LastCycleMillis, &item.LastCycleStatus, &item.LastErrorCode,
			&item.ConsecutiveErrors, &item.CyclesCompleted); err != nil {
			return nil, err
		}
		item.HeartbeatAge = max(0, int64(now.Sub(item.LastSeenAt).Seconds()))
		item.Healthy = heartbeatHealthy(item.LastSeenAt, item.LastCycleStatus, now)
		result = append(result, item)
	}
	return result, rows.Err()
}

func (s *Service) queueMetrics(ctx context.Context) ([]queueMetric, error) {
	rows, err := s.db.Query(ctx, `with queue as (
		select 'platform'::text as queue,status,created_at from platform.outbox_job
		union all select 'notification',status,created_at from notification.outbox
		union all select 'support_notification',status,created_at from support.notification_outbox
	) select queue,status,count(*)::bigint,
		greatest(0,extract(epoch from now()-min(created_at)))::bigint as oldest_age_seconds
		from queue group by queue,status order by queue,status`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make([]queueMetric, 0)
	for rows.Next() {
		var item queueMetric
		if err := rows.Scan(&item.Queue, &item.Status, &item.Count, &item.OldestAgeSeconds); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

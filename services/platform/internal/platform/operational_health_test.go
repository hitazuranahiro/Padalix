package platform

import (
	"errors"
	"testing"
	"time"
)

func TestHeartbeatHealthRequiresFreshSuccessfulCycle(t *testing.T) {
	now := time.Date(2026, time.July, 16, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name     string
		lastSeen time.Time
		status   string
		healthy  bool
	}{
		{name: "fresh", lastSeen: now.Add(-10 * time.Second), status: "ok", healthy: true},
		{name: "starting", lastSeen: now.Add(-10 * time.Second), status: "starting", healthy: true},
		{name: "stale", lastSeen: now.Add(-61 * time.Second), status: "ok", healthy: false},
		{name: "failed", lastSeen: now.Add(-2 * time.Second), status: "error", healthy: false},
		{name: "stopped", lastSeen: now.Add(-2 * time.Second), status: "stopped", healthy: false},
		{name: "future", lastSeen: now.Add(time.Second), status: "ok", healthy: false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			if got := heartbeatHealthy(test.lastSeen, test.status, now); got != test.healthy {
				t.Fatalf("heartbeatHealthy() = %v, want %v", got, test.healthy)
			}
		})
	}
}

func TestOperationalErrorCodeIsBounded(t *testing.T) {
	if got := operationalErrorCode(errors.New("recover notification jobs: database timeout")); got != "notification_lock_recovery_failed" {
		t.Fatalf("unexpected error code %q", got)
	}
	if got := operationalErrorCode(errors.New("secret provider detail")); got != "worker_cycle_failed" {
		t.Fatalf("unexpected fallback code %q", got)
	}
}

package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/hitazuranahiro/padalix/services/platform/internal/platform"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	stellarConfig, err := platform.StellarPaymentConfigFromEnv()
	if err != nil {
		slog.Error("stellar payment configuration invalid", "error", err)
		os.Exit(1)
	}
	stellar, err := platform.NewStellarPaymentService(stellarConfig)
	if err != nil {
		slog.Error("stellar payment service unavailable", "error", err)
		os.Exit(1)
	}
	config, err := platform.WorkerConfigFromEnv()
	if err != nil {
		slog.Error("worker configuration invalid", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("database configuration failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		slog.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	slog.Info("Padalix worker ready", "worker_id", config.ID)
	if err := platform.NewWorker(pool, stellar, config).Run(ctx); err != nil {
		slog.Error("worker stopped", "error", err)
		os.Exit(1)
	}
}

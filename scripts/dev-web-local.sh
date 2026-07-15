#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_ENV="$ROOT_DIR/apps/admin/.env.local"

if [[ ! -f "$ADMIN_ENV" ]]; then
  echo "Missing apps/admin/.env.local. Configure the admin ingestion service first." >&2
  exit 1
fi

KYC_INGEST_SECRET="$(sed -n 's/^KYC_INGEST_SECRET=//p' "$ADMIN_ENV" | tail -n 1)"
DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$ADMIN_ENV" | tail -n 1)"
ADMIN_AUTH_SECRET="$(sed -n 's/^BETTER_AUTH_SECRET=//p' "$ADMIN_ENV" | tail -n 1)"
if [[ -z "$KYC_INGEST_SECRET" || -z "$DATABASE_URL" || -z "$ADMIN_AUTH_SECRET" ]]; then
  echo "Admin database, auth, and KYC ingestion configuration is incomplete." >&2
  exit 1
fi

export KYC_INGEST_SECRET DATABASE_URL
export KYC_INGEST_URL="${KYC_INGEST_URL:-http://localhost:3001/api/internal/kyc/cases}"
export NEXT_PUBLIC_APP_ORIGIN="${NEXT_PUBLIC_APP_ORIGIN:-http://localhost:3002}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3002}"
export BETTER_AUTH_TRUSTED_ORIGINS="${BETTER_AUTH_TRUSTED_ORIGINS:-http://localhost:3002}"
export BETTER_AUTH_SECRET="$(printf 'padalix-customer-auth:%s' "$ADMIN_AUTH_SECRET" | shasum -a 256 | awk '{print $1}')"
export PLATFORM_API_ORIGIN_URL="${PLATFORM_API_ORIGIN_URL:-http://127.0.0.1:8080}"
export PLATFORM_INTERNAL_TOKEN="$(printf 'padalix-platform:%s' "$ADMIN_AUTH_SECRET" | shasum -a 256 | awk '{print $1}')"

exec pnpm --filter @padalix/web dev

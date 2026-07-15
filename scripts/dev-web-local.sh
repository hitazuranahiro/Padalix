#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_ENV="$ROOT_DIR/apps/admin/.env.local"

if [[ ! -f "$ADMIN_ENV" ]]; then
  echo "Missing apps/admin/.env.local. Configure the admin ingestion service first." >&2
  exit 1
fi

KYC_INGEST_SECRET="$(sed -n 's/^KYC_INGEST_SECRET=//p' "$ADMIN_ENV" | tail -n 1)"
if [[ -z "$KYC_INGEST_SECRET" ]]; then
  echo "KYC_INGEST_SECRET is missing from apps/admin/.env.local." >&2
  exit 1
fi

export KYC_INGEST_SECRET
export KYC_INGEST_URL="${KYC_INGEST_URL:-http://localhost:3001/api/internal/kyc/cases}"
export NEXT_PUBLIC_APP_ORIGIN="${NEXT_PUBLIC_APP_ORIGIN:-http://localhost:3002}"

exec pnpm --filter @padalix/web dev

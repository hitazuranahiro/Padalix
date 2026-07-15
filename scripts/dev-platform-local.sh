#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_ENV="$ROOT_DIR/apps/admin/.env.local"
if [[ ! -f "$ADMIN_ENV" ]]; then echo "Missing apps/admin/.env.local." >&2; exit 1; fi

DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$ADMIN_ENV" | tail -n 1)"
ADMIN_AUTH_SECRET="$(sed -n 's/^BETTER_AUTH_SECRET=//p' "$ADMIN_ENV" | tail -n 1)"
if [[ -z "$DATABASE_URL" || -z "$ADMIN_AUTH_SECRET" ]]; then echo "Admin database and auth secret are required." >&2; exit 1; fi

export DATABASE_URL
export PLATFORM_INTERNAL_TOKEN="$(printf 'padalix-platform:%s' "$ADMIN_AUTH_SECRET" | shasum -a 256 | awk '{print $1}')"
export PLATFORM_LISTEN_ADDR="${PLATFORM_LISTEN_ADDR:-127.0.0.1:8080}"
cd "$ROOT_DIR/services/platform"
exec go run ./cmd/api

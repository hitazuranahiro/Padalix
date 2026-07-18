#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-}"
DEMO_AUTH_SUBJECT="${DEMO_AUTH_SUBJECT:-}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

if [[ -z "$DEMO_AUTH_SUBJECT" ]]; then
  echo "DEMO_AUTH_SUBJECT is required. Use the Better Auth user id for an account that has signed in once." >&2
  exit 1
fi

psql "$DATABASE_URL" -v auth_subject="$DEMO_AUTH_SUBJECT" -f "$ROOT_DIR/scripts/seed-demo.sql"

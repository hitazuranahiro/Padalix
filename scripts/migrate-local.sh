#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://padalix:padalix-local-only@127.0.0.1:5432/padalix}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/apps/admin/sql/001_cms_schemas.sql"
PGOPTIONS="-c search_path=auth" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/apps/admin/sql/002_better_auth.sql"

for migration in \
  003_content_assets.sql \
  004_support_system.sql \
  005_kyc_compliance.sql \
  006_kyc_automation_and_capabilities.sql \
  007_customer_auth.sql \
  008_platform_mvp.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/apps/admin/sql/$migration"
done

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
  008_platform_mvp.sql \
  009_payment_connectors.sql \
  010_status_system.sql \
  011_customer_passkeys.sql \
  012_stellar_wallet_links.sql \
  013_transfer_receipts.sql \
  014_stellar_testnet_payments.sql \
  015_platform_worker_and_ledger.sql \
  016_kyc_evidence_storage.sql \
  017_compliance_control_plane.sql \
  018_worker_observability.sql \
  019_ganap_checkout_connector.sql \
  020_family_distribution.sql \
  021_recipient_claims.sql \
  022_stellar_claimable_balances.sql \
  023_family_distribution_execution.sql \
  024_account_preferences_and_terms.sql \
  025_customer_experience.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/apps/admin/sql/$migration"
done

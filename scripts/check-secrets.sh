#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

failed=0

report_matches() {
  local label="$1"
  local pattern="$2"
  local matches
  matches="$(git grep -nEI "$pattern" -- ':!pnpm-lock.yaml' 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    echo "$label" >&2
    echo "$matches" >&2
    failed=1
  fi
}

tracked_envs="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -Ev '\.env\.example$' || true)"
if [[ -n "$tracked_envs" ]]; then
  echo "Tracked environment files are not allowed:" >&2
  echo "$tracked_envs" >&2
  failed=1
fi

tracked_vercel="$(git ls-files | grep -E '(^|/)\.vercel/' || true)"
if [[ -n "$tracked_vercel" ]]; then
  echo "Tracked Vercel project metadata is not allowed:" >&2
  echo "$tracked_vercel" >&2
  failed=1
fi

report_matches "Private key material detected:" 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
report_matches "Cloud or source-control credential detected:" '(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|sk_live_[A-Za-z0-9]{20,})'
report_matches "Encoded application secret detected:" '(BETTER_AUTH_SECRET|PLATFORM_INTERNAL_TOKEN|KYC_INGEST_SECRET|SUPPORT_TOKEN_PEPPER|CRON_SECRET)[[:space:]]*=[[:space:]]*base64:[A-Za-z0-9+/=_-]{20,}'

while IFS= read -r match; do
  [[ -z "$match" ]] && continue
  case "$match" in
    *"@localhost"*|*"@127.0.0.1"*|*"<"*|*'${'*) ;;
    *)
      echo "Non-local PostgreSQL credential detected: $match" >&2
      failed=1
      ;;
  esac
done < <(git grep -nE 'postgres(ql)?://[^[:space:]<>]+:[^[:space:]<>]+@[^[:space:]<>]+' -- ':!pnpm-lock.yaml' 2>/dev/null || true)

if [[ $failed -ne 0 ]]; then
  echo "Secret scan failed. Remove the value from Git history and rotate it before continuing." >&2
  exit 1
fi

echo "Secret scan passed."

#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "Usage: $0 <staging|production> <marketing-url> <app-url> <admin-url> <api-url>" >&2
  exit 2
fi

environment="$1"
marketing_url="${2%/}"
app_url="${3%/}"
admin_url="${4%/}"
api_url="${5%/}"

if [[ "$environment" != "staging" && "$environment" != "production" ]]; then
  echo "Environment must be staging or production." >&2
  exit 2
fi

for url in "$marketing_url" "$app_url" "$admin_url" "$api_url"; do
  if [[ ! "$url" =~ ^https:// ]]; then
    echo "Deployment validation requires HTTPS: $url" >&2
    exit 2
  fi
done

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

require_header() {
  local file="$1"
  local header="$2"
  if ! tr -d '\r' < "$file" | grep -qi "^${header}:"; then
    echo "Missing ${header} in response captured at ${file}" >&2
    return 1
  fi
}

check_surface() {
  local name="$1"
  local url="$2"
  local header_file="$tmp_dir/${name}.headers"
  curl --silent --show-error --fail --location --max-time 20 --dump-header "$header_file" --output /dev/null "$url"
  require_header "$header_file" "Content-Security-Policy"
  require_header "$header_file" "Strict-Transport-Security"
  require_header "$header_file" "X-Content-Type-Options"
  require_header "$header_file" "X-Correlation-ID"
  echo "Validated $name at $url"
}

check_surface marketing "$marketing_url"
check_surface app "$app_url/login"
check_surface admin "$admin_url/login"

api_headers="$tmp_dir/api.headers"
api_body="$tmp_dir/api.body"
curl --silent --show-error --fail --max-time 20 --dump-header "$api_headers" --output "$api_body" "$api_url/health"
require_header "$api_headers" "Strict-Transport-Security"
require_header "$api_headers" "X-Content-Type-Options"
require_header "$api_headers" "X-Correlation-ID"
if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$api_body"; then
  echo "Platform health response is not healthy." >&2
  exit 1
fi

support_headers="$tmp_dir/support.headers"
support_status="$(curl --silent --show-error --max-time 20 --request OPTIONS \
  --header "Origin: $marketing_url" \
  --header "Access-Control-Request-Method: POST" \
  --dump-header "$support_headers" --output /dev/null --write-out '%{http_code}' \
  "$admin_url/api/support/tickets")"
if [[ "$support_status" != "204" ]]; then
  echo "Support preflight returned $support_status instead of 204." >&2
  exit 1
fi
if ! tr -d '\r' < "$support_headers" | grep -Fqi "Access-Control-Allow-Origin: $marketing_url"; then
  echo "Support preflight did not allow the exact marketing origin." >&2
  exit 1
fi

curl --silent --show-error --fail --max-time 20 --output /dev/null "$marketing_url/status"
echo "Deployment validation passed for $environment."

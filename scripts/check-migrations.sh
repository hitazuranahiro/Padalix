#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_DIR="$ROOT_DIR/apps/admin/sql"
MIGRATION_RUNNER="$ROOT_DIR/scripts/migrate-local.sh"

migrations=()
while IFS= read -r migration; do
  migrations+=("$migration")
done < <(find "$MIGRATION_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' -print | sort)

if [[ ${#migrations[@]} -eq 0 ]]; then
  echo "No SQL migrations found in $MIGRATION_DIR" >&2
  exit 1
fi

expected=1
for migration_path in "${migrations[@]}"; do
  migration="$(basename "$migration_path")"
  prefix="${migration%%_*}"
  number=$((10#$prefix))
  if [[ $number -ne $expected ]]; then
    printf 'Migration sequence error: expected %03d, found %s\n' "$expected" "$migration" >&2
    exit 1
  fi
  if ! grep -Fq "$migration" "$MIGRATION_RUNNER"; then
    echo "Migration is not included by scripts/migrate-local.sh: $migration" >&2
    exit 1
  fi
  expected=$((expected + 1))
done

while IFS= read -r listed; do
  [[ -z "$listed" ]] && continue
  if [[ ! -f "$MIGRATION_DIR/$listed" ]]; then
    echo "Migration runner references a missing file: $listed" >&2
    exit 1
  fi
done < <(grep -Eo '[0-9]{3}_[A-Za-z0-9_-]+\.sql' "$MIGRATION_RUNNER" | sort -u)

printf 'Validated %d sequential migrations.\n' "${#migrations[@]}"

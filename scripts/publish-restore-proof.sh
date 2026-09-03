#!/usr/bin/env bash

set -Eeuo pipefail

CONTAINER="${PG_BACKUP_CONTAINER:-}"
PROOF_FILE="${RESTORE_PROOF_FILE:-}"
CONFIRMATION="${RESTORE_PROOF_PUBLISH_CONFIRMATION:-}"

die() { echo "[restore-proof] ERROR: $*" >&2; exit 1; }
[[ "$CONFIRMATION" == PUBLISH_PII_SAFE_MONTHLY_RESTORE_PROOF ]] \
  || die 'konfirmasi publish restore proof tidak cocok'
[[ -n "$CONTAINER" ]] || die 'PG_BACKUP_CONTAINER wajib ditentukan eksplisit'
[[ "$CONTAINER" == smk-pg-backup ]] || die 'container backup authoritative tidak cocok'
[[ -n "$PROOF_FILE" && -f "$PROOF_FILE" ]] || die 'RESTORE_PROOF_FILE wajib dan harus ada'
grep -Eq '^\{"schemaVersion":"diis-restore-proof-v1","status":"(success|failed)","createdEpoch":[0-9]+\}$' \
  "$PROOF_FILE" || die 'restore proof tidak valid atau tidak PII-safe'

candidate="/tmp/diis-restore-proof-$$.json"
cleanup() { docker exec "$CONTAINER" rm -f "$candidate" "${candidate}.verify" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker cp "$PROOF_FILE" "${CONTAINER}:${candidate}" >/dev/null
docker exec "$CONTAINER" sh -c \
  '/opt/backup-bin/mc cp --quiet "$1" "myminio/${BACKUP_BUCKET}/postgres/monitor/restore-latest.json" && /opt/backup-bin/mc cp --quiet "myminio/${BACKUP_BUCKET}/postgres/monitor/restore-latest.json" "$2" && cmp -s "$1" "$2"' \
  sh "$candidate" "${candidate}.verify"
echo 'RESTORE_PROOF_PUBLISHED status=verified'

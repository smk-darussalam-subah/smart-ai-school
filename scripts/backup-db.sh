#!/usr/bin/env bash

set -euo pipefail

# Manual pre-change wrapper only. The pg-backup container is the sole scheduler
# and sole owner of durable local database backup points.
CONTAINER="${PG_BACKUP_CONTAINER:-smk-pg-backup}"
CONFIRMATION="${MANUAL_PRECHANGE_CONFIRM:-}"

if [[ "$CONFIRMATION" != 'CREATE_PROTECTED_PRECHANGE_BACKUP' ]]; then
  echo 'ERROR: set MANUAL_PRECHANGE_CONFIRM=CREATE_PROTECTED_PRECHANGE_BACKUP' >&2
  exit 64
fi

if ! docker ps --filter "name=^${CONTAINER}$" --filter status=running --format '{{.Names}}' \
  | grep -Fxq "$CONTAINER"; then
  echo "ERROR: backup container ${CONTAINER} is not running" >&2
  exit 69
fi

echo 'Starting one protected pre-change backup through the authoritative container.'
docker exec --env BACKUP_CLASS=pre-change "$CONTAINER" sh /backup.sh
echo 'Protected pre-change backup completed. No host dump was retained.'

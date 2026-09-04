#!/bin/bash

set -Eeuo pipefail

for command in docker curl awk sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { printf 'ERROR: %s unavailable\n' "$command" >&2; exit 70; }
done

running=$(docker ps -q | awk 'NF {n++} END {print n+0}')
unhealthy=$(docker ps --filter health=unhealthy -q | awk 'NF {n++} END {print n+0}')
[[ "$running" =~ ^[0-9]+$ && "$unhealthy" == 0 ]] || exit 71

docker exec smk-postgres sh -ceu 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null
migrations=$(docker exec smk-postgres sh -ceu \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"')
[[ "$migrations" =~ ^[0-9]+$ ]] || exit 72

backup_stats=$(docker exec smk-pg-backup sh -ceu '
  MC=$(command -v mc || true)
  [ -n "$MC" ] || MC=/opt/backup-bin/mc
  [ -x "$MC" ]
  points=$($MC find myminio/diis-backup/postgres --name "*.complete.json" | awk "NF {n++} END {print n+0}")
  bytes=$($MC du --json myminio/diis-backup 2>/dev/null | sed -n "s/.*\"size\":\([0-9][0-9]*\).*/\1/p" | tail -n 1)
  latest=$($MC find myminio/diis-backup/postgres --name "*.complete.json" | LC_ALL=C sort | tail -n 1)
  [ -n "$latest" ]
  latest_sha=$(printf "%s" "$latest" | sha256sum | awk "{print \$1}")
  printf "%s %s %s\n" "$points" "$bytes" "$latest_sha"
')
read -r backup_points backup_bytes latest_backup_sha <<<"$backup_stats"
[[ "$backup_points" =~ ^[0-9]+$ && "$backup_points" -gt 0 ]] || exit 73
[[ "$backup_bytes" =~ ^[0-9]+$ && "$backup_bytes" -gt 0 ]] || exit 73
[[ "$latest_backup_sha" =~ ^[a-f0-9]{64}$ ]] || exit 73

curl --fail --silent --show-error --max-time 15 https://smkdarussalamsubah.sch.id/health >/dev/null
curl --fail --silent --show-error --max-time 15 https://api.smkdarussalamsubah.sch.id/health >/dev/null

printf '{"schemaVersion":"diis-production-readonly-summary-v1","runningContainers":%s,"unhealthyContainers":0,"successfulMigrations":%s,"backupPoints":%s,"backupAggregateBytes":%s,"latestBackupPathSha256":"%s","databaseReady":true,"webHealthy":true,"apiHealthy":true}\n' \
  "$running" "$migrations" "$backup_points" "$backup_bytes" "$latest_backup_sha"

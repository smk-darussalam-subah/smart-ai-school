#!/bin/bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DU_PARSER="$SCRIPT_DIR/parse-minio-du-observation.py"
COMPLETION_VALIDATOR="$SCRIPT_DIR/validate-production-completion-observation.py"
CAPTURE_HELPER="$SCRIPT_DIR/bounded-command-capture.py"
COMPLETION_LIBRARY="$SCRIPT_DIR/w10d_completion_validation.py"
TEST_BOUNDARY="$SCRIPT_DIR/w10d-test-boundary.sh"
EXPECTED_MIGRATIONS=${EXPECTED_MIGRATIONS:-46}
SUMMARY_CAPTURE_TIMEOUT_SECONDS=${SUMMARY_CAPTURE_TIMEOUT_SECONDS:-30}
SUMMARY_TEMP_ROOT=${SUMMARY_TEMP_ROOT:-/tmp}

for command in docker curl awk sha256sum python3 sort mktemp rm stat id; do
  command -v "$command" >/dev/null 2>&1 || { printf 'ERROR: %s unavailable\n' "$command" >&2; exit 70; }
done
for helper in "$DU_PARSER" "$COMPLETION_VALIDATOR" "$CAPTURE_HELPER" "$COMPLETION_LIBRARY" "$TEST_BOUNDARY"; do
  [ -f "$helper" ] && [ ! -L "$helper" ] || exit 70
done
[[ "$EXPECTED_MIGRATIONS" =~ ^[0-9]+$ ]] || exit 70
[[ "$SUMMARY_CAPTURE_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] \
  && (( SUMMARY_CAPTURE_TIMEOUT_SECONDS >= 1 && SUMMARY_CAPTURE_TIMEOUT_SECONDS <= 60 )) || exit 70
# shellcheck source=w10d-test-boundary.sh
. "$TEST_BOUNDARY"
w10d_init_test_boundary || exit 70
if [ "$W10D_TEST_MODE" = 0 ]; then
  w10d_no_test_value "${ALLOW_TEST_SUMMARY_TEMP_ROOT:-}" || exit 70
  [ "$SUMMARY_TEMP_ROOT" = /tmp ] || exit 70
else
  [ "${ALLOW_TEST_SUMMARY_TEMP_ROOT:-0}" = 1 ] || exit 70
  w10d_test_path_confined "$SUMMARY_TEMP_ROOT" || exit 70
fi
[ -d "$SUMMARY_TEMP_ROOT" ] && [ ! -L "$SUMMARY_TEMP_ROOT" ] || exit 70

temp_dir=$(mktemp -d "$SUMMARY_TEMP_ROOT/diis-recovery-summary.XXXXXX") || exit 70
[ "$(stat -c '%a:%u' "$temp_dir")" = "700:$(id -u)" ] || exit 70
cleanup_temp() {
  code=$?
  trap - EXIT HUP INT TERM
  rm -rf -- "$temp_dir" || code=74
  [ ! -e "$temp_dir" ] || code=74
  exit "$code"
}
trap cleanup_temp EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
capture() {
  output=$1 max_bytes=$2
  shift 2
  python3 "$CAPTURE_HELPER" --output "$output" --max-bytes "$max_bytes" \
    --timeout-seconds "$SUMMARY_CAPTURE_TIMEOUT_SECONDS" -- "$@"
}

running_file="$temp_dir/running.containers"
unhealthy_file="$temp_dir/unhealthy.containers"
ready_file="$temp_dir/database.ready"
migrations_file="$temp_dir/migrations.count"
capture "$running_file" 1048576 docker ps -q || exit 71
capture "$unhealthy_file" 1048576 docker ps --filter health=unhealthy -q || exit 71
running=$(awk 'NF {n++} END {print n+0}' "$running_file")
unhealthy=$(awk 'NF {n++} END {print n+0}' "$unhealthy_file")
[[ "$running" =~ ^[0-9]+$ && "$unhealthy" == 0 ]] || exit 71

capture "$ready_file" 4096 docker exec smk-postgres sh -ceu \
  'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' || exit 72
capture "$migrations_file" 4096 docker exec smk-postgres sh -ceu \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;"' \
  || exit 72
migrations=$(awk 'NF { if (seen++) exit 1; value=$0 } END { if (seen != 1) exit 1; print value }' \
  "$migrations_file") || exit 72
[[ "$migrations" =~ ^[0-9]+$ && "$migrations" = "$EXPECTED_MIGRATIONS" ]] || exit 72

target_file="$temp_dir/target.inventory"
legacy_file="$temp_dir/legacy.inventory"
capture "$target_file" 1048576 docker exec smk-pg-backup sh -ceu '
  MC=$(command -v mc || true); [ -n "$MC" ] || MC=/opt/backup-bin/mc; [ -x "$MC" ]
  exec "$MC" find myminio/diis-backup/postgres --name "*.complete.json"
' || { printf 'ERROR: completion inventory observation failed\n' >&2; exit 73; }
capture "$legacy_file" 1048576 docker exec smk-pg-backup sh -ceu '
  MC=$(command -v mc || true); [ -n "$MC" ] || MC=/opt/backup-bin/mc; [ -x "$MC" ]
  exec "$MC" find myminio/diis-backup/postgres --name "*.sql.gz"
' || { printf 'ERROR: legacy inventory observation failed\n' >&2; exit 73; }

target_count=$(awk 'NF {n++} END {print n+0}' "$target_file")
legacy_count=$(awk 'NF {n++} END {print n+0}' "$legacy_file")
target_unique=$(awk 'NF' "$target_file" | LC_ALL=C sort -u | awk 'NF {n++} END {print n+0}')
legacy_unique=$(awk 'NF' "$legacy_file" | LC_ALL=C sort -u | awk 'NF {n++} END {print n+0}')
[ "$target_count" = "$target_unique" ] && [ "$legacy_count" = "$legacy_unique" ] || exit 73
(( target_count <= 256 && legacy_count <= 4096 )) || exit 73

content_set="$temp_dir/content-set"
: >"$content_set"
index=0
while IFS= read -r marker; do
  [ -n "$marker" ] || continue
  sidecar="${marker%.complete.json}.sha256"
  manifest_file="$temp_dir/manifest.$index"
  sidecar_file="$temp_dir/sidecar.$index"
  capture "$manifest_file" 131072 docker exec smk-pg-backup sh -ceu '
    MC=$(command -v mc || true); [ -n "$MC" ] || MC=/opt/backup-bin/mc; [ -x "$MC" ]
    exec "$MC" cat "$1"
  ' sh "$marker" || { printf 'ERROR: completion manifest read failed\n' >&2; exit 73; }
  capture "$sidecar_file" 4096 docker exec smk-pg-backup sh -ceu '
    MC=$(command -v mc || true); [ -n "$MC" ] || MC=/opt/backup-bin/mc; [ -x "$MC" ]
    exec "$MC" cat "$1"
  ' sh "$sidecar" || { printf 'ERROR: completion sidecar read failed\n' >&2; exit 73; }
  validation=$(python3 "$COMPLETION_VALIDATOR" --object-name "$marker" \
    --manifest-file "$manifest_file" --sidecar-file "$sidecar_file") \
    || { printf 'ERROR: completion manifest validation failed\n' >&2; exit 73; }
  [[ "$validation" =~ ^COMPLETION_OBSERVATION_VALID\ backupIdSha256=([a-f0-9]{64})\ manifestSha256=([a-f0-9]{64})\ sidecarSha256=([a-f0-9]{64})$ ]] || exit 73
  printf '%s:%s:%s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}" >>"$content_set"
  index=$((index + 1))
done <"$target_file"

typed="$temp_dir/typed-paths"
awk 'NF {print "target:" $0}' "$target_file" >"$typed"
awk 'NF {print "legacy:" $0}' "$legacy_file" >>"$typed"
path_set_sha=$(LC_ALL=C sort "$typed" | sha256sum | awk '{print $1}')
content_set_sha=$(LC_ALL=C sort "$content_set" | sha256sum | awk '{print $1}')
if (( target_count > 0 && legacy_count == 0 )); then
  backup_state=target-complete; backup_reason=target-completion-validated
elif (( target_count == 0 && legacy_count > 0 )); then
  backup_state=legacy-observed; backup_reason=legacy-capacity-preservation-only
elif (( target_count > 0 && legacy_count > 0 )); then
  backup_state=transition-observed; backup_reason=validated-target-and-legacy-observed
else
  printf 'ERROR: no recovery artifacts observed\n' >&2; exit 73
fi

du_file="$temp_dir/minio-du.json"
capture "$du_file" 1048576 docker exec smk-pg-backup sh -ceu '
  MC=$(command -v mc || true); [ -n "$MC" ] || MC=/opt/backup-bin/mc; [ -x "$MC" ]
  exec "$MC" du --json myminio/diis-backup
' || { printf 'ERROR: backup aggregate observation failed\n' >&2; exit 73; }
backup_bytes=$(python3 "$DU_PARSER" <"$du_file") || exit 73

[[ "$target_count" =~ ^[0-9]+$ && "$legacy_count" =~ ^[0-9]+$ && "$backup_bytes" =~ ^[0-9]+$ ]] || exit 73
[[ "$path_set_sha" =~ ^[a-f0-9]{64}$ && "$content_set_sha" =~ ^[a-f0-9]{64}$ ]] || exit 73
(( backup_bytes > 0 )) || { printf 'ERROR: backup aggregate observation invalid\n' >&2; exit 73; }
curl --fail --silent --show-error --max-time 15 https://smkdarussalamsubah.sch.id/health >/dev/null
curl --fail --silent --show-error --max-time 15 https://api.smkdarussalamsubah.sch.id/health >/dev/null

rm -rf -- "$temp_dir" || exit 74
[ ! -e "$temp_dir" ] || exit 74
trap - EXIT HUP INT TERM
printf '{"schemaVersion":"diis-production-readonly-summary-v3","runningContainers":%s,"unhealthyContainers":0,"successfulMigrations":%s,"backupState":"%s","backupReason":"%s","targetCompletionCount":%s,"legacyDumpCount":%s,"backupAggregateBytes":%s,"backupPathSetSha256":"%s","backupContentSetSha256":"%s","legacyTargetValidity":false,"databaseReady":true,"webHealthy":true,"apiHealthy":true}\n' \
  "$running" "$migrations" "$backup_state" "$backup_reason" "$target_count" "$legacy_count" \
  "$backup_bytes" "$path_set_sha" "$content_set_sha"

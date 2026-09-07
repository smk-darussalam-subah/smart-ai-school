#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${W10D_COMPLETION_VALIDATOR+x}" ] \
  || [ -n "${W10D_COMPLETION_VALIDATOR_PATH+x}" ] \
  || [ -n "${W10D_CAPTURE_HELPER_PATH+x}" ] \
  || [ -n "${W10D_DU_PARSER_PATH+x}" ]; then
  printf '%s\n' 'W10D_RUNTIME_SELECTOR_REJECTED' >&2
  exit 64
fi
. "${SCRIPT_DIR}/backup-lib.sh"
W10D_COMPLETION_VALIDATOR_PATH="${SCRIPT_DIR}/../../../scripts/w10d_completion_validation.py"
W10D_CAPTURE_HELPER_PATH="${SCRIPT_DIR}/../../../scripts/bounded-command-capture.py"
W10D_DU_PARSER_PATH="${SCRIPT_DIR}/../../../scripts/parse-minio-du-observation.py"

MC=${MC:-/opt/backup-bin/mc}
RCLONE=${RCLONE:-/opt/backup-bin/rclone}
TEMP_ROOT=${BACKUP_TEMP_ROOT:-/tmp}
LOCK_DIR=${BACKUP_LOCK_DIR:-/tmp/diis-pg-backup.lock}
TEMP_DIR=''
LOCK_ACQUIRED=0

cleanup() {
  code=$?
  cleanup_failed=0
  trap - EXIT
  [ -z "$TEMP_DIR" ] || rm -rf "$TEMP_DIR" || cleanup_failed=1
  if [ "$LOCK_ACQUIRED" -eq 1 ]; then
    release_directory_lock "$LOCK_DIR" 2>/dev/null || cleanup_failed=1
  fi
  if [ "$cleanup_failed" -ne 0 ] && [ "$code" -eq 0 ]; then
    code=70
  fi
  exit "$code"
}
on_signal() {
  trap - HUP INT TERM
  exit "$1"
}
trap cleanup EXIT
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

require_command pg_dump
require_command pg_restore
require_command psql
require_command sha256sum
require_command cmp
require_command base64
require_command python3
require_command awk
require_command grep
require_command sort
require_command cat
[ -z "${W10D_COMPLETION_VALIDATOR+x}" ] \
  || backup_die "override validator completion dilarang"
[ -x "$MC" ] || backup_die "MinIO client terverifikasi tidak tersedia"
[ -x "$RCLONE" ] || backup_die "rclone terverifikasi tidak tersedia"
require_value POSTGRES_HOST
require_value POSTGRES_USER
require_value POSTGRES_DB
require_value BACKUP_BUCKET
require_value OFFSITE_CRYPT_REMOTE
require_value RCLONE_MINIO_REMOTE
require_value APP_OBJECT_BUCKET

acquire_directory_lock "$LOCK_DIR"
LOCK_ACQUIRED=1
TEMP_DIR=$(mktemp -d "${TEMP_ROOT%/}/diis-backup.XXXXXX")
chmod 700 "$TEMP_DIR"

BACKUP_CLASS=${BACKUP_CLASS:-daily}
case "$BACKUP_CLASS" in daily|pre-change) ;; *) backup_die "BACKUP_CLASS tidak valid" ;; esac
# One clock observation binds every identity/retention field, including across
# second, day, ISO-week and month boundaries. Multiple date calls can disagree.
BACKUP_TIME_FIELDS=$(date -u '+%Y-%m-%dT%H:%M:%SZ %s %Y-%m-%d %G-W%V %Y-%m %Y%m%dT%H%M%SZ')
read -r CREATED_AT CREATED_EPOCH DAILY_KEY WEEKLY_KEY MONTHLY_KEY BACKUP_STAMP <<EOF
$BACKUP_TIME_FIELDS
EOF
BACKUP_ID="${BACKUP_STAMP}-$$"

remote="myminio/${BACKUP_BUCKET}/postgres"
telemetry_remote="${remote}/monitor/latest.json"

read_remote_bytes() {
  du_file="${TEMP_DIR}/remote-du.json"
  [ -f "$W10D_DU_PARSER_PATH" ] && [ ! -L "$W10D_DU_PARSER_PATH" ] \
    || backup_die "parser aggregate MinIO tidak tersedia"
  [ "$(sha256_file "$W10D_DU_PARSER_PATH")" = "$W10D_DU_PARSER_SHA256" ] \
    || backup_die "parser aggregate MinIO tidak cocok dengan source reviewed"
  w10d_capture_command "$du_file" 1048576 "$MC" du --json "$remote" \
    || backup_die "observasi aggregate MinIO gagal"
  measured=$(python3 "$W10D_DU_PARSER_PATH" <"$du_file") \
    || { rm -f "$du_file"; backup_die "observasi aggregate MinIO tidak valid"; }
  rm -f "$du_file"
  require_uint remote_bytes "$measured"
  printf '%s' "$measured"
}

remove_new_local_point() {
  cleanup_allowed="${TEMP_DIR}/cleanup-local-allowed"
  printf '%s\n' \
    "${remote}/${BACKUP_ID}.complete.json" \
    "${remote}/${BACKUP_ID}.dump" \
    "${remote}/${BACKUP_ID}.local.json" \
    "${remote}/${BACKUP_ID}.sha256" \
    | LC_ALL=C sort >"$cleanup_allowed"

  cleanup_pre_raw="${TEMP_DIR}/cleanup-local-pre.raw"
  cleanup_pre="${TEMP_DIR}/cleanup-local-pre.canonical"
  if ! w10d_capture_command "$cleanup_pre_raw" 65536 \
    "$MC" find "$remote" --name "${BACKUP_ID}.*"; then
    printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=pre-observation retry=prohibited\n' \
      "$BACKUP_ID" >&2
    return 74
  fi
  if grep -q '[[:cntrl:]]' "$cleanup_pre_raw" \
    || grep -q '^$' "$cleanup_pre_raw" \
    || ! LC_ALL=C sort "$cleanup_pre_raw" >"$cleanup_pre" \
    || ! LC_ALL=C sort -u "$cleanup_pre_raw" >"${cleanup_pre}.unique" \
    || ! cmp -s "$cleanup_pre" "${cleanup_pre}.unique"; then
    printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=pre-parse retry=prohibited\n' \
      "$BACKUP_ID" >&2
    return 74
  fi
  while IFS= read -r cleanup_observed; do
    [ -z "$cleanup_observed" ] || grep -Fqx "$cleanup_observed" "$cleanup_allowed" \
      || {
        printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=pre-ownership retry=prohibited\n' \
          "$BACKUP_ID" >&2
        return 74
      }
  done <"$cleanup_pre"

  cleanup_delete_failed=0
  for candidate in \
    "${remote}/${BACKUP_ID}.complete.json" \
    "${remote}/${BACKUP_ID}.local.json" \
    "${remote}/${BACKUP_ID}.dump" \
    "${remote}/${BACKUP_ID}.sha256"; do
    if grep -Fqx "$candidate" "$cleanup_pre"; then
      "$MC" rm --quiet "$candidate" >/dev/null 2>&1 || cleanup_delete_failed=1
    fi
  done

  cleanup_post_raw="${TEMP_DIR}/cleanup-local-post.raw"
  cleanup_post="${TEMP_DIR}/cleanup-local-post.canonical"
  if ! w10d_capture_command "$cleanup_post_raw" 65536 \
    "$MC" find "$remote" --name "${BACKUP_ID}.*"; then
    printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=post-observation retry=prohibited\n' \
      "$BACKUP_ID" >&2
    return 74
  fi
  if grep -q '[[:cntrl:]]' "$cleanup_post_raw" \
    || grep -q '^$' "$cleanup_post_raw" \
    || ! LC_ALL=C sort "$cleanup_post_raw" >"$cleanup_post" \
    || ! LC_ALL=C sort -u "$cleanup_post_raw" >"${cleanup_post}.unique" \
    || ! cmp -s "$cleanup_post" "${cleanup_post}.unique"; then
    printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=post-parse retry=prohibited\n' \
      "$BACKUP_ID" >&2
    return 74
  fi
  if [ "$cleanup_delete_failed" -ne 0 ] || [ -s "$cleanup_post" ]; then
    printf 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS backupId=%s phase=absence-proof retry=prohibited\n' \
      "$BACKUP_ID" >&2
    return 74
  fi
  return 0
}

remove_new_local_point_or_stop() {
  cleanup_context=$1
  remove_new_local_point && cleanup_rc=0 || cleanup_rc=$?
  [ "$cleanup_rc" -eq 0 ] && return 0
  [ "$cleanup_rc" -eq 74 ] && exit 74
  backup_die "$cleanup_context"
}

degraded_raw="${TEMP_DIR}/degraded-points.raw"
degraded_inventory="${TEMP_DIR}/degraded-points.canonical"
w10d_capture_command "$degraded_raw" 1048576 "$MC" find "$remote" --name '*.local.json' \
  || backup_die "observasi degraded point gagal"
w10d_canonicalize_inventory "$degraded_raw" "$degraded_inventory"
degraded_count=$(awk 'NF {n++} END {print n+0}' "$degraded_inventory")
max_degraded=${BACKUP_MAX_DEGRADED_POINTS:-3}
require_uint BACKUP_MAX_DEGRADED_POINTS "$max_degraded"
[ "$degraded_count" -lt "$max_degraded" ] || backup_die "off-site belum pulih dan local degraded points sudah mencapai batas"

retention_existing_raw="${TEMP_DIR}/retention-existing.raw"
retention_existing="${TEMP_DIR}/retention-existing.canonical"
w10d_capture_command "$retention_existing_raw" 1048576 "$MC" find "$remote" --name '*.complete.json' \
  || backup_die "observasi completion lokal untuk retention gagal"
w10d_canonicalize_inventory "$retention_existing_raw" "$retention_existing"
if grep -Fqx "${remote}/${BACKUP_ID}.complete.json" "$retention_existing"; then
  backup_die "backupId bertabrakan dengan completion existing"
fi

# Snapshot the off-site completion inventory before the first dump or
# publication mutation. The shared writer lock prevents another reviewed DIIS
# writer from changing the retention set during this attempt.
validate_offsite_config
offsite_manifest_existing="${TEMP_DIR}/offsite-manifest-existing"
capture_offsite_completion_inventory "$offsite_manifest_existing"
if grep -Fqx "${BACKUP_ID}.complete.json" "$offsite_manifest_existing"; then
  backup_die "backupId bertabrakan dengan completion off-site existing"
fi

estimate=$(psql --host="$POSTGRES_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --tuples-only --no-align --command='SELECT pg_database_size(current_database());' | tr -d '[:space:]')
hard_budget=${BACKUP_LOCAL_BUDGET_BYTES:-$GATE0_MAX_BACKUP_BYTES}
require_uint BACKUP_LOCAL_BUDGET_BYTES "$hard_budget"
[ "$hard_budget" -eq "$GATE0_MAX_BACKUP_BYTES" ] \
  || backup_die "budget backup harus tepat keputusan Gate 0: ${GATE0_MAX_BACKUP_BYTES} bytes"
[ "$estimate" -le "$hard_budget" ] || backup_die "estimasi database melebihi budget absolut Gate 0"

capacity_guard "$TEMP_ROOT" "$estimate" "${BACKUP_SPACE_MULTIPLIER:-3}" "${BACKUP_MIN_FREE_PERCENT:-25}"
minio_target_path=${MINIO_TARGET_PATH:-/var/lib/diis-minio-target}
[ -d "$minio_target_path" ] || backup_die "filesystem target MinIO tidak dapat diobservasi"
capacity_guard "$minio_target_path" "$estimate" "${BACKUP_SPACE_MULTIPLIER:-3}" "${BACKUP_MIN_FREE_PERCENT:-25}"
TARGET_TOTAL_BYTES=$CAPACITY_TOTAL_BYTES
TARGET_FREE_BYTES=$CAPACITY_AVAILABLE_BYTES
TARGET_PROJECTED_FREE_PERCENT=$CAPACITY_PROJECTED_PERCENT

remote_bytes=$(read_remote_bytes)
[ $((remote_bytes + estimate + BACKUP_LOCAL_METADATA_RESERVE_BYTES)) -le "$hard_budget" ] \
  || backup_die "budget backup lokal termasuk reserve metadata akan terlewati"

DUMP_FILE="${TEMP_DIR}/${BACKUP_ID}.dump"
LIST_FILE="${TEMP_DIR}/${BACKUP_ID}.list"
SHA_FILE="${TEMP_DIR}/${BACKUP_ID}.sha256"
LOCAL_MANIFEST="${TEMP_DIR}/${BACKUP_ID}.local.json"
COMPLETE_MANIFEST="${TEMP_DIR}/${BACKUP_ID}.complete.json"
PRE_OBJECT_LIST="${TEMP_DIR}/${BACKUP_ID}.objects.pre"

object_source="${RCLONE_MINIO_REMOTE%/}/${APP_OBJECT_BUCKET}"
pre_object_raw="${TEMP_DIR}/${BACKUP_ID}.objects.pre.raw"
w10d_capture_command "$pre_object_raw" 8388608 "$RCLONE" lsf "$object_source" \
  --exclude '/tmp/**' --exclude '/cache/**' --exclude '/derived/**' \
  || backup_die "inventory object sebelum snapshot database gagal"
w10d_canonicalize_inventory "$pre_object_raw" "$PRE_OBJECT_LIST"

backup_log "membuat PostgreSQL custom-format backup"
pg_dump --host="$POSTGRES_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --format=custom --compress=6 --no-owner --no-acl --file="$DUMP_FILE"
pg_restore --list "$DUMP_FILE" >"$LIST_FILE"
[ -s "$LIST_FILE" ] || backup_die "arsip pg_dump tidak memiliki daftar restore"

DUMP_BYTES=$(wc -c <"$DUMP_FILE" | tr -d '[:space:]')
[ "$DUMP_BYTES" -ge 1024 ] || backup_die "dump terlalu kecil"
DUMP_SHA256=$(sha256_file "$DUMP_FILE")
printf '%s  %s\n' "$DUMP_SHA256" "${BACKUP_ID}.dump" >"$SHA_FILE"
TABLE_COUNT=$(psql --host="$POSTGRES_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --tuples-only --no-align --command="SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema');" | tr -d '[:space:]')
USER_COUNT=$(psql --host="$POSTGRES_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --tuples-only --no-align --command='SELECT count(*) FROM auth.users;' | tr -d '[:space:]')
STUDENT_COUNT=$(psql --host="$POSTGRES_HOST" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --tuples-only --no-align --command='SELECT count(*) FROM student.students;' | tr -d '[:space:]')
for value in "$TABLE_COUNT" "$USER_COUNT" "$STUDENT_COUNT"; do require_uint safe_count "$value"; done
export BACKUP_ID BACKUP_CLASS CREATED_AT CREATED_EPOCH DAILY_KEY WEEKLY_KEY MONTHLY_KEY
export DUMP_SHA256 DUMP_BYTES TABLE_COUNT USER_COUNT STUDENT_COUNT
export TARGET_TOTAL_BYTES TARGET_FREE_BYTES TARGET_PROJECTED_FREE_PERCENT

write_manifest "$LOCAL_MANIFEST" local_valid pending pending
$MC cp --quiet "$DUMP_FILE" "${remote}/${BACKUP_ID}.dump"
$MC cp --quiet "$SHA_FILE" "${remote}/${BACKUP_ID}.sha256"
$MC cp --quiet "$LOCAL_MANIFEST" "${remote}/${BACKUP_ID}.local.json"

LOCAL_VERIFY_DUMP="${TEMP_DIR}/${BACKUP_ID}.local-verify.dump"
LOCAL_VERIFY_SHA="${TEMP_DIR}/${BACKUP_ID}.local-verify.sha256"
$MC cp --quiet "${remote}/${BACKUP_ID}.dump" "$LOCAL_VERIFY_DUMP"
$MC cp --quiet "${remote}/${BACKUP_ID}.sha256" "$LOCAL_VERIFY_SHA"
verify_sha256 "$LOCAL_VERIFY_DUMP" "$DUMP_SHA256"
cmp -s "$SHA_FILE" "$LOCAL_VERIFY_SHA" || backup_die "sidecar checksum MinIO lokal tidak cocok"
[ "$(wc -c <"$LOCAL_VERIFY_DUMP" | tr -d '[:space:]')" = "$DUMP_BYTES" ] \
  || backup_die "ukuran dump MinIO lokal tidak cocok"

OBJECT_STATUS=$(RCLONE="$RCLONE" PATH="$(dirname "$RCLONE"):$PATH" \
  sh "$SCRIPT_DIR/offsite-replication.sh" "$DUMP_FILE" "$SHA_FILE" "$COMPLETE_MANIFEST" \
    "$TEMP_DIR" "$PRE_OBJECT_LIST" "$offsite_manifest_existing")
[ "$OBJECT_STATUS" = verified ] || [ "$OBJECT_STATUS" = empty ] || backup_die "status object replication tidak valid"
$MC cp --quiet "$COMPLETE_MANIFEST" "${remote}/${BACKUP_ID}.complete.json"
$MC rm --quiet "${remote}/${BACKUP_ID}.local.json"

manifest_dir="${TEMP_DIR}/manifests"
mkdir "$manifest_dir"
retention_with_new_raw="${TEMP_DIR}/retention-with-new.raw"
manifest_list="${TEMP_DIR}/manifest-list"
cat "$retention_existing" >"$retention_with_new_raw"
printf '%s\n' "${remote}/${BACKUP_ID}.complete.json" >>"$retention_with_new_raw"
w10d_canonicalize_inventory "$retention_with_new_raw" "$manifest_list"
while IFS= read -r object; do
  [ -n "$object" ] || continue
  case "$object" in
    "$remote"/*.complete.json) ;;
    *) backup_die "path object completion local tidak aman" ;;
  esac
  printf '%s' "$object" | grep -Eq '^[^[:cntrl:]]+$' \
    || backup_die "path object completion local mengandung karakter tidak aman"
  case "$object" in
    *'..'*|*'//'*) backup_die "path object completion local mengandung dot segment" ;;
  esac
  object_name=$(basename "$object")
  case "$object_name" in
    *.complete.json) ;;
    *) backup_die "nama object completion tidak valid" ;;
  esac
  object_base=${object_name%.complete.json}
  local_manifest="${manifest_dir}/${object_name}"
  local_sidecar="${manifest_dir}/${object_base}.sha256"
  $MC cp --quiet "$object" "$local_manifest"
  $MC cp --quiet "${remote}/${object_base}.sha256" "$local_sidecar"
  validate_completion_manifest "$local_manifest" "$local_sidecar" "$object_name" \
    || backup_die "manifest retention tidak valid"
  printf '%s|%s|%s|%s\n' "$(json_uint createdEpoch "$local_manifest")" \
    "$(json_value class "$local_manifest")" "$(json_value protectionState "$local_manifest")" \
    "$object_name" >>"${TEMP_DIR}/retention-rows"
done <"$manifest_list"

daily_kept=0
if [ -f "${TEMP_DIR}/retention-rows" ]; then
  sort -t '|' -k1,1nr "${TEMP_DIR}/retention-rows" | while IFS='|' read -r epoch class protection object; do
    keep=false
    if [ "$class" = daily ] && [ "$daily_kept" -lt "${BACKUP_DAILY_POINTS:-3}" ]; then
      daily_kept=$((daily_kept + 1)); keep=true
    elif [ "$class:$protection" = pre-change:protected ]; then
      backup_id=$(json_value backupId "${manifest_dir}/$object")
      release_candidate="${TEMP_DIR}/local-release-${backup_id}.json"
      if w10d_capture_command "$release_candidate" 4096 "$RCLONE" cat \
        "${OFFSITE_CRYPT_REMOTE%/}/database/releases/${backup_id}.release.json"; then
        validate_prechange_release "$release_candidate" "$backup_id" \
          || backup_die "release marker protected point tidak valid"
      else
        backup_log "RELEASE_MARKER_UNAVAILABLE backupId=${backup_id} retention=keep" >&2
        keep=true
      fi
    fi
    if [ "$keep" = false ]; then
      base="${remote}/${object%.complete.json}"
      # Completion is the validity boundary. Remove it first so an interrupted
      # retention pass can only leave harmless orphan data, never a false-valid point.
      $MC rm --quiet "${remote}/${object}"
      $MC rm --quiet "${base}.dump" "${base}.sha256"
    fi
  done
fi

[ -f "${TEMP_DIR}/offsite-telemetry.env" ] \
  || backup_die "telemetry pertumbuhan off-site tidak tersedia"
. "${TEMP_DIR}/offsite-telemetry.env"
for metric in "$GROWTH_7_BYTES" "$GROWTH_30_BYTES"; do
  case "$metric" in
    -[0-9]*)
      unsigned_metric=${metric#-}
      require_uint growth_bytes "$unsigned_metric"
      ;;
    *) require_uint growth_bytes "$metric" ;;
  esac
done
case "$GROWTH_7_STATUS:$GROWTH_30_STATUS" in
  available:available|available:insufficient_history|insufficient_history:available|insufficient_history:insufficient_history) ;;
  *) backup_die "status telemetry pertumbuhan tidak valid" ;;
esac
case "$DAYS_TO_FULL" in -1|[0-9]*) ;; *) backup_die "days-to-full tidak valid" ;; esac

restore_status=missing
restore_age_days=-1
restore_proof="${TEMP_DIR}/restore-latest.json"
if $MC cp --quiet "myminio/${BACKUP_BUCKET}/postgres/monitor/restore-latest.json" \
  "$restore_proof" >/dev/null 2>&1; then
  restore_schema=$(json_value schemaVersion "$restore_proof")
  restore_status=$(json_value status "$restore_proof")
  restore_epoch=$(json_uint createdEpoch "$restore_proof")
  require_uint restore_created_epoch "$restore_epoch"
  case "$restore_schema:$restore_status" in
    diis-restore-proof-v1:success|diis-restore-proof-v1:failed) ;;
    diis-restore-proof-v3:success|diis-restore-proof-v3:failed)
      restore_source=$(json_value source "$restore_proof")
      [ "$restore_source" = independent-crypt ] || [ "$restore_status" = failed ] \
        || backup_die "restore proof success bukan dari independent crypt"
      ;;
    *) backup_die "restore proof monitor tidak valid" ;;
  esac
  restore_age_days=$(((CREATED_EPOCH - restore_epoch) / 86400))
  [ "$restore_age_days" -ge 0 ] || backup_die "restore proof berasal dari masa depan"
fi

telemetry_file="${TEMP_DIR}/backup-telemetry.json"
cat >"$telemetry_file" <<EOF
{"schemaVersion":"diis-backup-telemetry-v1","createdEpoch":${CREATED_EPOCH},"backupBytes":${DUMP_BYTES},"growth7Status":"${GROWTH_7_STATUS}","growth7Bytes":${GROWTH_7_BYTES},"growth30Status":"${GROWTH_30_STATUS}","growth30Bytes":${GROWTH_30_BYTES},"targetTotalBytes":${TARGET_TOTAL_BYTES},"targetFreeBytes":${TARGET_FREE_BYTES},"projectedFreePercent":${TARGET_PROJECTED_FREE_PERCENT},"projectedDaysToFull":${DAYS_TO_FULL},"offsiteStatus":"complete","restoreStatus":"${restore_status}","restoreAgeDays":${restore_age_days}}
EOF
metadata_bytes=$(wc -c <"$SHA_FILE")
metadata_bytes=$((metadata_bytes + $(wc -c <"$LOCAL_MANIFEST")))
metadata_bytes=$((metadata_bytes + $(wc -c <"$COMPLETE_MANIFEST")))
metadata_bytes=$((metadata_bytes + $(wc -c <"$telemetry_file")))
[ "$metadata_bytes" -le "$BACKUP_LOCAL_METADATA_RESERVE_BYTES" ] \
  || {
    remove_new_local_point_or_stop \
      "metadata melampaui reserve dan recovery point baru gagal dibersihkan"
    backup_die "metadata backup melampaui reserve yang dibatasi"
  }

previous_telemetry="${TEMP_DIR}/previous-telemetry.json"
had_previous_telemetry=false
previous_telemetry_bytes=0
if $MC cp --quiet "$telemetry_remote" "$previous_telemetry" >/dev/null 2>&1; then
  had_previous_telemetry=true
  previous_telemetry_bytes=$(wc -c <"$previous_telemetry" | tr -d '[:space:]')
  require_uint previous_telemetry_bytes "$previous_telemetry_bytes"
fi

before_telemetry_bytes=$(read_remote_bytes)
telemetry_bytes=$(wc -c <"$telemetry_file" | tr -d '[:space:]')
require_uint telemetry_bytes "$telemetry_bytes"
if [ $((before_telemetry_bytes - previous_telemetry_bytes + telemetry_bytes)) -gt "$hard_budget" ]; then
  remove_new_local_point_or_stop \
    "telemetry akan melewati budget dan recovery point baru gagal dibersihkan"
  backup_die "budget backup lokal akan terlewati oleh telemetry final"
fi

$MC cp --quiet "$telemetry_file" "$telemetry_remote"
final_remote_bytes=$(read_remote_bytes)
if [ "$final_remote_bytes" -gt "$hard_budget" ]; then
  remove_new_local_point_or_stop \
    "budget terlewati dan recovery point baru gagal dibersihkan"
  if [ "$had_previous_telemetry" = true ]; then
    $MC cp --quiet "$previous_telemetry" "$telemetry_remote" \
      || backup_die "budget terlewati dan telemetry sebelumnya gagal dipulihkan"
  else
    $MC rm --quiet "$telemetry_remote" \
      || backup_die "budget terlewati dan telemetry baru gagal dibersihkan"
  fi
  backup_die "total aktual backup lokal melampaui budget absolut Gate 0"
fi

backup_log "BACKUP_COMPLETE class=${BACKUP_CLASS} bytes=${DUMP_BYTES} localBytes=${final_remote_bytes} objectStatus=${OBJECT_STATUS}"

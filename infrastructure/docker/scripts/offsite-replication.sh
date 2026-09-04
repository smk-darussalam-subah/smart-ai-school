#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${SCRIPT_DIR}/backup-lib.sh"

[ "$#" -eq 5 ] || backup_die "usage: offsite-replication.sh DUMP SHA MANIFEST TEMP_DIR PRE_OBJECT_LIST"
DUMP_FILE=$1
SHA_FILE=$2
COMPLETE_MANIFEST=$3
TEMP_DIR=$4
PRE_OBJECT_LIST=$5

require_command rclone
require_command base64
require_command cmp
require_value OFFSITE_CRYPT_REMOTE
require_value OFFSITE_CONFIG_FINGERPRINT
require_value OFFSITE_EXPECTED_PROVIDER
require_value OFFSITE_EXPECTED_ORIGIN
require_value RCLONE_MINIO_REMOTE
require_value APP_OBJECT_BUCKET
safe_remote_base "$OFFSITE_CRYPT_REMOTE"
safe_remote_base "$RCLONE_MINIO_REMOTE"
[ -f "$PRE_OBJECT_LIST" ] || backup_die "inventory object pra-snapshot tidak tersedia"

validate_offsite_config

rclone lsf "$OFFSITE_CRYPT_REMOTE" --max-depth 1 >/dev/null

db_target="${OFFSITE_CRYPT_REMOTE%/}/database/current/${BACKUP_ID}"
rclone copyto "$DUMP_FILE" "${db_target}.dump" --immutable --no-traverse
rclone copyto "$SHA_FILE" "${db_target}.sha256" --immutable --no-traverse
db_restore_sample="${TEMP_DIR}/database-remote.sample"
db_restore_sidecar="${TEMP_DIR}/database-remote.sha256"
rclone copyto "${db_target}.dump" "$db_restore_sample"
rclone copyto "${db_target}.sha256" "$db_restore_sidecar"
[ "$(sha256_file "$db_restore_sample")" = "$DUMP_SHA256" ] \
  || backup_die "database off-site restore hash tidak cocok"
cmp -s "$SHA_FILE" "$db_restore_sidecar" \
  || backup_die "database off-site sidecar tidak cocok"
rm -f "$db_restore_sample" "$db_restore_sidecar"

object_source="${RCLONE_MINIO_REMOTE%/}/${APP_OBJECT_BUCKET}"
post_object_list="${TEMP_DIR}/${BACKUP_ID}.objects.post"
canonical_pre="${TEMP_DIR}/${BACKUP_ID}.objects.pre.canonical"
LC_ALL=C sort -u "$PRE_OBJECT_LIST" >"$canonical_pre"
cmp -s "$PRE_OBJECT_LIST" "$canonical_pre" \
  || backup_die "inventory object pra-snapshot tidak canonical atau memiliki duplikasi"

OBJECT_MANIFEST="${TEMP_DIR}/${BACKUP_ID}.objects.tsv"
printf 'diis-object-manifest-v1|%s|exact\n' "$BACKUP_ID" >"$OBJECT_MANIFEST"
OBJECT_COUNT=0
while IFS= read -r object_path; do
  [ -n "$object_path" ] || continue
  printf '%s' "$object_path" | grep -Eq '^[^[:cntrl:]]+$' \
    || backup_die "path object mengandung karakter tidak aman"
  case "$object_path" in /*|*'//'*) backup_die "path object tidak aman" ;; esac
  printf '%s' "$object_path" | grep -Eq '(^|/)\.\.?(/|$)' \
    && backup_die "path object mengandung dot segment"

  OBJECT_COUNT=$((OBJECT_COUNT + 1))
  source_copy="${TEMP_DIR}/object-source-${OBJECT_COUNT}"
  remote_copy="${TEMP_DIR}/object-remote-${OBJECT_COUNT}"
  rclone copyto "${object_source}/${object_path}" "$source_copy"
  object_sha=$(sha256_file "$source_copy")
  object_bytes=$(wc -c <"$source_copy" | tr -d '[:space:]')
  require_uint object_bytes "$object_bytes"
  blob_remote="${OFFSITE_CRYPT_REMOTE%/}/objects/blobs/${object_sha}"
  rclone copyto "$source_copy" "$blob_remote" --immutable --no-traverse
  rclone copyto "$blob_remote" "$remote_copy"
  verify_sha256 "$remote_copy" "$object_sha"
  encoded_path=$(printf '%s' "$object_path" | base64 | tr -d '\r\n')
  printf '%s|%s|%s\n' "$object_sha" "$object_bytes" "$encoded_path" >>"$OBJECT_MANIFEST"
  rm -f "$source_copy" "$remote_copy"
done <"$PRE_OBJECT_LIST"

rclone lsf "$object_source" --recursive --files-only \
  --exclude '/tmp/**' --exclude '/cache/**' --exclude '/derived/**' \
  | LC_ALL=C sort >"$post_object_list" \
  || backup_die "inventory object pasca-snapshot gagal"
cmp -s "$PRE_OBJECT_LIST" "$post_object_list" \
  || backup_die "object berubah selama cutover backup; snapshot dibatalkan"

line_number=0
while IFS='|' read -r expected_sha expected_bytes encoded_path; do
  line_number=$((line_number + 1))
  [ "$line_number" -eq 1 ] && continue
  object_path=$(printf '%s' "$encoded_path" | base64 -d) \
    || backup_die "path object manifest tidak dapat didekode"
  verify_source="${TEMP_DIR}/object-source-post-${line_number}"
  rclone copyto "${object_source}/${object_path}" "$verify_source"
  verify_sha256 "$verify_source" "$expected_sha"
  [ "$(wc -c <"$verify_source" | tr -d '[:space:]')" = "$expected_bytes" ] \
    || backup_die "ukuran object berubah selama cutover backup"
  rm -f "$verify_source"
done <"$OBJECT_MANIFEST"

OBJECT_MANIFEST_SHA256=$(sha256_file "$OBJECT_MANIFEST")
rclone copyto "$OBJECT_MANIFEST" \
  "${OFFSITE_CRYPT_REMOTE%/}/objects/manifests/${BACKUP_ID}.objects.tsv" \
  --immutable --no-traverse
object_manifest_copy="${TEMP_DIR}/${BACKUP_ID}.objects.remote.tsv"
rclone copyto "${OFFSITE_CRYPT_REMOTE%/}/objects/manifests/${BACKUP_ID}.objects.tsv" \
  "$object_manifest_copy"
verify_sha256 "$object_manifest_copy" "$OBJECT_MANIFEST_SHA256"
rm -f "$object_manifest_copy"

OBJECT_STATUS=verified
[ "$OBJECT_COUNT" -gt 0 ] || OBJECT_STATUS=empty
export OFFSITE_EFFECTIVE_FINGERPRINT OBJECT_MANIFEST_SHA256 OBJECT_COUNT
write_manifest "$COMPLETE_MANIFEST" complete complete "$OBJECT_STATUS"
validate_completion_manifest "$COMPLETE_MANIFEST" || backup_die "completion manifest tidak valid"
rclone copyto "$COMPLETE_MANIFEST" \
  "${OFFSITE_CRYPT_REMOTE%/}/database/manifests/${BACKUP_ID}.complete.json" \
  --immutable --no-traverse

manifest_remote="${OFFSITE_CRYPT_REMOTE%/}/database/manifests"
retention_dir="${TEMP_DIR}/offsite-manifests"
mkdir -p "$retention_dir"
rclone lsf "$manifest_remote" --files-only >"${TEMP_DIR}/offsite-manifest-list"
while IFS= read -r name; do
  [ -n "$name" ] || continue
  case "$name" in *.complete.json) ;; *) continue ;; esac
  local_manifest="${retention_dir}/$(basename "$name")"
  rclone copyto "${manifest_remote}/${name}" "$local_manifest"
  validate_completion_manifest "$local_manifest" || backup_die "manifest off-site tidak valid"
  backup_id=$(json_value backupId "$local_manifest")
  echo "$backup_id" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9]+$' \
    || backup_die "backupId off-site tidak valid"
  printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
    "$(json_uint createdEpoch "$local_manifest")" \
    "$(json_value dailyKey "$local_manifest")" \
    "$(json_value weeklyKey "$local_manifest")" \
    "$(json_value monthlyKey "$local_manifest")" \
    "$(json_value class "$local_manifest")" \
    "$(json_value protectionState "$local_manifest")" \
    "$backup_id" \
    "$(json_uint bytes "$local_manifest")" >>"${TEMP_DIR}/offsite-retention-rows"
done <"${TEMP_DIR}/offsite-manifest-list"

daily_seconds=$((14 * 86400))
weekly_kept=0
monthly_kept=0
seen_weeks='|'
seen_months='|'
now_epoch=$(date -u '+%s')
if [ -f "${TEMP_DIR}/offsite-retention-rows" ]; then
  sort -t '|' -k1,1nr "${TEMP_DIR}/offsite-retention-rows" | \
    while IFS='|' read -r epoch daily_key weekly_key monthly_key class protection backup_id bytes; do
      keep=false
      if [ "$class:$protection" = pre-change:protected ]; then
        release_candidate="${TEMP_DIR}/${backup_id}.release.json"
        if rclone cat "${OFFSITE_CRYPT_REMOTE%/}/database/releases/${backup_id}.release.json" \
          >"$release_candidate" 2>/dev/null; then
          validate_prechange_release "$release_candidate" "$backup_id" \
            || backup_die "release marker protected point tidak valid"
        else
          keep=true
        fi
      fi
      age=$((now_epoch - epoch))
      [ "$age" -le "$daily_seconds" ] && keep=true
      case "$seen_weeks" in
        *"|${weekly_key}|"*) ;;
        *)
          if [ "$weekly_kept" -lt 8 ]; then
            weekly_kept=$((weekly_kept + 1))
            seen_weeks="${seen_weeks}${weekly_key}|"
            keep=true
          fi
          ;;
      esac
      case "$seen_months" in
        *"|${monthly_key}|"*) ;;
        *)
          if [ "$monthly_kept" -lt 12 ]; then
            monthly_kept=$((monthly_kept + 1))
            seen_months="${seen_months}${monthly_key}|"
            keep=true
          fi
          ;;
      esac
      if [ "$keep" = false ]; then
        backup_log "OFFSITE_RETENTION candidate=${backup_id} mode=${OFFSITE_RETENTION_APPLY:-0}" >&2
        if [ "${OFFSITE_RETENTION_APPLY:-0}" = 1 ]; then
          rclone deletefile "${manifest_remote}/${backup_id}.complete.json"
          rclone deletefile "${OFFSITE_CRYPT_REMOTE%/}/database/current/${backup_id}.dump"
          rclone deletefile "${OFFSITE_CRYPT_REMOTE%/}/database/current/${backup_id}.sha256"
          rclone deletefile "${OFFSITE_CRYPT_REMOTE%/}/objects/manifests/${backup_id}.objects.tsv"
        fi
      fi
    done
fi

growth_7_status=insufficient_history
growth_30_status=insufficient_history
growth_7_bytes=0
growth_30_bytes=0
if [ -f "${TEMP_DIR}/offsite-retention-rows" ]; then
  seven_baseline=$(awk -F '|' -v cutoff=$((now_epoch - 7 * 86400)) \
    '$1 <= cutoff && $1 > best { best=$1; bytes=$8 } END { if (best) print bytes }' \
    "${TEMP_DIR}/offsite-retention-rows")
  thirty_baseline=$(awk -F '|' -v cutoff=$((now_epoch - 30 * 86400)) \
    '$1 <= cutoff && $1 > best { best=$1; bytes=$8 } END { if (best) print bytes }' \
    "${TEMP_DIR}/offsite-retention-rows")
  if [ -n "$seven_baseline" ]; then
    growth_7_status=available
    growth_7_bytes=$((DUMP_BYTES - seven_baseline))
  fi
  if [ -n "$thirty_baseline" ]; then
    growth_30_status=available
    growth_30_bytes=$((DUMP_BYTES - thirty_baseline))
  fi
fi
days_to_full=-1
if [ "$growth_30_status" = available ] && [ "$growth_30_bytes" -gt 0 ]; then
  days_to_full=$((TARGET_FREE_BYTES * 30 / growth_30_bytes))
fi
cat >"${TEMP_DIR}/offsite-telemetry.env" <<EOF
GROWTH_7_STATUS=${growth_7_status}
GROWTH_7_BYTES=${growth_7_bytes}
GROWTH_30_STATUS=${growth_30_status}
GROWTH_30_BYTES=${growth_30_bytes}
DAYS_TO_FULL=${days_to_full}
EOF

printf '%s\n' "$OBJECT_STATUS"

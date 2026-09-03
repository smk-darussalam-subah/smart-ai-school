#!/bin/sh

set -eu

GATE0_MAX_BACKUP_BYTES=4015794422
BACKUP_LOCAL_METADATA_RESERVE_BYTES=65536
LOCK_OWNER_TOKEN=''

backup_log() {
  printf '[%s WIB] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

backup_die() {
  backup_log "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || backup_die "command wajib tidak tersedia: $1"
}

require_value() {
  eval "value=\${$1:-}"
  [ -n "$value" ] || backup_die "konfigurasi wajib tidak tersedia: $1"
}

require_uint() {
  case "$2" in
    ''|*[!0-9]*) backup_die "$1 harus bilangan bulat non-negatif" ;;
  esac
}

sha256_file() {
  sha256sum "$1" | awk '{print $1}'
}

verify_sha256() {
  file=$1
  expected=$2
  actual=$(sha256_file "$file")
  [ "$actual" = "$expected" ] || backup_die "checksum tidak cocok untuk $(basename "$file")"
}

acquire_directory_lock() {
  lock_dir=$1
  lock_parent=$(dirname "$lock_dir")
  mkdir -p "$lock_parent"
  boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || printf unknown)
  self_start=$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || printf unknown)
  token="${boot_id}:$$:${self_start}"

  if ! mkdir "$lock_dir" 2>/dev/null; then
    owner_file="${lock_dir}/owner"
    attempt=0
    while [ ! -s "$owner_file" ] && [ "$attempt" -lt 20 ]; do
      attempt=$((attempt + 1))
      sleep 0.05
    done

    owner_boot=$(sed -n '1p' "$owner_file" 2>/dev/null || true)
    owner_pid=$(sed -n '2p' "$owner_file" 2>/dev/null || true)
    owner_start=$(sed -n '3p' "$owner_file" 2>/dev/null || true)
    owner_live=false
    case "$owner_pid" in ''|*[!0-9]*) ;;
      *)
        if [ "$owner_boot" = "$boot_id" ] && kill -0 "$owner_pid" 2>/dev/null; then
          current_start=$(awk '{print $22}' "/proc/${owner_pid}/stat" 2>/dev/null || true)
          [ -n "$current_start" ] && [ "$current_start" = "$owner_start" ] && owner_live=true
        fi
        ;;
    esac
    [ "$owner_live" = false ] || backup_die "backup lain sedang berjalan"

    stale_dir="${lock_dir}.stale.$$"
    mv "$lock_dir" "$stale_dir" 2>/dev/null || backup_die "status lock berubah; coba lagi"
    if ! mkdir "$lock_dir" 2>/dev/null; then
      rm -rf "$stale_dir"
      backup_die "backup lain memperoleh lock saat stale recovery"
    fi
    rm -rf "$stale_dir"
  fi

  owner_tmp="${lock_dir}/owner.$$"
  printf '%s\n%s\n%s\n%s\n' "$boot_id" "$$" "$self_start" "$token" >"$owner_tmp"
  mv "$owner_tmp" "${lock_dir}/owner"
  LOCK_OWNER_TOKEN=$token
}

release_directory_lock() {
  lock_dir=$1
  [ -n "$LOCK_OWNER_TOKEN" ] || return 0
  owner_token=$(sed -n '4p' "${lock_dir}/owner" 2>/dev/null || true)
  [ "$owner_token" = "$LOCK_OWNER_TOKEN" ] || return 1
  rm -f "${lock_dir}/owner"
  rmdir "$lock_dir"
  LOCK_OWNER_TOKEN=''
}

capacity_guard() {
  path=$1
  estimated_bytes=$2
  multiplier=${3:-3}
  min_free_percent=${4:-25}
  require_uint estimated_bytes "$estimated_bytes"
  require_uint multiplier "$multiplier"
  require_uint min_free_percent "$min_free_percent"
  [ "$estimated_bytes" -gt 0 ] || backup_die "estimasi dump harus lebih besar dari nol"

  set -- $(df -Pk "$path" | awk 'NR==2 {print $2, $4}')
  total_bytes=$(($1 * 1024))
  available_bytes=$(($2 * 1024))
  required_bytes=$((estimated_bytes * multiplier))
  projected_bytes=$((available_bytes - estimated_bytes))
  [ "$available_bytes" -ge "$required_bytes" ] || backup_die "ruang bebas kurang dari ${multiplier}x estimasi dump"
  [ "$projected_bytes" -ge 0 ] || backup_die "ruang bebas tidak cukup untuk dump"
  projected_percent=$((projected_bytes * 100 / total_bytes))
  [ "$projected_percent" -ge "$min_free_percent" ] || backup_die "ruang bebas setelah backup diproyeksikan di bawah ${min_free_percent}%"

  CAPACITY_TOTAL_BYTES=$total_bytes
  CAPACITY_AVAILABLE_BYTES=$available_bytes
  CAPACITY_PROJECTED_BYTES=$projected_bytes
  CAPACITY_PROJECTED_PERCENT=$projected_percent
}

json_value() {
  key=$1
  file=$2
  sed -n "s/.*\"${key}\":[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n 1
}

json_uint() {
  key=$1
  file=$2
  sed -n "s/.*\"${key}\":[[:space:]]*\([0-9][0-9]*\).*/\1/p" "$file" | head -n 1
}

validate_completion_manifest() {
  file=$1
  [ "$(json_value schemaVersion "$file")" = 'diis-backup-v1' ] || return 1
  [ "$(json_value status "$file")" = 'complete' ] || return 1
  [ "$(json_value offsiteStatus "$file")" = 'complete' ] || return 1
  checksum=$(json_value sha256 "$file")
  echo "$checksum" | grep -Eq '^[a-f0-9]{64}$' || return 1
  epoch=$(json_uint createdEpoch "$file")
  require_uint createdEpoch "$epoch"
  class=$(json_value class "$file")
  case "$class" in daily|pre-change) ;; *) return 1 ;; esac
  protection=$(json_value protectionState "$file")
  case "$class:$protection" in daily:none|pre-change:protected) ;; *) return 1 ;; esac
  object_manifest_sha=$(json_value objectManifestSha256 "$file")
  echo "$object_manifest_sha" | grep -Eq '^[a-f0-9]{64}$' || return 1
  offsite_fingerprint=$(json_value offsiteConfigFingerprint "$file")
  echo "$offsite_fingerprint" | grep -Eq '^[a-f0-9]{64}$' || return 1
  object_count=$(json_uint objectCount "$file")
  require_uint objectCount "$object_count"
  target_total=$(json_uint targetTotalBytes "$file")
  target_free=$(json_uint targetFreeBytes "$file")
  require_uint targetTotalBytes "$target_total"
  require_uint targetFreeBytes "$target_free"
  [ "$target_total" -gt 0 ] || return 1
  [ "$target_free" -gt 0 ] || return 1
}

validate_prechange_release() {
  file=$1
  expected_backup_id=$2
  [ "$(json_value schemaVersion "$file")" = 'diis-prechange-release-v1' ] || return 1
  [ "$(json_value backupId "$file")" = "$expected_backup_id" ] || return 1
  [ "$(json_value reconciliationStatus "$file")" = complete ] || return 1
  reconciliation_ref=$(json_value reconciliationRef "$file")
  echo "$reconciliation_ref" | grep -Eq '^[A-Z0-9][A-Z0-9._/-]{5,79}$' || return 1
  released_at=$(json_value releasedAt "$file")
  echo "$released_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' || return 1
}

write_manifest() {
  output=$1
  status=$2
  offsite_status=$3
  object_status=$4
  protection_state=none
  [ "$BACKUP_CLASS" = pre-change ] && protection_state=protected
  cat >"$output" <<EOF
{"schemaVersion":"diis-backup-v1","status":"${status}","backupId":"${BACKUP_ID}","class":"${BACKUP_CLASS}","protectionState":"${protection_state}","createdAt":"${CREATED_AT}","createdEpoch":${CREATED_EPOCH},"dailyKey":"${DAILY_KEY}","weeklyKey":"${WEEKLY_KEY}","monthlyKey":"${MONTHLY_KEY}","sha256":"${DUMP_SHA256}","bytes":${DUMP_BYTES},"archiveValidated":true,"offsiteStatus":"${offsite_status}","offsiteConfigFingerprint":"${OFFSITE_EFFECTIVE_FINGERPRINT:-pending}","objectStatus":"${object_status}","objectManifestSha256":"${OBJECT_MANIFEST_SHA256:-pending}","objectCount":${OBJECT_COUNT:-0},"tableCount":${TABLE_COUNT},"userCount":${USER_COUNT},"studentCount":${STUDENT_COUNT},"targetTotalBytes":${TARGET_TOTAL_BYTES:-0},"targetFreeBytes":${TARGET_FREE_BYTES:-0},"targetProjectedFreePercent":${TARGET_PROJECTED_FREE_PERCENT:-0}}
EOF
}

safe_remote_base() {
  value=$1
  echo "$value" | grep -Eq '^[A-Za-z0-9_-]+:[A-Za-z0-9._/-]*$' || backup_die "remote rclone tidak valid"
  case "$value" in
    *..*|*//*|/*) backup_die "remote rclone tidak aman" ;;
  esac
}

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
  self_namespace=$(readlink "/proc/$$/ns/pid" 2>/dev/null || printf unknown)
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
    owner_namespace=$(sed -n '5p' "$owner_file" 2>/dev/null || true)
    owner_live=false
    case "$owner_pid" in ''|*[!0-9]*) ;;
      *)
        if [ "$owner_boot" = "$boot_id" ] && [ "$owner_namespace" = "$self_namespace" ] \
          && kill -0 "$owner_pid" 2>/dev/null; then
          current_start=$(awk '{print $22}' "/proc/${owner_pid}/stat" 2>/dev/null || true)
          [ -n "$current_start" ] && [ "$current_start" = "$owner_start" ] && owner_live=true
        fi
        ;;
    esac
    [ "$owner_live" = false ] || backup_die "backup lain sedang berjalan"
    if [ "$owner_boot" = "$boot_id" ] && [ "$owner_namespace" != "$self_namespace" ]; then
      backup_die "lock backup lintas PID namespace aktif atau ambigu"
    fi

    stale_dir="${lock_dir}.stale.$$"
    mv "$lock_dir" "$stale_dir" 2>/dev/null || backup_die "status lock berubah; coba lagi"
    if ! mkdir "$lock_dir" 2>/dev/null; then
      rm -rf "$stale_dir"
      backup_die "backup lain memperoleh lock saat stale recovery"
    fi
    rm -rf "$stale_dir"
  fi

  owner_tmp="${lock_dir}/owner.$$"
  printf '%s\n%s\n%s\n%s\n%s\n' "$boot_id" "$$" "$self_start" "$token" \
    "$self_namespace" >"$owner_tmp"
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

config_value() {
  key=$1
  config=$2
  printf '%s\n' "$config" | awk -F '[[:space:]]*=[[:space:]]*' -v wanted="$key" \
    '$1 == wanted { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }'
}

list_contains() {
  list=$1
  wanted=$2
  old_ifs=$IFS
  IFS=','
  for item in $list; do
    [ "$item" = "$wanted" ] && { IFS=$old_ifs; return 0; }
  done
  IFS=$old_ifs
  return 1
}

lower_value() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

validate_public_commissioned_origin() {
  endpoint=$1
  expected_origin=$2
  if [ -z "$endpoint" ]; then
    [ "$expected_origin" = provider-default ] \
      || backup_die "origin commissioning tidak cocok dengan endpoint default provider"
    EFFECTIVE_OFFSITE_ORIGIN=provider-default
    return
  fi

  origin=$(lower_value "$endpoint")
  origin=${origin%/}
  case "$origin" in
    https://*) ;;
    *) backup_die "custom endpoint off-site wajib origin HTTPS publik" ;;
  esac
  authority=${origin#https://}
  case "$authority" in
    ''|*/*|*\?*|*\#*|*@*|*\\*|*\[*|*\]*)
      backup_die "custom endpoint off-site bukan origin publik yang aman"
      ;;
  esac
  host=${authority%%:*}
  echo "$host" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' \
    || backup_die "hostname endpoint off-site tidak valid"
  echo "$host" | grep -q '\.' || backup_die "hostname endpoint off-site wajib FQDN publik"
  echo "$host" | grep -Eq '^[0-9.]+$' \
    && backup_die "alamat IP literal tidak diizinkan sebagai endpoint off-site"
  case "$host" in
    localhost|*.localhost|*.local|*.internal|*.lan|*.home|*.corp)
      backup_die "hostname endpoint off-site berada pada namespace privat"
      ;;
  esac
  [ "$origin" = "$expected_origin" ] \
    || backup_die "origin endpoint off-site tidak cocok dengan commissioning"
  EFFECTIVE_OFFSITE_ORIGIN=$origin
}

validate_offsite_config() {
  require_command rclone
  require_value OFFSITE_CRYPT_REMOTE
  require_value OFFSITE_CONFIG_FINGERPRINT
  require_value OFFSITE_EXPECTED_PROVIDER
  require_value OFFSITE_EXPECTED_ORIGIN
  safe_remote_base "$OFFSITE_CRYPT_REMOTE"

  crypt_remote_name=${OFFSITE_CRYPT_REMOTE%%:*}
  crypt_config=$(rclone config show "$crypt_remote_name" 2>/dev/null) \
    || backup_die "konfigurasi crypt tidak dapat dibaca"
  [ "$(config_value type "$crypt_config")" = crypt ] \
    || backup_die "OFFSITE_CRYPT_REMOTE bukan backend rclone crypt"
  crypt_backing=$(config_value remote "$crypt_config")
  safe_remote_base "$crypt_backing"
  [ "$(config_value filename_encryption "$crypt_config")" = standard ] \
    || backup_die "filename encryption crypt wajib standard"
  [ "$(config_value directory_name_encryption "$crypt_config")" = true ] \
    || backup_die "directory-name encryption crypt wajib aktif"

  backing_remote_name=${crypt_backing%%:*}
  if [ -n "${RCLONE_MINIO_REMOTE:-}" ]; then
    source_remote_name=${RCLONE_MINIO_REMOTE%%:*}
    [ "$backing_remote_name" != "$source_remote_name" ] \
      || backup_die "off-site tidak boleh membungkus remote MinIO sumber"
  fi
  backing_config=$(rclone config show "$backing_remote_name" 2>/dev/null) \
    || backup_die "konfigurasi backend off-site tidak dapat dibaca"
  backing_type=$(lower_value "$(config_value type "$backing_config")")
  allowed_types=$(lower_value "${OFFSITE_ALLOWED_BACKEND_TYPES:-b2,drive,azureblob,s3}" | tr -d '[:space:]')
  list_contains "$allowed_types" "$backing_type" \
    || backup_die "tipe backend off-site tidak termasuk allowlist independen"
  case "$backing_type" in local|crypt|alias) backup_die "backend off-site tidak independen" ;; esac

  backing_provider=$(lower_value "$(config_value provider "$backing_config")")
  backing_endpoint=$(config_value endpoint "$backing_config")
  provider_identity=${backing_provider:-$backing_type}
  expected_provider=$(lower_value "$OFFSITE_EXPECTED_PROVIDER")
  [ "$provider_identity" = "$expected_provider" ] \
    || backup_die "provider off-site tidak cocok dengan commissioning"
  forbidden_providers=$(lower_value "${OFFSITE_FORBIDDEN_PROVIDERS:-Minio,Hetzner}" | tr -d '[:space:]')
  list_contains "$forbidden_providers" "$provider_identity" \
    && backup_die "provider off-site berada pada failure domain yang dilarang"
  expected_origin=$(lower_value "$OFFSITE_EXPECTED_ORIGIN")
  validate_public_commissioned_origin "$backing_endpoint" "$expected_origin"

  drive_binding=''
  if [ "$backing_type" = drive ]; then
    require_value OFFSITE_EXPECTED_TEAM_DRIVE_SHA256
    require_value OFFSITE_EXPECTED_ROOT_FOLDER_SHA256
    team_drive=$(config_value team_drive "$backing_config")
    root_folder_id=$(config_value root_folder_id "$backing_config")
    [ -n "$team_drive" ] || backup_die "binding Shared Drive tidak tersedia"
    [ -n "$root_folder_id" ] || backup_die "binding root folder Shared Drive tidak tersedia"
    team_drive_sha=$(printf '%s' "$team_drive" | sha256sum | awk '{print $1}')
    root_folder_sha=$(printf '%s' "$root_folder_id" | sha256sum | awk '{print $1}')
    [ "$team_drive_sha" = "$OFFSITE_EXPECTED_TEAM_DRIVE_SHA256" ] \
      || backup_die "fingerprint Shared Drive tidak cocok dengan commissioning"
    [ "$root_folder_sha" = "$OFFSITE_EXPECTED_ROOT_FOLDER_SHA256" ] \
      || backup_die "fingerprint root folder Shared Drive tidak cocok dengan commissioning"
    drive_binding=";team_drive_sha256=${team_drive_sha};root_folder_sha256=${root_folder_sha}"
  elif [ -n "${OFFSITE_EXPECTED_TEAM_DRIVE_SHA256:-}${OFFSITE_EXPECTED_ROOT_FOLDER_SHA256:-}" ]; then
    backup_die "binding Shared Drive hanya valid untuk backend drive"
  fi

  fingerprint_input="crypt=crypt;filename=standard;directory=true;backend=${backing_type};provider=${provider_identity};origin=${EFFECTIVE_OFFSITE_ORIGIN}${drive_binding}"
  OFFSITE_EFFECTIVE_FINGERPRINT=$(printf '%s' "$fingerprint_input" | sha256sum | awk '{print $1}')
  [ "$OFFSITE_EFFECTIVE_FINGERPRINT" = "$OFFSITE_CONFIG_FINGERPRINT" ] \
    || backup_die "fingerprint konfigurasi off-site tidak cocok dengan commissioning"
  export OFFSITE_EFFECTIVE_FINGERPRINT
}

validate_offsite_provenance_metadata() {
  provenance=$1
  completion=$2
  [ -f "$provenance" ] && [ ! -L "$provenance" ] \
    || backup_die "provenance independent off-site tidak tersedia"
  validate_completion_manifest "$completion" \
    || backup_die "completion untuk provenance tidak valid"
  [ "$(json_value schemaVersion "$provenance")" = diis-offsite-restore-input-v1 ] \
    || backup_die "schema provenance independent off-site tidak valid"
  [ "$(json_value source "$provenance")" = independent-crypt ] \
    || backup_die "restore source bukan independent crypt"
  provenance_backup_id=$(json_value backupId "$provenance")
  completion_backup_id=$(json_value backupId "$completion")
  [ -n "$provenance_backup_id" ] && [ "$provenance_backup_id" = "$completion_backup_id" ] \
    || backup_die "backupId provenance tidak cocok"
  [ "$(json_value offsiteConfigFingerprint "$provenance")" = \
    "$(json_value offsiteConfigFingerprint "$completion")" ] \
    || backup_die "fingerprint provenance tidak cocok"
  [ "$(json_value dumpSha256 "$provenance")" = "$(json_value sha256 "$completion")" ] \
    || backup_die "dump hash provenance tidak cocok"
  [ "$(json_uint dumpBytes "$provenance")" = "$(json_uint bytes "$completion")" ] \
    || backup_die "dump size provenance tidak cocok"
  [ "$(json_value objectManifestSha256 "$provenance")" = \
    "$(json_value objectManifestSha256 "$completion")" ] \
    || backup_die "object manifest hash provenance tidak cocok"
  [ "$(json_uint objectCount "$provenance")" = "$(json_uint objectCount "$completion")" ] \
    || backup_die "object count provenance tidak cocok"
  OFFSITE_PROVENANCE_BACKUP_ID=$provenance_backup_id
  OFFSITE_PROVENANCE_SHA256=$(sha256_file "$provenance")
  export OFFSITE_PROVENANCE_BACKUP_ID OFFSITE_PROVENANCE_SHA256
}

validate_offsite_database_inputs() {
  provenance=$1
  completion=$2
  dump=$3
  sidecar=$4
  validate_offsite_provenance_metadata "$provenance" "$completion"
  [ "$(json_value dumpFile "$provenance")" = "$(basename "$dump")" ] \
    || backup_die "nama dump provenance tidak cocok"
  [ "$(json_value sidecarFile "$provenance")" = "$(basename "$sidecar")" ] \
    || backup_die "nama sidecar provenance tidak cocok"
  [ "$(json_value completionFile "$provenance")" = "$(basename "$completion")" ] \
    || backup_die "nama completion provenance tidak cocok"
  dump_sha=$(json_value dumpSha256 "$provenance")
  verify_sha256 "$dump" "$dump_sha"
  [ "$(wc -c <"$dump" | tr -d '[:space:]')" = "$(json_uint dumpBytes "$provenance")" ] \
    || backup_die "ukuran dump actual tidak cocok dengan provenance"
  [ "$(awk 'NF == 2 {print $1; exit}' "$sidecar")" = "$dump_sha" ] \
    || backup_die "sidecar hash tidak cocok dengan provenance"
  [ "$(awk 'NF == 2 {print $2; exit}' "$sidecar")" = "$(basename "$dump")" ] \
    || backup_die "sidecar filename tidak cocok dengan dump actual"
}

validate_offsite_object_inputs() {
  provenance=$1
  completion=$2
  objects=$3
  validate_offsite_provenance_metadata "$provenance" "$completion"
  [ "$(json_value objectManifestFile "$provenance")" = "$(basename "$objects")" ] \
    || backup_die "nama object manifest provenance tidak cocok"
  verify_sha256 "$objects" "$(json_value objectManifestSha256 "$provenance")"
  IFS='|' read -r provenance_schema provenance_object_id provenance_semantics <"$objects"
  [ "$provenance_schema:$provenance_object_id:$provenance_semantics" = \
    "diis-object-manifest-v1:${OFFSITE_PROVENANCE_BACKUP_ID}:exact" ] \
    || backup_die "header object manifest provenance tidak cocok"
  [ "$(( $(wc -l <"$objects") - 1 ))" = "$(json_uint objectCount "$provenance")" ] \
    || backup_die "object count actual tidak cocok dengan provenance"
}

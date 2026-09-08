#!/bin/sh

set -eu

GATE0_MAX_BACKUP_BYTES=4015794422
BACKUP_LOCAL_METADATA_RESERVE_BYTES=65536
LOCK_OWNER_TOKEN=''

# Library defaults are immutable container paths. Active callers may replace
# them only with a literal path derived inside reviewed source after this file
# is sourced; process-environment selectors are rejected before sourcing.
W10D_COMPLETION_VALIDATOR_PATH=/scripts/w10d_completion_validation.py
W10D_CAPTURE_HELPER_PATH=/scripts/bounded-command-capture.py
W10D_DU_PARSER_PATH=/scripts/parse-minio-du-observation.py
W10D_COMPLETION_VALIDATOR_SHA256=e6260806f44230905e3cb4d00a23114f1386f332ce95ba2b7b459bb33a2a421a
W10D_CAPTURE_HELPER_SHA256=6c4c8a69f8ddce7c1185b29a47fe702481bbd04ad7512e8138d9d3a24b734b4b
W10D_DU_PARSER_SHA256=35bdd6cabcd5b187597410cf289430b3da78476a4353d0b9617f1bb0e5d0433c

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
  case "${BACKUP_LOCK_TEST_MODE:-0}" in
    0)
      [ -z "${BACKUP_LOCK_TEST_DELAY_AFTER_MKDIR:-}" ] \
        && [ -z "${BACKUP_LOCK_TEST_READY_FILE:-}" ] \
        || backup_die "test control lock dilarang pada mode produksi"
      ;;
    1)
      test_root=${DIIS_W10D_TEST_ROOT:-}
      [ -d "$test_root" ] && [ ! -L "$test_root" ] \
        && [ "$(readlink -f -- "$test_root")" = "$test_root" ] \
        && [ "$(dirname -- "$test_root")" = /tmp ] \
        && [ "$(stat -c '%a:%u' -- "$test_root")" = "700:$(id -u)" ] \
        || backup_die "test root lock tidak aman"
      canonical_lock=$(readlink -m -- "$lock_dir") || backup_die "test lock tidak dapat di-canonicalize"
      canonical_ready=$(readlink -m -- "${BACKUP_LOCK_TEST_READY_FILE:-$test_root/unused}") \
        || backup_die "test marker lock tidak dapat di-canonicalize"
      case "$canonical_lock:$canonical_ready" in
        "$test_root"/*:"$test_root"/*) ;;
        *) backup_die "test control lock keluar dari root privat" ;;
      esac
      ;;
    *) backup_die "mode test lock tidak valid" ;;
  esac
  case "${BACKUP_LOCK_BOOTSTRAP_REQUIRED:-0}" in 0|1) ;; *) backup_die "mode bootstrap lock tidak valid" ;; esac
  if [ ! -e "$lock_parent" ] && [ ! -L "$lock_parent" ]; then
    if [ "${BACKUP_LOCK_BOOTSTRAP_REQUIRED:-0}" = 1 ]; then
      backup_die "parent lock belum dibootstrap atau tidak aman"
    fi
    # Transitional compatibility for the single current legacy container only.
    # Reviewed candidate/cleanup/handoff paths all force bootstrap-required=1.
    [ "$lock_parent" = /var/lock/diis-backup ] \
      || backup_die "parent lock legacy tidak termasuk path transisi"
    mkdir -m 0700 "$lock_parent" 2>/dev/null \
      || backup_die "parent lock legacy tidak dapat dibuat"
  fi
  [ -d "$lock_parent" ] && [ ! -L "$lock_parent" ] \
    || backup_die "parent lock belum dibootstrap atau tidak aman"
  boot_id=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || printf unknown)
  self_start=$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || printf unknown)
  self_namespace=$(readlink "/proc/$$/ns/pid" 2>/dev/null || printf unknown)
  token="${boot_id}:$$:${self_start}"

  if ! mkdir -m 0700 "$lock_dir" 2>/dev/null; then
    application_marker="${lock_dir}/application-owner.json"
    if [ -e "$application_marker" ] || [ -L "$application_marker" ]; then
      backup_die "karantina aplikasi aktif atau ambigu; rekonsiliasi wajib"
    fi
    owner_file="${lock_dir}/owner"
    # An ownerless directory may be a creator between mkdir(2) and owner
    # publication. It is therefore ambiguous, never stale, and must not be
    # moved or reclaimed by a contender.
    [ -f "$owner_file" ] && [ ! -L "$owner_file" ] && [ -s "$owner_file" ] \
      || backup_die "status lock ambigu; owner belum terpublikasi"

    owner_boot=$(sed -n '1p' "$owner_file" 2>/dev/null || true)
    owner_pid=$(sed -n '2p' "$owner_file" 2>/dev/null || true)
    owner_start=$(sed -n '3p' "$owner_file" 2>/dev/null || true)
    owner_namespace=$(sed -n '5p' "$owner_file" 2>/dev/null || true)
    [ -n "$owner_boot" ] && [ -n "$owner_pid" ] && [ -n "$owner_start" ] \
      && [ -n "$owner_namespace" ] \
      || backup_die "status lock ambigu; identitas owner tidak lengkap"
    # Application deployment owns a persistent, explicitly reconciled
    # quarantine. It is never an ordinary stale backup lock: guardian death or
    # a host reboot must not authorize a backup/restore/cleanup writer to move
    # or replace it. Only the separately approved application reconciliation
    # lifecycle may retire this sentinel.
    case "$owner_namespace" in
      diis-application-quarantine:*)
        backup_die "karantina aplikasi aktif atau ambigu; rekonsiliasi wajib"
        ;;
    esac
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
    if ! mkdir -m 0700 "$lock_dir" 2>/dev/null; then
      rm -rf "$stale_dir"
      backup_die "backup lain memperoleh lock saat stale recovery"
    fi
    rm -rf "$stale_dir"
  fi

  if [ "${BACKUP_LOCK_TEST_MODE:-0}" = 1 ] && [ -n "${BACKUP_LOCK_TEST_DELAY_AFTER_MKDIR:-}" ]; then
    case "$BACKUP_LOCK_TEST_DELAY_AFTER_MKDIR" in *[!0-9]*|'') backup_die "test delay lock tidak valid" ;; esac
    [ -z "${BACKUP_LOCK_TEST_READY_FILE:-}" ] || : >"$BACKUP_LOCK_TEST_READY_FILE"
    sleep "$BACKUP_LOCK_TEST_DELAY_AFTER_MKDIR"
  fi

  owner_tmp="${lock_dir}/owner.$$"
  printf '%s\n%s\n%s\n%s\n%s\n' "$boot_id" "$$" "$self_start" "$token" \
    "$self_namespace" >"$owner_tmp"
  mv "$owner_tmp" "${lock_dir}/owner"
  LOCK_OWNER_TOKEN=$token
}

require_sha256_value() {
  name=$1
  value=$2
  echo "$value" | grep -Eq '^[a-f0-9]{64}$' \
    || backup_die "fingerprint ${name} tidak valid"
}

release_directory_lock() {
  lock_dir=$1
  [ -n "$LOCK_OWNER_TOKEN" ] || return 0
  owner_token=$(sed -n '4p' "${lock_dir}/owner" 2>/dev/null || true)
  [ "$owner_token" = "$LOCK_OWNER_TOKEN" ] || return 1
  rm -f "${lock_dir}/owner"
  rmdir "$lock_dir" || return 1
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

w10d_capture_command() {
  output=$1
  max_bytes=$2
  shift 2
  [ -n "$output" ] || { backup_log "ERROR: output observasi tidak valid" >&2; return 64; }
  [ -f "$W10D_CAPTURE_HELPER_PATH" ] && [ ! -L "$W10D_CAPTURE_HELPER_PATH" ] \
    || { backup_log "ERROR: bounded capture helper tidak tersedia" >&2; return 64; }
  [ "$(sha256_file "$W10D_CAPTURE_HELPER_PATH")" = "$W10D_CAPTURE_HELPER_SHA256" ] \
    || { backup_log "ERROR: bounded capture helper tidak cocok dengan source reviewed" >&2; return 64; }
  command -v python3 >/dev/null 2>&1 \
    || { backup_log "ERROR: runtime validator Python tidak tersedia" >&2; return 64; }
  python3 "$W10D_CAPTURE_HELPER_PATH" \
    --output "$output" --max-bytes "$max_bytes" --timeout-seconds 30 -- "$@"
}

w10d_canonicalize_inventory() {
  input=$1
  output=$2
  [ -f "$input" ] && [ ! -L "$input" ] || backup_die "inventory observasi tidak tersedia"
  if [ ! -s "$input" ]; then
    : >"$output"
    return 0
  fi
  grep -q '[[:cntrl:]]' "$input" \
    && backup_die "inventory observasi mengandung control byte"
  grep -q '^$' "$input" \
    && backup_die "inventory observasi mengandung baris kosong ambigu"
  sorted="${output}.sorted"
  unique="${output}.unique"
  LC_ALL=C sort "$input" >"$sorted"
  LC_ALL=C sort -u "$input" >"$unique"
  cmp -s "$sorted" "$unique" \
    || backup_die "inventory observasi mengandung duplikasi"
  mv "$sorted" "$output"
  rm -f "$unique"
}

validate_completion_manifest() {
  [ "$#" -eq 3 ] || return 1
  file=$1
  sidecar=$2
  object_name=$3
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  [ -f "$sidecar" ] && [ ! -L "$sidecar" ] || return 1
  [ -n "$object_name" ] || return 1
  [ -z "${W10D_COMPLETION_VALIDATOR+x}" ] || return 1
  completion_validator=$W10D_COMPLETION_VALIDATOR_PATH
  [ -f "$completion_validator" ] && [ ! -L "$completion_validator" ] || return 1
  [ "$(sha256_file "$completion_validator")" = "$W10D_COMPLETION_VALIDATOR_SHA256" ] \
    || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  python3 "$completion_validator" \
    --object-name "$object_name" \
    --manifest-file "$file" \
    --sidecar-file "$sidecar" >/dev/null 2>&1
}

validate_prechange_release() {
  file=$1
  expected_backup_id=$2
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$file" "$expected_backup_id" <<'PY' >/dev/null 2>&1
import json
import re
import sys


def strict_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate-key")
        value[key] = item
    return value


try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        value = json.load(stream, object_pairs_hook=strict_object)
except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
    raise SystemExit(1)

required = {
    "schemaVersion", "backupId", "reconciliationRef",
    "reconciliationStatus", "releasedAt",
}
if type(value) is not dict or set(value) != required:
    raise SystemExit(1)
if any(type(value[key]) is not str for key in required):
    raise SystemExit(1)
if value["schemaVersion"] != "diis-prechange-release-v1":
    raise SystemExit(1)
if value["backupId"] != sys.argv[2]:
    raise SystemExit(1)
if value["reconciliationStatus"] != "complete":
    raise SystemExit(1)
if re.fullmatch(r"[A-Z0-9][A-Z0-9._/-]{5,79}", value["reconciliationRef"]) is None:
    raise SystemExit(1)
if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", value["releasedAt"]) is None:
    raise SystemExit(1)
PY
}

validate_private_owned_directory() {
  directory=$1
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$directory" <<'PY' >/dev/null 2>&1
import os
import stat
import sys


path = sys.argv[1]
if not os.path.isabs(path) or path == "/" or os.path.normpath(path) != path:
    raise SystemExit(1)
if os.path.realpath(path) != path:
    raise SystemExit(1)

current = "/"
for component in path.split("/")[1:]:
    if not component:
        raise SystemExit(1)
    current = os.path.join(current, component)
    try:
        current_stat = os.lstat(current)
    except OSError:
        raise SystemExit(1)
    if stat.S_ISLNK(current_stat.st_mode) or not stat.S_ISDIR(current_stat.st_mode):
        raise SystemExit(1)

final_stat = os.lstat(path)
if final_stat.st_uid != os.geteuid() or stat.S_IMODE(final_stat.st_mode) != 0o700:
    raise SystemExit(1)
PY
}

validate_effective_offsite_config() {
  effective_crypt_config=$1
  effective_backing_config=$2
  effective_credential_file_expected=$3

  for effective_key in type remote filename_encryption directory_name_encryption; do
    require_single_config_key "$effective_key" "$effective_crypt_config"
  done
  [ "$(lower_value "$(config_value type "$effective_crypt_config")")" = crypt ] \
    || backup_die "OFFSITE_CRYPT_REMOTE bukan backend rclone crypt"
  effective_crypt_backing=$(config_value remote "$effective_crypt_config")
  safe_remote_base "$effective_crypt_backing"
  [ "$effective_crypt_backing" = "${effective_crypt_backing%/}" ] \
    || backup_die "remote backing off-site wajib canonical tanpa trailing slash"
  [ "$(lower_value "$(config_value filename_encryption "$effective_crypt_config")")" = standard ] \
    || backup_die "filename encryption crypt wajib standard"
  [ "$(lower_value "$(config_value directory_name_encryption "$effective_crypt_config")")" = true ] \
    || backup_die "directory-name encryption crypt wajib aktif"

  effective_backing_remote_name=${effective_crypt_backing%%:*}
  require_single_config_key type "$effective_backing_config"
  for effective_optional_key in provider endpoint; do
    effective_key_count=$(config_key_count "$effective_optional_key" "$effective_backing_config")
    case "$effective_key_count" in 0|1) ;; *) backup_die "cardinality konfigurasi off-site tidak valid" ;; esac
  done
  if [ -n "${RCLONE_MINIO_REMOTE:-}" ]; then
    effective_source_remote_name=${RCLONE_MINIO_REMOTE%%:*}
    [ "$(lower_value "$effective_backing_remote_name")" != "$(lower_value "$effective_source_remote_name")" ] \
      || backup_die "off-site tidak boleh membungkus remote MinIO sumber"
  fi
  effective_backing_type=$(lower_value "$(config_value type "$effective_backing_config")")
  effective_allowed_types=$(lower_value "${OFFSITE_ALLOWED_BACKEND_TYPES:-b2,drive,azureblob,s3}" | tr -d '[:space:]')
  list_contains "$effective_allowed_types" "$effective_backing_type" \
    || backup_die "tipe backend off-site tidak termasuk allowlist independen"
  case "$effective_backing_type" in local|crypt|alias) backup_die "backend off-site tidak independen" ;; esac

  effective_backing_provider=$(lower_value "$(config_value provider "$effective_backing_config")")
  effective_backing_endpoint=$(config_value endpoint "$effective_backing_config")
  effective_provider_identity=${effective_backing_provider:-$effective_backing_type}
  [ "$effective_backing_type" != drive ] || effective_provider_identity=google
  effective_expected_provider=$(lower_value "$OFFSITE_EXPECTED_PROVIDER")
  [ "$effective_provider_identity" = "$effective_expected_provider" ] \
    || backup_die "provider off-site tidak cocok dengan commissioning"
  effective_forbidden_providers=$(lower_value "${OFFSITE_FORBIDDEN_PROVIDERS:-Minio,Hetzner}" | tr -d '[:space:]')
  list_contains "$effective_forbidden_providers" "$effective_provider_identity" \
    && backup_die "provider off-site berada pada failure domain yang dilarang"
  effective_expected_origin=$(lower_value "$OFFSITE_EXPECTED_ORIGIN")
  validate_public_commissioned_origin "$effective_backing_endpoint" "$effective_expected_origin"

  effective_drive_binding=''
  if [ "$effective_backing_type" = drive ]; then
    require_value OFFSITE_EXPECTED_TEAM_DRIVE_SHA256
    require_value OFFSITE_EXPECTED_ROOT_FOLDER_SHA256
    require_value OFFSITE_EXPECTED_AUTH_MODE
    require_value OFFSITE_EXPECTED_PRINCIPAL_SHA256
    require_value OFFSITE_EXPECTED_PROJECT_SHA256
    require_value OFFSITE_EXPECTED_KEY_IDENTITY_SHA256
    require_value OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256
    [ "$OFFSITE_EXPECTED_AUTH_MODE" = service-account-file ] \
      || backup_die "auth mode Drive wajib Service Account file"
    [ "$OFFSITE_EXPECTED_PROVIDER" = google ] \
      || backup_die "provider Drive wajib google"
    [ "$OFFSITE_EXPECTED_ORIGIN" = provider-default ] \
      || backup_die "origin Drive wajib provider-default"
    for effective_value_name in principal project key-identity credential-artifact; do
      case "$effective_value_name" in
        principal) effective_value=$OFFSITE_EXPECTED_PRINCIPAL_SHA256 ;;
        project) effective_value=$OFFSITE_EXPECTED_PROJECT_SHA256 ;;
        key-identity) effective_value=$OFFSITE_EXPECTED_KEY_IDENTITY_SHA256 ;;
        credential-artifact) effective_value=$OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256 ;;
      esac
      require_sha256_value "$effective_value_name" "$effective_value"
    done
    require_single_config_key team_drive "$effective_backing_config"
    require_single_config_key root_folder_id "$effective_backing_config"
    require_single_config_key service_account_file "$effective_backing_config"
    for effective_forbidden_key in token client_id client_secret service_account_credentials \
      impersonate_service_account impersonate; do
      reject_config_key "$effective_forbidden_key" "$effective_backing_config"
    done
    effective_team_drive=$(config_value team_drive "$effective_backing_config")
    effective_root_folder_id=$(config_value root_folder_id "$effective_backing_config")
    effective_credential_file=$(config_value service_account_file "$effective_backing_config")
    [ -n "$effective_team_drive" ] || backup_die "binding Shared Drive tidak tersedia"
    [ -n "$effective_root_folder_id" ] || backup_die "binding root folder Shared Drive tidak tersedia"
    [ "$effective_credential_file" = "$effective_credential_file_expected" ] \
      || backup_die "path Service Account Drive tidak cocok"
    [ -f "$effective_credential_file" ] && [ ! -L "$effective_credential_file" ] \
      || backup_die "artifact Service Account tidak tersedia"
    [ "$(stat -c '%a' "$effective_credential_file")" = 600 ] \
      || backup_die "mode artifact Service Account tidak aman"
    effective_credential_artifact_sha=$(sha256_file "$effective_credential_file")
    [ "$effective_credential_artifact_sha" = "$OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256" ] \
      || backup_die "fingerprint artifact Service Account tidak cocok"
    effective_team_drive_sha=$(printf '%s' "$effective_team_drive" | sha256sum | awk '{print $1}')
    effective_root_folder_sha=$(printf '%s' "$effective_root_folder_id" | sha256sum | awk '{print $1}')
    [ "$effective_team_drive_sha" = "$OFFSITE_EXPECTED_TEAM_DRIVE_SHA256" ] \
      || backup_die "fingerprint Shared Drive tidak cocok dengan commissioning"
    [ "$effective_root_folder_sha" = "$OFFSITE_EXPECTED_ROOT_FOLDER_SHA256" ] \
      || backup_die "fingerprint root folder Shared Drive tidak cocok dengan commissioning"
    effective_drive_binding=";team_drive_sha256=${effective_team_drive_sha};root_folder_sha256=${effective_root_folder_sha};auth=service-account-file;principal_sha256=${OFFSITE_EXPECTED_PRINCIPAL_SHA256};project_sha256=${OFFSITE_EXPECTED_PROJECT_SHA256};key_identity_sha256=${OFFSITE_EXPECTED_KEY_IDENTITY_SHA256};credential_artifact_sha256=${effective_credential_artifact_sha}"
  elif [ -n "${OFFSITE_EXPECTED_TEAM_DRIVE_SHA256:-}${OFFSITE_EXPECTED_ROOT_FOLDER_SHA256:-}${OFFSITE_EXPECTED_AUTH_MODE:-}${OFFSITE_EXPECTED_PRINCIPAL_SHA256:-}${OFFSITE_EXPECTED_PROJECT_SHA256:-}${OFFSITE_EXPECTED_KEY_IDENTITY_SHA256:-}${OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256:-}" ]; then
    backup_die "binding Shared Drive hanya valid untuk backend drive"
  fi

  effective_fingerprint_input="crypt=crypt;remote=${effective_crypt_backing};filename=standard;directory=true;backend=${effective_backing_type};provider=${effective_provider_identity};origin=${EFFECTIVE_OFFSITE_ORIGIN}${effective_drive_binding}"
  OFFSITE_EFFECTIVE_FINGERPRINT=$(printf '%s' "$effective_fingerprint_input" | sha256sum | awk '{print $1}')
  [ "$OFFSITE_EFFECTIVE_FINGERPRINT" = "$OFFSITE_CONFIG_FINGERPRINT" ] \
    || backup_die "fingerprint konfigurasi off-site tidak cocok dengan commissioning"
  OFFSITE_EFFECTIVE_BACKING_REMOTE=$effective_crypt_backing
  OFFSITE_EFFECTIVE_BACKING_REMOTE_NAME=$(lower_value "$effective_backing_remote_name")
  OFFSITE_EFFECTIVE_PROVIDER=$effective_provider_identity
  OFFSITE_EFFECTIVE_ORIGIN=$EFFECTIVE_OFFSITE_ORIGIN
  OFFSITE_EFFECTIVE_BACKING_SHA256=$(printf '%s' "$effective_crypt_backing" | sha256sum | awk '{print $1}')
  export OFFSITE_EFFECTIVE_FINGERPRINT OFFSITE_EFFECTIVE_BACKING_REMOTE \
    OFFSITE_EFFECTIVE_BACKING_REMOTE_NAME OFFSITE_EFFECTIVE_PROVIDER \
    OFFSITE_EFFECTIVE_ORIGIN OFFSITE_EFFECTIVE_BACKING_SHA256
}

validate_object_source_authority() {
  source_crypt_config_output=$1
  source_backing_config_output=$2
  require_value OFFSITE_CRYPT_REMOTE
  require_value OFFSITE_CONFIG_FINGERPRINT
  require_value OFFSITE_EXPECTED_PROVIDER
  require_value OFFSITE_EXPECTED_ORIGIN
  require_sha256_value source-config "$OFFSITE_CONFIG_FINGERPRINT"
  safe_remote_base "$OFFSITE_CRYPT_REMOTE"
  [ "$OFFSITE_CRYPT_REMOTE" = "${OFFSITE_CRYPT_REMOTE%/}" ] \
    || backup_die "remote source object wajib canonical tanpa trailing slash"
  source_crypt_remote_name=${OFFSITE_CRYPT_REMOTE%%:*}
  [ ! -e "$source_crypt_config_output" ] && [ ! -L "$source_crypt_config_output" ] \
    || backup_die "output observasi config crypt source sudah ada"
  w10d_capture_command "$source_crypt_config_output" 65536 \
    rclone config show "$source_crypt_remote_name" \
    || backup_die "konfigurasi crypt source tidak dapat diobservasi"
  source_crypt_config=$(cat "$source_crypt_config_output")
  for source_key in type remote filename_encryption directory_name_encryption; do
    require_single_config_key "$source_key" "$source_crypt_config"
  done
  source_backing=$(config_value remote "$source_crypt_config")
  safe_remote_base "$source_backing"
  [ "$source_backing" = "${source_backing%/}" ] \
    || backup_die "remote backing source wajib canonical tanpa trailing slash"
  source_backing_remote_name=${source_backing%%:*}
  [ ! -e "$source_backing_config_output" ] && [ ! -L "$source_backing_config_output" ] \
    || backup_die "output observasi config backing source sudah ada"
  w10d_capture_command "$source_backing_config_output" 65536 \
    rclone config show "$source_backing_remote_name" \
    || backup_die "konfigurasi backing source tidak dapat diobservasi"
  source_backing_config=$(cat "$source_backing_config_output")
  validate_effective_offsite_config "$source_crypt_config" "$source_backing_config" \
    /run/diis-secrets/google-service-account.json
}

validate_object_target_authority() {
  authority_attempt_id=$1
  authority_target_parent=$2
  authority_target=$3
  authority_config_output=$4
  authority_source_crypt_config_output=$5
  authority_source_backing_config_output=$6

  echo "$authority_attempt_id" | grep -Eq '^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$' \
    || backup_die "attempt ID authority target tidak valid"
  require_value OFFSITE_CRYPT_REMOTE
  require_value OFFSITE_CONFIG_FINGERPRINT
  require_value OFFSITE_EXPECTED_PROVIDER
  require_value OFFSITE_EXPECTED_ORIGIN
  require_value OBJECT_TARGET_EXPECTED_PROVIDER
  require_value OBJECT_TARGET_EXPECTED_ORIGIN
  require_value OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT
  require_value OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256
  safe_remote_base "$OFFSITE_CRYPT_REMOTE"
  safe_remote_base "$authority_target_parent"
  safe_remote_base "$authority_target"
  [ "$OFFSITE_CRYPT_REMOTE" = "${OFFSITE_CRYPT_REMOTE%/}" ] \
    || backup_die "remote source object wajib canonical tanpa trailing slash"
  [ "$authority_target_parent" = "${authority_target_parent%/}" ] \
    || backup_die "parent target object wajib canonical tanpa trailing slash"
  [ "$authority_target" = "${authority_target%/}" ] \
    || backup_die "target object wajib canonical tanpa trailing slash"

  authority_expected_target="${authority_target_parent}/${authority_attempt_id}"
  [ "$authority_target" = "$authority_expected_target" ] \
    || backup_die "target object tidak cocok dengan parent dan attempt approved"
  validate_object_source_authority "$authority_source_crypt_config_output" \
    "$authority_source_backing_config_output"
  authority_source_remote_name=$(lower_value "${OFFSITE_CRYPT_REMOTE%%:*}")
  authority_target_remote_name=$(lower_value "${authority_target_parent%%:*}")
  [ "$authority_source_remote_name" != "$authority_target_remote_name" ] \
    || backup_die "target object tidak boleh memakai remote source backup"
  [ "$OFFSITE_EFFECTIVE_BACKING_REMOTE_NAME" != "$authority_target_remote_name" ] \
    || backup_die "target object tidak boleh memakai remote backing source backup"

  require_sha256_value source-config "$OFFSITE_CONFIG_FINGERPRINT"
  require_sha256_value target-config "$OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT"
  require_sha256_value target-authority "$OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256"
  authority_source_provider=$OFFSITE_EFFECTIVE_PROVIDER
  authority_source_origin=$OFFSITE_EFFECTIVE_ORIGIN
  authority_expected_provider=$(lower_value "$OBJECT_TARGET_EXPECTED_PROVIDER")
  authority_expected_origin=$(lower_value "${OBJECT_TARGET_EXPECTED_ORIGIN%/}")
  for authority_provider in "$authority_source_provider" "$authority_expected_provider"; do
    case "$authority_provider" in
      ''|*[!a-z0-9._-]*) backup_die "provider authority object tidak valid" ;;
    esac
  done
  for authority_origin in "$authority_source_origin" "$authority_expected_origin"; do
    case "$authority_origin" in
      ''|*[!a-z0-9._:/-]*) backup_die "origin authority object tidak valid" ;;
    esac
  done

  [ ! -e "$authority_config_output" ] && [ ! -L "$authority_config_output" ] \
    || backup_die "output observasi config target sudah ada"
  w10d_capture_command "$authority_config_output" 65536 \
    rclone config show "$authority_target_remote_name" \
    || backup_die "konfigurasi target object tidak dapat diobservasi"
  require_single_config_key type "$(cat "$authority_config_output")"
  authority_target_config=$(cat "$authority_config_output")
  for authority_optional_key in provider endpoint; do
    authority_key_count=$(config_key_count "$authority_optional_key" "$authority_target_config")
    case "$authority_key_count" in 0|1) ;; *) backup_die "cardinality konfigurasi target tidak valid" ;; esac
  done
  authority_target_type=$(lower_value "$(config_value type "$authority_target_config")")
  case "$authority_target_type" in
    s3|b2|drive|azureblob) ;;
    local|crypt|alias) backup_die "backend target object tidak terisolasi" ;;
    *) backup_die "backend target object tidak termasuk allowlist" ;;
  esac
  authority_target_provider=$(lower_value "$(config_value provider "$authority_target_config")")
  authority_target_provider=${authority_target_provider:-$authority_target_type}
  [ "$authority_target_type" != drive ] || authority_target_provider=google
  authority_target_origin=$(lower_value "$(config_value endpoint "$authority_target_config")")
  authority_target_origin=${authority_target_origin%/}
  authority_target_origin=${authority_target_origin:-provider-default}
  case "$authority_target_provider" in
    ''|*[!a-z0-9._-]*) backup_die "provider efektif target object tidak valid" ;;
  esac
  case "$authority_target_origin" in
    ''|*[!a-z0-9._:/-]*) backup_die "origin efektif target object tidak valid" ;;
  esac
  [ "$authority_target_provider" = "$authority_expected_provider" ] \
    || backup_die "provider target object tidak cocok dengan approval"
  [ "$authority_target_origin" = "$authority_expected_origin" ] \
    || backup_die "origin target object tidak cocok dengan approval"
  if [ "$authority_target_provider" = "$authority_source_provider" ] \
    && [ "$authority_target_origin" = "$authority_source_origin" ]; then
    backup_die "target object berada pada provider dan origin source backup"
  fi

  authority_target_config_fingerprint=$(sha256_file "$authority_config_output")
  [ "$authority_target_config_fingerprint" = "$OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT" ] \
    || backup_die "fingerprint konfigurasi target object tidak cocok"
  [ "$authority_target_config_fingerprint" != "$OFFSITE_CONFIG_FINGERPRINT" ] \
    || backup_die "fingerprint target object sama dengan source backup"
  authority_effective_sha=$(printf '%s\n' \
    'schemaVersion=diis-object-target-authority-v2' \
    "attemptId=${authority_attempt_id}" \
    "sourceRemote=${OFFSITE_CRYPT_REMOTE}" \
    "sourceProvider=${authority_source_provider}" \
    "sourceOrigin=${authority_source_origin}" \
    "sourceConfigFingerprint=${OFFSITE_EFFECTIVE_FINGERPRINT}" \
    "sourceBackingSha256=${OFFSITE_EFFECTIVE_BACKING_SHA256}" \
    "targetParent=${authority_target_parent}" \
    "target=${authority_target}" \
    "targetRemote=${authority_target_remote_name}" \
    "targetProvider=${authority_target_provider}" \
    "targetOrigin=${authority_target_origin}" \
    "targetConfigFingerprint=${authority_target_config_fingerprint}" \
    | sha256sum | awk '{print $1}')
  [ "$authority_effective_sha" = "$OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256" ] \
    || backup_die "fingerprint authority target object tidak cocok"

  OBJECT_TARGET_CANONICAL_PARENT=$authority_target_parent
  OBJECT_TARGET_CANONICAL_TARGET=$authority_target
  OBJECT_TARGET_SOURCE_REMOTE=$OFFSITE_CRYPT_REMOTE
  OBJECT_TARGET_SOURCE_PROVIDER=$authority_source_provider
  OBJECT_TARGET_SOURCE_ORIGIN=$authority_source_origin
  OBJECT_TARGET_SOURCE_CONFIG_FINGERPRINT=$OFFSITE_EFFECTIVE_FINGERPRINT
  OBJECT_TARGET_SOURCE_BACKING_SHA256=$OFFSITE_EFFECTIVE_BACKING_SHA256
  OBJECT_TARGET_REMOTE_NAME=$authority_target_remote_name
  OBJECT_TARGET_EFFECTIVE_PROVIDER=$authority_target_provider
  OBJECT_TARGET_EFFECTIVE_ORIGIN=$authority_target_origin
  OBJECT_TARGET_EFFECTIVE_CONFIG_FINGERPRINT=$authority_target_config_fingerprint
  OBJECT_TARGET_EFFECTIVE_AUTHORITY_SHA256=$authority_effective_sha
  export OBJECT_TARGET_CANONICAL_PARENT OBJECT_TARGET_CANONICAL_TARGET \
    OBJECT_TARGET_SOURCE_REMOTE OBJECT_TARGET_SOURCE_PROVIDER OBJECT_TARGET_SOURCE_ORIGIN \
    OBJECT_TARGET_SOURCE_CONFIG_FINGERPRINT OBJECT_TARGET_SOURCE_BACKING_SHA256 \
    OBJECT_TARGET_REMOTE_NAME \
    OBJECT_TARGET_EFFECTIVE_PROVIDER OBJECT_TARGET_EFFECTIVE_ORIGIN \
    OBJECT_TARGET_EFFECTIVE_CONFIG_FINGERPRINT OBJECT_TARGET_EFFECTIVE_AUTHORITY_SHA256
}

write_disposable_target_marker() {
  marker_attempt_id=$1
  printf '{"schemaVersion":"diis-disposable-object-target-v3","attemptId":"%s","sourceRemote":"%s","sourceProvider":"%s","sourceOrigin":"%s","sourceConfigFingerprint":"%s","sourceBackingSha256":"%s","targetParent":"%s","target":"%s","targetRemote":"%s","targetProvider":"%s","targetOrigin":"%s","targetConfigFingerprint":"%s","authoritySha256":"%s"}\n' \
    "$marker_attempt_id" "$OBJECT_TARGET_SOURCE_REMOTE" "$OBJECT_TARGET_SOURCE_PROVIDER" \
    "$OBJECT_TARGET_SOURCE_ORIGIN" "$OBJECT_TARGET_SOURCE_CONFIG_FINGERPRINT" \
    "$OBJECT_TARGET_SOURCE_BACKING_SHA256" "$OBJECT_TARGET_CANONICAL_PARENT" \
    "$OBJECT_TARGET_CANONICAL_TARGET" \
    "$OBJECT_TARGET_REMOTE_NAME" "$OBJECT_TARGET_EFFECTIVE_PROVIDER" \
    "$OBJECT_TARGET_EFFECTIVE_ORIGIN" "$OBJECT_TARGET_EFFECTIVE_CONFIG_FINGERPRINT" \
    "$OBJECT_TARGET_EFFECTIVE_AUTHORITY_SHA256"
}

validate_disposable_target_marker() {
  file=$1
  expected_attempt_id=$2
  [ -f "$file" ] && [ ! -L "$file" ] || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$file" "$expected_attempt_id" \
    "$OBJECT_TARGET_SOURCE_REMOTE" "$OBJECT_TARGET_SOURCE_PROVIDER" \
    "$OBJECT_TARGET_SOURCE_ORIGIN" "$OBJECT_TARGET_SOURCE_CONFIG_FINGERPRINT" \
    "$OBJECT_TARGET_SOURCE_BACKING_SHA256" "$OBJECT_TARGET_CANONICAL_PARENT" \
    "$OBJECT_TARGET_CANONICAL_TARGET" \
    "$OBJECT_TARGET_REMOTE_NAME" "$OBJECT_TARGET_EFFECTIVE_PROVIDER" \
    "$OBJECT_TARGET_EFFECTIVE_ORIGIN" "$OBJECT_TARGET_EFFECTIVE_CONFIG_FINGERPRINT" \
    "$OBJECT_TARGET_EFFECTIVE_AUTHORITY_SHA256" <<'PY' >/dev/null 2>&1
import json
import re
import sys


def strict_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate-key")
        value[key] = item
    return value


try:
    with open(sys.argv[1], encoding="utf-8") as stream:
        value = json.load(stream, object_pairs_hook=strict_object)
except (OSError, UnicodeError, ValueError, json.JSONDecodeError):
    raise SystemExit(1)

keys = {
    "schemaVersion", "attemptId", "sourceRemote", "sourceProvider",
    "sourceOrigin", "sourceConfigFingerprint", "sourceBackingSha256",
    "targetParent", "target",
    "targetRemote", "targetProvider", "targetOrigin",
    "targetConfigFingerprint", "authoritySha256",
}
if type(value) is not dict or set(value) != keys:
    raise SystemExit(1)
if any(type(value[key]) is not str for key in keys):
    raise SystemExit(1)
if value["schemaVersion"] != "diis-disposable-object-target-v3":
    raise SystemExit(1)
if value["attemptId"] != sys.argv[2]:
    raise SystemExit(1)
if re.fullmatch(r"w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}", value["attemptId"]) is None:
    raise SystemExit(1)
expected = {
    "sourceRemote": sys.argv[3],
    "sourceProvider": sys.argv[4],
    "sourceOrigin": sys.argv[5],
    "sourceConfigFingerprint": sys.argv[6],
    "sourceBackingSha256": sys.argv[7],
    "targetParent": sys.argv[8],
    "target": sys.argv[9],
    "targetRemote": sys.argv[10],
    "targetProvider": sys.argv[11],
    "targetOrigin": sys.argv[12],
    "targetConfigFingerprint": sys.argv[13],
    "authoritySha256": sys.argv[14],
}
if any(value[key] != expected[key] for key in expected):
    raise SystemExit(1)
PY
}

write_manifest() {
  output=$1
  status=$2
  offsite_status=$3
  object_status=$4
  protection_state=none
  [ "$BACKUP_CLASS" = pre-change ] && protection_state=protected
  cat >"$output" <<EOF
{"schemaVersion":"diis-backup-v1","status":"${status}","backupId":"${BACKUP_ID}","class":"${BACKUP_CLASS}","protectionState":"${protection_state}","createdAt":"${CREATED_AT}","createdEpoch":${CREATED_EPOCH},"dailyKey":"${DAILY_KEY}","weeklyKey":"${WEEKLY_KEY}","monthlyKey":"${MONTHLY_KEY}","sha256":"${DUMP_SHA256}","bytes":${DUMP_BYTES},"archiveValidated":true,"offsiteStatus":"${offsite_status}","offsiteConfigFingerprint":"${OFFSITE_EFFECTIVE_FINGERPRINT:-pending}","objectStatus":"${object_status}","objectManifestSha256":"${OBJECT_MANIFEST_SHA256:-pending}","objectCount":${OBJECT_COUNT:-0},"tableCount":${TABLE_COUNT},"userCount":${USER_COUNT},"studentCount":${STUDENT_COUNT},"targetTotalBytes":${TARGET_TOTAL_BYTES:-0},"targetFreeBytes":${TARGET_FREE_BYTES:-0}}
EOF
}

safe_remote_base() {
  value=$1
  echo "$value" | grep -Eq '^[A-Za-z0-9_-]+:[A-Za-z0-9._/-]*$' || backup_die "remote rclone tidak valid"
  case "$value" in
    *..*|*//*|/*) backup_die "remote rclone tidak aman" ;;
  esac
}

capture_offsite_completion_inventory() {
  capture_inventory_output=$1
  capture_inventory_raw="${capture_inventory_output}.paths.raw"
  capture_inventory_paths="${capture_inventory_output}.paths.canonical"
  capture_inventory_names="${capture_inventory_output}.names.raw"
  [ ! -e "$capture_inventory_output" ] && [ ! -L "$capture_inventory_output" ] \
    || backup_die "target inventory completion off-site sudah ada"
  w10d_capture_command "$capture_inventory_raw" 1048576 rclone lsf "$OFFSITE_CRYPT_REMOTE" \
    --recursive --files-only --include '/database/manifests/*.complete.json' \
    || backup_die "inventory completion off-site awal gagal"
  w10d_canonicalize_inventory "$capture_inventory_raw" "$capture_inventory_paths"
  : >"$capture_inventory_names"
  while IFS= read -r object_path; do
    [ -n "$object_path" ] || continue
    case "$object_path" in
      database/manifests/*.complete.json) ;;
      *) backup_die "path completion off-site awal tidak canonical" ;;
    esac
    object_name=${object_path#database/manifests/}
    case "$object_name" in
      ''|*/*|*'..'*) backup_die "nama completion off-site awal tidak aman" ;;
    esac
    printf '%s\n' "$object_name" >>"$capture_inventory_names"
  done <"$capture_inventory_paths"
  w10d_canonicalize_inventory "$capture_inventory_names" "$capture_inventory_output"
}

config_value() {
  key=$1
  config=$2
  printf '%s\n' "$config" | awk -F '[[:space:]]*=[[:space:]]*' -v wanted="$key" \
    '$1 == wanted { sub(/^[^=]*=[[:space:]]*/, ""); print; exit }'
}

config_key_count() {
  key=$1
  config=$2
  printf '%s\n' "$config" | awk -F '[[:space:]]*=[[:space:]]*' -v wanted="$key" \
    '$1 == wanted {n++} END {print n+0}'
}

require_single_config_key() {
  key=$1
  config=$2
  [ "$(config_key_count "$key" "$config")" = 1 ] \
    || backup_die "cardinality konfigurasi off-site tidak valid"
}

reject_config_key() {
  key=$1
  config=$2
  [ "$(config_key_count "$key" "$config")" = 0 ] \
    || backup_die "mode autentikasi off-site terlarang"
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
  # Production callers omit this argument and therefore bind to the exact
  # container mount. Tests may inject an isolated synthetic artifact path
  # without weakening any executable production call site.
  credential_file_expected=${1:-/run/diis-secrets/google-service-account.json}
  case "$credential_file_expected" in /*) ;; *) backup_die "path Service Account wajib absolut" ;; esac
  require_command rclone
  require_value OFFSITE_CRYPT_REMOTE
  require_value OFFSITE_CONFIG_FINGERPRINT
  require_value OFFSITE_EXPECTED_PROVIDER
  require_value OFFSITE_EXPECTED_ORIGIN
  safe_remote_base "$OFFSITE_CRYPT_REMOTE"

  crypt_remote_name=${OFFSITE_CRYPT_REMOTE%%:*}
  crypt_config=$(rclone config show "$crypt_remote_name" 2>/dev/null) \
    || backup_die "konfigurasi crypt tidak dapat dibaca"
  for crypt_key in type remote filename_encryption directory_name_encryption; do
    require_single_config_key "$crypt_key" "$crypt_config"
  done
  crypt_backing=$(config_value remote "$crypt_config")
  safe_remote_base "$crypt_backing"
  [ "$crypt_backing" = "${crypt_backing%/}" ] \
    || backup_die "remote backing off-site wajib canonical tanpa trailing slash"

  backing_remote_name=${crypt_backing%%:*}
  backing_config=$(rclone config show "$backing_remote_name" 2>/dev/null) \
    || backup_die "konfigurasi backend off-site tidak dapat dibaca"
  validate_effective_offsite_config "$crypt_config" "$backing_config" "$credential_file_expected"
}

validate_offsite_provenance_metadata() {
  provenance=$1
  completion=$2
  sidecar=$3
  object_name=$4
  [ -f "$provenance" ] && [ ! -L "$provenance" ] \
    || backup_die "provenance independent off-site tidak tersedia"
  validate_completion_manifest "$completion" "$sidecar" "$object_name" \
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
  validate_offsite_provenance_metadata "$provenance" "$completion" "$sidecar" "$(basename "$completion")"
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
  sidecar=$4
  validate_offsite_provenance_metadata "$provenance" "$completion" "$sidecar" "$(basename "$completion")"
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

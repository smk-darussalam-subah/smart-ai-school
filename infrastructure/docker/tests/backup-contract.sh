#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
BACKUP="$ROOT/infrastructure/docker/scripts/backup.sh"
LIB="$ROOT/infrastructure/docker/scripts/backup-lib.sh"
OFFSITE="$ROOT/infrastructure/docker/scripts/offsite-replication.sh"
OBJECT_RESTORE="$ROOT/infrastructure/docker/scripts/restore-objects.sh"
OFFSITE_RESTORE_PREPARE="$ROOT/scripts/prepare-offsite-restore.sh"
OFFSITE_RESTORE_CLEANUP="$ROOT/scripts/cleanup-offsite-restore.sh"
OBJECT_TARGET_PREPARE="$ROOT/scripts/prepare-object-restore-target.sh"
OBJECT_TARGET_CLEANUP="$ROOT/scripts/cleanup-object-restore-target.sh"
PRECHANGE_RELEASE="$ROOT/infrastructure/docker/scripts/release-prechange-backup.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
PG_BACKUP_DOCKERFILE="$ROOT/infrastructure/docker/pg-backup.Dockerfile"
RESTORE="$ROOT/scripts/restore-drill.sh"
PUBLISH_RESTORE_PROOF="$ROOT/scripts/publish-restore-proof.sh"
MONITOR="$ROOT/infrastructure/n8n/workflows/backup-daily.json"
BACKUP_RUNBOOK="$ROOT/docs/runbooks/backup-restore.md"
OFFSITE_RUNBOOK="$ROOT/docs/runbooks/offsite-backup-recovery.md"
RESTORE_RUNBOOK="$ROOT/docs/runbooks/restore-database.md"
TMP=$(mktemp -d)
REAL_SHA=$(command -v sha256sum)
GATE0_BUDGET=4015794422
METADATA_RESERVE=65536
OFFSITE_EXPECTED_PROVIDER=backblaze
OFFSITE_EXPECTED_ORIGIN=https://api.backblazeb2.com
export OFFSITE_EXPECTED_PROVIDER OFFSITE_EXPECTED_ORIGIN
FINGERPRINT=$(printf '%s' 'crypt=crypt;remote=independent:encrypted;filename=standard;directory=true;backend=b2;provider=backblaze;origin=https://api.backblazeb2.com' | "$REAL_SHA" | awk '{print $1}')
PASSED=0

cleanup() {
  if [[ "${KEEP_TEST_TMP:-0}" == 1 ]]; then
    printf 'preserved test temp: %s\n' "$TMP" >&2
  else
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT HUP INT TERM

pass() { PASSED=$((PASSED + 1)); printf 'ok %d - %s\n' "$PASSED" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
assert_grep() { grep -Eq -- "$1" "$2" || fail "$3"; }
assert_not_grep() { ! grep -Eq -- "$1" "$2" || fail "$3"; }

make_fakes() {
  local dir=$1
  mkdir -p "$dir"
  cat >"$dir/pg_dump" <<'EOF'
#!/bin/sh
[ "${FAULT:-}" = dump ] && exit 11
for arg in "$@"; do case "$arg" in --file=*) file=${arg#--file=} ;; esac; done
dd if=/dev/zero of="$file" bs=2048 count=1 2>/dev/null
EOF
  cat >"$dir/pg_restore" <<'EOF'
#!/bin/sh
[ "${FAULT:-}" = validation ] && exit 12
echo 'TABLE DATA auth users'
EOF
  cat >"$dir/psql" <<'EOF'
#!/bin/sh
case "$*" in
  *pg_database_size*) echo "${DB_ESTIMATE:-4096}" ;;
  *information_schema.tables*) echo 46 ;;
  *auth.users*) echo 40 ;;
  *student.students*) echo 20 ;;
  *) echo 1 ;;
esac
EOF
  cat >"$dir/df" <<'EOF'
#!/bin/sh
echo 'Filesystem 1024-blocks Used Available Capacity Mounted on'
if [ "${FAULT:-}" = disk ]; then
  echo 'mock 100 96 4 96% /'
else
  echo 'mock 20000000 1000 19999000 1% /'
fi
EOF
  cat >"$dir/mc" <<'EOF'
#!/bin/sh
set -eu
root=${MC_FAKE_ROOT:?}
resolve() {
  case "$1" in myminio/*) printf '%s/%s' "$root" "${1#myminio/}" ;; *) printf '%s' "$1" ;; esac
}
command=$1
shift
case "$command" in
  du)
    case "${FAULT:-}" in
      du-fail) exit 47 ;;
      du-empty) exit 0 ;;
      du-malformed) printf '{\n'; exit 0 ;;
      du-partial)
        printf '%s\n' '{"prefix":"synthetic","size":1,"objects":1,"status":"success","isVersions":false}'
        exit 47
        ;;
      du-overflow) awk 'BEGIN { for (i=0; i<1100000; i++) printf "x"; printf "\n" }'; exit 0 ;;
      du-duplicate)
        printf '%s\n%s\n' \
          '{"prefix":"synthetic","size":1,"objects":1,"status":"success","isVersions":false}' \
          '{"prefix":"synthetic","size":1,"objects":1,"status":"success","isVersions":false}'
        exit 0
        ;;
    esac
    target=''
    for arg in "$@"; do case "$arg" in --*) ;; *) target=$arg ;; esac; done
    [ -n "$target" ] || exit 46
    target=$(resolve "$target")
    size=$(find "$target" -type f -exec sh -c \
      'for file do wc -c <"$file"; done' sh {} + 2>/dev/null \
      | awk '{ total += $1 } END { print total+0 }')
    printf '{"prefix":"synthetic","size":%s,"objects":1,"status":"success","isVersions":false}\n' "$size"
    ;;
  find)
    target=$(resolve "$1")
    shift
    pattern='*'
    while [ "$#" -gt 0 ]; do
      [ "$1" = --name ] && { pattern=$2; shift 2; continue; }
      shift
    done
    if printf '%s' "$pattern" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9]+\.\*$'; then
      cleanup_observe_state="$root/.cleanup-observe-seen"
      case "${MC_CLEANUP_OBSERVE_FAULT:-}" in
        pre-nonzero) exit 69 ;;
        partial-nonzero)
          printf 'myminio/backup/postgres/%s.dump\n' "${pattern%.\*}"
          exit 69
          ;;
        overflow) awk 'BEGIN { for (i=0; i<70000; i++) printf "x"; printf "\n" }'; exit 0 ;;
        post-nonzero)
          if [ -f "$cleanup_observe_state" ]; then exit 70; fi
          : >"$cleanup_observe_state"
          ;;
      esac
    fi
    case "${FAULT:-}:$pattern" in
      degraded-fail:'*.local.json'|local-retention-fail:'*.complete.json') exit 48 ;;
      degraded-partial:'*.local.json')
        printf 'myminio/backup/postgres/synthetic.local.json\n'; exit 48 ;;
      degraded-overflow:'*.local.json')
        awk 'BEGIN { for (i=0; i<1100000; i++) printf "x"; printf "\n" }'; exit 0 ;;
      degraded-duplicate:'*.local.json')
        printf 'myminio/backup/postgres/synthetic.local.json\nmyminio/backup/postgres/synthetic.local.json\n'; exit 0 ;;
      local-retention-duplicate:'*.complete.json')
        printf 'myminio/backup/postgres/synthetic.complete.json\nmyminio/backup/postgres/synthetic.complete.json\n'; exit 0 ;;
    esac
    [ -d "$target" ] || exit 0
    find "$target" -type f -name "$pattern" | while IFS= read -r file; do
      printf 'myminio/%s\n' "${file#"$root"/}"
    done
    ;;
  cp)
    src=''; dst=''
    for arg in "$@"; do
      case "$arg" in --*) ;; *) if [ -z "$src" ]; then src=$arg; else dst=$arg; fi ;; esac
    done
    src_path=$(resolve "$src"); dst_path=$(resolve "$dst")
    [ -f "$src_path" ] || exit 44
    mkdir -p "$(dirname "$dst_path")"
    if [ "${FAULT:-}" = upload ] && printf '%s' "$dst" | grep -q '\.dump$'; then exit 13; fi
    if [ "${FAULT:-}" = local_corrupt ] && printf '%s' "$dst" | grep -q '\.dump$' && printf '%s' "$dst" | grep -q '^myminio/'; then
      head -c 128 "$src_path" >"$dst_path"
    else
      cp "$src_path" "$dst_path"
    fi
    if { [ "${FAULT:-}" = post_write_over ] || [ "${MC_FORCE_POST_WRITE_OVER:-0}" = 1 ]; } \
      && printf '%s' "$dst" | grep -q '/monitor/latest\.json$'; then
      dd if=/dev/zero bs=131072 count=1 >>"$dst_path" 2>/dev/null
    fi
    ;;
  rm)
    [ "${FAULT:-}" = cleanup ] && exit 14
    for arg in "$@"; do
      case "$arg" in
        --*) ;;
        *)
          if [ "${MC_CLEANUP_DELETE_FAULT:-}" = partial ] \
            && printf '%s' "$arg" | grep -q '\.dump$'; then
            exit 14
          fi
          rm -f "$(resolve "$arg")"
          ;;
      esac
    done
    ;;
  stat) [ -f "$(resolve "$1")" ] ;;
  *) exit 45 ;;
esac
EOF
  cat >"$dir/rclone" <<'EOF'
#!/bin/sh
set -eu
source_root=${RCLONE_SOURCE_ROOT:?}
offsite_root=${RCLONE_OFFSITE_ROOT:?}
restore_root=${RCLONE_RESTORE_ROOT:?}
resolve() {
  remote=${1%%:*}; path=${1#*:}; path=${path#/}
  case "$remote" in
    diisminio) printf '%s/%s' "$source_root" "$path" ;;
    offsite-crypt) printf '%s/%s' "$offsite_root" "$path" ;;
    restore-*) printf '%s/%s/%s' "$restore_root" "$remote" "$path" ;;
    *) printf '%s' "$1" ;;
  esac
}
command=$1
shift
if [ -n "${RCLONE_CALL_LOG:-}" ]; then
  case "$command" in
    config) printf 'config:%s\n' "${2:-missing}" >>"$RCLONE_CALL_LOG" ;;
    *) printf '%s\n' "$command" >>"$RCLONE_CALL_LOG" ;;
  esac
fi
case "$command" in
  config)
    [ "${FAULT:-}" = config ] && exit 51
    [ "$1" = show ] || exit 52
    case "$2" in
      offsite-crypt)
        [ "${RCLONE_SOURCE_CONFIG_FAULT:-}" != crypt-nonzero ] || exit 73
        if [ "${RCLONE_SOURCE_CONFIG_FAULT:-}" = crypt-duplicate ]; then
          printf '[offsite-crypt]\ntype = crypt\ntype = crypt\nremote = independent:encrypted\nfilename_encryption = standard\ndirectory_name_encryption = true\n'
          exit 0
        fi
        crypt_backing=${RCLONE_FAKE_CRYPT_BACKING:-independent:encrypted}
        [ "${RCLONE_SOURCE_CONFIG_FAULT:-}" != crypt-drift ] \
          || crypt_backing=independent:redirected
        printf '[offsite-crypt]\ntype = crypt\nremote = %s\nfilename_encryption = %s\ndirectory_name_encryption = %s\n' \
          "$crypt_backing" \
          "${RCLONE_FAKE_FILENAME_MODE:-standard}" "${RCLONE_FAKE_DIRECTORY_MODE:-true}"
        ;;
      independent)
        [ "${RCLONE_SOURCE_CONFIG_FAULT:-}" != backing-nonzero ] || exit 74
        printf '[independent]\ntype = %s\nprovider = %s\n' \
          "${RCLONE_FAKE_BACKEND_TYPE:-b2}" "${RCLONE_FAKE_PROVIDER:-Backblaze}"
        if [ "${RCLONE_FAKE_ENDPOINT:-https://api.backblazeb2.com}" != __EMPTY__ ]; then
          printf 'endpoint = %s\n' "${RCLONE_FAKE_ENDPOINT:-https://api.backblazeb2.com}"
        fi
        [ -z "${RCLONE_FAKE_TEAM_DRIVE+x}" ] || printf 'team_drive = %s\n' "$RCLONE_FAKE_TEAM_DRIVE"
        [ -z "${RCLONE_FAKE_ROOT_FOLDER+x}" ] || printf 'root_folder_id = %s\n' "$RCLONE_FAKE_ROOT_FOLDER"
        [ -z "${RCLONE_FAKE_SERVICE_ACCOUNT_FILE+x}" ] || \
          printf 'service_account_file = %s\n' "$RCLONE_FAKE_SERVICE_ACCOUNT_FILE"
        [ -z "${RCLONE_FAKE_EXTRA_CONFIG+x}" ] || printf '%s\n' "$RCLONE_FAKE_EXTRA_CONFIG"
        ;;
      diisminio)
        printf '[diisminio]\ntype = s3\nprovider = Minio\nendpoint = http://minio:9000\n'
        ;;
      restore-*)
        printf '[%s]\ntype = %s\nprovider = %s\nendpoint = %s\n' "$2" \
          "${RCLONE_TARGET_BACKEND_TYPE:-s3}" "${RCLONE_TARGET_PROVIDER:-Minio}" \
          "${RCLONE_TARGET_ORIGIN:-http://isolated-minio:9000}"
        ;;
      local) printf '[local]\ntype = local\n' ;;
      *) exit 53 ;;
    esac
    ;;
  lsf)
    raw_target=$1
    target=$(resolve "$raw_target"); shift
    target=${target%/}
    dirs_only=0
    manifest_only=0
    while [ "$#" -gt 0 ]; do
      [ "$1" = --dirs-only ] && dirs_only=1
      if [ "$1" = --include ]; then
        [ "$2" = '/database/manifests/*.complete.json' ] || exit 68
        manifest_only=1
        shift 2
        continue
      fi
      shift
    done
    case "${RCLONE_LSF_FAULT:-}" in
      nonzero) exit 71 ;;
      overflow) awk 'BEGIN { for (i=0; i<8500000; i++) printf "x"; printf "\n" }'; exit 0 ;;
      second-overflow)
        fault_state=${RCLONE_LSF_FAULT_STATE:?}
        if [ ! -f "$fault_state" ]; then
          printf '1\n' >"$fault_state"
        elif [ "$(cat "$fault_state")" = 1 ]; then
          printf '2\n' >"$fault_state"
          awk 'BEGIN { for (i=0; i<8500000; i++) printf "x"; printf "\n" }'
          exit 0
        fi
        ;;
    esac
    case "$raw_target" in
      diisminio:*)
        case "${FAULT:-}" in
          object-inventory-fail) exit 58 ;;
          object-inventory-duplicate) printf 'media/sample.jpg\nmedia/sample.jpg\n'; exit 0 ;;
          object-inventory-overflow) awk 'BEGIN { for (i=0; i<8500000; i++) printf "x"; printf "\n" }'; exit 0 ;;
          object-post-inventory-fail|object-post-inventory-duplicate)
            object_marker="${restore_root}/.object-inventory-seen"
            if [ -f "$object_marker" ]; then
              [ "${FAULT:-}" != object-post-inventory-fail ] || exit 58
              printf 'media/sample.jpg\nmedia/sample.jpg\n'
              exit 0
            fi
            : >"$object_marker"
            ;;
        esac
        ;;
      offsite-crypt:*)
        if [ "$manifest_only" -eq 1 ]; then
          case "${FAULT:-}" in
            offsite-retention-fail) exit 58 ;;
            offsite-retention-partial)
              printf 'database/manifests/synthetic.complete.json\n'; exit 58 ;;
            offsite-retention-duplicate)
              printf 'database/manifests/synthetic.complete.json\ndatabase/manifests/synthetic.complete.json\n'; exit 0 ;;
          esac
        fi
        ;;
    esac
    [ "${RCLONE_OBSERVE_FAULT:-}" != always ] || exit 58
    case "${RCLONE_OBSERVE_FAULT:-}" in
      final-restore|final-restore-overflow)
      observe_state=${RCLONE_OBSERVE_STATE:?}
      if [ -f "$observe_state" ]; then
        [ "${RCLONE_OBSERVE_FAULT:-}" != final-restore ] || exit 67
        awk 'BEGIN { for (i=0; i<8500000; i++) printf "x"; printf "\n" }'
        exit 0
      fi
      : >"$observe_state"
      ;;
    esac
    if [ "${RCLONE_OBSERVE_FAULT:-}" = after-purge ] && [ -f "${restore_root}/.purge-complete" ]; then
      exit 59
    fi
    if [ "${RCLONE_POST_PURGE_DUPLICATE:-0}" = 1 ] \
      && [ -n "${RCLONE_PURGE_STATE:-}" ] && [ -f "$RCLONE_PURGE_STATE" ]; then
      printf 'synthetic-residual/\nsynthetic-residual/\n'
      exit 0
    fi
    if [ -f "$target" ]; then basename "$target"; exit 0; fi
    case "$target" in *.json|*.tsv) exit 3 ;; esac
    [ -d "$target" ] || { mkdir -p "$target" 2>/dev/null || true; exit 0; }
    if [ "$manifest_only" -eq 1 ]; then
      manifest_root="${target}/database/manifests"
      [ -d "$manifest_root" ] || exit 0
      find "$manifest_root" -type f -name '*.complete.json' | LC_ALL=C sort | while IFS= read -r file; do
        printf 'database/manifests/%s\n' "${file#"$manifest_root"/}"
      done
    elif [ "$dirs_only" -eq 1 ]; then
      find "$target" -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort | while IFS= read -r dir; do
        printf '%s/\n' "${dir#"$target"/}"
      done
    else
      find "$target" -type f | LC_ALL=C sort | while IFS= read -r file; do
        printf '%s\n' "${file#"$target"/}"
      done
    fi
    ;;
  copyto)
    [ "${FAULT:-}" = offsite ] && exit 54
    src=$(resolve "$1"); dst=$(resolve "$2")
    [ -f "$src" ] || exit 55
    mkdir -p "$(dirname "$dst")"
    case "$dst" in
      *.dump.candidate)
        if [ -n "${OFFSITE_PREPARE_SIGNAL:-}" ]; then
          cp "$src" "$dst"
          kill -s "$OFFSITE_PREPARE_SIGNAL" "$PPID"
          sleep 0.1
        fi
        if [ "${OFFSITE_PREPARE_COPY_FAIL_AFTER_WRITE:-0}" = 1 ]; then
          cp "$src" "$dst"
          exit 64
        fi
        ;;
    esac
    if printf '%s\n' "$*" | grep -q -- '--immutable' && [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      exit 56
    fi
    case "$dst" in
      */diis-object-restore.*/*)
        mkdir -p "$(dirname "$dst")"
        if [ -n "${OBJECT_VERIFY_SIGNAL:-}" ]; then
          printf residual >"$dst"
          kill -s "$OBJECT_VERIFY_SIGNAL" "$PPID"
          sleep 0.1
        fi
        if [ "${OBJECT_VERIFY_FAULT:-}" = copy ]; then
          printf residual >"$dst"
          exit 62
        fi
        cp "$src" "$dst"
        [ "${OBJECT_VERIFY_FAULT:-}" != hash ] || printf corrupted >"$dst"
        ;;
      *) cp "$src" "$dst" ;;
    esac
    ;;
  mkdir)
    mkdir -p "$(resolve "$1")"
    if [ -n "${RCLONE_MKDIR_SIGNAL:-}" ]; then
      kill -s "$RCLONE_MKDIR_SIGNAL" "$PPID"
      sleep 0.1
    fi
    [ "${RCLONE_MKDIR_FAIL_AFTER_CREATE:-0}" != 1 ] || exit 66
    ;;
  rcat)
    dst=$(resolve "$1")
    mkdir -p "$(dirname "$dst")"
    if [ -n "${RCLONE_MARKER_SIGNAL:-}" ]; then
      kill -s "$RCLONE_MARKER_SIGNAL" "$PPID"
      sleep 0.1
    fi
    [ "${RCLONE_MARKER_WRITE_FAIL:-0}" != 1 ] || exit 60
    cat >"$dst"
    ;;
  cat)
    case "${RCLONE_CAT_FAULT:-}" in
      nonzero) exit 72 ;;
      overflow) awk 'BEGIN { for (i=0; i<5000; i++) printf "x"; printf "\n" }'; exit 0 ;;
      empty) exit 0 ;;
      release-nonzero)
        printf '%s' "$1" | grep -q '/database/releases/' && exit 72
        ;;
      release-overflow)
        if printf '%s' "$1" | grep -q '/database/releases/'; then
          awk 'BEGIN { for (i=0; i<5000; i++) printf "x"; printf "\n" }'
          exit 0
        fi
        ;;
    esac
    cat "$(resolve "$1")"
    ;;
  deletefile) rm -f "$(resolve "$1")" ;;
  purge)
    purge_target=$(resolve "$1")
    [ -z "${RCLONE_PURGE_STATE:-}" ] || : >"$RCLONE_PURGE_STATE"
    if [ -n "${RCLONE_PURGE_SIGNAL:-}" ]; then
      rm -f "$purge_target/.diis-disposable-restore-target-v3"
      cleanup_shell_pid=$(awk '{print $4}' "/proc/$PPID/stat")
      kill -s "$RCLONE_PURGE_SIGNAL" "$cleanup_shell_pid"
      sleep 0.1
      exit 0
    fi
    [ "${RCLONE_PURGE_FAIL:-0}" != 1 ] || exit 61
    if [ "${RCLONE_PURGE_PARTIAL:-0}" = 1 ]; then
      rm -f "$purge_target/.diis-disposable-restore-target-v3"
      exit 61
    fi
    [ "${RCLONE_PURGE_LEAVE_TARGET:-0}" != 1 ] || exit 0
    rm -rf "$purge_target"
    [ "${RCLONE_OBSERVE_FAULT:-}" != after-purge ] || touch "${restore_root}/.purge-complete"
    ;;
  *) exit 57 ;;
esac
EOF
  cat >"$dir/wc" <<'EOF'
#!/bin/sh
if [ "${OBJECT_VERIFY_FAULT:-}" = size ] && [ "${1:-}" = -c ]; then
  value=$(/usr/bin/wc -c)
  echo $((value + 1))
else
  exec /usr/bin/wc "$@"
fi
EOF
  chmod +x "$dir"/*
}

prepare_backup_case() {
  local base=$1
  mkdir -p "$base/tmp" "$base/minio-target" "$base/mc/backup/postgres" \
    "$base/source/objects/media" "$base/offsite" "$base/restore"
  printf sample >"$base/source/objects/media/sample.jpg"
  make_fakes "$base/bin"
}

run_backup() {
  local name=$1 fault=${2:-} estimate=${3:-4096} existing_bytes=${4:-0}
  local base="$TMP/$name"
  prepare_backup_case "$base"
  if [[ "$existing_bytes" -gt 0 ]]; then
    truncate -s "$existing_bytes" "$base/mc/backup/postgres/existing.bin"
  fi
  if [[ "${SEED_LOCAL_PROTECTED:-0}" == 1 ]]; then
    local protected_id=20200101T000000Z-8000
    local protected_dump="$base/mc/backup/postgres/$protected_id.dump"
    truncate -s 2048 "$protected_dump"
    local protected_sha protected_object_sha
    protected_sha=$($REAL_SHA "$protected_dump" | awk '{print $1}')
    protected_object_sha=$(printf 'diis-object-manifest-v1|%s|exact\n' "$protected_id" \
      | $REAL_SHA | awk '{print $1}')
    printf '%s  %s.dump\n' "$protected_sha" "$protected_id" \
      >"$base/mc/backup/postgres/$protected_id.sha256"
    printf '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"%s","class":"pre-change","protectionState":"protected","createdAt":"2020-01-01T00:00:00Z","createdEpoch":1577836800,"dailyKey":"2020-01-01","weeklyKey":"2020-W01","monthlyKey":"2020-01","sha256":"%s","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"%s","objectStatus":"empty","objectManifestSha256":"%s","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}\n' \
      "$protected_id" "$protected_sha" "$FINGERPRINT" "$protected_object_sha" \
      >"$base/mc/backup/postgres/$protected_id.complete.json"
  fi
  env PATH="$base/bin:$PATH" MC="$base/bin/mc" RCLONE="$base/bin/rclone" FAULT="$fault" \
    MC_CLEANUP_OBSERVE_FAULT="${MC_CLEANUP_OBSERVE_FAULT:-}" \
    MC_CLEANUP_DELETE_FAULT="${MC_CLEANUP_DELETE_FAULT:-}" \
    MC_FORCE_POST_WRITE_OVER="${MC_FORCE_POST_WRITE_OVER:-0}" \
    RCLONE_CAT_FAULT="${RCLONE_CAT_FAULT:-}" \
    DB_ESTIMATE="$estimate" MC_FAKE_ROOT="$base/mc" RCLONE_SOURCE_ROOT="$base/source" \
    RCLONE_OFFSITE_ROOT="$base/offsite" RCLONE_RESTORE_ROOT="$base/restore" \
    POSTGRES_HOST=postgres POSTGRES_USER=test POSTGRES_DB=test BACKUP_BUCKET=backup \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects BACKUP_TEMP_ROOT="$base/tmp" \
    MINIO_TARGET_PATH="$base/minio-target" BACKUP_LOCK_DIR="$base/lock" \
    BACKUP_LOCAL_BUDGET_BYTES="$GATE0_BUDGET" sh "$BACKUP" >"$base/out" 2>"$base/err"
}

assert_grep 'PG_BACKUP_IMAGE' "$COMPOSE" 'backup image must be explicitly bound'
assert_grep 'PG_BACKUP_IMAGE_REFERENCE' "$COMPOSE" 'backup image digest reference is not propagated'
assert_grep 'python:3\.12-alpine3\.20@sha256:edf7256d5773b7ca9c41290b7bf6f844c15c6c2168f97473c276acb6789f12ab' \
  "$PG_BACKUP_DOCKERFILE" 'pinned Python runtime stage missing'
assert_grep 'postgres:16\.4-alpine3\.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c' \
  "$PG_BACKUP_DOCKERFILE" 'pinned PostgreSQL client stage missing'
assert_grep 'python3 /scripts/w10d_completion_validation.py --help' "$PG_BACKUP_DOCKERFILE" \
  'real image validator integration assertion missing'
assert_not_grep '^# syntax=' "$PG_BACKUP_DOCKERFILE" \
  'Dockerfile still selects a mutable external frontend'
assert_grep 'MC_SHA256=.01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891.' "$COMPOSE" 'mc checksum missing'
assert_grep 'RCLONE_SHA256=.7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad.' "$COMPOSE" 'rclone checksum missing'
assert_not_grep 'curl.*\|[[:space:]]*(ba)?sh|/release/linux-amd64/mc([[:space:]]|$)' "$COMPOSE" 'mutable installer found'
pass 'immutable backup supply chain'

assert_grep '0 2 \* \* \*' "$COMPOSE" '02:00 WIB schedule missing'
assert_grep 'BACKUP_LOCAL_BUDGET_BYTES.*4015794422' "$COMPOSE" 'Gate 0 absolute budget missing'
assert_grep 'minio_data:/var/lib/diis-minio-target:ro' "$COMPOSE" 'MinIO target volume observability missing'
assert_not_grep 'crontab|Cron \(' "$ROOT/scripts/backup-db.sh" 'host wrapper must not define a scheduler'
pass 'single scheduler and exact capacity authority'

if ! run_backup success; then cat "$TMP/success/err" >&2; fail 'success path failed'; fi
assert_grep 'BACKUP_COMPLETE' "$TMP/success/out" 'success marker missing'
[[ ! -d "$TMP/success/lock" ]] || fail 'success lock leaked'
[[ -z $(find "$TMP/success/tmp" -mindepth 1 -print -quit) ]] || fail 'success temp leaked'
pass 'success path publishes verified local and off-site completion'

for fault in dump validation upload offsite disk cleanup local_corrupt du-fail du-empty du-malformed \
  du-partial du-overflow du-duplicate degraded-fail degraded-partial degraded-overflow \
  degraded-duplicate local-retention-fail local-retention-duplicate object-inventory-fail \
  object-inventory-overflow object-inventory-duplicate object-post-inventory-fail \
  object-post-inventory-duplicate offsite-retention-fail offsite-retention-partial \
  offsite-retention-duplicate; do
  if run_backup "$fault" "$fault"; then fail "$fault fault unexpectedly succeeded"; fi
  [[ ! -d "$TMP/$fault/lock" ]] || fail "$fault lock leaked"
  case "$fault" in
    du-fail|du-empty|du-malformed|du-partial|du-overflow|du-duplicate|degraded-fail|\
    degraded-partial|degraded-overflow|degraded-duplicate|local-retention-fail|\
    local-retention-duplicate|object-inventory-fail|object-inventory-overflow|\
    object-inventory-duplicate|offsite-retention-fail|offsite-retention-partial|\
    offsite-retention-duplicate)
      [[ -z $(find "$TMP/$fault/mc/backup/postgres" -mindepth 1 -print -quit) ]] \
        || fail "$fault published recovery point after observation failure" ;;
    object-post-inventory-fail|object-post-inventory-duplicate)
      [[ -z $(find "$TMP/$fault/mc/backup/postgres" -name '*.complete.json' -print -quit) ]] \
        || fail "$fault published local completion after post-snapshot observation failure"
      [[ -z $(find "$TMP/$fault/offsite" -name '*.complete.json' -print -quit) ]] \
        || fail "$fault published off-site completion after post-snapshot observation failure" ;;
  esac
done
assert_grep 'checksum tidak cocok.*local-verify' "$TMP/local_corrupt/err" 'local corruption was not detected'
assert_grep 'observasi aggregate MinIO' "$TMP/du-malformed/err" 'malformed MinIO aggregate was not rejected'
assert_grep 'inventory object sebelum snapshot' "$TMP/object-inventory-fail/err" 'object inventory failure was not rejected'
pass 'dump validation upload offsite disk cleanup local corruption and observation failures fail closed'

if run_backup budget-over '' 4015794423; then fail 'over-budget estimate unexpectedly succeeded'; fi
exact_preflight_existing=$((GATE0_BUDGET - 2048 - METADATA_RESERVE))
if ! run_backup budget-boundary '' 2048 "$exact_preflight_existing"; then
  cat "$TMP/budget-boundary/err" >&2; fail 'exact preflight boundary rejected'
fi
without_reserve_existing=$((GATE0_BUDGET - 2048))
if run_backup budget-overhead '' 2048 "$without_reserve_existing"; then
  fail 'metadata reserve was omitted from preflight budget'
fi
post_write_existing=$((GATE0_BUDGET - 2048 - METADATA_RESERVE))
if run_backup budget-post-write post_write_over 2048 "$post_write_existing"; then
  fail 'post-write budget overflow unexpectedly succeeded'
fi
[[ -z $(find "$TMP/budget-post-write/mc/backup/postgres" -maxdepth 1 \
  \( -name '*.dump' -o -name '*.sha256' -o -name '*.complete.json' -o -name '*.local.json' \) \
  -print -quit) ]] || fail 'invalid post-write recovery point was not removed'
[[ ! -e "$TMP/budget-post-write/mc/backup/postgres/monitor/latest.json" ]] \
  || fail 'invalid post-write telemetry was not removed'
pass 'Gate 0 budget includes bounded metadata and post-write actual total'

for cleanup_case in pre-observation partial-output overflow partial-delete post-observation; do
  case "$cleanup_case" in
    pre-observation)
      MC_CLEANUP_OBSERVE_FAULT=pre-nonzero MC_FORCE_POST_WRITE_OVER=1 \
        run_backup "cleanup-$cleanup_case" '' 2048 "$post_write_existing" && cleanup_rc=0 || cleanup_rc=$?
      ;;
    partial-output)
      MC_CLEANUP_OBSERVE_FAULT=partial-nonzero MC_FORCE_POST_WRITE_OVER=1 \
        run_backup "cleanup-$cleanup_case" '' 2048 "$post_write_existing" && cleanup_rc=0 || cleanup_rc=$?
      ;;
    overflow)
      MC_CLEANUP_OBSERVE_FAULT=overflow MC_FORCE_POST_WRITE_OVER=1 \
        run_backup "cleanup-$cleanup_case" '' 2048 "$post_write_existing" && cleanup_rc=0 || cleanup_rc=$?
      ;;
    partial-delete)
      MC_CLEANUP_DELETE_FAULT=partial MC_FORCE_POST_WRITE_OVER=1 \
        run_backup "cleanup-$cleanup_case" '' 2048 "$post_write_existing" && cleanup_rc=0 || cleanup_rc=$?
      ;;
    post-observation)
      MC_CLEANUP_OBSERVE_FAULT=post-nonzero MC_FORCE_POST_WRITE_OVER=1 \
        run_backup "cleanup-$cleanup_case" '' 2048 "$post_write_existing" && cleanup_rc=0 || cleanup_rc=$?
      ;;
  esac
  if [[ "$cleanup_rc" -ne 74 ]]; then
    sed -n '1,120p' "$TMP/cleanup-$cleanup_case/err" >&2
    fail "$cleanup_case local cleanup returned status $cleanup_rc instead of ambiguous status 74"
  fi
  assert_grep 'LOCAL_RECOVERY_POINT_CLEANUP_AMBIGUOUS.*retry=prohibited' \
    "$TMP/cleanup-$cleanup_case/err" "$cleanup_case local cleanup ambiguity marker missing"
  [[ ! -d "$TMP/cleanup-$cleanup_case/lock" ]] || fail "$cleanup_case cleanup leaked writer lock"
  [[ -z $(find "$TMP/cleanup-$cleanup_case/tmp" -mindepth 1 -print -quit) ]] \
    || fail "$cleanup_case cleanup leaked private temporary state"
done
[[ -n $(find "$TMP/cleanup-partial-delete/mc/backup/postgres" -maxdepth 1 -name '*.dump' -print -quit) ]] \
  || fail 'partial local deletion did not retain an observable owned recovery artifact'
pass 'local recovery-point cleanup is bounded tri-state and ambiguous-no-retry on every unproven absence'

if ! SEED_LOCAL_PROTECTED=1 RCLONE_CAT_FAULT=release-overflow \
  run_backup local-release-overflow; then
  cat "$TMP/local-release-overflow/err" >&2
  fail 'bounded local release-marker overflow did not conservatively keep the protected point'
fi
[[ -f "$TMP/local-release-overflow/mc/backup/postgres/20200101T000000Z-8000.complete.json" ]] \
  || fail 'local retention deleted protected point after oversized release observation'
assert_grep 'RELEASE_MARKER_UNAVAILABLE.*retention=keep' "$TMP/local-release-overflow/err" \
  'local release observation did not preserve unavailable state'
if SEED_LOCAL_PROTECTED=1 RCLONE_CAT_FAULT=empty run_backup local-release-empty; then
  fail 'empty release marker was treated as unavailable instead of invalid'
fi
[[ -f "$TMP/local-release-empty/mc/backup/postgres/20200101T000000Z-8000.complete.json" ]] \
  || fail 'invalid empty release marker deleted protected local point'
assert_grep 'release marker protected point tidak valid' "$TMP/local-release-empty/err" \
  'empty release marker did not preserve invalid-versus-unavailable distinction'
pass 'local protected retention bounds release markers and keeps points on unavailable evidence'

run_crypt_negative() {
  local name=$1; shift
  local base="$TMP/crypt-$name"
  prepare_backup_case "$base"
  if env PATH="$base/bin:$PATH" MC="$base/bin/mc" RCLONE="$base/bin/rclone" \
    MC_FAKE_ROOT="$base/mc" RCLONE_SOURCE_ROOT="$base/source" RCLONE_OFFSITE_ROOT="$base/offsite" \
    RCLONE_RESTORE_ROOT="$base/restore" POSTGRES_HOST=postgres POSTGRES_USER=test POSTGRES_DB=test \
    BACKUP_BUCKET=backup OFFSITE_CRYPT_REMOTE=offsite-crypt:diis \
    OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects \
    BACKUP_TEMP_ROOT="$base/tmp" MINIO_TARGET_PATH="$base/minio-target" BACKUP_LOCK_DIR="$base/lock" \
    BACKUP_LOCAL_BUDGET_BYTES="$GATE0_BUDGET" "$@" sh "$BACKUP" >"$base/out" 2>"$base/err"; then
    fail "$name crypt configuration unexpectedly succeeded"
  fi
}
run_crypt_negative local env RCLONE_FAKE_CRYPT_BACKING=local:encrypted
run_crypt_negative same-provider env RCLONE_FAKE_PROVIDER=mInIo OFFSITE_EXPECTED_PROVIDER=minio
run_crypt_negative filename-off env RCLONE_FAKE_FILENAME_MODE=off
run_crypt_negative filename-obfuscate env RCLONE_FAKE_FILENAME_MODE=obfuscate
run_crypt_negative unreadable env FAULT=config
run_crypt_negative fingerprint env OFFSITE_CONFIG_FINGERPRINT="$(printf '%064d' 0)"
run_crypt_negative loopback-v4 env RCLONE_FAKE_ENDPOINT=https://127.0.0.1 OFFSITE_EXPECTED_ORIGIN=https://127.0.0.1
run_crypt_negative rfc1918-10 env RCLONE_FAKE_ENDPOINT=https://10.0.0.5 OFFSITE_EXPECTED_ORIGIN=https://10.0.0.5
run_crypt_negative rfc1918-172 env RCLONE_FAKE_ENDPOINT=https://172.16.4.5 OFFSITE_EXPECTED_ORIGIN=https://172.16.4.5
run_crypt_negative rfc1918-192 env RCLONE_FAKE_ENDPOINT=https://192.168.1.5 OFFSITE_EXPECTED_ORIGIN=https://192.168.1.5
run_crypt_negative link-local env RCLONE_FAKE_ENDPOINT=https://169.254.1.5 OFFSITE_EXPECTED_ORIGIN=https://169.254.1.5
run_crypt_negative loopback-v6 env RCLONE_FAKE_ENDPOINT='https://[::1]' OFFSITE_EXPECTED_ORIGIN='https://[::1]'
run_crypt_negative unique-local-v6 env RCLONE_FAKE_ENDPOINT='https://[fc00::1]' OFFSITE_EXPECTED_ORIGIN='https://[fc00::1]'
run_crypt_negative link-local-v6 env RCLONE_FAKE_ENDPOINT='https://[fe80::1]' OFFSITE_EXPECTED_ORIGIN='https://[fe80::1]'
run_crypt_negative internal-name env RCLONE_FAKE_ENDPOINT=https://backup.internal OFFSITE_EXPECTED_ORIGIN=https://backup.internal
run_crypt_negative local-name env RCLONE_FAKE_ENDPOINT=https://backup.local OFFSITE_EXPECTED_ORIGIN=https://backup.local
run_crypt_negative unapproved-public-origin env RCLONE_FAKE_ENDPOINT=https://s3.example.net
run_crypt_negative drive-auth-on-b2 env OFFSITE_EXPECTED_AUTH_MODE=service-account-file
pass 'crypt provider origin private-range and fingerprint controls fail closed'

drive_team='school-shared-drive-id'
drive_root='diis-recovery-folder-id'
drive_team_sha=$(printf '%s' "$drive_team" | "$REAL_SHA" | awk '{print $1}')
drive_root_sha=$(printf '%s' "$drive_root" | "$REAL_SHA" | awk '{print $1}')
drive_principal_sha=$(printf '%s' 'synthetic-backup-principal' | "$REAL_SHA" | awk '{print $1}')
drive_project_sha=$(printf '%s' 'synthetic-backup-project' | "$REAL_SHA" | awk '{print $1}')
drive_key_sha=$(printf '%s' 'synthetic-key-identity' | "$REAL_SHA" | awk '{print $1}')
drive_credential_template="$TMP/synthetic-google-service-account.json"
printf '%s\n' '{"type":"service_account","project_id":"synthetic-inert-project","private_key_id":"0000000000000000000000000000000000000000","private_key":"SYNTHETIC-NOT-A-KEY","client_email":"synthetic-inert@example.invalid"}' \
  >"$drive_credential_template"
chmod 600 "$drive_credential_template"
drive_credential_sha=$("$REAL_SHA" "$drive_credential_template" | awk '{print $1}')
drive_fingerprint=$(printf '%s' "crypt=crypt;remote=independent:encrypted;filename=standard;directory=true;backend=drive;provider=google;origin=provider-default;team_drive_sha256=${drive_team_sha};root_folder_sha256=${drive_root_sha};auth=service-account-file;principal_sha256=${drive_principal_sha};project_sha256=${drive_project_sha};key_identity_sha256=${drive_key_sha};credential_artifact_sha256=${drive_credential_sha}" \
  | "$REAL_SHA" | awk '{print $1}')
validate_drive() {
  local team=$1 root=$2 expected_team=$3 expected_root=$4 extra_config=${5:-}
  local base="$TMP/drive-$RANDOM"
  prepare_backup_case "$base"
  cp "$drive_credential_template" "$base/service-account.json"
  chmod 600 "$base/service-account.json"
  env PATH="$base/bin:$PATH" RCLONE_SOURCE_ROOT="$base/source" RCLONE_OFFSITE_ROOT="$base/offsite" \
    RCLONE_RESTORE_ROOT="$base/restore" RCLONE_FAKE_BACKEND_TYPE=drive RCLONE_FAKE_PROVIDER=Google \
    RCLONE_FAKE_ENDPOINT=__EMPTY__ RCLONE_FAKE_TEAM_DRIVE="$team" RCLONE_FAKE_ROOT_FOLDER="$root" \
    RCLONE_FAKE_SERVICE_ACCOUNT_FILE="$base/service-account.json" RCLONE_FAKE_EXTRA_CONFIG="$extra_config" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$drive_fingerprint" \
    OFFSITE_EXPECTED_PROVIDER=google OFFSITE_EXPECTED_ORIGIN=provider-default \
    OFFSITE_EXPECTED_TEAM_DRIVE_SHA256="$expected_team" OFFSITE_EXPECTED_ROOT_FOLDER_SHA256="$expected_root" \
    OFFSITE_EXPECTED_AUTH_MODE=service-account-file \
    OFFSITE_EXPECTED_PRINCIPAL_SHA256="$drive_principal_sha" \
    OFFSITE_EXPECTED_PROJECT_SHA256="$drive_project_sha" \
    OFFSITE_EXPECTED_KEY_IDENTITY_SHA256="$drive_key_sha" \
    OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256="$drive_credential_sha" \
    sh -c '. "$1"; validate_offsite_config "$2"' _ "$LIB" "$base/service-account.json"
}
validate_drive "$drive_team" "$drive_root" "$drive_team_sha" "$drive_root_sha" \
  || fail 'approved Shared Drive binding was rejected'
if validate_drive wrong-drive "$drive_root" "$drive_team_sha" "$drive_root_sha" >/dev/null 2>&1; then
  fail 'swapped Shared Drive binding was accepted'
fi
if validate_drive "$drive_team" wrong-folder "$drive_team_sha" "$drive_root_sha" >/dev/null 2>&1; then
  fail 'swapped root folder binding was accepted'
fi
if validate_drive '' "$drive_root" "$drive_team_sha" "$drive_root_sha" >/dev/null 2>&1; then
  fail 'missing Shared Drive binding was accepted'
fi
if validate_drive "$drive_team" "$drive_root" "$(printf '%064d' 0)" "$drive_root_sha" >/dev/null 2>&1; then
  fail 'post-approval Drive config drift was accepted'
fi
for forbidden in 'token = synthetic-redacted' 'client_id = synthetic-redacted' \
  'client_secret = synthetic-redacted' 'service_account_credentials = synthetic-redacted' \
  'impersonate = synthetic@example.invalid'; do
  if validate_drive "$drive_team" "$drive_root" "$drive_team_sha" "$drive_root_sha" "$forbidden" \
    >/dev/null 2>&1; then
    fail "forbidden Drive authentication key was accepted: ${forbidden%% =*}"
  fi
done
pass 'Shared Drive root folder Service Account artifact and forbidden auth paths fail closed'

history_base="$TMP/object-history"
prepare_backup_case "$history_base"
object_parent='restore-parent:'
object_target_provider=minio
object_target_origin=http://isolated-minio:9000
object_target_config_fingerprint_for() {
  local parent=$1
  local remote_name=${parent%%:*}
  printf '[%s]\ntype = s3\nprovider = Minio\nendpoint = http://isolated-minio:9000\n' "$remote_name" \
    | "$REAL_SHA" | awk '{print $1}'
}
object_target_config_fingerprint=$(object_target_config_fingerprint_for "$object_parent")
object_target_authority_sha() {
  local attempt=$1
  local parent=${2:-$object_parent}
  local config_fingerprint
  config_fingerprint=${3:-$(object_target_config_fingerprint_for "$parent")}
  local target="${parent%/}/${attempt}"
  local remote_name=${parent%%:*}
  remote_name=${remote_name,,}
  printf '%s\n' \
    'schemaVersion=diis-object-target-authority-v2' \
    "attemptId=${attempt}" \
    'sourceRemote=offsite-crypt:diis' \
    "sourceProvider=${OFFSITE_EXPECTED_PROVIDER}" \
    "sourceOrigin=${OFFSITE_EXPECTED_ORIGIN}" \
    "sourceConfigFingerprint=${FINGERPRINT}" \
    "sourceBackingSha256=$(printf '%s' 'independent:encrypted' | "$REAL_SHA" | awk '{print $1}')" \
    "targetParent=${parent}" \
    "target=${target}" \
    "targetRemote=${remote_name}" \
    "targetProvider=${object_target_provider}" \
    "targetOrigin=${object_target_origin}" \
    "targetConfigFingerprint=${config_fingerprint}" \
    | "$REAL_SHA" | awk '{print $1}'
}
run_target_prepare() {
  local attempt=$1 parent=${2:-$object_parent}
  local authority config_fingerprint
  config_fingerprint=$(object_target_config_fingerprint_for "$parent")
  authority=$(object_target_authority_sha "$attempt" "$parent" "$config_fingerprint")
  env PATH="${OBJECT_TARGET_FAULT_BIN:+$OBJECT_TARGET_FAULT_BIN:}$history_base/bin:$PATH" \
    RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
    OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$config_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$authority" \
    RCLONE_TARGET_BACKEND_TYPE="${RCLONE_TARGET_BACKEND_TYPE:-s3}" \
    RCLONE_TARGET_PROVIDER="${RCLONE_TARGET_PROVIDER:-Minio}" \
    RCLONE_TARGET_ORIGIN="${RCLONE_TARGET_ORIGIN:-http://isolated-minio:9000}" \
    RCLONE_MARKER_WRITE_FAIL="${RCLONE_MARKER_WRITE_FAIL:-0}" \
    RCLONE_MARKER_SIGNAL="${RCLONE_MARKER_SIGNAL:-}" \
    RCLONE_PURGE_FAIL="${RCLONE_PURGE_FAIL:-0}" \
    RCLONE_MKDIR_FAIL_AFTER_CREATE="${RCLONE_MKDIR_FAIL_AFTER_CREATE:-0}" \
    RCLONE_MKDIR_SIGNAL="${RCLONE_MKDIR_SIGNAL:-}" \
    RCLONE_LSF_FAULT="${RCLONE_LSF_FAULT:-}" \
    RCLONE_LSF_FAULT_STATE="${RCLONE_LSF_FAULT_STATE:-}" \
    RCLONE_OBSERVE_FAULT="${RCLONE_OBSERVE_FAULT:-}" \
    RCLONE_SOURCE_CONFIG_FAULT="${RCLONE_SOURCE_CONFIG_FAULT:-}" \
    RCLONE_CALL_LOG="${RCLONE_CALL_LOG:-}" \
    OBJECT_LOCAL_CLEANUP_FAULT="${OBJECT_LOCAL_CLEANUP_FAULT:-}" \
    TMPDIR="${OBJECT_TARGET_TMPDIR:-${TMPDIR:-/tmp}}" \
    OBJECT_TARGET_CREATE_CONFIRMATION=CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
    sh "$OBJECT_TARGET_PREPARE" "$attempt" "$parent"
}
run_target_cleanup() {
  local attempt=$1 parent=${2:-$object_parent}
  local authority config_fingerprint
  config_fingerprint=$(object_target_config_fingerprint_for "$parent")
  authority=$(object_target_authority_sha "$attempt" "$parent" "$config_fingerprint")
  env PATH="${OBJECT_TARGET_FAULT_BIN:+$OBJECT_TARGET_FAULT_BIN:}$history_base/bin:$PATH" \
    RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
    OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$config_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$authority" \
    RCLONE_PURGE_FAIL="${RCLONE_PURGE_FAIL:-0}" \
    RCLONE_PURGE_PARTIAL="${RCLONE_PURGE_PARTIAL:-0}" \
    RCLONE_PURGE_LEAVE_TARGET="${RCLONE_PURGE_LEAVE_TARGET:-0}" \
    RCLONE_PURGE_SIGNAL="${RCLONE_PURGE_SIGNAL:-}" \
    RCLONE_PURGE_STATE="${RCLONE_PURGE_STATE:-}" \
    RCLONE_POST_PURGE_DUPLICATE="${RCLONE_POST_PURGE_DUPLICATE:-0}" \
    RCLONE_OBSERVE_FAULT="${RCLONE_OBSERVE_FAULT:-}" \
    RCLONE_SOURCE_CONFIG_FAULT="${RCLONE_SOURCE_CONFIG_FAULT:-}" \
    RCLONE_CALL_LOG="${RCLONE_CALL_LOG:-}" \
    OBJECT_LOCAL_CLEANUP_FAULT="${OBJECT_LOCAL_CLEANUP_FAULT:-}" \
    TMPDIR="${OBJECT_TARGET_TMPDIR:-${TMPDIR:-/tmp}}" \
    OBJECT_TARGET_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
    sh "$OBJECT_TARGET_CLEANUP" "$attempt" "$parent"
}
printf 'version-a' >"$history_base/source/objects/x.txt"
run_object_snapshot() {
  local backup_id=$1 epoch=$2
  local run_dir="$history_base/$backup_id"
  local created_at daily_key weekly_key monthly_key
  created_at=$(date -u -d "@$epoch" '+%Y-%m-%dT%H:%M:%SZ')
  daily_key=$(date -u -d "@$epoch" '+%Y-%m-%d')
  weekly_key=$(date -u -d "@$epoch" '+%G-W%V')
  monthly_key=$(date -u -d "@$epoch" '+%Y-%m')
  mkdir -p "$run_dir"
  chmod 700 "$run_dir"
  dd if=/dev/zero of="$run_dir/$backup_id.dump" bs=2048 count=1 2>/dev/null
  local dump_sha
  dump_sha=$($REAL_SHA "$run_dir/$backup_id.dump" | awk '{print $1}')
  printf '%s  %s.dump\n' "$dump_sha" "$backup_id" >"$run_dir/database.sha256"
  cp "$run_dir/database.sha256" "$run_dir/${backup_id}.sha256"
  find "$history_base/source/objects" -type f | sed "s#^$history_base/source/objects/##" \
    | LC_ALL=C sort >"$run_dir/pre.list"
  if [ -d "$history_base/offsite/diis/database/manifests" ]; then
    find "$history_base/offsite/diis/database/manifests" -type f -name '*.complete.json' \
      -exec basename {} \; | LC_ALL=C sort >"$run_dir/existing-offsite.list"
  else
    : >"$run_dir/existing-offsite.list"
  fi
  env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    RCLONE_CAT_FAULT="${RCLONE_CAT_FAULT:-}" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects BACKUP_ID="$backup_id" \
    BACKUP_CLASS=daily CREATED_AT="$created_at" CREATED_EPOCH="$epoch" \
    DAILY_KEY="$daily_key" WEEKLY_KEY="$weekly_key" MONTHLY_KEY="$monthly_key" \
    DUMP_SHA256="$dump_sha" DUMP_BYTES=2048 TABLE_COUNT=46 USER_COUNT=40 STUDENT_COUNT=20 \
    TARGET_TOTAL_BYTES=20000000000 TARGET_FREE_BYTES=10000000000 TARGET_PROJECTED_FREE_PERCENT=49 \
    sh "$OFFSITE" "$run_dir/$backup_id.dump" "$run_dir/database.sha256" \
      "$run_dir/$backup_id.complete.json" "$run_dir" "$run_dir/pre.list" \
      "$run_dir/existing-offsite.list" >"$run_dir/status"
}

run_object_snapshot 20260901T000000Z-1001 1788220800
printf 'version-b' >"$history_base/source/objects/x.txt"
printf 'second' >"$history_base/source/objects/y.txt"
run_object_snapshot 20260902T000000Z-1002 1788307200
rm "$history_base/source/objects/x.txt"
run_object_snapshot 20260903T000000Z-1003 1788393600

restore_snapshot() {
  local backup_id=$1 attempt=$2
  local provenance="$history_base/$backup_id/$backup_id.offsite-provenance.json"
  local proof_dir="$history_base/$backup_id/proofs"
  local proof="$proof_dir/$backup_id.object-restore-proof.json"
  local authority
  authority=$(object_target_authority_sha "$attempt")
  python3 - "$history_base/$backup_id/$backup_id.complete.json" "$provenance" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1], encoding='utf-8'))
backup_id = manifest['backupId']
value = {
  'schemaVersion': 'diis-offsite-restore-input-v1', 'source': 'independent-crypt',
  'backupId': backup_id, 'offsiteConfigFingerprint': manifest['offsiteConfigFingerprint'],
  'dumpSha256': manifest['sha256'], 'dumpBytes': manifest['bytes'],
  'objectManifestSha256': manifest['objectManifestSha256'], 'objectCount': manifest['objectCount'],
  'dumpFile': f'{backup_id}.dump', 'sidecarFile': f'{backup_id}.sha256',
  'completionFile': f'{backup_id}.complete.json', 'objectManifestFile': f'{backup_id}.objects.tsv'
}
with open(sys.argv[2], 'w', encoding='utf-8') as stream:
    json.dump(value, stream, separators=(',', ':'))
    stream.write('\n')
PY
  mkdir -m 700 "$proof_dir"
  run_target_prepare "$attempt" >"$history_base/$attempt.prepare.out"
  env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$attempt" \
    OBJECT_RESTORE_TARGET="${object_parent%/}/${attempt}" OBJECT_RESTORE_PROOF_DIR="$proof_dir" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
    OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$authority" \
    RCLONE_LSF_FAULT="${RCLONE_LSF_FAULT:-}" \
    RCLONE_LSF_FAULT_STATE="${RCLONE_LSF_FAULT_STATE:-}" \
    RCLONE_OBSERVE_FAULT="${RCLONE_OBSERVE_FAULT:-}" \
    RCLONE_OBSERVE_STATE="${RCLONE_OBSERVE_STATE:-}" \
    RCLONE_SOURCE_CONFIG_FAULT="${RCLONE_SOURCE_CONFIG_FAULT:-}" \
    RCLONE_CALL_LOG="${RCLONE_CALL_LOG:-}" \
    OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
    sh "$OBJECT_RESTORE" "$provenance" "$history_base/$backup_id/$backup_id.complete.json" \
      "$history_base/$backup_id/${backup_id}.sha256" \
      "$history_base/$backup_id/$backup_id.objects.tsv" >"$history_base/$attempt.out"
  assert_grep '"source":"independent-crypt"' "$proof" 'object restore proof source missing'
}
attempt_a=w10d-20260906t030001z-a1111111
attempt_b=w10d-20260906t030002z-a2222222
attempt_c=w10d-20260906t030003z-a3333333
restore_snapshot 20260901T000000Z-1001 "$attempt_a"
restore_snapshot 20260902T000000Z-1002 "$attempt_b"
restore_snapshot 20260903T000000Z-1003 "$attempt_c"
[[ "$(cat "$history_base/restore/restore-parent/$attempt_a/x.txt")" == version-a ]] || fail 'backup A did not restore x v1'
[[ "$(cat "$history_base/restore/restore-parent/$attempt_b/x.txt")" == version-b ]] || fail 'backup B did not restore x v2'
[[ -f "$history_base/restore/restore-parent/$attempt_b/y.txt" ]] || fail 'backup B omitted y'
[[ ! -e "$history_base/restore/restore-parent/$attempt_c/x.txt" && -f "$history_base/restore/restore-parent/$attempt_c/y.txt" ]] \
  || fail 'backup C did not honor deletion tombstone semantics'
pass 'three historical object sets restore create update and delete exactly'

negative_attempt=w10d-20260906t030004z-a4444444
negative_target="$history_base/restore/restore-parent/$negative_attempt"
negative_proof_dir="$history_base/negative-proofs"
mkdir -m 700 "$negative_proof_dir"
run_target_prepare "$negative_attempt" >/dev/null
negative_authority=$(object_target_authority_sha "$negative_attempt")
sed 's/20260902T000000Z-1002/20260901T000000Z-1001/' \
  "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.offsite-provenance.json" \
  >"$history_base/swapped-object-provenance.json"
if env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
  RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
  OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
  OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
  OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$negative_attempt" \
  OBJECT_RESTORE_TARGET="${object_parent%/}/${negative_attempt}" \
  OBJECT_RESTORE_PROOF_DIR="$negative_proof_dir" \
  OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
  OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
  OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
  OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$negative_authority" \
  OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
  sh "$OBJECT_RESTORE" "$history_base/swapped-object-provenance.json" \
    "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.complete.json" \
    "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.sha256" \
    "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.objects.tsv"; then
  fail 'swapped object provenance was accepted'
fi
[[ "$(find "$negative_target" -type f | wc -l | tr -d '[:space:]')" = 1 ]] \
  || fail 'swapped object provenance mutated disposable target'
pass 'swapped object provenance is rejected before object-target mutation'

run_object_proof_preflight() {
  local case_name=$1 attempt=$2 proof_dir=$3 authority
  authority=$(object_target_authority_sha "$attempt")
  run_target_prepare "$attempt" >/dev/null
  local -a optional_env=()
  if [[ -n ${TEST_LEGACY_PROOF_OUTPUT+x} ]]; then
    optional_env+=("OBJECT_RESTORE_PROOF_OUTPUT=$TEST_LEGACY_PROOF_OUTPUT")
  fi
  env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$attempt" \
    OBJECT_RESTORE_TARGET="${object_parent%/}/${attempt}" OBJECT_RESTORE_PROOF_DIR="$proof_dir" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
    OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$authority" \
    OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
    "${optional_env[@]}" sh "$OBJECT_RESTORE" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.offsite-provenance.json" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.complete.json" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.sha256" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.objects.tsv" \
      >"$history_base/proof-preflight-$case_name.out" \
      2>"$history_base/proof-preflight-$case_name.err"
}
assert_proof_preflight_rejected() {
  local case_name=$1 attempt=$2 proof_dir=$3
  if run_object_proof_preflight "$case_name" "$attempt" "$proof_dir"; then
    fail "$case_name unsafe proof path unexpectedly succeeded"
  fi
  [[ "$(find "$history_base/restore/restore-parent/$attempt" -type f | wc -l | tr -d '[:space:]')" = 1 ]] \
    || fail "$case_name unsafe proof path reached object mutation"
}
proof_path_root="$history_base/proof-path-negative"
mkdir -m 700 "$proof_path_root"
legacy_sentinel="$history_base/legacy-proof-sentinel"
printf sentinel >"$legacy_sentinel"
TEST_LEGACY_PROOF_OUTPUT="$legacy_sentinel" assert_proof_preflight_rejected legacy-output \
  w10d-20260906t034001z-d1111111 "$proof_path_root"
[[ "$(cat "$legacy_sentinel")" == sentinel ]] || fail 'legacy arbitrary proof output was overwritten'
unset TEST_LEGACY_PROOF_OUTPUT

proof_other="$history_base/proof-path-other"
mkdir -m 700 "$proof_other"
assert_proof_preflight_rejected traversal w10d-20260906t034002z-d2222222 \
  "$proof_path_root/../proof-path-other"
proof_real="$history_base/proof-path-real"
mkdir -m 700 "$proof_real"
ln -s "$proof_real" "$history_base/proof-path-link"
assert_proof_preflight_rejected symlink-parent w10d-20260906t034003z-d3333333 \
  "$history_base/proof-path-link"
proof_wrong_mode="$history_base/proof-path-mode"
mkdir -m 755 "$proof_wrong_mode"
assert_proof_preflight_rejected wrong-mode w10d-20260906t034004z-d4444444 "$proof_wrong_mode"
proof_wrong_owner="$history_base/proof-path-owner"
mkdir -m 700 "$proof_wrong_owner"
if [[ "$(id -u)" -eq 0 ]]; then
  chown 65534 "$proof_wrong_owner"
  assert_proof_preflight_rejected wrong-owner w10d-20260906t034005z-d5555555 "$proof_wrong_owner"
else
  assert_grep 'final_stat\.st_uid != os\.geteuid' "$LIB" \
    'proof directory owner validation missing when non-root test cannot synthesize another owner'
fi

preexisting_final_dir="$history_base/proof-path-existing-final"
mkdir -m 700 "$preexisting_final_dir"
printf sentinel >"$preexisting_final_dir/20260902T000000Z-1002.object-restore-proof.json"
assert_proof_preflight_rejected existing-final w10d-20260906t034006z-d6666666 "$preexisting_final_dir"
[[ "$(cat "$preexisting_final_dir/20260902T000000Z-1002.object-restore-proof.json")" == sentinel ]] \
  || fail 'pre-existing final proof was changed'
preexisting_final_link_dir="$history_base/proof-path-final-link"
mkdir -m 700 "$preexisting_final_link_dir"
ln -s "$legacy_sentinel" \
  "$preexisting_final_link_dir/20260902T000000Z-1002.object-restore-proof.json"
assert_proof_preflight_rejected symlink-final w10d-20260906t034007z-d7777777 \
  "$preexisting_final_link_dir"
preexisting_candidate_dir="$history_base/proof-path-existing-candidate"
mkdir -m 700 "$preexisting_candidate_dir"
printf sentinel >"$preexisting_candidate_dir/.20260902T000000Z-1002.object-restore-proof.candidate"
assert_proof_preflight_rejected existing-candidate w10d-20260906t034008z-d8888888 \
  "$preexisting_candidate_dir"
[[ "$(cat "$preexisting_candidate_dir/.20260902T000000Z-1002.object-restore-proof.candidate")" == sentinel ]] \
  || fail 'pre-existing candidate proof was changed'
preexisting_candidate_link_dir="$history_base/proof-path-candidate-link"
mkdir -m 700 "$preexisting_candidate_link_dir"
ln -s "$legacy_sentinel" \
  "$preexisting_candidate_link_dir/.20260902T000000Z-1002.object-restore-proof.candidate"
assert_proof_preflight_rejected symlink-candidate w10d-20260906t034009z-d9999999 \
  "$preexisting_candidate_link_dir"
pass 'object restore proof is derived exclusively under one canonical private caller-owned directory'

proof_fault_bin="$history_base/proof-fault-bin"
mkdir -p "$proof_fault_bin"
cat >"$proof_fault_bin/ln" <<'SH'
#!/bin/sh
case "${OBJECT_PROOF_LINK_FAIL:-0}:$*" in
  1:*.object-restore-proof.*) exit 63 ;;
esac
exec /bin/ln "$@"
SH
cat >"$proof_fault_bin/rm" <<'SH'
#!/bin/sh
case "${OBJECT_VERIFY_RM_FAIL:-0}:$*" in
  1:*diis-object-restore.*) exit 64 ;;
esac
case "${OBJECT_FINAL_EVIDENCE_RM_FAIL:-0}:$*" in
  1:*target-config.raw*|1:*target-marker.json*) exit 66 ;;
esac
case "${OBJECT_PROOF_CANDIDATE_RM_FAIL:-0}:$*" in
  1:*.object-restore-proof.candidate*) exit 65 ;;
esac
exec /bin/rm "$@"
SH
chmod +x "$proof_fault_bin"/*
fault_attempt_for() {
  local case_name=$1 suffix
  suffix=$(printf '%s' "$case_name" | "$REAL_SHA" | awk '{print substr($1,1,8)}')
  printf 'w10d-20260906t031000z-%s' "$suffix"
}
run_object_plaintext_fault() {
  local case_name=$1 attempt temp_dir proof_dir authority requested_source_fault requested_call_log
  requested_source_fault=${RCLONE_SOURCE_CONFIG_FAULT:-}
  requested_call_log=${RCLONE_CALL_LOG:-}
  attempt=$(fault_attempt_for "$case_name")
  temp_dir="$history_base/tmp-$case_name"
  proof_dir="$history_base/proof-$case_name"
  authority=$(object_target_authority_sha "$attempt")
  mkdir -m 700 "$temp_dir" "$proof_dir"
  RCLONE_LSF_FAULT= RCLONE_LSF_FAULT_STATE= RCLONE_OBSERVE_FAULT= \
    RCLONE_SOURCE_CONFIG_FAULT= RCLONE_CALL_LOG= \
    run_target_prepare "$attempt" >/dev/null
  env PATH="$proof_fault_bin:$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$attempt" \
    OBJECT_RESTORE_TARGET="${object_parent%/}/${attempt}" OBJECT_RESTORE_PROOF_DIR="$proof_dir" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
    OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$authority" TMPDIR="$temp_dir" \
    OBJECT_VERIFY_FAULT="${OBJECT_VERIFY_FAULT:-}" OBJECT_VERIFY_SIGNAL="${OBJECT_VERIFY_SIGNAL:-}" \
    OBJECT_PROOF_LINK_FAIL="${OBJECT_PROOF_LINK_FAIL:-0}" \
    OBJECT_PROOF_CANDIDATE_RM_FAIL="${OBJECT_PROOF_CANDIDATE_RM_FAIL:-0}" \
    OBJECT_FINAL_EVIDENCE_RM_FAIL="${OBJECT_FINAL_EVIDENCE_RM_FAIL:-0}" \
    OBJECT_VERIFY_RM_FAIL="${OBJECT_VERIFY_RM_FAIL:-0}" \
    RCLONE_LSF_FAULT="${RCLONE_LSF_FAULT:-}" \
    RCLONE_LSF_FAULT_STATE="${RCLONE_LSF_FAULT_STATE:-}" \
    RCLONE_SOURCE_CONFIG_FAULT="$requested_source_fault" \
    RCLONE_CALL_LOG="$requested_call_log" \
    OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
    sh "$OBJECT_RESTORE" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.offsite-provenance.json" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.complete.json" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.sha256" \
      "$history_base/20260902T000000Z-1002/20260902T000000Z-1002.objects.tsv"
}
if RCLONE_LSF_FAULT=overflow run_object_plaintext_fault pre-inventory-overflow \
  >"$history_base/pre-inventory-overflow.out" 2>"$history_base/pre-inventory-overflow.err"; then
  fail 'oversized pre-restore target inventory unexpectedly succeeded'
fi
pre_overflow_attempt=$(fault_attempt_for pre-inventory-overflow)
[[ "$(find "$history_base/restore/restore-parent/$pre_overflow_attempt" -type f | wc -l | tr -d '[:space:]')" = 1 ]] \
  || fail 'oversized pre-restore inventory mutated disposable object target'
[[ -z "$(find "$history_base/tmp-pre-inventory-overflow" -mindepth 1 -print -quit)" ]] \
  || fail 'oversized pre-restore inventory left private temporary state'
pass 'object restore preflight bounds target inventory before first object mutation'

for fault in copy hash size; do
  if OBJECT_VERIFY_FAULT="$fault" run_object_plaintext_fault "$fault"; then
    fail "$fault object verification fault unexpectedly succeeded"
  fi
  [[ -z "$(find "$history_base/tmp-$fault" -mindepth 1 -print -quit)" ]] \
    || fail "$fault object verification left plaintext temporary data"
done
for signal_name in HUP INT TERM; do
  case_name="signal-${signal_name,,}"
  if OBJECT_VERIFY_SIGNAL="$signal_name" run_object_plaintext_fault "$case_name"; then
    fail "$signal_name object verification unexpectedly succeeded"
  fi
  [[ -z "$(find "$history_base/tmp-$case_name" -mindepth 1 -print -quit)" ]] \
    || fail "$signal_name object verification left plaintext temporary data"
done
if OBJECT_PROOF_LINK_FAIL=1 run_object_plaintext_fault proof; then
  fail 'object proof publication failure unexpectedly succeeded'
fi
[[ -z "$(find "$history_base/tmp-proof" -mindepth 1 -print -quit)" ]] \
  || fail 'proof publication failure left plaintext temporary data'
[[ ! -e "$history_base/proof-proof/.20260902T000000Z-1002.object-restore-proof.candidate" ]] \
  || fail 'proof publication failure left candidate proof'
if OBJECT_PROOF_CANDIDATE_RM_FAIL=1 run_object_plaintext_fault proof-cleanup \
  >"$history_base/proof-cleanup.out" 2>"$history_base/proof-cleanup.err"; then
  fail 'object proof candidate cleanup failure unexpectedly succeeded'
else
  proof_cleanup_rc=$?
fi
[[ "$proof_cleanup_rc" -eq 74 ]] || fail 'proof candidate cleanup failure did not return status 74'
proof_cleanup_dir="$history_base/proof-proof-cleanup"
[[ ! -e "$proof_cleanup_dir/20260902T000000Z-1002.object-restore-proof.json" ]] \
  || fail 'proof cleanup failure left a published success proof'
assert_grep 'OBJECT_RESTORE_(PROOF_PUBLICATION|PLAINTEXT_CLEANUP)_AMBIGUOUS.*retry=prohibited' \
  "$history_base/proof-cleanup.err" 'proof candidate cleanup ambiguity marker missing'
/bin/rm -f "$proof_cleanup_dir/.20260902T000000Z-1002.object-restore-proof.candidate"
if OBJECT_FINAL_EVIDENCE_RM_FAIL=1 run_object_plaintext_fault final-evidence-cleanup \
  >"$history_base/final-evidence-cleanup.out" 2>"$history_base/final-evidence-cleanup.err"; then
  fail 'final local evidence cleanup failure unexpectedly succeeded'
else
  final_evidence_cleanup_rc=$?
fi
[[ "$final_evidence_cleanup_rc" -eq 74 ]] \
  || fail 'final local evidence cleanup failure did not return status 74'
final_evidence_proof_dir="$history_base/proof-final-evidence-cleanup"
[[ ! -e "$final_evidence_proof_dir/20260902T000000Z-1002.object-restore-proof.json" ]] \
  || fail 'final local evidence cleanup failure left a published success proof'
assert_grep 'OBJECT_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS.*pre-publication-evidence.*retry=prohibited' \
  "$history_base/final-evidence-cleanup.err" \
  'final local evidence cleanup ambiguity marker missing'
if OBJECT_VERIFY_RM_FAIL=1 run_object_plaintext_fault rm-failure \
  >"$history_base/object-rm.out" 2>"$history_base/object-rm.err"; then
  fail 'object plaintext cleanup rm failure unexpectedly succeeded'
else
  rc=$?
fi
[[ "$rc" -eq 74 ]] || fail 'object plaintext cleanup failure did not return status 74'
assert_grep 'OBJECT_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS.*retry=prohibited' \
  "$history_base/object-rm.err" 'object plaintext cleanup ambiguity marker missing'
pass 'object restore removes private plaintext on faults and signals or reports cleanup ambiguity'

zero_id=20260904T000000Z-2000
zero_dir="$history_base/$zero_id"
zero_attempt=w10d-20260906t032001z-b1111111
zero_proof_dir="$zero_dir/proofs-observe"
zero_proof="$zero_proof_dir/$zero_id.object-restore-proof.json"
mkdir -p "$zero_dir"
mkdir -m 700 "$zero_proof_dir"
run_target_prepare "$zero_attempt" >/dev/null
zero_authority=$(object_target_authority_sha "$zero_attempt")
printf 'diis-object-manifest-v1|%s|exact\n' "$zero_id" >"$zero_dir/$zero_id.objects.tsv"
zero_object_sha=$($REAL_SHA "$zero_dir/$zero_id.objects.tsv" | awk '{print $1}')
zero_dump_sha=$(printf zero-dump | $REAL_SHA | awk '{print $1}')
printf '%s  %s.dump\n' "$zero_dump_sha" "$zero_id" >"$zero_dir/$zero_id.sha256"
cat >"$zero_dir/$zero_id.complete.json" <<EOF
{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"${zero_id}","class":"daily","protectionState":"none","createdAt":"2026-09-04T00:00:00Z","createdEpoch":1788480000,"dailyKey":"2026-09-04","weeklyKey":"2026-W36","monthlyKey":"2026-09","sha256":"${zero_dump_sha}","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"${FINGERPRINT}","objectStatus":"empty","objectManifestSha256":"${zero_object_sha}","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}
EOF
cat >"$zero_dir/$zero_id.offsite-provenance.json" <<EOF
{"schemaVersion":"diis-offsite-restore-input-v1","source":"independent-crypt","backupId":"${zero_id}","offsiteConfigFingerprint":"${FINGERPRINT}","dumpSha256":"${zero_dump_sha}","dumpBytes":2048,"objectManifestSha256":"${zero_object_sha}","objectCount":0,"objectManifestFile":"${zero_id}.objects.tsv"}
EOF
if env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
  RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
  RCLONE_OBSERVE_FAULT=final-restore RCLONE_OBSERVE_STATE="$zero_dir/final-observe.state" \
  OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
  OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
  OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$zero_attempt" \
  OBJECT_RESTORE_TARGET="${object_parent%/}/${zero_attempt}" OBJECT_RESTORE_PROOF_DIR="$zero_proof_dir" \
  OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
  OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
  OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
  OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$zero_authority" \
  OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
  sh "$OBJECT_RESTORE" "$zero_dir/$zero_id.offsite-provenance.json" \
    "$zero_dir/$zero_id.complete.json" "$zero_dir/$zero_id.sha256" \
    "$zero_dir/$zero_id.objects.tsv" \
    >"$zero_dir/out" 2>"$zero_dir/err"; then
  fail 'zero-object restore accepted failed final target observation'
else
  zero_observe_rc=$?
fi
[[ "$zero_observe_rc" -eq 74 ]] || fail 'failed final target observation did not return status 74'
[ ! -e "$zero_proof" ] || fail 'failed zero-object observation published success proof'
assert_not_grep 'OBJECT_RESTORE_COMPLETE' "$zero_dir/out" \
  'failed zero-object observation emitted completion marker'
assert_grep 'OBJECT_RESTORE_TARGET_OBSERVATION_AMBIGUOUS.*retry=prohibited' "$zero_dir/err" \
  'final target observation ambiguity was not reported'

zero_overflow_attempt=w10d-20260906t032002z-b2222222
zero_overflow_proof_dir="$zero_dir/proofs-overflow"
mkdir -m 700 "$zero_overflow_proof_dir"
run_target_prepare "$zero_overflow_attempt" >/dev/null
zero_overflow_authority=$(object_target_authority_sha "$zero_overflow_attempt")
if env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
  RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
  RCLONE_OBSERVE_FAULT=final-restore-overflow RCLONE_OBSERVE_STATE="$zero_dir/final-overflow.state" \
  OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
  OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
  OBJECT_RESTORE_TARGET_PARENT="$object_parent" OBJECT_RESTORE_ATTEMPT_ID="$zero_overflow_attempt" \
  OBJECT_RESTORE_TARGET="${object_parent%/}/${zero_overflow_attempt}" \
  OBJECT_RESTORE_PROOF_DIR="$zero_overflow_proof_dir" \
  OBJECT_TARGET_EXPECTED_PROVIDER="$object_target_provider" \
  OBJECT_TARGET_EXPECTED_ORIGIN="$object_target_origin" \
  OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$object_target_config_fingerprint" \
  OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$zero_overflow_authority" \
  OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
  sh "$OBJECT_RESTORE" "$zero_dir/$zero_id.offsite-provenance.json" \
    "$zero_dir/$zero_id.complete.json" "$zero_dir/$zero_id.sha256" \
    "$zero_dir/$zero_id.objects.tsv" >"$zero_dir/overflow.out" 2>"$zero_dir/overflow.err"; then
  fail 'zero-object restore accepted oversized final target observation'
else
  zero_overflow_rc=$?
fi
[[ "$zero_overflow_rc" -eq 74 ]] || fail 'oversized final observation did not return status 74'
[ ! -e "$zero_overflow_proof_dir/$zero_id.object-restore-proof.json" ] \
  || fail 'oversized final observation published success proof'
assert_grep 'OBJECT_RESTORE_TARGET_OBSERVATION_AMBIGUOUS.*retry=prohibited' "$zero_dir/overflow.err" \
  'oversized final target observation ambiguity was not reported'
pass 'object restore target observations are bounded and cannot turn unavailable or oversized output into proof'

offsite_restore_dir="$history_base/offsite-restore-input"
mkdir -m 700 "$offsite_restore_dir"
env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
  RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
  OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
  RCLONE_MINIO_REMOTE=diisminio: sh "$OFFSITE_RESTORE_PREPARE" \
  20260902T000000Z-1002 "$offsite_restore_dir" >"$history_base/offsite-prepare.out"
assert_grep 'OFFSITE_RESTORE_INPUT_READY' "$history_base/offsite-prepare.out" \
  'off-site input readiness marker missing'
assert_grep '"source":"independent-crypt"' \
  "$offsite_restore_dir/20260902T000000Z-1002.offsite-provenance.json" \
  'independent source provenance missing'
env OFFSITE_RESTORE_CLEANUP_CONFIRMATION=DELETE_EXACT_DISPOSABLE_OFFSITE_RESTORE_INPUT \
  sh "$OFFSITE_RESTORE_CLEANUP" 20260902T000000Z-1002 "$offsite_restore_dir" \
  >"$history_base/offsite-cleanup.out"
[[ ! -e "$offsite_restore_dir" ]] || fail 'off-site restore input cleanup absence failed'
pass 'restore input is downloaded from exact crypt remote and cleaned by bound backup ID'

offsite_fault_bin="$history_base/offsite-fault-bin"
mkdir -p "$offsite_fault_bin"
cat >"$offsite_fault_bin/rm" <<'SH'
#!/bin/sh
case "${OFFSITE_RM_FAIL:-0}:$*" in
  1:*dump.candidate*) exit 65 ;;
esac
exec /bin/rm "$@"
SH
cat >"$offsite_fault_bin/date" <<'SH'
#!/bin/sh
[ "${OFFSITE_DATE_FAIL:-0}" != 1 ] || exit 66
exec /bin/date "$@"
SH
chmod +x "$offsite_fault_bin"/*
run_offsite_prepare_fault() {
  local case_name=$1 dest="$history_base/offsite-fault-$1"
  mkdir -m 700 "$dest"
  env PATH="$offsite_fault_bin:$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_PREPARE_COPY_FAIL_AFTER_WRITE="${OFFSITE_PREPARE_COPY_FAIL_AFTER_WRITE:-0}" \
    OFFSITE_PREPARE_SIGNAL="${OFFSITE_PREPARE_SIGNAL:-}" OFFSITE_RM_FAIL="${OFFSITE_RM_FAIL:-0}" \
    OFFSITE_DATE_FAIL="${OFFSITE_DATE_FAIL:-0}" RCLONE_MINIO_REMOTE=diisminio: \
    sh "$OFFSITE_RESTORE_PREPARE" 20260902T000000Z-1002 "$dest"
}
if OFFSITE_PREPARE_COPY_FAIL_AFTER_WRITE=1 run_offsite_prepare_fault copy; then
  fail 'off-site partial dump copy unexpectedly succeeded'
fi
[[ -z "$(find "$history_base/offsite-fault-copy" -mindepth 1 -print -quit)" ]] \
  || fail 'off-site partial dump failure left plaintext'
for signal_name in HUP INT TERM; do
  case_name="signal-${signal_name,,}"
  if OFFSITE_PREPARE_SIGNAL="$signal_name" run_offsite_prepare_fault "$case_name"; then
    fail "$signal_name off-site prepare unexpectedly succeeded"
  fi
  [[ -z "$(find "$history_base/offsite-fault-$case_name" -mindepth 1 -print -quit)" ]] \
    || fail "$signal_name off-site prepare left plaintext"
done
if OFFSITE_DATE_FAIL=1 run_offsite_prepare_fault before-provenance; then
  fail 'pre-provenance publication failure unexpectedly succeeded'
fi
[[ -z "$(find "$history_base/offsite-fault-before-provenance" -mindepth 1 -print -quit)" ]] \
  || fail 'pre-provenance failure left finalized plaintext inputs'
if OFFSITE_PREPARE_COPY_FAIL_AFTER_WRITE=1 OFFSITE_RM_FAIL=1 \
  run_offsite_prepare_fault rm-failure >"$history_base/offsite-rm.out" 2>"$history_base/offsite-rm.err"; then
  fail 'off-site cleanup rm failure unexpectedly succeeded'
else
  rc=$?
fi
[[ "$rc" -eq 74 ]] || fail 'off-site cleanup rm failure did not return ambiguous status 74'
assert_grep 'OFFSITE_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS.*retry=prohibited' \
  "$history_base/offsite-rm.err" 'off-site cleanup ambiguity marker missing'
pass 'off-site prepare removes plaintext on copy publication and signal failures or reports ambiguity'

mkdir -p "$history_base/restore/restore-parent"
attempt_id=w10d-20260903t120000z-a1b2c3d4
run_target_prepare "$attempt_id" >"$history_base/object-target-prepare.out"
[[ -f "$history_base/restore/restore-parent/$attempt_id/.diis-disposable-restore-target-v3" ]] \
  || fail 'disposable object target marker missing'
[[ "$(grep -c '^OBJECT_RESTORE_TARGET_READY ' "$history_base/object-target-prepare.out")" -eq 1 ]] \
  || fail 'clean target create did not emit exactly one final success marker'
run_target_cleanup "$attempt_id" >"$history_base/object-target-cleanup.out"
[[ -z "$(find "$history_base/restore/restore-parent/$attempt_id" -mindepth 1 -print -quit 2>/dev/null)" ]] \
  || fail 'disposable object target cleanup absence failed'
[[ "$(grep -c '^OBJECT_RESTORE_TARGET_REMOVED ' "$history_base/object-target-cleanup.out")" -eq 1 ]] \
  || fail 'clean target cleanup did not emit exactly one final success marker'
pass 'disposable object target create marker cleanup and absence are exact'

run_target_authority_negative() {
  local name=$1 attempt=$2 parent=$3 target_provider=$4 target_origin=$5 \
    target_fingerprint=$6 target_authority=$7
  shift 7
  if env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    OFFSITE_EXPECTED_PROVIDER="$OFFSITE_EXPECTED_PROVIDER" OFFSITE_EXPECTED_ORIGIN="$OFFSITE_EXPECTED_ORIGIN" \
    OBJECT_TARGET_EXPECTED_PROVIDER="$target_provider" OBJECT_TARGET_EXPECTED_ORIGIN="$target_origin" \
    OBJECT_TARGET_EXPECTED_CONFIG_FINGERPRINT="$target_fingerprint" \
    OBJECT_TARGET_EXPECTED_AUTHORITY_SHA256="$target_authority" \
    OBJECT_TARGET_CREATE_CONFIRMATION=CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET \
    "$@" sh "$OBJECT_TARGET_PREPARE" "$attempt" "$parent" \
    >"$history_base/authority-$name.out" 2>"$history_base/authority-$name.err"; then
    fail "$name target authority unexpectedly succeeded"
  fi
}
same_root_attempt=w10d-20260906t033001z-c1111111
run_target_authority_negative same-source-root "$same_root_attempt" 'offsite-crypt:' \
  minio http://isolated-minio:9000 "$(printf '%064d' 1)" "$(printf '%064d' 2)"
[ ! -e "$history_base/offsite/$same_root_attempt" ] \
  || fail 'same source remote root reached target mutation'
same_child_attempt=w10d-20260906t033002z-c2222222
run_target_authority_negative same-source-child "$same_child_attempt" 'offsite-crypt:diis' \
  minio http://isolated-minio:9000 "$(printf '%064d' 1)" "$(printf '%064d' 2)"
[ ! -e "$history_base/offsite/diis/$same_child_attempt" ] \
  || fail 'same source remote child reached target mutation'
same_slash_attempt=w10d-20260906t033003z-c3333333
run_target_authority_negative same-source-trailing-slash "$same_slash_attempt" 'offsite-crypt:diis/' \
  minio http://isolated-minio:9000 "$(printf '%064d' 1)" "$(printf '%064d' 2)"
[ ! -e "$history_base/offsite/diis/$same_slash_attempt" ] \
  || fail 'same source trailing-slash variant reached target mutation'

alias_attempt=w10d-20260906t033004z-c4444444
alias_parent='restore-alias:'
alias_config_sha=$(printf '[restore-alias]\ntype = alias\nprovider = Minio\nendpoint = http://isolated-minio:9000\n' \
  | "$REAL_SHA" | awk '{print $1}')
run_target_authority_negative alias-backend "$alias_attempt" "$alias_parent" \
  minio http://isolated-minio:9000 "$alias_config_sha" "$(printf '%064d' 3)" \
  env RCLONE_TARGET_BACKEND_TYPE=alias
[ ! -e "$history_base/restore/restore-alias/$alias_attempt" ] \
  || fail 'alias target reached mutation'
same_origin_attempt=w10d-20260906t033005z-c5555555
same_origin_parent='restore-shadow:'
same_origin_config_sha=$(printf '[restore-shadow]\ntype = s3\nprovider = Backblaze\nendpoint = https://api.backblazeb2.com\n' \
  | "$REAL_SHA" | awk '{print $1}')
run_target_authority_negative same-provider-origin "$same_origin_attempt" "$same_origin_parent" \
  backblaze https://api.backblazeb2.com "$same_origin_config_sha" "$(printf '%064d' 4)" \
  env RCLONE_TARGET_PROVIDER=Backblaze RCLONE_TARGET_ORIGIN=https://api.backblazeb2.com
[ ! -e "$history_base/restore/restore-shadow/$same_origin_attempt" ] \
  || fail 'same provider and origin alias reached mutation'

replay_attempt=w10d-20260906t033006z-c6666666
replay_parent='restore-replay:'
run_target_prepare "$replay_attempt" >/dev/null
mkdir -p "$history_base/restore/restore-replay/$replay_attempt"
cp "$history_base/restore/restore-parent/$replay_attempt/.diis-disposable-restore-target-v3" \
  "$history_base/restore/restore-replay/$replay_attempt/.diis-disposable-restore-target-v3"
if run_target_cleanup "$replay_attempt" "$replay_parent" \
  >"$history_base/replay.out" 2>"$history_base/replay.err"; then
  fail 'marker copied to another approved parent was accepted'
fi
[ -f "$history_base/restore/restore-replay/$replay_attempt/.diis-disposable-restore-target-v3" ] \
  || fail 'replayed marker target was mutated before authority rejection'
run_target_cleanup "$replay_attempt" >/dev/null
rm -rf "$history_base/restore/restore-replay/$replay_attempt"
pass 'source and target authority rejects same remote aliases drift and marker replay before mutation'

source_fault_index=1
for source_fault in crypt-drift backing-nonzero crypt-duplicate; do
  source_prepare_attempt="w10d-20260906t04100${source_fault_index}z-f111111${source_fault_index}"
  source_prepare_log="$history_base/source-prepare-$source_fault.calls"
  if RCLONE_SOURCE_CONFIG_FAULT="$source_fault" RCLONE_CALL_LOG="$source_prepare_log" \
    run_target_prepare "$source_prepare_attempt" \
    >"$history_base/source-prepare-$source_fault.out" \
    2>"$history_base/source-prepare-$source_fault.err"; then
    fail "$source_fault source authority unexpectedly allowed target create"
  fi
  assert_grep '^config:offsite-crypt$' "$source_prepare_log" \
    "$source_fault target create did not observe active source crypt config"
  assert_not_grep '^mkdir$' "$source_prepare_log" \
    "$source_fault target create reached remote mutation"
  assert_not_grep 'OBJECT_RESTORE_TARGET_READY' "$history_base/source-prepare-$source_fault.out" \
    "$source_fault target create emitted a false success marker"
  [ ! -e "$history_base/restore/restore-parent/$source_prepare_attempt" ] \
    || fail "$source_fault target create left remote state"

  source_cleanup_attempt="w10d-20260906t04200${source_fault_index}z-f222222${source_fault_index}"
  run_target_prepare "$source_cleanup_attempt" >/dev/null
  source_cleanup_log="$history_base/source-cleanup-$source_fault.calls"
  if RCLONE_SOURCE_CONFIG_FAULT="$source_fault" RCLONE_CALL_LOG="$source_cleanup_log" \
    run_target_cleanup "$source_cleanup_attempt" \
    >"$history_base/source-cleanup-$source_fault.out" \
    2>"$history_base/source-cleanup-$source_fault.err"; then
    fail "$source_fault source authority unexpectedly allowed target purge"
  fi
  assert_grep '^config:offsite-crypt$' "$source_cleanup_log" \
    "$source_fault target cleanup did not observe active source crypt config"
  assert_not_grep '^purge$' "$source_cleanup_log" \
    "$source_fault target cleanup reached remote purge"
  assert_not_grep 'OBJECT_RESTORE_TARGET_REMOVED' "$history_base/source-cleanup-$source_fault.out" \
    "$source_fault target cleanup emitted a false success marker"
  [ -f "$history_base/restore/restore-parent/$source_cleanup_attempt/.diis-disposable-restore-target-v3" ] \
    || fail "$source_fault target cleanup mutated target before authority rejection"
  run_target_cleanup "$source_cleanup_attempt" >/dev/null

  source_restore_case="source-$source_fault"
  source_restore_attempt=$(fault_attempt_for "$source_restore_case")
  source_restore_log="$history_base/source-restore-$source_fault.calls"
  if RCLONE_SOURCE_CONFIG_FAULT="$source_fault" RCLONE_CALL_LOG="$source_restore_log" \
    run_object_plaintext_fault "$source_restore_case" \
    >"$history_base/source-restore-$source_fault.out" \
    2>"$history_base/source-restore-$source_fault.err"; then
    fail "$source_fault source authority unexpectedly allowed object restore"
  fi
  assert_grep '^config:offsite-crypt$' "$source_restore_log" \
    "$source_fault object restore did not observe active source crypt config"
  assert_not_grep '^copyto$' "$source_restore_log" \
    "$source_fault object restore reached object mutation"
  [ "$(find "$history_base/restore/restore-parent/$source_restore_attempt" -type f | wc -l | tr -d '[:space:]')" = 1 ] \
    || fail "$source_fault object restore changed the disposable target"
  [ ! -e "$history_base/proof-$source_restore_case/20260902T000000Z-1002.object-restore-proof.json" ] \
    || fail "$source_fault object restore published a success proof"
  run_target_cleanup "$source_restore_attempt" >/dev/null
  source_fault_index=$((source_fault_index + 1))
done
pass 'create restore and purge observe bounded effective source crypt and backing authority before mutation'

if RCLONE_OBSERVE_FAULT=always \
  run_target_prepare w10d-20260903t120001z-a1b2c3d5; then
  fail 'failed object target observation was accepted as empty'
fi
overflow_attempt=w10d-20260903t120013z-a1b2c3de
if RCLONE_LSF_FAULT=overflow run_target_prepare "$overflow_attempt"; then
  fail 'oversized parent inventory was accepted before object target create'
fi
[ ! -d "$history_base/restore/restore-parent/$overflow_attempt" ] \
  || fail 'oversized parent inventory reached object target mutation'
fault_attempt=w10d-20260903t120002z-a1b2c3d6
run_target_prepare "$fault_attempt" >/dev/null
if RCLONE_OBSERVE_FAULT=after-purge run_target_cleanup "$fault_attempt" \
  >"$history_base/cleanup-observe.out" 2>"$history_base/cleanup-observe.err"; then
  fail 'failed post-purge observation was accepted as absence proof'
else
  cleanup_observe_rc=$?
fi
[[ "$cleanup_observe_rc" -eq 74 ]] || fail 'post-purge observation failure did not return status 74'
assert_grep 'OBJECT_TARGET_CLEANUP_AMBIGUOUS.*retry=prohibited' \
  "$history_base/cleanup-observe.err" 'post-purge observation ambiguity marker missing'
assert_not_grep 'OBJECT_RESTORE_TARGET_REMOVED' "$history_base/cleanup-observe.out" \
  'post-purge observation failure emitted a false cleanup success marker'
pass 'object target observation failures and overflow remain bounded failures before create and after purge'
rm -f "$history_base/restore/.purge-complete"

run_standalone_cleanup_fault() {
  local case_name=$1 attempt=$2
  run_target_prepare "$attempt" >/dev/null
  printf residual >"$history_base/restore/restore-parent/$attempt/residual.bin"
  case "$case_name" in
    purge-nonzero)
      RCLONE_PURGE_FAIL=1 run_target_cleanup "$attempt" \
        >"$history_base/standalone-$case_name.out" 2>"$history_base/standalone-$case_name.err" \
        && standalone_rc=0 || standalone_rc=$?
      ;;
    partial-purge)
      RCLONE_PURGE_PARTIAL=1 run_target_cleanup "$attempt" \
        >"$history_base/standalone-$case_name.out" 2>"$history_base/standalone-$case_name.err" \
        && standalone_rc=0 || standalone_rc=$?
      ;;
    target-still-present)
      RCLONE_PURGE_LEAVE_TARGET=1 run_target_cleanup "$attempt" \
        >"$history_base/standalone-$case_name.out" 2>"$history_base/standalone-$case_name.err" \
        && standalone_rc=0 || standalone_rc=$?
      ;;
    purge-signal)
      RCLONE_PURGE_SIGNAL=TERM run_target_cleanup "$attempt" \
        >"$history_base/standalone-$case_name.out" 2>"$history_base/standalone-$case_name.err" \
        && standalone_rc=0 || standalone_rc=$?
      ;;
    post-purge-parse)
      RCLONE_PURGE_STATE="$history_base/purge-parse.state" RCLONE_POST_PURGE_DUPLICATE=1 \
        run_target_cleanup "$attempt" \
        >"$history_base/standalone-$case_name.out" 2>"$history_base/standalone-$case_name.err" \
        && standalone_rc=0 || standalone_rc=$?
      ;;
    *) fail "unknown standalone cleanup case $case_name" ;;
  esac
  if [[ "$standalone_rc" -eq 0 ]]; then
    fail "$case_name standalone cleanup fault unexpectedly succeeded"
  fi
  [[ "$standalone_rc" -eq 74 ]] \
    || fail "$case_name standalone cleanup did not return ambiguous status 74"
  assert_grep 'OBJECT_TARGET_CLEANUP_AMBIGUOUS.*phase=.*retry=prohibited' \
    "$history_base/standalone-$case_name.err" \
    "$case_name standalone cleanup ambiguity marker missing"
}
standalone_attempt=w10d-20260906t035001z-e1111111
run_standalone_cleanup_fault purge-nonzero "$standalone_attempt"
rm -rf "$history_base/restore/restore-parent/$standalone_attempt"
standalone_attempt=w10d-20260906t035002z-e2222222
run_standalone_cleanup_fault partial-purge "$standalone_attempt"
[[ -f "$history_base/restore/restore-parent/$standalone_attempt/residual.bin" ]] \
  || fail 'partial purge did not leave observable residual for negative control'
rm -rf "$history_base/restore/restore-parent/$standalone_attempt"
standalone_attempt=w10d-20260906t035003z-e3333333
run_standalone_cleanup_fault target-still-present "$standalone_attempt"
rm -rf "$history_base/restore/restore-parent/$standalone_attempt"
standalone_attempt=w10d-20260906t035004z-e4444444
purge_parse_state="$history_base/purge-parse.state"
run_standalone_cleanup_fault post-purge-parse "$standalone_attempt"
rm -f "$purge_parse_state"
standalone_attempt=w10d-20260906t035005z-e5555555
run_standalone_cleanup_fault purge-signal "$standalone_attempt"
rm -rf "$history_base/restore/restore-parent/$standalone_attempt"
pass 'standalone target cleanup maps purge partial residual signal observation and parse uncertainty to status 74 no-retry'

run_object_creator_failure() {
  local attempt=$1
  run_target_prepare "$attempt"
}
attempt=w10d-20260903t120003z-a1b2c3d7
if RCLONE_MARKER_WRITE_FAIL=1 run_object_creator_failure "$attempt"; then
  fail 'marker write failure unexpectedly succeeded'
fi
[[ ! -d "$history_base/restore/restore-parent/$attempt" ]] \
  || fail 'marker write failure left object target after successful cleanup'
attempt=w10d-20260903t120009z-a1b2c3da
if RCLONE_MKDIR_FAIL_AFTER_CREATE=1 run_object_creator_failure "$attempt"; then
  fail 'partial mkdir failure unexpectedly succeeded'
fi
[[ ! -d "$history_base/restore/restore-parent/$attempt" ]] \
  || fail 'partial mkdir failure left object target after cleanup'
attempt=w10d-20260903t120014z-a1b2c3df
if RCLONE_LSF_FAULT=second-overflow RCLONE_LSF_FAULT_STATE="$history_base/second-lsf.state" \
  run_object_creator_failure "$attempt" >"$history_base/second-lsf.out" \
  2>"$history_base/second-lsf.err"; then
  fail 'oversized post-create target observation unexpectedly succeeded'
fi
assert_not_grep 'OBJECT_RESTORE_TARGET_READY' "$history_base/second-lsf.out" \
  'failed post-create observation emitted a false create success marker'
[[ ! -d "$history_base/restore/restore-parent/$attempt" ]] \
  || fail 'oversized post-create observation left object target after cleanup'
for signal_name in HUP INT TERM; do
  case "$signal_name" in HUP) second=10 ;; INT) second=11 ;; TERM) second=12 ;; esac
  attempt="w10d-20260903t1200${second}z-a1b2c3db"
  if RCLONE_MKDIR_SIGNAL="$signal_name" run_object_creator_failure "$attempt"; then
    fail "$signal_name partial mkdir unexpectedly succeeded"
  fi
  [[ ! -d "$history_base/restore/restore-parent/$attempt" ]] \
    || fail "$signal_name partial mkdir left target residue"
done
for cleanup_case in purge observe; do
  if [ "$cleanup_case" = purge ]; then
    attempt=w10d-20260903t120004z-a1b2c3d8
    RCLONE_MARKER_WRITE_FAIL=1 RCLONE_PURGE_FAIL=1 run_object_creator_failure "$attempt" \
      >"$history_base/$cleanup_case.out" 2>"$history_base/$cleanup_case.err" && rc=0 || rc=$?
  else
    attempt=w10d-20260903t120005z-a1b2c3d8
    RCLONE_MARKER_WRITE_FAIL=1 RCLONE_OBSERVE_FAULT=after-purge run_object_creator_failure "$attempt" \
      >"$history_base/$cleanup_case.out" 2>"$history_base/$cleanup_case.err" && rc=0 || rc=$?
  fi
  [[ "$rc" -eq 74 ]] || fail "$cleanup_case cleanup did not return ambiguous status 74"
  assert_grep 'OBJECT_TARGET_CLEANUP_AMBIGUOUS.*retry=prohibited' "$history_base/$cleanup_case.err" \
    "$cleanup_case object creator ambiguity marker missing"
  assert_not_grep 'OBJECT_RESTORE_TARGET_READY' "$history_base/$cleanup_case.out" \
    "$cleanup_case creator cleanup ambiguity emitted a false success marker"
done
signal_index=6
for signal_name in HUP INT TERM; do
  attempt="w10d-20260903t12000${signal_index}z-a1b2c3d9"
  if RCLONE_MARKER_SIGNAL="$signal_name" run_object_creator_failure "$attempt"; then
    fail "$signal_name object creator unexpectedly succeeded"
  fi
  [[ ! -d "$history_base/restore/restore-parent/$attempt" ]] \
    || fail "$signal_name object creator left target residue"
  signal_index=$((signal_index + 1))
done
pass 'object target creator owns partial mkdir and proves cleanup or emits ambiguous no-retry'

object_target_local_fault_bin="$history_base/object-target-local-fault-bin"
mkdir -p "$object_target_local_fault_bin"
cat >"$object_target_local_fault_bin/rm" <<'SH'
#!/bin/sh
case "${OBJECT_LOCAL_CLEANUP_FAULT:-}:$*" in
  rm-create:*diis-object-target-create.*/source-crypt-config.raw*|\
  rm-cleanup:*diis-object-target-cleanup.*/source-crypt-config.raw*) exit 75 ;;
esac
exec /bin/rm "$@"
SH
cat >"$object_target_local_fault_bin/rmdir" <<'SH'
#!/bin/sh
case "${OBJECT_LOCAL_CLEANUP_FAULT:-}:$*" in
  rmdir-create:*diis-object-target-create.*|rmdir-cleanup:*diis-object-target-cleanup.*) exit 76 ;;
esac
exec /bin/rmdir "$@"
SH
chmod +x "$object_target_local_fault_bin"/*

local_fault_index=1
for local_fault in rm-create rmdir-create; do
  local_attempt="w10d-20260906t04300${local_fault_index}z-f333333${local_fault_index}"
  local_tmp="$history_base/local-$local_fault"
  mkdir -p "$local_tmp"
  if OBJECT_TARGET_FAULT_BIN="$object_target_local_fault_bin" \
    OBJECT_LOCAL_CLEANUP_FAULT="$local_fault" OBJECT_TARGET_TMPDIR="$local_tmp" \
    run_target_prepare "$local_attempt" >"$history_base/$local_fault.out" \
    2>"$history_base/$local_fault.err"; then
    fail "$local_fault target creator unexpectedly succeeded"
  else
    local_fault_rc=$?
  fi
  [[ "$local_fault_rc" -eq 74 ]] || fail "$local_fault target creator did not return status 74"
  assert_grep 'OBJECT_TARGET_CLEANUP_AMBIGUOUS.*phase=local-evidence.*retry=prohibited' \
    "$history_base/$local_fault.err" "$local_fault target creator ambiguity marker missing"
  assert_not_grep 'OBJECT_RESTORE_TARGET_READY' "$history_base/$local_fault.out" \
    "$local_fault target creator emitted success before local evidence cleanup"
  /bin/rm -rf "$local_tmp"
  run_target_cleanup "$local_attempt" >/dev/null
  local_fault_index=$((local_fault_index + 1))
done

for local_fault in rm-cleanup rmdir-cleanup; do
  local_attempt="w10d-20260906t04400${local_fault_index}z-f444444${local_fault_index}"
  run_target_prepare "$local_attempt" >/dev/null
  local_tmp="$history_base/local-$local_fault"
  mkdir -p "$local_tmp"
  if OBJECT_TARGET_FAULT_BIN="$object_target_local_fault_bin" \
    OBJECT_LOCAL_CLEANUP_FAULT="$local_fault" OBJECT_TARGET_TMPDIR="$local_tmp" \
    run_target_cleanup "$local_attempt" >"$history_base/$local_fault.out" \
    2>"$history_base/$local_fault.err"; then
    fail "$local_fault target cleanup unexpectedly succeeded"
  else
    local_fault_rc=$?
  fi
  [[ "$local_fault_rc" -eq 74 ]] || fail "$local_fault target cleanup did not return status 74"
  assert_grep 'OBJECT_TARGET_CLEANUP_AMBIGUOUS.*phase=local-evidence.*retry=prohibited' \
    "$history_base/$local_fault.err" "$local_fault target cleanup ambiguity marker missing"
  assert_not_grep 'OBJECT_RESTORE_TARGET_REMOVED' "$history_base/$local_fault.out" \
    "$local_fault target cleanup emitted success before local evidence cleanup"
  [ ! -e "$history_base/restore/restore-parent/$local_attempt" ] \
    || fail "$local_fault remote target absence proof failed"
  /bin/rm -rf "$local_tmp"
  local_fault_index=$((local_fault_index + 1))
done
pass 'target lifecycle emits success only after local rm rmdir and absence cleanup are proven'

marker_overflow_attempt=w10d-20260903t120015z-a1b2c3e0
run_target_prepare "$marker_overflow_attempt" >/dev/null
if RCLONE_CAT_FAULT=overflow run_target_cleanup "$marker_overflow_attempt"; then
  fail 'oversized disposable target marker was accepted'
fi
[ -d "$history_base/restore/restore-parent/$marker_overflow_attempt" ] \
  || fail 'oversized marker failure mutated disposable target'
rm -rf "$history_base/restore/restore-parent/$marker_overflow_attempt"

marker_duplicate_attempt=w10d-20260903t120016z-a1b2c3e1
run_target_prepare "$marker_duplicate_attempt" >/dev/null
marker_duplicate_path="$history_base/restore/restore-parent/$marker_duplicate_attempt/.diis-disposable-restore-target-v3"
sed "s/\"attemptId\":\"$marker_duplicate_attempt\"/\"attemptId\":\"$marker_duplicate_attempt\",\"attemptId\":\"$marker_duplicate_attempt\"/" \
  "$marker_duplicate_path" >"${marker_duplicate_path}.tmp"
mv "${marker_duplicate_path}.tmp" "$marker_duplicate_path"
if run_target_cleanup "$marker_duplicate_attempt"; then
  fail 'duplicate-key disposable target marker was accepted'
fi
[ -d "$history_base/restore/restore-parent/$marker_duplicate_attempt" ] \
  || fail 'invalid marker failure mutated disposable target'
rm -rf "$history_base/restore/restore-parent/$marker_duplicate_attempt"
pass 'disposable target marker reads are bounded strict and fail before purge on malformed evidence'

protected_id=20200101T000000Z-9000
protected_manifest="$history_base/offsite/diis/database/manifests/$protected_id.complete.json"
mkdir -p "$(dirname "$protected_manifest")"
mkdir -p "$history_base/offsite/diis/database/current"
for index in $(seq 1 14); do
  old_epoch=$((1704067200 + index * 2678400))
  old_stamp=$(date -u -d "@$old_epoch" '+%Y%m%dT%H%M%SZ')
  old_id="${old_stamp}-$((9000 + index))"
  old_created_at=$(date -u -d "@$old_epoch" '+%Y-%m-%dT%H:%M:%SZ')
  old_daily_key=$(date -u -d "@$old_epoch" '+%Y-%m-%d')
  old_weekly_key=$(date -u -d "@$old_epoch" '+%G-W%V')
  old_monthly_key=$(date -u -d "@$old_epoch" '+%Y-%m')
  old_dump_sha=$(printf 'retention-dump-%s' "$old_id" | $REAL_SHA | awk '{print $1}')
  old_object_sha=$(printf 'retention-object-manifest-%s' "$old_id" | $REAL_SHA | awk '{print $1}')
  printf '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"%s","class":"daily","protectionState":"none","createdAt":"%s","createdEpoch":%s,"dailyKey":"%s","weeklyKey":"%s","monthlyKey":"%s","sha256":"%s","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"%s","objectStatus":"empty","objectManifestSha256":"%s","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}\n' \
    "$old_id" "$old_created_at" "$old_epoch" "$old_daily_key" "$old_weekly_key" "$old_monthly_key" "$old_dump_sha" "$FINGERPRINT" "$old_object_sha" \
    >"$history_base/offsite/diis/database/manifests/$old_id.complete.json"
  printf '%s  %s.dump\n' "$old_dump_sha" "$old_id" \
    >"$history_base/offsite/diis/database/current/$old_id.sha256"
done
protected_epoch=1577836800
protected_created_at=$(date -u -d "@$protected_epoch" '+%Y-%m-%dT%H:%M:%SZ')
protected_daily_key=$(date -u -d "@$protected_epoch" '+%Y-%m-%d')
protected_weekly_key=$(date -u -d "@$protected_epoch" '+%G-W%V')
protected_monthly_key=$(date -u -d "@$protected_epoch" '+%Y-%m')
protected_dump_sha=$(printf 'retention-protected-dump-%s' "$protected_id" | $REAL_SHA | awk '{print $1}')
protected_object_sha=$(printf 'retention-protected-object-manifest-%s' "$protected_id" | $REAL_SHA | awk '{print $1}')
printf '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"%s","class":"pre-change","protectionState":"protected","createdAt":"%s","createdEpoch":%s,"dailyKey":"%s","weeklyKey":"%s","monthlyKey":"%s","sha256":"%s","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"%s","objectStatus":"empty","objectManifestSha256":"%s","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}\n' \
  "$protected_id" "$protected_created_at" "$protected_epoch" "$protected_daily_key" "$protected_weekly_key" "$protected_monthly_key" "$protected_dump_sha" "$FINGERPRINT" "$protected_object_sha" >"$protected_manifest"
printf '%s  %s.dump\n' "$protected_dump_sha" "$protected_id" \
  >"$history_base/offsite/diis/database/current/$protected_id.sha256"
OFFSITE_RETENTION_APPLY=1 run_object_snapshot 20260904T000000Z-1004 1788480000
[[ -f "$protected_manifest" ]] || fail 'protected pre-change point was deleted by ordinary retention'
RCLONE_CAT_FAULT=release-overflow OFFSITE_RETENTION_APPLY=1 \
  run_object_snapshot 20260904T010000Z-1007 1788483600
[[ -f "$protected_manifest" ]] || fail 'oversized release marker observation deleted protected point'
pass 'protected pre-change survives age slot pressure and unavailable or oversized release observation'

env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
  RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
  OFFSITE_CRYPT_REMOTE=offsite-crypt:diis \
  PRECHANGE_RELEASE_CONFIRMATION=RELEASE_PROTECTED_PRECHANGE_AFTER_RECONCILIATION \
  sh "$PRECHANGE_RELEASE" "$protected_id" W10.RECON-001 >"$history_base/release.out"
release_remote="$history_base/offsite/diis/database/releases/$protected_id.release.json"
[[ -f "$release_remote" ]] || fail 'explicit protected release marker missing'
(
  source "$LIB"
  validate_prechange_release "$release_remote" "$protected_id"
) || fail 'explicit protected release marker invalid'
OFFSITE_RETENTION_APPLY=1 run_object_snapshot 20260905T000000Z-1005 1788566400
[[ ! -f "$protected_manifest" ]] || fail 'released pre-change point remained retention-protected'
pass 'protected pre-change releases only after validated reconciliation marker'

retention_negative_id=20200001T000000Z-9999
retention_negative_manifest="$history_base/offsite/diis/database/manifests/$retention_negative_id.complete.json"
retention_negative_sidecar="$history_base/offsite/diis/database/current/$retention_negative_id.sha256"
retention_negative_dump="$history_base/offsite/diis/database/current/$retention_negative_id.dump"
cp "$history_base/offsite/diis/database/manifests/20260905T000000Z-1005.complete.json" \
  "$retention_negative_manifest"
retention_negative_sha=$(printf retention-negative | $REAL_SHA | awk '{print $1}')
printf '%s  %s.dump\n' "$retention_negative_sha" "$retention_negative_id" >"$retention_negative_sidecar"
printf sentinel >"$retention_negative_dump"
if OFFSITE_RETENTION_APPLY=1 run_object_snapshot 20260906T000000Z-1006 1788652800; then
  fail 'filename-mismatched retention point was accepted'
fi
[[ -f "$retention_negative_manifest" && -f "$retention_negative_sidecar" \
  && "$(cat "$retention_negative_dump")" = sentinel ]] \
  || fail 'filename-mismatched retention point was deleted before strict validation'
pass 'retention rejects filename mismatch before any deletion'

signal_base="$TMP/live-lock"
prepare_backup_case "$signal_base"
cat >"$signal_base/bin/pg_dump" <<'EOF'
#!/bin/sh
for arg in "$@"; do case "$arg" in --file=*) file=${arg#--file=} ;; esac; done
touch "$file"
sleep 30
EOF
chmod +x "$signal_base/bin/pg_dump"
common_lock_env=(env PATH="$signal_base/bin:$PATH" MC="$signal_base/bin/mc" RCLONE="$signal_base/bin/rclone" \
  MC_FAKE_ROOT="$signal_base/mc" RCLONE_SOURCE_ROOT="$signal_base/source" RCLONE_OFFSITE_ROOT="$signal_base/offsite" \
  RCLONE_RESTORE_ROOT="$signal_base/restore" POSTGRES_HOST=postgres POSTGRES_USER=test POSTGRES_DB=test \
  BACKUP_BUCKET=backup OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
  RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects BACKUP_TEMP_ROOT="$signal_base/tmp" \
  MINIO_TARGET_PATH="$signal_base/minio-target" BACKUP_LOCK_DIR="$signal_base/lock" BACKUP_LOCAL_BUDGET_BYTES="$GATE0_BUDGET")
"${common_lock_env[@]}" sh "$BACKUP" >"$signal_base/first.out" 2>"$signal_base/first.err" &
first_pid=$!
for _ in $(seq 1 100); do [[ -s "$signal_base/lock/owner" ]] && break; sleep 0.05; done
[[ -s "$signal_base/lock/owner" ]] || fail 'live lock owner missing'
if "${common_lock_env[@]}" sh "$BACKUP" >/dev/null 2>&1; then fail 'second live writer accepted'; fi
kill -KILL "$first_pid" 2>/dev/null || true
wait "$first_pid" 2>/dev/null || true
cat >"$signal_base/bin/pg_dump" <<'EOF'
#!/bin/sh
for arg in "$@"; do case "$arg" in --file=*) file=${arg#--file=} ;; esac; done
dd if=/dev/zero of="$file" bs=2048 count=1 2>/dev/null
EOF
chmod +x "$signal_base/bin/pg_dump"
if ! "${common_lock_env[@]}" sh "$BACKUP" >"$signal_base/recovery.out" 2>"$signal_base/recovery.err"; then
  cat "$signal_base/recovery.err" >&2; fail 'stale lock was not reclaimed'
fi
[[ ! -d "$signal_base/lock" ]] || fail 'recovered lock leaked'
pass 'live duplicate rejected and SIGKILL stale lock reclaimed'

restore_base="$TMP/restore"
restore_fake="$restore_base/bin"
restore_state="$restore_base/state"
restore_tmp="$restore_base/archive-tmp"
mkdir -p "$restore_fake" "$restore_state" "$restore_base/proofs" "$restore_tmp"
chmod 700 "$restore_base/proofs"
cat >"$restore_fake/docker" <<'EOF'
#!/bin/sh
state=${DOCKER_STATE:?}
command=$1; shift
case "$command" in
  inspect)
    format=$2; target=$3
    case "$format" in
      *State.Running*) echo true ;;
      *restore-target*) [ "${UNMARKED:-0}" = 1 ] || echo disposable-v1 ;;
      *restore-data-path*) echo /var/lib/postgresql/data ;;
      *NetworkSettings.Networks*) echo diis-restore-isolated ;;
      *) exit 61 ;;
    esac
    ;;
  network)
    echo isolated-v1
    ;;
  exec)
    args="$*"
    case "$args" in
      *'df -Pk'*) printf '%s\n' '10000000 9999000' ;;
      *'pg_restore --list'*)
        if [ "${RESTORE_FAULT:-}" = archive-list ]; then exit 64; fi
        if [ "${RESTORE_FAULT:-}" = empty-archive-list ]; then exit 0; fi
        i=0
        while [ "$i" -lt 5000 ]; do
          printf '%s\n' 'TABLE DATA auth users'
          i=$((i + 1))
        done
        touch "$state/archive-list-consumed"
        ;;
      *'pg_restore --username='*)
        if [ "${RESTORE_FAULT:-}" = restore ]; then exit 62; fi
        ;;
      *'CREATE DATABASE'*)
        touch "$state/database-created"
        if [ "${RESTORE_SIGNAL:-}" = database-create ]; then
          kill -"${RESTORE_SIGNAL_NAME:-TERM}" "$PPID"
          exit 0
        fi
        if [ "${RESTORE_FAULT:-}" = database-create ]; then exit 66; fi
        if [ "${RESTORE_BLOCK:-}" = after-lock ]; then
          touch "$state/create-wait"
          while [ ! -f "$state/release" ]; do sleep 0.05; done
        fi
        ;;
      *'DROP DATABASE IF EXISTS'*) rm -f "$state/database-created"; : >"$state/database-dropped" ;;
      *'pg_database'*)
        if [ "${RESTORE_FAULT:-}" = database-absence ] && [ -e "$state/database-dropped" ]; then
          exit 68
        fi
        if [ -e "$state/database-created" ]; then printf '%s\n' disposable; else printf '\n'; fi
        ;;
      *'information_schema.tables'*) printf '%s\n' 46 ;;
      *'auth.users'*) printf '%s\n' 40 ;;
      *'student.students'*) printf '%s\n' 20 ;;
    esac
    ;;
  *) exit 63 ;;
esac
EOF
chmod +x "$restore_fake/docker"
cat >"$restore_fake/mkdir" <<'EOF'
#!/bin/sh
if [ "${RESTORE_FAULT:-}" = lock-mkdir ]; then
  target=''
  for argument in "$@"; do case "$argument" in -*) ;; *) target=$argument ;; esac; done
fi
if [ "${RESTORE_FAULT:-}" = lock-mkdir ] && [ "$target" = "${RESTORE_LOCK_DIR:-}" ]; then
  /usr/bin/mkdir "$@"
  exit 77
fi
exec /usr/bin/mkdir "$@"
EOF
chmod +x "$restore_fake/mkdir"
restore_backup_id=20260903T000000Z-7000
restore_dump="$restore_base/$restore_backup_id.dump"
dd if=/dev/zero of="$restore_dump" bs=2048 count=1 2>/dev/null
restore_sha=$($REAL_SHA "$restore_dump" | awk '{print $1}')
restore_object_sha=$(printf 'diis-object-manifest-v1|%s|exact\n' "$restore_backup_id" | $REAL_SHA | awk '{print $1}')
printf '%s  %s.dump\n' "$restore_sha" "$restore_backup_id" >"$restore_base/$restore_backup_id.sha256"
cat >"$restore_base/$restore_backup_id.complete.json" <<EOF
{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"${restore_backup_id}","class":"daily","protectionState":"none","createdAt":"2026-09-03T00:00:00Z","createdEpoch":1788393600,"dailyKey":"2026-09-03","weeklyKey":"2026-W36","monthlyKey":"2026-09","sha256":"${restore_sha}","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"${FINGERPRINT}","objectStatus":"empty","objectManifestSha256":"${restore_object_sha}","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}
EOF
cat >"$restore_base/$restore_backup_id.offsite-provenance.json" <<EOF
{"schemaVersion":"diis-offsite-restore-input-v1","source":"independent-crypt","backupId":"${restore_backup_id}","offsiteConfigFingerprint":"${FINGERPRINT}","dumpSha256":"${restore_sha}","dumpBytes":2048,"objectManifestSha256":"${restore_object_sha}","objectCount":0,"dumpFile":"${restore_backup_id}.dump","sidecarFile":"${restore_backup_id}.sha256","completionFile":"${restore_backup_id}.complete.json","objectManifestFile":"${restore_backup_id}.objects.tsv"}
EOF
run_restore() {
  local name=$1 container=${2:-diis-restore-test} unmarked=${3:-0} fault=${4:-} \
    provenance=${5:-$restore_base/$restore_backup_id.offsite-provenance.json}
  if [ "${RESTORE_DETACHED:-0}" = 1 ]; then
    env PATH="$restore_fake:$PATH" DOCKER_STATE="$restore_state" UNMARKED="$unmarked" \
      RESTORE_FAULT="$fault" TMPDIR="$restore_tmp" \
      RESTORE_SIGNAL="${RESTORE_SIGNAL:-}" RESTORE_SIGNAL_NAME="${RESTORE_SIGNAL_NAME:-TERM}" \
      RESTORE_BLOCK="${RESTORE_BLOCK:-}" \
      POSTGRES_CONTAINER="$container" POSTGRES_USER=postgres DUMP_FILE="$restore_dump" \
      MANIFEST_FILE="$restore_base/$restore_backup_id.complete.json" \
      CHECKSUM_FILE="$restore_base/$restore_backup_id.sha256" PROVENANCE_FILE="$provenance" \
      RESTORE_OWNERSHIP_FILE="${RESTORE_OWNERSHIP_FILE:-}" \
      RESTORE_PROOF_OUTPUT="${RESTORE_PROOF_OUTPUT:-$restore_base/proofs/$name.json}" RESTORE_LOCK_DIR="$restore_base/lock-$name" \
      setsid perl -e '$SIG{HUP}="DEFAULT"; $SIG{INT}="DEFAULT"; $SIG{TERM}="DEFAULT"; exec @ARGV' -- \
      bash "$RESTORE" \
      >"$restore_base/out-$name" 2>"$restore_base/err-$name"
  else
    env PATH="$restore_fake:$PATH" DOCKER_STATE="$restore_state" UNMARKED="$unmarked" \
      RESTORE_FAULT="$fault" TMPDIR="$restore_tmp" \
      RESTORE_SIGNAL="${RESTORE_SIGNAL:-}" RESTORE_SIGNAL_NAME="${RESTORE_SIGNAL_NAME:-TERM}" \
      RESTORE_BLOCK="${RESTORE_BLOCK:-}" \
      POSTGRES_CONTAINER="$container" POSTGRES_USER=postgres DUMP_FILE="$restore_dump" \
      MANIFEST_FILE="$restore_base/$restore_backup_id.complete.json" \
      CHECKSUM_FILE="$restore_base/$restore_backup_id.sha256" PROVENANCE_FILE="$provenance" \
      RESTORE_OWNERSHIP_FILE="${RESTORE_OWNERSHIP_FILE:-}" \
      RESTORE_PROOF_OUTPUT="${RESTORE_PROOF_OUTPUT:-$restore_base/proofs/$name.json}" RESTORE_LOCK_DIR="$restore_base/lock-$name" \
      bash "$RESTORE" >"$restore_base/out-$name" 2>"$restore_base/err-$name"
  fi
}
mkdir -p "$restore_base/lock-success"
printf '%s\n%s\n%s\n%s\n%s\n' stale-boot 999999 stale-start stale-token "$(readlink /proc/$$/ns/pid)" \
  >"$restore_base/lock-success/owner"
if ! run_restore success; then
  cat "$restore_base/out-success" >&2 || true
  cat "$restore_base/err-success" >&2 || true
  cat "$restore_base/proofs/success.json" >&2 || true
  find "$restore_base" -maxdepth 2 -type f -print >&2 || true
  fail 'isolated restore failed'
fi
assert_grep 'RESTORE_DRILL_COMPLETE' "$restore_base/out-success" 'restore completion missing'
assert_grep '"status":"success"' "$restore_base/proofs/success.json" 'restore success proof missing'
assert_grep '"source":"independent-crypt"' "$restore_base/proofs/success.json" \
  'restore success proof independent source missing'
assert_grep '"tableCount":46.*"userCount":40.*"studentCount":20' \
  "$restore_base/proofs/success.json" 'restore success proof exact counts missing'
[[ -f "$restore_state/archive-list-consumed" ]] \
  || fail 'restore archive list was not consumed completely'
[[ -z "$(find "$restore_tmp" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
  || fail 'restore archive list temp file was not cleaned after success'
[[ ! -d "$restore_base/lock-success" ]] || fail 'stale restore lock was not reclaimed'
rm -f "$restore_state/archive-list-consumed"
if run_restore archive-list-failure diis-restore-test 0 archive-list; then
  fail 'pg_restore archive-list command failure was accepted'
fi
assert_grep 'archive list validation gagal' "$restore_base/err-archive-list-failure" \
  'archive-list command failure did not fail closed'
assert_grep '"status":"failed"' "$restore_base/proofs/archive-list-failure.json" \
  'archive-list command failure proof is not failed'
if run_restore empty-archive-list diis-restore-test 0 empty-archive-list; then
  fail 'empty pg_restore archive list was accepted'
fi
assert_grep 'archive list kosong' "$restore_base/err-empty-archive-list" \
  'empty archive list did not fail closed'
assert_grep '"status":"failed"' "$restore_base/proofs/empty-archive-list.json" \
  'empty archive-list proof is not failed'
[[ ! -e "$restore_state/database-created" ]] || fail 'archive-list failure mutated database'
[[ -z "$(find "$restore_tmp" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
  || fail 'restore archive list temp file was not cleaned after failure'
if run_restore production smk-postgres; then fail 'production restore target accepted'; fi
if run_restore unmarked diis-restore-test 1; then fail 'unmarked restore target accepted'; fi
sed 's/"source":"independent-crypt"/"source":"minio-local"/' \
  "$restore_base/$restore_backup_id.offsite-provenance.json" >"$restore_base/local-provenance.json"
if run_restore local-source diis-restore-test 0 '' "$restore_base/local-provenance.json"; then
  fail 'local source provenance was accepted by database restore'
fi
[[ ! -e "$restore_state/database-created" ]] || fail 'negative restore mutated database'
pass 'restore requires independent provenance and marked isolated target before mutation'

mkdir -p "$restore_base/outside"
ln -s "$restore_base/outside" "$restore_base/proofs/ownership-link"
ownership_outside="$restore_base/outside/ownership"
ownership_traversal="$restore_base/proofs/../outside/traversal"
ownership_symlink="$restore_base/proofs/ownership-link/ownership"
ownership_preexisting="$restore_base/proofs/preexisting-ownership"
printf 'sentinel-ownership-file\n' >"$ownership_preexisting"
for ownership_case in outside traversal symlink preexisting; do
  case "$ownership_case" in
    outside) ownership_override=$ownership_outside ;;
    traversal) ownership_override=$ownership_traversal ;;
    symlink) ownership_override=$ownership_symlink ;;
    preexisting) ownership_override=$ownership_preexisting ;;
  esac
  if RESTORE_OWNERSHIP_FILE="$ownership_override" run_restore "ownership-$ownership_case"; then
    fail "arbitrary ownership path $ownership_case was accepted"
  fi
  assert_grep 'RESTORE_OWNERSHIP_FILE override dilarang' \
    "$restore_base/err-ownership-$ownership_case" \
    "ownership $ownership_case override did not fail closed"
  [[ ! -e "$restore_state/database-created" ]] \
    || fail "ownership $ownership_case rejection mutated database"
  [[ ! -d "$restore_base/lock-ownership-$ownership_case" ]] \
    || fail "ownership $ownership_case rejection created restore lock"
done
[[ ! -e "$ownership_outside" && ! -L "$ownership_outside" ]] \
  || fail 'outside ownership override created a file'
[[ ! -e "$restore_base/outside/traversal" && ! -L "$restore_base/outside/traversal" ]] \
  || fail 'traversal ownership override created a file'
[[ -L "$restore_base/proofs/ownership-link" ]] \
  || fail 'symlink ownership negative control was altered'
[[ "$(cat "$ownership_preexisting")" = 'sentinel-ownership-file' ]] \
  || fail 'pre-existing ownership target was overwritten or removed'
public_proof_dir="$restore_base/public-proofs"
mkdir -p "$public_proof_dir"
chmod 755 "$public_proof_dir"
if RESTORE_PROOF_OUTPUT="$public_proof_dir/public.json" run_restore public-proof-dir; then
  fail 'non-private proof directory was accepted'
fi
assert_grep 'mode direktori proof privat wajib 0700' \
  "$restore_base/err-public-proof-dir" 'non-private proof directory did not fail closed'
[[ ! -e "$public_proof_dir/public.json" ]] \
  || fail 'non-private proof directory received failure proof'
[[ ! -e "$restore_state/database-created" ]] \
  || fail 'non-private proof directory validation mutated database'
pass 'restore ownership path is direct-child derived and rejects outside, traversal, symlink, pre-existing, and non-private proof roots'

for signal_name in HUP INT TERM; do
  signal_case="signal-${signal_name,,}-database-create"
  case "$signal_name" in HUP) expected_signal_rc=129 ;; INT) expected_signal_rc=130 ;; TERM) expected_signal_rc=143 ;; esac
  if RESTORE_SIGNAL=database-create RESTORE_SIGNAL_NAME="$signal_name" run_restore "$signal_case"; then
    fail "$signal_name database-create signal unexpectedly succeeded"
  else
    signal_rc=$?
  fi
  [[ "$signal_rc" -eq "$expected_signal_rc" ]] \
    || fail "$signal_name database-create signal returned unexpected status $signal_rc"
  [[ ! -e "$restore_state/database-created" ]] \
    || fail "$signal_name database-create signal left disposable database"
  [[ ! -d "$restore_base/lock-$signal_case" ]] \
    || fail "$signal_name database-create signal left restore lock"
  [[ -z "$(find "$restore_base/proofs" -maxdepth 1 -name '.diis-restore-*.ownership.*' -print -quit)" ]] \
    || fail "$signal_name database-create signal left ownership registration"
  assert_grep 'RESTORE_DRILL_CLEANUP_OK databaseAbsent=true lockAbsent=true' \
    "$restore_base/err-$signal_case" "$signal_name database cleanup absence proof missing"
  # The fake sends TERM to the parent to model the signal; remap the trigger for
  # HUP/INT/TERM by verifying cleanup remains signal-independent at this boundary.
done
pass 'restore database ownership is pre-registered and HUP/INT/TERM cleanup proves absence'

for signal_name in HUP INT TERM; do
  signal_case="signal-${signal_name,,}-lock"
  case "$signal_name" in HUP) expected_signal_rc=129 ;; INT) expected_signal_rc=130 ;; TERM) expected_signal_rc=143 ;; esac
  rm -f "$restore_state/create-wait" "$restore_state/release"
  RESTORE_SIGNAL= RESTORE_BLOCK=after-lock RESTORE_DETACHED=1 run_restore "$signal_case" &
  restore_pid=$!
  for _ in $(seq 1 100); do
    [[ -f "$restore_base/lock-$signal_case/owner" && -f "$restore_state/create-wait" ]] && break
    sleep 0.05
  done
  [[ -f "$restore_base/lock-$signal_case/owner" ]] || fail "$signal_name lock signal did not reach owned boundary"
  ownership_path=$(find "$restore_base/proofs" -maxdepth 1 -type f -name '.diis-restore-*.ownership.*' -print -quit)
  [[ -n "$ownership_path" && "$(dirname "$ownership_path")" = "$restore_base/proofs" ]] \
    || fail "$signal_name ownership registration was not a direct proof-directory child"
  owner_pid=$(sed -n '2p' "$restore_base/lock-$signal_case/owner")
  kill -"$signal_name" "$owner_pid" 2>/dev/null || fail "$signal_name lock signal injection failed"
  touch "$restore_state/release"
  if wait "$restore_pid"; then
    fail "$signal_name lock signal unexpectedly succeeded"
  else
    signal_rc=$?
  fi
  [[ "$signal_rc" -eq "$expected_signal_rc" ]] \
    || fail "$signal_name lock signal returned unexpected status $signal_rc"
  [[ ! -e "$restore_state/database-created" ]] \
    || fail "$signal_name lock signal left disposable database"
  [[ ! -d "$restore_base/lock-$signal_case" ]] \
    || fail "$signal_name lock signal left restore lock"
  [[ -z "$(find "$restore_base/proofs" -maxdepth 1 -name '.diis-restore-*.ownership.*' -print -quit)" ]] \
    || fail "$signal_name lock signal left ownership registration"
  assert_grep 'RESTORE_DRILL_CLEANUP_OK databaseAbsent=true lockAbsent=true' \
    "$restore_base/err-$signal_case" "$signal_name lock cleanup absence proof missing"
done
pass 'restore lock ownership is pre-registered and HUP/INT/TERM cleanup proves absence'

if run_restore lock-mkdir-fault diis-restore-test 0 lock-mkdir; then
  fail 'lock acquisition fault unexpectedly succeeded'
fi
assert_grep 'RESTORE_DRILL_CLEANUP_AMBIGUOUS.*databaseAbsent=true.*lockAbsent=false.*retry=prohibited' \
  "$restore_base/err-lock-mkdir-fault" 'lock acquisition fault did not emit ambiguous no-retry'
assert_grep '"status":"failed"' "$restore_base/proofs/lock-mkdir-fault.json" \
  'lock acquisition fault emitted non-failed proof'
pass 'lock acquisition fault is fail-closed with explicit ambiguous no-retry'

if run_restore database-create-fault diis-restore-test 0 database-create; then
  fail 'database-create fault unexpectedly succeeded'
fi
[[ ! -e "$restore_state/database-created" ]] || fail 'database-create fault left disposable database'
[[ ! -d "$restore_base/lock-database-create-fault" ]] || fail 'database-create fault left restore lock'
assert_grep 'RESTORE_DRILL_CLEANUP_OK databaseAbsent=true lockAbsent=true' \
  "$restore_base/err-database-create-fault" 'database-create fault absence proof missing'
pass 'database mutation fault is fail-closed with exact cleanup absence proof'

rm -f "$restore_state/database-dropped"
if run_restore database-absence-fault diis-restore-test 0 database-absence; then
  fail 'database absence observation fault unexpectedly succeeded'
fi
assert_grep 'RESTORE_DRILL_CLEANUP_AMBIGUOUS.*databaseAbsent=false.*retry=prohibited' \
  "$restore_base/err-database-absence-fault" 'database absence observation fault did not emit ambiguous no-retry'
assert_grep '"status":"failed"' "$restore_base/proofs/database-absence-fault.json" \
  'database absence observation fault emitted non-failed proof'
[[ ! -e "$restore_state/database-created" ]] || fail 'database absence observation fault left disposable database'
pass 'database absence observation fault is explicit ambiguous no-retry without false success'

publish_fake="$TMP/publish-bin"
mkdir -p "$publish_fake"
cat >"$publish_fake/docker" <<'SH'
#!/bin/sh
printf '%s\n' "$*" >>"${PUBLISH_LOG:?}"
exit 0
SH
chmod +x "$publish_fake/docker"
env PATH="$publish_fake:$PATH" PUBLISH_LOG="$TMP/publish.log" PG_BACKUP_CONTAINER=smk-pg-backup \
  RESTORE_PROOF_FILE="$restore_base/proofs/success.json" \
  RESTORE_PROOF_PUBLISH_CONFIRMATION=PUBLISH_PII_SAFE_MONTHLY_RESTORE_PROOF \
  bash "$PUBLISH_RESTORE_PROOF" >/dev/null \
  || fail 'valid independent restore proof was rejected by publisher'
sed 's/"source":"independent-crypt"/"source":"minio-local"/' \
  "$restore_base/proofs/success.json" >"$restore_base/proofs/local-source.json"
if env PATH="$publish_fake:$PATH" PUBLISH_LOG="$TMP/publish-invalid.log" \
  PG_BACKUP_CONTAINER=smk-pg-backup RESTORE_PROOF_FILE="$restore_base/proofs/local-source.json" \
  RESTORE_PROOF_PUBLISH_CONFIRMATION=PUBLISH_PII_SAFE_MONTHLY_RESTORE_PROOF \
  bash "$PUBLISH_RESTORE_PROOF" >/dev/null 2>&1; then
  fail 'publisher accepted successful restore proof from local source'
fi
[[ ! -e "$TMP/publish-invalid.log" ]] || fail 'invalid restore proof reached Docker publisher mutation'
pass 'restore proof publisher preserves version 3 independent provenance and count contract'

assert_grep 'objectManifestSha256' "$LIB" 'object manifest binding missing'
assert_grep 'objects/blobs' "$OFFSITE" 'content-addressed object blobs missing'
assert_grep 'exact' "$OBJECT_RESTORE" 'exact object restore semantics missing'
assert_not_grep 'rclone[[:space:]]+sync' "$OFFSITE" 'destructive sync is forbidden'
assert_grep 'pre-change:protected' "$OFFSITE" 'protected off-site retention missing'
assert_grep 'database/releases' "$OFFSITE" 'explicit protection release marker missing'
assert_grep 'rclone cat' "$OFFSITE" 'release marker must use exact object read'
pass 'historical object and protected retention contracts are explicit'

release_contract="$TMP/release-contract"
mkdir -p "$release_contract"
cat >"$release_contract/valid.json" <<'EOF'
{"schemaVersion":"diis-prechange-release-v1","backupId":"20260903T000000Z-1234","reconciliationRef":"W10.RECON-001","reconciliationStatus":"complete","releasedAt":"2026-09-03T00:00:00Z"}
EOF
sed 's/20260903T000000Z-1234/20260903T000000Z-9999/' \
  "$release_contract/valid.json" >"$release_contract/wrong-id.json"
: >"$release_contract/empty.json"
python3 - "$release_contract/valid.json" "$release_contract/duplicate.json" \
  "$release_contract/unknown.json" <<'PY'
from pathlib import Path
import sys

valid = Path(sys.argv[1]).read_text(encoding="utf-8").strip()
Path(sys.argv[2]).write_text(valid[:-1] + ',"backupId":"20260903T000000Z-1234"}\n', encoding="utf-8")
Path(sys.argv[3]).write_text(valid[:-1] + ',"unexpected":true}\n', encoding="utf-8")
PY
(
  # shellcheck source=../scripts/backup-lib.sh
  source "$LIB"
  validate_prechange_release "$release_contract/valid.json" '20260903T000000Z-1234'
  ! validate_prechange_release "$release_contract/wrong-id.json" '20260903T000000Z-1234'
  ! validate_prechange_release "$release_contract/empty.json" '20260903T000000Z-1234'
  ! validate_prechange_release "$release_contract/duplicate.json" '20260903T000000Z-1234'
  ! validate_prechange_release "$release_contract/unknown.json" '20260903T000000Z-1234'
) || fail 'release marker content validation failed'
pass 'protected release marker is strict-schema content-bound to backup identity'

for runbook in "$BACKUP_RUNBOOK" "$OFFSITE_RUNBOOK" "$RESTORE_RUNBOOK"; do
  assert_grep 'NOT ACTIVE / NOT COMMISSIONED' "$runbook" 'runbook must state current runtime hold'
done
assert_grep '4015794422' "$BACKUP_RUNBOOK" 'runbook omits exact Gate 0 budget'
assert_grep '19:00 WIB' "$BACKUP_RUNBOOK" 'runbook omits verified legacy schedule'
assert_grep 'exact content-addressed object manifest|content-addressed' "$BACKUP_RUNBOOK" \
  'runbook omits exact object history contract'
assert_grep 'filename_encryption=standard' "$OFFSITE_RUNBOOK" \
  'off-site runbook omits required filename encryption'
assert_grep 'Service Account file' "$OFFSITE_RUNBOOK" \
  'off-site runbook omits dedicated Service Account auth'
assert_grep 'Individual Backup tidak dapat diproteksi' "$OFFSITE_RUNBOOK" \
  'off-site runbook falsely implies individual Backup protection'
assert_grep 'Credential custodian' "$OFFSITE_RUNBOOK" \
  'off-site runbook omits custody decision fields'
assert_grep 'H1.*root-cron read-only|H1 — root-cron read-only' "$BACKUP_RUNBOOK" \
  'backup runbook omits H1 read-only gate'
assert_grep 'POSTGRES_CONTAINER=diis-restore-disposable' "$RESTORE_RUNBOOK" \
  'restore runbook does not require explicit disposable target'
pass 'runbooks separate current runtime from target contract'

assert_grep 'backupBytes' "$MONITOR" 'backup size telemetry missing'
assert_grep 'growth7Bytes' "$MONITOR" '7-day growth telemetry missing'
assert_grep 'growth30Bytes' "$MONITOR" '30-day growth telemetry missing'
assert_grep 'projectedDaysToFull' "$MONITOR" 'days-to-full telemetry missing'
assert_grep 'RESTORE_PROOF_MISSING_OR_STALE' "$MONITOR" 'restore proof alert missing'
assert_grep '"active": false' "$MONITOR" 'monitor must remain inactive before commissioning'
assert_not_grep 'pg_dump|/backup\.sh' "$MONITOR" 'n8n must not own backup execution'
pass 'monitor telemetry contract is complete and inactive'

NODE_BIN=$(command -v node || command -v node.exe || true)
[[ -n "$NODE_BIN" ]] || fail 'Node.js unavailable for n8n behavior test'
MONITOR_ARG=$MONITOR
case "$NODE_BIN" in *.exe) MONITOR_ARG=$(wslpath -w "$MONITOR") ;; esac
"$NODE_BIN" - "$MONITOR_ARG" <<'EOF' || fail 'n8n telemetry behavior failed'
const fs = require('fs');
const workflow = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const code = workflow.nodes.find((node) => node.name === 'Nilai freshness completion')?.parameters?.jsCode;
if (!code) throw new Error('monitor evaluator missing');
const evaluate = (telemetry, env = {}) => new Function('$input', '$env', code)(
  { first: () => ({ json: telemetry }) }, env,
)[0].json;
const base = {
  schemaVersion: 'diis-backup-telemetry-v1', createdEpoch: Math.floor(Date.now() / 1000) - 3600,
  backupBytes: 100, growth7Status: 'available', growth7Bytes: 5,
  growth30Status: 'available', growth30Bytes: 10, targetTotalBytes: 1000,
  targetFreeBytes: 500, projectedFreePercent: 50, projectedDaysToFull: 1500,
  offsiteStatus: 'complete', restoreStatus: 'success', restoreAgeDays: 1,
};
const healthy = evaluate(base);
if (!healthy.completionFresh || healthy.alertRequired || healthy.reasonCodes.length) throw new Error('healthy telemetry rejected');
const capacity = evaluate({ ...base, projectedFreePercent: 20 });
if (!capacity.reasonCodes.includes('CAPACITY_LOW')) throw new Error('capacity alert missing');
const restore = evaluate({ ...base, restoreStatus: 'failed' });
if (!restore.reasonCodes.includes('RESTORE_PROOF_MISSING_OR_STALE')) throw new Error('restore alert missing');
const stale = evaluate({ ...base, createdEpoch: Math.floor(Date.now() / 1000) - 7200 });
if (!stale.reasonCodes.includes('COMPLETION_STALE_OR_MISSING')) throw new Error('freshness alert missing');
const nullMetric = evaluate({ ...base, targetFreeBytes: null });
if (!nullMetric.reasonCodes.includes('TELEMETRY_INVALID')) throw new Error('null telemetry accepted');
const stringMetric = evaluate({ ...base, growth7Bytes: '5' });
if (!stringMetric.reasonCodes.includes('TELEMETRY_INVALID')) throw new Error('string telemetry accepted');
const invalidRange = evaluate({ ...base, projectedFreePercent: 101 });
if (!invalidRange.reasonCodes.includes('TELEMETRY_INVALID')) throw new Error('invalid range accepted');
const invalidGrowth = evaluate({ ...base, growth30Status: 'complete' });
if (!invalidGrowth.reasonCodes.includes('TELEMETRY_INVALID')) throw new Error('invalid growth status accepted');
EOF
pass 'n8n capacity restore and freshness behavior'

printf '1..%d\n' "$PASSED"

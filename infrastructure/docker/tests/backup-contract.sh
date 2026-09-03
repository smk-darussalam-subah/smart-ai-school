#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
BACKUP="$ROOT/infrastructure/docker/scripts/backup.sh"
LIB="$ROOT/infrastructure/docker/scripts/backup-lib.sh"
OFFSITE="$ROOT/infrastructure/docker/scripts/offsite-replication.sh"
OBJECT_RESTORE="$ROOT/infrastructure/docker/scripts/restore-objects.sh"
PRECHANGE_RELEASE="$ROOT/infrastructure/docker/scripts/release-prechange-backup.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
RESTORE="$ROOT/scripts/restore-drill.sh"
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
FINGERPRINT=$(printf '%s' 'crypt=crypt;filename=standard;directory=true;backend=b2;provider=backblaze;origin=https://api.backblazeb2.com' | "$REAL_SHA" | awk '{print $1}')
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
    target=''
    for arg in "$@"; do case "$arg" in --*) ;; *) target=$arg ;; esac; done
    [ -n "$target" ] || exit 46
    target=$(resolve "$target")
    size=$(find "$target" -type f -exec sh -c \
      'for file do wc -c <"$file"; done' sh {} + 2>/dev/null \
      | awk '{ total += $1 } END { print total+0 }')
    printf '{"size":%s}\n' "$size"
    ;;
  find)
    target=$(resolve "$1")
    shift
    pattern='*'
    while [ "$#" -gt 0 ]; do
      [ "$1" = --name ] && { pattern=$2; shift 2; continue; }
      shift
    done
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
    if [ "${FAULT:-}" = post_write_over ] && printf '%s' "$dst" | grep -q '/monitor/latest\.json$'; then
      dd if=/dev/zero bs=131072 count=1 >>"$dst_path" 2>/dev/null
    fi
    ;;
  rm)
    [ "${FAULT:-}" = cleanup ] && exit 14
    for arg in "$@"; do case "$arg" in --*) ;; *) rm -f "$(resolve "$arg")" ;; esac; done
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
case "$command" in
  config)
    [ "${FAULT:-}" = config ] && exit 51
    [ "$1" = show ] || exit 52
    case "$2" in
      offsite-crypt)
        printf '[offsite-crypt]\ntype = crypt\nremote = %s\nfilename_encryption = %s\ndirectory_name_encryption = %s\n' \
          "${RCLONE_FAKE_CRYPT_BACKING:-independent:encrypted}" \
          "${RCLONE_FAKE_FILENAME_MODE:-standard}" "${RCLONE_FAKE_DIRECTORY_MODE:-true}"
        ;;
      independent)
        printf '[independent]\ntype = %s\nprovider = %s\nendpoint = %s\n' \
          "${RCLONE_FAKE_BACKEND_TYPE:-b2}" "${RCLONE_FAKE_PROVIDER:-Backblaze}" \
          "${RCLONE_FAKE_ENDPOINT:-https://api.backblazeb2.com}"
        ;;
      diisminio)
        printf '[diisminio]\ntype = s3\nprovider = Minio\nendpoint = http://minio:9000\n'
        ;;
      local) printf '[local]\ntype = local\n' ;;
      *) exit 53 ;;
    esac
    ;;
  lsf)
    target=$(resolve "$1")
    target=${target%/}
    if [ -f "$target" ]; then basename "$target"; exit 0; fi
    case "$target" in *.json|*.tsv) exit 3 ;; esac
    [ -d "$target" ] || { mkdir -p "$target" 2>/dev/null || true; exit 0; }
    find "$target" -type f | LC_ALL=C sort | while IFS= read -r file; do
      printf '%s\n' "${file#"$target"/}"
    done
    ;;
  copyto)
    [ "${FAULT:-}" = offsite ] && exit 54
    src=$(resolve "$1"); dst=$(resolve "$2")
    [ -f "$src" ] || exit 55
    mkdir -p "$(dirname "$dst")"
    if printf '%s\n' "$*" | grep -q -- '--immutable' && [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
      exit 56
    fi
    cp "$src" "$dst"
    ;;
  cat) cat "$(resolve "$1")" ;;
  deletefile) rm -f "$(resolve "$1")" ;;
  purge) rm -rf "$(resolve "$1")" ;;
  *) exit 57 ;;
esac
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
  env PATH="$base/bin:$PATH" MC="$base/bin/mc" RCLONE="$base/bin/rclone" FAULT="$fault" \
    DB_ESTIMATE="$estimate" MC_FAKE_ROOT="$base/mc" RCLONE_SOURCE_ROOT="$base/source" \
    RCLONE_OFFSITE_ROOT="$base/offsite" RCLONE_RESTORE_ROOT="$base/restore" \
    POSTGRES_HOST=postgres POSTGRES_USER=test POSTGRES_DB=test BACKUP_BUCKET=backup \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects BACKUP_TEMP_ROOT="$base/tmp" \
    MINIO_TARGET_PATH="$base/minio-target" BACKUP_LOCK_DIR="$base/lock" \
    BACKUP_LOCAL_BUDGET_BYTES="$GATE0_BUDGET" sh "$BACKUP" >"$base/out" 2>"$base/err"
}

assert_grep 'postgres:16\.4-alpine3\.20@sha256:[a-f0-9]{64}' "$COMPOSE" 'backup image must be immutable'
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

for fault in dump validation upload offsite disk cleanup local_corrupt; do
  if run_backup "$fault" "$fault"; then fail "$fault fault unexpectedly succeeded"; fi
  [[ ! -d "$TMP/$fault/lock" ]] || fail "$fault lock leaked"
done
assert_grep 'checksum tidak cocok.*local-verify' "$TMP/local_corrupt/err" 'local corruption was not detected'
pass 'dump validation upload offsite disk cleanup and local corruption fail closed'

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
pass 'crypt provider origin private-range and fingerprint controls fail closed'

history_base="$TMP/object-history"
prepare_backup_case "$history_base"
printf 'version-a' >"$history_base/source/objects/x.txt"
run_object_snapshot() {
  local backup_id=$1 epoch=$2
  local run_dir="$history_base/$backup_id"
  mkdir -p "$run_dir"
  dd if=/dev/zero of="$run_dir/database.dump" bs=2048 count=1 2>/dev/null
  local dump_sha
  dump_sha=$($REAL_SHA "$run_dir/database.dump" | awk '{print $1}')
  printf '%s  %s.dump\n' "$dump_sha" "$backup_id" >"$run_dir/database.sha256"
  find "$history_base/source/objects" -type f | sed "s#^$history_base/source/objects/##" \
    | LC_ALL=C sort >"$run_dir/pre.list"
  env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OFFSITE_CONFIG_FINGERPRINT="$FINGERPRINT" \
    RCLONE_MINIO_REMOTE=diisminio: APP_OBJECT_BUCKET=objects BACKUP_ID="$backup_id" \
    BACKUP_CLASS=daily CREATED_AT=2026-09-03T00:00:00Z CREATED_EPOCH="$epoch" \
    DAILY_KEY=2026-09-03 WEEKLY_KEY=2026-W36 MONTHLY_KEY=2026-09 \
    DUMP_SHA256="$dump_sha" DUMP_BYTES=2048 TABLE_COUNT=46 USER_COUNT=40 STUDENT_COUNT=20 \
    TARGET_TOTAL_BYTES=20000000000 TARGET_FREE_BYTES=10000000000 TARGET_PROJECTED_FREE_PERCENT=49 \
    sh "$OFFSITE" "$run_dir/database.dump" "$run_dir/database.sha256" \
      "$run_dir/complete.json" "$run_dir" "$run_dir/pre.list" >"$run_dir/status"
}

run_object_snapshot 20260901T000000Z-1001 1788220800
printf 'version-b' >"$history_base/source/objects/x.txt"
printf 'second' >"$history_base/source/objects/y.txt"
run_object_snapshot 20260902T000000Z-1002 1788307200
rm "$history_base/source/objects/x.txt"
run_object_snapshot 20260903T000000Z-1003 1788393600

restore_snapshot() {
  local backup_id=$1 target=$2
  mkdir -p "$history_base/restore/$target"
  : >"$history_base/restore/$target/.diis-disposable-restore-target-v1"
  env PATH="$history_base/bin:$PATH" RCLONE_SOURCE_ROOT="$history_base/source" \
    RCLONE_OFFSITE_ROOT="$history_base/offsite" RCLONE_RESTORE_ROOT="$history_base/restore" \
    OFFSITE_CRYPT_REMOTE=offsite-crypt:diis OBJECT_RESTORE_TARGET="$target:" \
    OBJECT_RESTORE_CONFIRMATION=RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET \
    sh "$OBJECT_RESTORE" "$history_base/$backup_id/complete.json" \
      "$history_base/$backup_id/$backup_id.objects.tsv" >"$history_base/$target.out"
}
restore_snapshot 20260901T000000Z-1001 restore-a
restore_snapshot 20260902T000000Z-1002 restore-b
restore_snapshot 20260903T000000Z-1003 restore-c
[[ "$(cat "$history_base/restore/restore-a/x.txt")" == version-a ]] || fail 'backup A did not restore x v1'
[[ "$(cat "$history_base/restore/restore-b/x.txt")" == version-b ]] || fail 'backup B did not restore x v2'
[[ -f "$history_base/restore/restore-b/y.txt" ]] || fail 'backup B omitted y'
[[ ! -e "$history_base/restore/restore-c/x.txt" && -f "$history_base/restore/restore-c/y.txt" ]] \
  || fail 'backup C did not honor deletion tombstone semantics'
pass 'three historical object sets restore create update and delete exactly'

protected_id=20250101T000000Z-9000
protected_manifest="$history_base/offsite/diis/database/manifests/$protected_id.complete.json"
mkdir -p "$(dirname "$protected_manifest")"
for index in $(seq 1 14); do
  old_id="2025$(printf '%02d' "$index")01T000000Z-$((9000 + index))"
  old_epoch=$((1704067200 + index * 2678400))
  printf '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"%s","class":"daily","protectionState":"none","createdAt":"2025-01-01T00:00:00Z","createdEpoch":%s,"dailyKey":"2025-01-01","weeklyKey":"2025-W%02d","monthlyKey":"2025-%02d","sha256":"%064d","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"%s","objectStatus":"empty","objectManifestSha256":"%064d","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000,"targetProjectedFreePercent":49}\n' \
    "$old_id" "$old_epoch" "$index" "$index" 1 "$FINGERPRINT" 2 \
    >"$history_base/offsite/diis/database/manifests/$old_id.complete.json"
done
printf '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"%s","class":"pre-change","protectionState":"protected","createdAt":"2025-01-01T00:00:00Z","createdEpoch":1609459200,"dailyKey":"2021-01-01","weeklyKey":"2021-W01","monthlyKey":"2021-01","sha256":"%064d","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"%s","objectStatus":"empty","objectManifestSha256":"%064d","objectCount":0,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000,"targetProjectedFreePercent":49}\n' \
  "$protected_id" 3 "$FINGERPRINT" 4 >"$protected_manifest"
OFFSITE_RETENTION_APPLY=1 run_object_snapshot 20260904T000000Z-1004 1788480000
[[ -f "$protected_manifest" ]] || fail 'protected pre-change point was deleted by ordinary retention'
pass 'protected pre-change survives age and weekly monthly slot pressure'

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
      *'CREATE DATABASE'*) touch "$state/database-created" ;;
      *'DROP DATABASE IF EXISTS'*) rm -f "$state/database-created" ;;
      *'information_schema.tables'*) printf '%s\n' 46 ;;
      *'auth.users'*) printf '%s\n' 40 ;;
      *'student.students'*) printf '%s\n' 20 ;;
    esac
    ;;
  *) exit 63 ;;
esac
EOF
chmod +x "$restore_fake/docker"
restore_dump="$restore_base/synthetic.dump"
dd if=/dev/zero of="$restore_dump" bs=2048 count=1 2>/dev/null
restore_sha=$($REAL_SHA "$restore_dump" | awk '{print $1}')
printf '%s  synthetic.dump\n' "$restore_sha" >"$restore_base/synthetic.sha256"
cat >"$restore_base/synthetic.complete.json" <<EOF
{"schemaVersion":"diis-backup-v1","status":"complete","offsiteStatus":"complete","sha256":"${restore_sha}","tableCount":46,"userCount":40,"studentCount":20}
EOF
run_restore() {
  local name=$1 container=${2:-diis-restore-test} unmarked=${3:-0} fault=${4:-}
  env PATH="$restore_fake:$PATH" DOCKER_STATE="$restore_state" UNMARKED="$unmarked" \
    RESTORE_FAULT="$fault" TMPDIR="$restore_tmp" \
    POSTGRES_CONTAINER="$container" POSTGRES_USER=postgres DUMP_FILE="$restore_dump" \
    MANIFEST_FILE="$restore_base/synthetic.complete.json" CHECKSUM_FILE="$restore_base/synthetic.sha256" \
    RESTORE_PROOF_OUTPUT="$restore_base/proofs/$name.json" RESTORE_LOCK_DIR="$restore_base/lock-$name" \
    bash "$RESTORE" >"$restore_base/out-$name" 2>"$restore_base/err-$name"
}
mkdir -p "$restore_base/lock-success"
printf '%s\n%s\n%s\n%s\n' stale-boot 999999 stale-start stale-token \
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
[[ ! -e "$restore_state/database-created" ]] || fail 'negative restore mutated database'
pass 'restore requires marked isolated target before mutation'

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
(
  # shellcheck source=../scripts/backup-lib.sh
  source "$LIB"
  validate_prechange_release "$release_contract/valid.json" '20260903T000000Z-1234'
  ! validate_prechange_release "$release_contract/wrong-id.json" '20260903T000000Z-1234'
) || fail 'release marker content validation failed'
pass 'protected release marker is content-bound to backup identity'

for runbook in "$BACKUP_RUNBOOK" "$OFFSITE_RUNBOOK" "$RESTORE_RUNBOOK"; do
  assert_grep 'NOT ACTIVE / NOT COMMISSIONED' "$runbook" 'runbook must state current runtime hold'
done
assert_grep '4015794422' "$BACKUP_RUNBOOK" 'runbook omits exact Gate 0 budget'
assert_grep '19:00 WIB' "$BACKUP_RUNBOOK" 'runbook omits verified legacy schedule'
assert_grep 'exact content-addressed object manifest|content-addressed' "$BACKUP_RUNBOOK" \
  'runbook omits exact object history contract'
assert_grep 'filename_encryption=standard' "$OFFSITE_RUNBOOK" \
  'off-site runbook omits required filename encryption'
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

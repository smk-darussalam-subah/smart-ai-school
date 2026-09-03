#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=../infrastructure/docker/scripts/backup-lib.sh
source "$SCRIPT_DIR/../infrastructure/docker/scripts/backup-lib.sh"

CONTAINER="${POSTGRES_CONTAINER:-}"
DB_USER="${POSTGRES_USER:-postgres}"
DUMP_FILE="${DUMP_FILE:-}"
MANIFEST_FILE="${MANIFEST_FILE:-}"
CHECKSUM_FILE="${CHECKSUM_FILE:-}"
RESTORE_PROOF_OUTPUT="${RESTORE_PROOF_OUTPUT:-}"
LOCK_DIR="${RESTORE_LOCK_DIR:-/tmp/diis-restore-drill.lock}"
RESTORE_DB="diis_restore_$(date -u +%Y%m%d%H%M%S)_${RANDOM}"
GATE0_MAX_BACKUP_BYTES=4015794422
CREATED=false
LOCK_ACQUIRED=0
ARCHIVE_LIST_FILE=''

die() { echo "[restore-drill] ERROR: $*" >&2; exit 1; }

cleanup() {
  local code=$?
  local cleanup_failed=false
  trap - EXIT
  if [[ "$CREATED" == true ]]; then
    docker exec "$CONTAINER" psql --username="$DB_USER" --dbname=postgres \
      --set=ON_ERROR_STOP=1 --command="DROP DATABASE IF EXISTS \"${RESTORE_DB}\" WITH (FORCE);" \
      >/dev/null 2>&1 || cleanup_failed=true
  fi
  if [[ "$LOCK_ACQUIRED" -eq 1 ]]; then
    release_directory_lock "$LOCK_DIR" >/dev/null 2>&1 || cleanup_failed=true
  fi
  if [[ -n "$ARCHIVE_LIST_FILE" ]]; then
    rm -f "$ARCHIVE_LIST_FILE" || cleanup_failed=true
  fi
  if [[ "$cleanup_failed" == true ]]; then
    echo '[restore-drill] ERROR: cleanup database atau lock gagal' >&2
    [[ "$code" -ne 0 ]] || code=70
  fi
  if [[ -n "$RESTORE_PROOF_OUTPUT" ]]; then
    local proof_status=failed
    [[ "$code" -eq 0 ]] && proof_status=success
    local proof_tmp="${RESTORE_PROOF_OUTPUT}.candidate.$$"
    printf '{"schemaVersion":"diis-restore-proof-v1","status":"%s","createdEpoch":%s}\n' \
      "$proof_status" "$(date -u +%s)" >"$proof_tmp" || code=70
    chmod 600 "$proof_tmp" || code=70
    mv "$proof_tmp" "$RESTORE_PROOF_OUTPUT" || code=70
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

[[ -n "$CONTAINER" ]] || die 'POSTGRES_CONTAINER disposable wajib ditentukan eksplisit'
case "${CONTAINER,,}" in
  smk-postgres|smk-staging-postgres|*production*|*staging*)
    die 'container PostgreSQL production/staging dilarang untuk restore drill'
    ;;
esac
[[ -n "$DUMP_FILE" && -f "$DUMP_FILE" ]] || die 'DUMP_FILE custom-format wajib dan harus ada'
[[ -n "$MANIFEST_FILE" && -f "$MANIFEST_FILE" ]] || die 'MANIFEST_FILE wajib dan harus ada'
[[ -n "$CHECKSUM_FILE" && -f "$CHECKSUM_FILE" ]] || die 'CHECKSUM_FILE wajib dan harus ada'
[[ -n "$RESTORE_PROOF_OUTPUT" && -d "$(dirname "$RESTORE_PROOF_OUTPUT")" ]] \
  || die 'RESTORE_PROOF_OUTPUT pada direktori privat wajib ditentukan'
[[ "$RESTORE_DB" =~ ^diis_restore_[0-9]{14}_[0-9]+$ ]] || die 'nama database disposable tidak aman'

running=$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null) \
  || die 'container PostgreSQL disposable tidak dapat diobservasi'
[[ "$running" == true ]] || die 'container PostgreSQL disposable tidak berjalan'
target_marker=$(docker inspect --format '{{index .Config.Labels "com.diis.restore-target"}}' "$CONTAINER" 2>/dev/null) \
  || die 'marker target restore tidak dapat dibaca'
[[ "$target_marker" == disposable-v1 ]] || die 'target restore tidak memiliki marker disposable resmi'
target_data_path=$(docker inspect --format '{{index .Config.Labels "com.diis.restore-data-path"}}' "$CONTAINER" 2>/dev/null) \
  || die 'data path target restore tidak dapat dibaca'
[[ "$target_data_path" =~ ^/var/lib/postgresql/data(/[A-Za-z0-9._-]+)*$ ]] \
  || die 'data path target restore tidak aman'

target_network_output=$(docker inspect --format \
  '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' \
  "$CONTAINER" 2>/dev/null) || die 'network target restore tidak dapat diobservasi'
mapfile -t target_networks < <(printf '%s\n' "$target_network_output" | sed '/^[[:space:]]*$/d')
[[ "${#target_networks[@]}" -eq 1 && -n "${target_networks[0]}" ]] \
  || die 'target restore wajib berada tepat pada satu network terisolasi'
target_network=${target_networks[0]}
case "${target_network,,}" in *smk*|*production*|*staging*) die 'network aplikasi dilarang untuk restore drill' ;; esac
network_marker=$(docker network inspect --format '{{index .Labels "com.diis.restore-network"}}' "$target_network" 2>/dev/null) \
  || die 'marker network restore tidak dapat dibaca'
[[ "$network_marker" == isolated-v1 ]] || die 'network restore tidak terisolasi atau tidak bertanda'

grep -Eq '"schemaVersion":"diis-backup-v1"' "$MANIFEST_FILE" || die 'manifest schema tidak valid'
grep -Eq '"status":"complete"' "$MANIFEST_FILE" || die 'backup belum complete'
grep -Eq '"offsiteStatus":"complete"' "$MANIFEST_FILE" || die 'off-site completion belum terbukti'

expected=$(awk 'NR==1 {print $1}' "$CHECKSUM_FILE")
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || die 'checksum sidecar tidak valid'
actual=$(sha256sum "$DUMP_FILE" | awk '{print $1}')
[[ "$actual" == "$expected" ]] || die 'checksum dump tidak cocok'
manifest_sha=$(sed -n 's/.*"sha256":"\([a-f0-9]*\)".*/\1/p' "$MANIFEST_FILE")
[[ "$manifest_sha" == "$actual" ]] || die 'checksum manifest tidak cocok'

ARCHIVE_LIST_FILE=$(mktemp)
chmod 600 "$ARCHIVE_LIST_FILE"
docker exec -i "$CONTAINER" pg_restore --list <"$DUMP_FILE" >"$ARCHIVE_LIST_FILE" \
  || die 'archive list validation gagal'
[[ -s "$ARCHIVE_LIST_FILE" ]] || die 'archive list kosong'
rm -f "$ARCHIVE_LIST_FILE"
ARCHIVE_LIST_FILE=''

dump_bytes=$(wc -c <"$DUMP_FILE")
(( dump_bytes <= GATE0_MAX_BACKUP_BYTES )) || die 'dump melebihi budget absolut Gate 0'
capacity=$(docker exec "$CONTAINER" sh -c \
  "df -Pk '$target_data_path' | awk 'NR==2 {print \$2, \$4}'" 2>/dev/null) \
  || die 'kapasitas filesystem PostgreSQL target tidak dapat diobservasi'
read -r total_kb available_kb <<<"$capacity"
[[ "$total_kb" =~ ^[0-9]+$ && "$available_kb" =~ ^[0-9]+$ ]] \
  || die 'hasil kapasitas filesystem PostgreSQL target tidak valid'
total_bytes=$((total_kb * 1024))
available_bytes=$((available_kb * 1024))
(( available_bytes >= dump_bytes * 3 )) || die 'ruang restore target kurang dari 3x ukuran dump'
projected_bytes=$((available_bytes - dump_bytes))
(( projected_bytes >= 0 && projected_bytes * 100 / total_bytes >= 25 )) \
  || die 'ruang bebas target setelah restore diproyeksikan di bawah 25%'

acquire_directory_lock "$LOCK_DIR"
LOCK_ACQUIRED=1

docker exec "$CONTAINER" psql --username="$DB_USER" --dbname=postgres \
  --set=ON_ERROR_STOP=1 --command="CREATE DATABASE \"${RESTORE_DB}\";" >/dev/null
CREATED=true
docker exec -i "$CONTAINER" pg_restore --username="$DB_USER" --dbname="$RESTORE_DB" \
  --no-owner --no-privileges --exit-on-error --single-transaction <"$DUMP_FILE"

query_count() {
  docker exec "$CONTAINER" psql --username="$DB_USER" --dbname="$RESTORE_DB" \
    --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="$1" | tr -d '[:space:]'
}

table_count=$(query_count "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema');")
user_count=$(query_count 'SELECT count(*) FROM auth.users;')
student_count=$(query_count 'SELECT count(*) FROM student.students;')
expected_tables=$(sed -n 's/.*"tableCount":\([0-9]*\).*/\1/p' "$MANIFEST_FILE")
expected_users=$(sed -n 's/.*"userCount":\([0-9]*\).*/\1/p' "$MANIFEST_FILE")
expected_students=$(sed -n 's/.*"studentCount":\([0-9]*\).*/\1/p' "$MANIFEST_FILE")
[[ "$table_count" == "$expected_tables" ]] || die 'table count reconciliation gagal'
[[ "$user_count" == "$expected_users" ]] || die 'user count reconciliation gagal'
[[ "$student_count" == "$expected_students" ]] || die 'student count reconciliation gagal'

echo "RESTORE_DRILL_COMPLETE tables=${table_count} users=${user_count} students=${student_count}"

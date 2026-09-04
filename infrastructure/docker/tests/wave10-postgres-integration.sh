#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
# shellcheck source=../scripts/backup-lib.sh
source "$ROOT/infrastructure/docker/scripts/backup-lib.sh"

POSTGRES_IMAGE='pgvector/pgvector@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc'
PREFIX="diis-wave10-proof-$$"
NETWORK="${PREFIX}-net"
CONTAINER="${PREFIX}-postgres"
DATABASE='diis_test_wave10_identity'
PASSWORD='synthetic-wave10-only'
TMP=$(mktemp -d)
BACKUP_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
PROOF_DIR="$TMP/proofs"
ARCHIVE_TMP_DIR="$TMP/archive-tmp"
SIGNAL_BIN="$TMP/signal-bin"
REAL_DOCKER=$(command -v docker)

container_present() {
  local observed
  observed=$(docker container ls --all --filter "name=^/${CONTAINER}$" --format '{{.Names}}') \
    || return 2
  [[ -z "$observed" ]] && return 1
  [[ "$observed" == "$CONTAINER" ]]
}

network_present() {
  local observed
  observed=$(docker network ls --filter "name=^${NETWORK}$" --format '{{.Name}}') \
    || return 2
  [[ -z "$observed" ]] && return 1
  [[ "$observed" == "$NETWORK" ]]
}

cleanup() {
  local code=$? observed_status=0
  local cleanup_failed=false
  trap - EXIT HUP INT TERM

  if container_present; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || cleanup_failed=true
  else
    observed_status=$?
    [[ "$observed_status" -eq 1 ]] || cleanup_failed=true
  fi
  if container_present; then
    cleanup_failed=true
  else
    observed_status=$?
    [[ "$observed_status" -eq 1 ]] || cleanup_failed=true
  fi

  if network_present; then
    docker network rm "$NETWORK" >/dev/null 2>&1 || cleanup_failed=true
  else
    observed_status=$?
    [[ "$observed_status" -eq 1 ]] || cleanup_failed=true
  fi
  if network_present; then
    cleanup_failed=true
  else
    observed_status=$?
    [[ "$observed_status" -eq 1 ]] || cleanup_failed=true
  fi

  rm -rf "$TMP" || cleanup_failed=true
  [[ ! -e "$TMP" && ! -L "$TMP" ]] || cleanup_failed=true

  if [[ "$cleanup_failed" == true ]]; then
    printf 'WAVE10_POSTGRES_INTEGRATION_CLEANUP_AMBIGUOUS retry=prohibited\n' >&2
    [[ "$code" -ne 0 ]] || code=70
  else
    printf 'WAVE10_POSTGRES_INTEGRATION_CLEANUP_COMPLETE container=absent network=absent temp=absent\n' >&2
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

fail() {
  printf 'WAVE10_POSTGRES_INTEGRATION_ERROR %s\n' "$*" >&2
  exit 1
}

restore_database_count() {
  docker exec "$CONTAINER" psql -U postgres -d postgres -Atc \
    "SELECT count(*) FROM pg_database WHERE datname LIKE 'diis_restore_%';"
}

assert_restore_cleanup() {
  local case_name=$1 lock_dir=$2 remaining_restore_dbs
  remaining_restore_dbs=$(restore_database_count) || fail "$case_name database absence cannot be observed"
  [[ "$remaining_restore_dbs" == 0 ]] || fail "$case_name restore database leaked"
  [[ ! -e "$lock_dir" && ! -L "$lock_dir" ]] || fail "$case_name restore lock leaked"
  [[ -z "$(find "$PROOF_DIR" -maxdepth 1 -name '.diis-restore-*.ownership.*' -print -quit)" ]] \
    || fail "$case_name ownership registration leaked"
  [[ -z "$(find "$ARCHIVE_TMP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]] \
    || fail "$case_name archive-list temporary file leaked"
}

assert_proof_value() {
  local proof=$1 key=$2 expected=$3 actual
  actual=$(json_value "$key" "$proof")
  [[ "$actual" == "$expected" ]] \
    || fail "proof $key mismatch: expected=$expected actual=${actual:-missing}"
}

mkdir -m 700 "$PROOF_DIR" "$ARCHIVE_TMP_DIR" "$SIGNAL_BIN"

cat >"$SIGNAL_BIN/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

args=$*
case "$args" in
  *'CREATE DATABASE '*|*'DROP DATABASE '*)
    if [[ -n "${DOCKER_MUTATION_LOG:-}" ]]; then
      printf 'database-mutation\n' >>"$DOCKER_MUTATION_LOG"
    fi
    ;;
esac

if [[ "${SIGNAL_ON_CREATE:-0}" == 1 && "$args" == *'CREATE DATABASE '* ]]; then
  "${REAL_DOCKER:?}" "$@"
  printf 'create-complete-before-signal\n' >"${SIGNAL_BOUNDARY_MARKER:?}"
  kill -TERM "$PPID"
  exit 143
fi

exec "${REAL_DOCKER:?}" "$@"
EOF
chmod 700 "$SIGNAL_BIN/docker"

docker network create --label com.diis.restore-network=isolated-v1 "$NETWORK" >/dev/null
MSYS_NO_PATHCONV=1 docker run -d --name "$CONTAINER" --network "$NETWORK" \
  --label com.diis.restore-target=disposable-v1 \
  --label com.diis.restore-data-path=/var/lib/postgresql/data \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$PASSWORD" -e POSTGRES_DB="$DATABASE" \
  -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null

ready_samples=0
for _ in $(seq 1 120); do
  if docker exec "$CONTAINER" pg_isready -U postgres -d "$DATABASE" >/dev/null 2>&1; then
    ready_samples=$((ready_samples + 1))
    [[ "$ready_samples" -ge 3 ]] && break
  else
    ready_samples=0
  fi
  sleep 0.25
done
[[ "$ready_samples" -ge 3 ]] || fail 'PostgreSQL disposable tidak stabil'
[[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" == true ]] \
  || fail 'PostgreSQL disposable berhenti setelah readiness probe'
host_port=$(docker port "$CONTAINER" 5432/tcp | awk -F: 'NR==1 {print $NF}')
[[ "$host_port" =~ ^[0-9]+$ ]] || fail 'invalid mapped PostgreSQL port'
database_url="postgresql://postgres:${PASSWORD}@127.0.0.1:${host_port}/${DATABASE}?schema=public"

(
  cd "$ROOT"
  export DATABASE_URL="$database_url"
  npm --workspace packages/database run db:migrate
)
docker exec -i "$CONTAINER" psql -U postgres -d "$DATABASE" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE TABLE public.diis_disposable_test_marker (marker text PRIMARY KEY);
INSERT INTO public.diis_disposable_test_marker(marker) VALUES ('WAVE10_IDENTITY_DISPOSABLE_V1');
SQL

(
  cd "$ROOT"
  export WAVE10_IDENTITY_DATABASE_URL="$database_url"
  export WAVE10_IDENTITY_DATABASE_CONFIRMATION=CONFIRM_DISPOSABLE_WAVE10_IDENTITY
  npm --workspace apps/api test -- --runInBand --runTestsByPath \
    src/__tests__/users-last-super-admin-postgres.spec.ts
)

DUMP_FILE="$TMP/${BACKUP_ID}.dump"
CHECKSUM_FILE="$TMP/${BACKUP_ID}.sha256"
COMPLETION_FILE="$TMP/${BACKUP_ID}.complete.json"
OBJECT_MANIFEST_FILE="$TMP/${BACKUP_ID}.objects.tsv"
PROVENANCE_FILE="$TMP/${BACKUP_ID}.offsite-provenance.json"
docker exec "$CONTAINER" pg_dump -U postgres -d "$DATABASE" --format=custom --no-owner --no-acl \
  >"$DUMP_FILE"
DUMP_SHA=$(sha256_file "$DUMP_FILE")
DUMP_BYTES=$(wc -c <"$DUMP_FILE" | tr -d '[:space:]')
printf '%s  %s\n' "$DUMP_SHA" "$(basename "$DUMP_FILE")" >"$CHECKSUM_FILE"
printf 'diis-object-manifest-v1|%s|exact\n' "$BACKUP_ID" >"$OBJECT_MANIFEST_FILE"
OBJECT_MANIFEST_SHA=$(sha256_file "$OBJECT_MANIFEST_FILE")
OFFSITE_FINGERPRINT=$(printf '%s' 'wave10-integration-independent-crypt-v1' | sha256sum | awk '{print $1}')
TABLE_COUNT=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema');")
USER_COUNT=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc 'SELECT count(*) FROM auth.users;')
STUDENT_COUNT=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc 'SELECT count(*) FROM student.students;')
read -r total_kb free_kb < <(docker exec "$CONTAINER" sh -c \
  "df -Pk /var/lib/postgresql/data | awk 'NR==2 {print \$2, \$4}'")
[[ "$total_kb" =~ ^[0-9]+$ && "$free_kb" =~ ^[0-9]+$ ]] \
  || fail 'invalid disposable PostgreSQL capacity'
TARGET_TOTAL_BYTES=$((total_kb * 1024))
TARGET_FREE_BYTES=$((free_kb * 1024))
TARGET_PROJECTED_FREE_PERCENT=$(((TARGET_FREE_BYTES - DUMP_BYTES) * 100 / TARGET_TOTAL_BYTES))
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CREATED_EPOCH=$(date -u +%s)
DAILY_KEY=$(date -u +%Y-%m-%d)
WEEKLY_KEY=$(date -u +%G-W%V)
MONTHLY_KEY=$(date -u +%Y-%m)

cat >"$COMPLETION_FILE" <<EOF
{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"${BACKUP_ID}","class":"daily","protectionState":"none","createdAt":"${CREATED_AT}","createdEpoch":${CREATED_EPOCH},"dailyKey":"${DAILY_KEY}","weeklyKey":"${WEEKLY_KEY}","monthlyKey":"${MONTHLY_KEY}","sha256":"${DUMP_SHA}","bytes":${DUMP_BYTES},"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"${OFFSITE_FINGERPRINT}","objectStatus":"empty","objectManifestSha256":"${OBJECT_MANIFEST_SHA}","objectCount":0,"tableCount":${TABLE_COUNT},"userCount":${USER_COUNT},"studentCount":${STUDENT_COUNT},"targetTotalBytes":${TARGET_TOTAL_BYTES},"targetFreeBytes":${TARGET_FREE_BYTES},"targetProjectedFreePercent":${TARGET_PROJECTED_FREE_PERCENT}}
EOF
cat >"$PROVENANCE_FILE" <<EOF
{"schemaVersion":"diis-offsite-restore-input-v1","source":"independent-crypt","backupId":"${BACKUP_ID}","offsiteConfigFingerprint":"${OFFSITE_FINGERPRINT}","dumpSha256":"${DUMP_SHA}","dumpBytes":${DUMP_BYTES},"objectManifestSha256":"${OBJECT_MANIFEST_SHA}","objectCount":0,"dumpFile":"$(basename "$DUMP_FILE")","sidecarFile":"$(basename "$CHECKSUM_FILE")","completionFile":"$(basename "$COMPLETION_FILE")","objectManifestFile":"$(basename "$OBJECT_MANIFEST_FILE")"}
EOF
chmod 600 "$DUMP_FILE" "$CHECKSUM_FILE" "$COMPLETION_FILE" "$OBJECT_MANIFEST_FILE" "$PROVENANCE_FILE"

validate_offsite_database_inputs "$PROVENANCE_FILE" "$COMPLETION_FILE" "$DUMP_FILE" "$CHECKSUM_FILE"
validate_offsite_object_inputs "$PROVENANCE_FILE" "$COMPLETION_FILE" "$OBJECT_MANIFEST_FILE"
PROVENANCE_SHA=$(sha256_file "$PROVENANCE_FILE")

SUCCESS_PROOF="$PROOF_DIR/${BACKUP_ID}.success.restore-proof.json"
SUCCESS_LOCK="$TMP/${BACKUP_ID}.success.restore.lock"
if ! env TMPDIR="$ARCHIVE_TMP_DIR" POSTGRES_CONTAINER="$CONTAINER" POSTGRES_USER=postgres \
  DUMP_FILE="$DUMP_FILE" MANIFEST_FILE="$COMPLETION_FILE" CHECKSUM_FILE="$CHECKSUM_FILE" \
  PROVENANCE_FILE="$PROVENANCE_FILE" RESTORE_PROOF_OUTPUT="$SUCCESS_PROOF" \
  RESTORE_LOCK_DIR="$SUCCESS_LOCK" bash "$ROOT/scripts/restore-drill.sh" \
  >"$TMP/success.out" 2>"$TMP/success.err"; then
  sed -n '1,120p' "$TMP/success.err" >&2
  fail 'independent off-site restore success path failed'
fi
grep -Fq 'RESTORE_DRILL_COMPLETE' "$TMP/success.out" || fail 'restore completion marker missing'
grep -Fq 'RESTORE_DRILL_CLEANUP_OK databaseAbsent=true lockAbsent=true' "$TMP/success.err" \
  || fail 'success cleanup absence proof missing'
assert_proof_value "$SUCCESS_PROOF" schemaVersion diis-restore-proof-v2
assert_proof_value "$SUCCESS_PROOF" status success
assert_proof_value "$SUCCESS_PROOF" source independent-crypt
assert_proof_value "$SUCCESS_PROOF" backupId "$BACKUP_ID"
assert_proof_value "$SUCCESS_PROOF" sourceProvenanceSha256 "$PROVENANCE_SHA"
assert_proof_value "$SUCCESS_PROOF" dumpSha256 "$DUMP_SHA"
assert_proof_value "$SUCCESS_PROOF" objectManifestSha256 "$OBJECT_MANIFEST_SHA"
SUCCESS_PROOF_EPOCH=$(json_uint createdEpoch "$SUCCESS_PROOF")
[[ "$SUCCESS_PROOF_EPOCH" =~ ^[0-9]+$ && "$SUCCESS_PROOF_EPOCH" -gt 0 ]] \
  || fail 'success proof createdEpoch invalid'
assert_restore_cleanup success "$SUCCESS_LOCK"

INVALID_PROVENANCE="$TMP/${BACKUP_ID}.invalid.offsite-provenance.json"
sed 's/"source":"independent-crypt"/"source":"local-minio"/' \
  "$PROVENANCE_FILE" >"$INVALID_PROVENANCE"
chmod 600 "$INVALID_PROVENANCE"
INVALID_PROOF="$PROOF_DIR/${BACKUP_ID}.invalid.restore-proof.json"
INVALID_LOCK="$TMP/${BACKUP_ID}.invalid.restore.lock"
INVALID_MUTATION_LOG="$TMP/${BACKUP_ID}.invalid.mutations"
before_invalid_dbs=$(restore_database_count)
if env PATH="$SIGNAL_BIN:$PATH" REAL_DOCKER="$REAL_DOCKER" DOCKER_MUTATION_LOG="$INVALID_MUTATION_LOG" \
  TMPDIR="$ARCHIVE_TMP_DIR" POSTGRES_CONTAINER="$CONTAINER" POSTGRES_USER=postgres \
  DUMP_FILE="$DUMP_FILE" MANIFEST_FILE="$COMPLETION_FILE" CHECKSUM_FILE="$CHECKSUM_FILE" \
  PROVENANCE_FILE="$INVALID_PROVENANCE" RESTORE_PROOF_OUTPUT="$INVALID_PROOF" \
  RESTORE_LOCK_DIR="$INVALID_LOCK" bash "$ROOT/scripts/restore-drill.sh" \
  >"$TMP/invalid.out" 2>"$TMP/invalid.err"; then
  fail 'invalid restore input unexpectedly succeeded'
fi
after_invalid_dbs=$(restore_database_count)
[[ "$before_invalid_dbs" == "$after_invalid_dbs" && "$after_invalid_dbs" == 0 ]] \
  || fail 'invalid input changed disposable database state'
[[ ! -e "$INVALID_MUTATION_LOG" ]] || fail 'invalid input reached a database mutation'
grep -Fq 'restore source bukan independent crypt' "$TMP/invalid.err" \
  || fail 'invalid provenance rejection marker missing'
assert_proof_value "$INVALID_PROOF" status failed
assert_proof_value "$INVALID_PROOF" source unavailable
assert_restore_cleanup invalid "$INVALID_LOCK"

SIGNAL_PROOF="$PROOF_DIR/${BACKUP_ID}.signal.restore-proof.json"
SIGNAL_LOCK="$TMP/${BACKUP_ID}.signal.restore.lock"
SIGNAL_BOUNDARY_MARKER="$TMP/${BACKUP_ID}.signal-boundary"
if env PATH="$SIGNAL_BIN:$PATH" REAL_DOCKER="$REAL_DOCKER" SIGNAL_ON_CREATE=1 \
  SIGNAL_BOUNDARY_MARKER="$SIGNAL_BOUNDARY_MARKER" TMPDIR="$ARCHIVE_TMP_DIR" \
  POSTGRES_CONTAINER="$CONTAINER" POSTGRES_USER=postgres DUMP_FILE="$DUMP_FILE" \
  MANIFEST_FILE="$COMPLETION_FILE" CHECKSUM_FILE="$CHECKSUM_FILE" \
  PROVENANCE_FILE="$PROVENANCE_FILE" RESTORE_PROOF_OUTPUT="$SIGNAL_PROOF" \
  RESTORE_LOCK_DIR="$SIGNAL_LOCK" bash "$ROOT/scripts/restore-drill.sh" \
  >"$TMP/signal.out" 2>"$TMP/signal.err"; then
  fail 'TERM boundary restore unexpectedly succeeded'
else
  signal_rc=$?
fi
[[ "$signal_rc" -eq 143 ]] || fail "TERM boundary returned unexpected status $signal_rc"
[[ -f "$SIGNAL_BOUNDARY_MARKER" ]] || fail 'TERM boundary was not reached after database creation'
grep -Fq 'RESTORE_DRILL_CLEANUP_OK databaseAbsent=true lockAbsent=true' "$TMP/signal.err" \
  || fail 'TERM cleanup absence proof missing'
assert_proof_value "$SIGNAL_PROOF" status failed
assert_proof_value "$SIGNAL_PROOF" source independent-crypt
assert_proof_value "$SIGNAL_PROOF" backupId "$BACKUP_ID"
assert_proof_value "$SIGNAL_PROOF" sourceProvenanceSha256 "$PROVENANCE_SHA"
assert_proof_value "$SIGNAL_PROOF" dumpSha256 "$DUMP_SHA"
assert_proof_value "$SIGNAL_PROOF" objectManifestSha256 "$OBJECT_MANIFEST_SHA"
assert_restore_cleanup signal "$SIGNAL_LOCK"

printf 'WAVE10_POSTGRES_INTEGRATION_COMPLETE migrations=applied concurrency=3/3 restore=verified provenance=independent-crypt invalid=pre-mutation signal-cleanup=verified\n'

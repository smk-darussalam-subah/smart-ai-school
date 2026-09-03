#!/usr/bin/env bash

set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
POSTGRES_IMAGE='pgvector/pgvector@sha256:00ba258a66dac104fd5171074a0084462a64a1369d8513f3d0a634e2f24d15bc'
PREFIX="diis-wave10-proof-$$"
NETWORK="${PREFIX}-net"
CONTAINER="${PREFIX}-postgres"
DATABASE='diis_test_wave10_identity'
PASSWORD='synthetic-wave10-only'
TMP=$(mktemp -d)

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT HUP INT TERM

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
    [ "$ready_samples" -ge 3 ] && break
  else
    ready_samples=0
  fi
  sleep 0.25
done
[ "$ready_samples" -ge 3 ] || { echo 'PostgreSQL disposable tidak stabil' >&2; exit 1; }
[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" = true ] \
  || { echo 'PostgreSQL disposable berhenti setelah readiness probe' >&2; exit 1; }
host_port=$(docker port "$CONTAINER" 5432/tcp | awk -F: 'NR==1 {print $NF}')
[[ "$host_port" =~ ^[0-9]+$ ]] || { echo 'invalid mapped PostgreSQL port' >&2; exit 1; }
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

dump="$TMP/wave10.dump"
docker exec "$CONTAINER" pg_dump -U postgres -d "$DATABASE" --format=custom --no-owner --no-acl \
  >"$dump"
dump_sha=$(sha256sum "$dump" | awk '{print $1}')
printf '%s  wave10.dump\n' "$dump_sha" >"$TMP/wave10.sha256"
table_count=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema');")
user_count=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc 'SELECT count(*) FROM auth.users;')
student_count=$(docker exec "$CONTAINER" psql -U postgres -d "$DATABASE" -Atc 'SELECT count(*) FROM student.students;')
cat >"$TMP/wave10.complete.json" <<EOF
{"schemaVersion":"diis-backup-v1","status":"complete","offsiteStatus":"complete","sha256":"${dump_sha}","tableCount":${table_count},"userCount":${user_count},"studentCount":${student_count}}
EOF

POSTGRES_CONTAINER="$CONTAINER" POSTGRES_USER=postgres DUMP_FILE="$dump" \
  MANIFEST_FILE="$TMP/wave10.complete.json" CHECKSUM_FILE="$TMP/wave10.sha256" \
  RESTORE_PROOF_OUTPUT="$TMP/restore-proof.json" RESTORE_LOCK_DIR="$TMP/restore.lock" \
  bash "$ROOT/scripts/restore-drill.sh"
grep -Fq '"status":"success"' "$TMP/restore-proof.json"

remaining_restore_dbs=$(docker exec "$CONTAINER" psql -U postgres -d postgres -Atc \
  "SELECT count(*) FROM pg_database WHERE datname LIKE 'diis_restore_%';")
[[ "$remaining_restore_dbs" == 0 ]] || { echo 'restore database leaked' >&2; exit 1; }

printf 'WAVE10_POSTGRES_INTEGRATION_COMPLETE migrations=applied concurrency=3/3 restore=verified cleanup=verified\n'

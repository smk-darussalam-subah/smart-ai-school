#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
HELPER="$ROOT/infrastructure/deploy/compose-application.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
STAGING_COMPOSE="$ROOT/infrastructure/docker/docker-compose.staging.yml"
PLACEHOLDER='registry.invalid/diis/pg-backup@sha256:0000000000000000000000000000000000000000000000000000000000000000'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin"
cat >"$TMP/bin/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
printf 'PG_BACKUP_IMAGE=%s\n' "${PG_BACKUP_IMAGE-<unset>}" >>"$DIIS_FAKE_DOCKER_LOG"
printf 'ARGS=%s\n' "$*" >>"$DIIS_FAKE_DOCKER_LOG"
SH
chmod +x "$TMP/bin/docker"

export DIIS_FAKE_DOCKER_LOG="$TMP/docker.log"

run_approved() {
  local operation=$1
  local branch=$2
  local env_file=$3
  PATH="$TMP/bin:$PATH" bash "$HELPER" "$operation" "$branch" "$env_file" \
    >>"$TMP/app.out"
}

run_approved init-staging staging .env.staging
run_approved build-app staging .env.staging
run_approved build-app main .env
run_approved migrate staging .env.staging
run_approved migrate main .env
run_approved deploy-app staging .env.staging
run_approved deploy-app main .env

[ "$(grep -Fc "PG_BACKUP_IMAGE=$PLACEHOLDER" "$TMP/docker.log")" -eq 7 ]
grep -Fx 'ARGS=compose -p smk-staging -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging run --rm db-init-staging' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -p smk-staging -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging build --no-cache --build-arg API_URL=http://smk-staging-api:3001 api web api-migrate' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -f docker-compose.yml --env-file .env build --no-cache api web api-migrate' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -p smk-staging -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging --profile migrate run --rm --no-deps api-migrate' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -f docker-compose.yml --env-file .env --profile migrate run --rm --no-deps api-migrate' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -p smk-staging -f docker-compose.yml -f docker-compose.staging.yml --env-file .env.staging up -d --no-deps api web' "$TMP/docker.log" >/dev/null
grep -Fx 'ARGS=compose -f docker-compose.yml --env-file .env up -d --no-deps api web' "$TMP/docker.log" >/dev/null
[ "$(grep -Fc 'COMPOSE_APPLICATION_SCOPE status=backup-unselected' "$TMP/app.out")" -eq 7 ]
echo 'APPROVED_OPERATIONS_EXACT_OK'

before_lines=$(wc -l <"$TMP/docker.log")
reject_without_docker() {
  local expected_reason=$1
  shift
  set +e
  PATH="$TMP/bin:$PATH" bash "$HELPER" "$@" \
    >"$TMP/rejected.out" 2>"$TMP/rejected.err"
  local status=$?
  set -e
  [ "$status" -eq 64 ]
  grep -Fx "COMPOSE_APPLICATION_SCOPE_REJECTED reason=$expected_reason" \
    "$TMP/rejected.err" >/dev/null
  [ "$(wc -l <"$TMP/docker.log")" -eq "$before_lines" ]
}

reject_without_docker invalid-arity --project-name run stop api
reject_without_docker unsupported-branch build --push api
reject_without_docker invalid-arity up api
reject_without_docker invalid-arity deploy-app staging .env.staging extra
reject_without_docker unsupported-operation stop staging .env.staging
reject_without_docker unsupported-operation pg-backup staging .env.staging
reject_without_docker environment-file-mismatch build-app staging .env
reject_without_docker environment-file-mismatch deploy-app main .env.staging
reject_without_docker operation-branch-mismatch init-staging main .env
echo 'COMMAND_SMUGGLING_MATRIX_REJECTED_OK'

grep -F '${PG_BACKUP_IMAGE:?reviewed digest-pinned pg-backup image is required}' \
  "$COMPOSE" >/dev/null
grep -F 'PG_BACKUP_IMAGE_REFERENCE: ${PG_BACKUP_IMAGE:?reviewed digest-pinned pg-backup image is required}' \
  "$COMPOSE" >/dev/null
echo 'DIRECT_BACKUP_GUARD_RETAINED_OK'

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  : >"$TMP/empty.env"
  set +e
  docker compose --env-file "$TMP/empty.env" -f "$COMPOSE" config --services \
    >"$TMP/strict.out" 2>"$TMP/strict.err"
  strict_status=$?
  set -e
  [ "$strict_status" -ne 0 ]
  grep -F 'reviewed digest-pinned pg-backup image is required' "$TMP/strict.err" >/dev/null

  PG_BACKUP_IMAGE="$PLACEHOLDER" docker compose --env-file "$TMP/empty.env" \
    -f "$COMPOSE" config --services >"$TMP/main-configured.out" 2>"$TMP/main-configured.err"
  for service in api web pg-backup; do
    grep -Fx "$service" "$TMP/main-configured.out" >/dev/null
  done

  PG_BACKUP_IMAGE="$PLACEHOLDER" docker compose --env-file "$TMP/empty.env" \
    -p smk-staging -f "$COMPOSE" -f "$STAGING_COMPOSE" config --services \
    >"$TMP/staging-configured.out" 2>"$TMP/staging-configured.err"
  for service in api web db-init-staging pg-backup; do
    grep -Fx "$service" "$TMP/staging-configured.out" >/dev/null
  done
  PG_BACKUP_IMAGE="$PLACEHOLDER" docker compose --env-file "$TMP/empty.env" \
    -p smk-staging -f "$COMPOSE" -f "$STAGING_COMPOSE" --profile migrate \
    config --services >"$TMP/migrate-configured.out" 2>"$TMP/migrate-configured.err"
  grep -Fx 'api-migrate' "$TMP/migrate-configured.out" >/dev/null
  echo 'REAL_COMPOSE_APPLICATION_MODELS_OK'
else
  echo 'REAL_COMPOSE_APPLICATION_MODELS_SKIPPED reason=docker-compose-unavailable'
fi

echo 'COMPOSE_APPLICATION_CONTRACT_PASS cases=5'

#!/usr/bin/env bash
set -euo pipefail

UNSELECTED_BACKUP_IMAGE='registry.invalid/diis/pg-backup@sha256:0000000000000000000000000000000000000000000000000000000000000000'
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DOCKER_ROOT="$ROOT/infrastructure/docker"

reject() {
  printf 'COMPOSE_APPLICATION_SCOPE_REJECTED reason=%s\n' "$1" >&2
  exit 64
}

[ "$#" -eq 3 ] || reject 'invalid-arity'

operation=$1
branch=$2
env_file=$3

case "$branch" in
  main)
    [ "$env_file" = '.env' ] || reject 'environment-file-mismatch'
    compose_args=(-f docker-compose.yml)
    ;;
  staging)
    [ "$env_file" = '.env.staging' ] || reject 'environment-file-mismatch'
    compose_args=(-p smk-staging -f docker-compose.yml -f docker-compose.staging.yml)
    ;;
  *)
    reject 'unsupported-branch'
    ;;
esac

case "$operation" in
  init-staging)
    [ "$branch" = 'staging' ] || reject 'operation-branch-mismatch'
    command_args=(run --rm db-init-staging)
    ;;
  build-app)
    command_args=(build --no-cache)
    if [ "$branch" = 'staging' ]; then
      command_args+=(--build-arg API_URL=http://smk-staging-api:3001)
    fi
    command_args+=(api web api-migrate)
    ;;
  migrate)
    command_args=(--profile migrate run --rm --no-deps api-migrate)
    ;;
  deploy-app)
    command_args=(up -d --no-deps api web)
    ;;
  *)
    reject 'unsupported-operation'
    ;;
esac

# Compose interpolates every service before applying the selected target. This
# non-resolving placeholder unblocks application-only parsing; selecting the
# backup service is impossible through this symbolic interface and real backup
# commands retain their guard.
cd "$DOCKER_ROOT"
printf 'COMPOSE_APPLICATION_SCOPE status=backup-unselected operation=%s branch=%s\n' \
  "$operation" "$branch"
PG_BACKUP_IMAGE="$UNSELECTED_BACKUP_IMAGE" \
  exec docker compose "${compose_args[@]}" --env-file "$env_file" "${command_args[@]}"

#!/bin/bash

set -Eeuo pipefail
umask 077

REPO_DIR=${REPO_DIR:-/home/appuser/smart-ai-school}
EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}
EXPECTED_MAIN_TREE=${EXPECTED_MAIN_TREE:?EXPECTED_MAIN_TREE is required}
W10D_ATTEMPT_ID=${W10D_ATTEMPT_ID:?W10D_ATTEMPT_ID is required}
EXPECTED_MINIO_VOLUME=${EXPECTED_MINIO_VOLUME:?EXPECTED_MINIO_VOLUME is required}
ENV_FILE=${ENV_FILE:?ENV_FILE is required}
CANDIDATE_CONFIRMATION=${CANDIDATE_CONFIRMATION:-}
HOST_LOCK=${HOST_LOCK:-/home/appuser/.local/state/diis-deploy/deploy.lock}
BACKUP_WRITER_LOCK=${BACKUP_WRITER_LOCK:-/var/lock/diis-backup/backup.lock}
CANDIDATE_CONTAINER=smk-pg-backup-candidate
LEGACY_TOOL_VOLUME=docker_backup_bin
EXPECTED_IMAGE='postgres:16.4-alpine3.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c'

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ "$CANDIDATE_CONFIRMATION" = CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE ] \
  || die "exact candidate confirmation is required"
[[ "$W10D_ATTEMPT_ID" =~ ^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$ ]] \
  || die "attempt ID invalid"
[[ "$EXPECTED_MINIO_VOLUME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]] \
  || die "MinIO volume name invalid"
candidate_tool_volume="diis-backup-bin-${W10D_ATTEMPT_ID}"
project_name="diis-${W10D_ATTEMPT_ID}"
[ "$candidate_tool_volume" != "$LEGACY_TOOL_VOLUME" ] || die "legacy tool volume is forbidden"
case "$ENV_FILE" in /*) ;; *) die "ENV_FILE must be absolute" ;; esac
[ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || die "ENV_FILE unavailable"
[ "$(stat -c '%a' "$ENV_FILE")" = 600 ] || die "ENV_FILE mode must be 0600"

for command in docker git flock stat; do
  command -v "$command" >/dev/null 2>&1 || die "$command unavailable"
done
cd "$REPO_DIR"
[ "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA" ] || die "checkout SHA mismatch"
[ "$(git rev-parse HEAD^{tree})" = "$EXPECTED_MAIN_TREE" ] || die "checkout tree mismatch"
[ -z "$(git status --porcelain --untracked-files=normal)" ] || die "checkout is not clean"

base_compose="$REPO_DIR/infrastructure/docker/docker-compose.yml"
candidate_compose="$REPO_DIR/infrastructure/docker/docker-compose.backup-candidate.yml"
backup_lib="$REPO_DIR/infrastructure/docker/scripts/backup-lib.sh"
[ -f "$base_compose" ] && [ -f "$candidate_compose" ] && [ -f "$backup_lib" ] \
  || die "reviewed candidate source unavailable"

mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || die "production host lock is already held"
# shellcheck source=../docker/scripts/backup-lib.sh
source "$backup_lib"

created=0
backup_lock_acquired=0
container_absent() {
  listing=$(docker container ls --all --no-trunc \
    --filter "name=^/${CANDIDATE_CONTAINER}$" --format '{{.Names}}') || return 2
  [ -z "$listing" ]
}
volume_absent() {
  listing=$(docker volume ls --filter "name=^${candidate_tool_volume}$" --format '{{.Name}}') \
    || return 2
  [ -z "$listing" ]
}
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if (( code != 0 && created == 1 )); then
    if docker container inspect "$CANDIDATE_CONTAINER" >/dev/null 2>&1; then
      actual_attempt=$(docker container inspect --format '{{index .Config.Labels "com.diis.w10d.attempt"}}' "$CANDIDATE_CONTAINER" 2>/dev/null)
      if [ "$actual_attempt" = "$W10D_ATTEMPT_ID" ]; then
        docker rm --force "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || cleanup_failed=1
      else
        cleanup_failed=1
      fi
    fi
    container_absent || cleanup_failed=1
    volume_absent
    presence_rc=$?
    if [ "$presence_rc" -ne 0 ]; then
      if [ "$presence_rc" -eq 1 ]; then
        docker volume rm "$candidate_tool_volume" >/dev/null 2>&1 || cleanup_failed=1
      else
        cleanup_failed=1
      fi
    fi
    volume_absent || cleanup_failed=1
  fi
  if (( backup_lock_acquired == 1 )); then
    release_directory_lock "$BACKUP_WRITER_LOCK" >/dev/null 2>&1 || cleanup_failed=1
    [ ! -e "$BACKUP_WRITER_LOCK" ] || cleanup_failed=1
  fi
  if (( cleanup_failed == 1 )); then
    printf 'CANDIDATE_CLEANUP_AMBIGUOUS attemptId=%s retry=prohibited\n' "$W10D_ATTEMPT_ID" >&2
    code=78
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

acquire_directory_lock "$BACKUP_WRITER_LOCK"
backup_lock_acquired=1
if container_absent; then
  :
else
  observation_rc=$?
  if (( observation_rc == 1 )); then
    die "candidate container already exists"
  fi
  printf 'CANDIDATE_PRECREATE_OBSERVATION_AMBIGUOUS resource=container retry=prohibited\n' >&2
  exit 78
fi
if volume_absent; then
  :
else
  observation_rc=$?
  if (( observation_rc == 1 )); then
    die "candidate tool volume already exists"
  fi
  printf 'CANDIDATE_PRECREATE_OBSERVATION_AMBIGUOUS resource=volume retry=prohibited\n' >&2
  exit 78
fi
docker volume inspect "$LEGACY_TOOL_VOLUME" >/dev/null 2>&1 \
  || die "legacy tool volume unavailable for no-touch proof"
docker volume inspect "$EXPECTED_MINIO_VOLUME" >/dev/null 2>&1 \
  || die "approved MinIO source volume unavailable"

export CANDIDATE_BACKUP_BIN_VOLUME_NAME="$candidate_tool_volume"
export CANDIDATE_MINIO_DATA_VOLUME_NAME="$EXPECTED_MINIO_VOLUME"
export W10D_ATTEMPT_ID
docker compose --project-name "$project_name" --env-file "$ENV_FILE" \
  -f "$base_compose" -f "$candidate_compose" config --quiet
created=1
docker compose --project-name "$project_name" --env-file "$ENV_FILE" \
  -f "$base_compose" -f "$candidate_compose" up --detach --no-deps --no-build --pull never pg-backup

[ "$(docker container inspect --format '{{.Config.Image}}' "$CANDIDATE_CONTAINER")" = "$EXPECTED_IMAGE" ] \
  || die "candidate image mismatch"
[ "$(docker container inspect --format '{{index .Config.Labels "com.diis.w10d.attempt"}}' "$CANDIDATE_CONTAINER")" = "$W10D_ATTEMPT_ID" ] \
  || die "candidate attempt label mismatch"
actual_tool_volume=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/opt/backup-bin"}}{{.Name}}{{end}}{{end}}' \
  "$CANDIDATE_CONTAINER")
[ "$actual_tool_volume" = "$candidate_tool_volume" ] \
  || die "candidate tool volume is not attempt-specific"
[ "$actual_tool_volume" != "$LEGACY_TOOL_VOLUME" ] || die "legacy tool volume was mounted"
actual_minio_volume=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lib/diis-minio-target"}}{{.Name}}{{end}}{{end}}' \
  "$CANDIDATE_CONTAINER")
[ "$actual_minio_volume" = "$EXPECTED_MINIO_VOLUME" ] || die "MinIO source volume mismatch"
for binding in 'BACKUP_SCHEDULE_ENABLED=0' 'BACKUP_BUCKET_CREATION_ALLOWED=0' 'OFFSITE_RETENTION_APPLY=0'; do
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CANDIDATE_CONTAINER" \
    | grep -Fqx "$binding" || die "candidate safety binding mismatch"
done

printf 'CANDIDATE_READY attemptId=%s project=%s toolVolume=%s schedule=0 bucketCreate=0 retention=0\n' \
  "$W10D_ATTEMPT_ID" "$project_name" "$candidate_tool_volume"

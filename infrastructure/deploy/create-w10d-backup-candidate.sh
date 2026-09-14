#!/bin/bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEST_BOUNDARY="$SCRIPT_DIR/../../scripts/w10d-test-boundary.sh"
[ -f "$TEST_BOUNDARY" ] && [ ! -L "$TEST_BOUNDARY" ] || { printf 'ERROR: test boundary unavailable\n' >&2; exit 1; }
# shellcheck source=../../scripts/w10d-test-boundary.sh
. "$TEST_BOUNDARY"

REPO_DIR=${REPO_DIR:-/home/appuser/smart-ai-school}
EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}
EXPECTED_MAIN_TREE=${EXPECTED_MAIN_TREE:?EXPECTED_MAIN_TREE is required}
W10D_ATTEMPT_ID=${W10D_ATTEMPT_ID:?W10D_ATTEMPT_ID is required}
EXPECTED_MINIO_VOLUME=${EXPECTED_MINIO_VOLUME:?EXPECTED_MINIO_VOLUME is required}
EXPECTED_CANDIDATE_IMAGE=${EXPECTED_CANDIDATE_IMAGE:?EXPECTED_CANDIDATE_IMAGE is required}
EXPECTED_CANDIDATE_IMAGE_ID=${EXPECTED_CANDIDATE_IMAGE_ID:?EXPECTED_CANDIDATE_IMAGE_ID is required}
ENV_FILE=${ENV_FILE:?ENV_FILE is required}
SERVICE_ACCOUNT_EVIDENCE_OUTPUT=${SERVICE_ACCOUNT_EVIDENCE_OUTPUT:?SERVICE_ACCOUNT_EVIDENCE_OUTPUT is required}
EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256=${EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256:?expected Service Account principal hash is required}
EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256=${EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256:?expected Service Account project hash is required}
EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256=${EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256:?expected Service Account key hash is required}
EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256=${EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256:?expected Service Account artifact hash is required}
EXPECTED_OFFSITE_CONFIG_FINGERPRINT=${EXPECTED_OFFSITE_CONFIG_FINGERPRINT:?expected off-site fingerprint is required}
EXPECTED_OFFSITE_PROVIDER=${EXPECTED_OFFSITE_PROVIDER:?expected off-site provider is required}
EXPECTED_OFFSITE_ORIGIN=${EXPECTED_OFFSITE_ORIGIN:?expected off-site origin is required}
EXPECTED_TEAM_DRIVE_SHA256=${EXPECTED_TEAM_DRIVE_SHA256:?expected Shared Drive hash is required}
EXPECTED_ROOT_FOLDER_SHA256=${EXPECTED_ROOT_FOLDER_SHA256:?expected Shared Drive root hash is required}
CANDIDATE_CONFIRMATION=${CANDIDATE_CONFIRMATION:-}
BACKUP_WRITER_LOCK=${BACKUP_WRITER_LOCK:-/var/lock/diis-backup/backup.lock}
CANDIDATE_CONTAINER=smk-pg-backup-candidate
LEGACY_TOOL_VOLUME=docker_backup_bin

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
w10d_init_test_boundary || die "test root is not one canonical private direct child of /tmp"
w10d_bind_host_lock /home/appuser/.local/state/diis-deploy/deploy.lock \
  || die "host lock must use canonical production identity or confined test override"
if [ "$W10D_TEST_MODE" = 0 ]; then
  for value in "${ALLOW_TEST_BACKUP_LOCK_PATH:-}" "${ALLOW_TEST_CREDENTIAL_PATH:-}"; do
    w10d_no_test_value "$value" || die "test control forbidden in production mode"
  done
  [ -z "${TEST_BACKUP_LOCK_HOST_PATH:-}" ] && [ -z "${TEST_BACKUP_WRITER_LOCK:-}" ] \
    || die "test path forbidden in production mode"
else
  [ "${ALLOW_TEST_BACKUP_LOCK_PATH:-0}" = 1 ] \
    && [ "${ALLOW_TEST_CREDENTIAL_PATH:-0}" = 1 ] \
    || die "explicit test confirmations are required"
  for path in "$REPO_DIR" "$HOST_LOCK" "$BACKUP_WRITER_LOCK" "$ENV_FILE" \
    "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT" "${SERVICE_ACCOUNT_HOST_FILE:-}" \
    "${TEST_BACKUP_LOCK_HOST_PATH:-}" "${TEST_BACKUP_WRITER_LOCK:-}"; do
    w10d_test_path_confined "$path" || die "test path escapes canonical private test root"
  done
fi
[ "$CANDIDATE_CONFIRMATION" = CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE ] \
  || die "exact candidate confirmation is required"
[[ "$W10D_ATTEMPT_ID" =~ ^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$ ]] \
  || die "attempt ID invalid"
[[ "$EXPECTED_MINIO_VOLUME" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]] \
  || die "MinIO volume name invalid"
[[ "$EXPECTED_CANDIDATE_IMAGE" =~ ^[a-z0-9]+([._-][a-z0-9]+)*([:/][a-z0-9]+([._-][a-z0-9]+)*)*@sha256:[a-f0-9]{64}$ ]] \
  || die "candidate image reference must be one immutable name@sha256 digest"
[[ "$EXPECTED_CANDIDATE_IMAGE_ID" =~ ^sha256:[a-f0-9]{64}$ ]] \
  || die "candidate image ID must be one immutable sha256 ID"
if [ -n "${PG_BACKUP_IMAGE+x}" ] && [ "$PG_BACKUP_IMAGE" != "$EXPECTED_CANDIDATE_IMAGE" ]; then
  die "inherited PG_BACKUP_IMAGE does not match reviewed candidate image"
fi
PG_BACKUP_IMAGE=$EXPECTED_CANDIDATE_IMAGE
export PG_BACKUP_IMAGE
candidate_tool_volume="diis-backup-bin-${W10D_ATTEMPT_ID}"
project_name="diis-${W10D_ATTEMPT_ID}"
[ "$candidate_tool_volume" != "$LEGACY_TOOL_VOLUME" ] || die "legacy tool volume is forbidden"
[ "$EXPECTED_OFFSITE_PROVIDER" = google ] || die "off-site provider binding invalid"
[ "$EXPECTED_OFFSITE_ORIGIN" = provider-default ] || die "off-site origin binding invalid"
case "$ENV_FILE" in /*) ;; *) die "ENV_FILE must be absolute" ;; esac
[ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || die "ENV_FILE unavailable"
[ "$(stat -c '%a' "$ENV_FILE")" = 600 ] || die "ENV_FILE mode must be 0600"
case "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT" in /*) ;; *) die "Service Account evidence path must be absolute" ;; esac
[ ! -e "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT" ] || die "Service Account evidence output already exists"
[ -d "$(dirname "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT")" ] \
  && [ ! -L "$(dirname "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT")" ] \
  && [ "$(stat -c '%a:%u' "$(dirname "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT")")" = "700:$(id -u)" ] \
  || die "Service Account evidence directory must be private"
[ "$(id -u)" = 0 ] || die "candidate credential preflight requires exact privileged gate"

for command in docker git flock stat id python3 sha256sum; do
  command -v "$command" >/dev/null 2>&1 || die "$command unavailable"
done
for binding_hash in "$EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256" \
  "$EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256" "$EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256" \
  "$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256" "$EXPECTED_OFFSITE_CONFIG_FINGERPRINT" \
  "$EXPECTED_TEAM_DRIVE_SHA256" "$EXPECTED_ROOT_FOLDER_SHA256"; do
  [[ "$binding_hash" =~ ^[a-f0-9]{64}$ ]] || die "candidate binding hash invalid"
done
lock_parent=$(dirname "$BACKUP_WRITER_LOCK")
[ "$BACKUP_WRITER_LOCK" = /var/lock/diis-backup/backup.lock ] \
  || { [ "$W10D_TEST_MODE" = 1 ] \
    && [ "${ALLOW_TEST_BACKUP_LOCK_PATH:-0}" = 1 ] \
    && [ "${TEST_BACKUP_LOCK_HOST_PATH:-}" = "$lock_parent" ] \
    && [ "${TEST_BACKUP_WRITER_LOCK:-}" = "$BACKUP_WRITER_LOCK" ] \
    && w10d_test_path_confined "$BACKUP_WRITER_LOCK" \
    && w10d_test_path_confined "$REPO_DIR"; } \
  || die "backup writer lock must use canonical production identity"
[ -d "$lock_parent" ] && [ ! -L "$lock_parent" ] || die "backup lock bootstrap unavailable"
if [ "$lock_parent" = /var/lock/diis-backup ]; then
  [ "$(readlink -f "$lock_parent")" = /run/lock/diis-backup ] \
    || die "backup lock bootstrap canonical path mismatch"
  app_uid=$(id -u appuser 2>/dev/null) || die "appuser identity unavailable"
  app_gid=$(id -g appuser 2>/dev/null) || die "appuser group unavailable"
  [ "$(stat -c '%a:%u:%g' "$lock_parent")" = "750:$app_uid:$app_gid" ] \
    || die "backup lock bootstrap metadata mismatch"
fi
cd "$REPO_DIR"
[ "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA" ] || die "checkout SHA mismatch"
[ "$(git rev-parse HEAD^{tree})" = "$EXPECTED_MAIN_TREE" ] || die "checkout tree mismatch"
[ -z "$(git status --porcelain --untracked-files=normal)" ] || die "checkout is not clean"

base_compose="$REPO_DIR/infrastructure/docker/docker-compose.yml"
candidate_compose="$REPO_DIR/infrastructure/docker/docker-compose.backup-candidate.yml"
backup_lib="$REPO_DIR/infrastructure/docker/scripts/backup-lib.sh"
service_account_parser="$REPO_DIR/scripts/google-service-account-binding.py"
service_account_file=${SERVICE_ACCOUNT_HOST_FILE:-/etc/diis/google-service-account.json}
[ "$service_account_file" = /etc/diis/google-service-account.json ] \
  || { [ "$W10D_TEST_MODE" = 1 ] && [ "${ALLOW_TEST_CREDENTIAL_PATH:-0}" = 1 ] \
    && w10d_test_path_confined "$service_account_file"; } \
  || die "Service Account host path must be canonical"
[ -f "$base_compose" ] && [ -f "$candidate_compose" ] && [ -f "$backup_lib" ] \
  && [ -f "$service_account_parser" ] && [ ! -L "$service_account_parser" ] \
  || die "reviewed candidate source unavailable"

mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || die "production host lock is already held"
# shellcheck source=../docker/scripts/backup-lib.sh
source "$backup_lib"
BACKUP_LOCK_BOOTSTRAP_REQUIRED=1
export BACKUP_LOCK_BOOTSTRAP_REQUIRED

created=0
backup_lock_acquired=0
service_account_evidence_published=0
service_account_candidate_owned=0
service_account_candidate="${SERVICE_ACCOUNT_EVIDENCE_OUTPUT}.candidate.$$"
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
  if (( code != 0 )); then
    if (( service_account_candidate_owned == 1 )); then
      [ -f "$service_account_candidate" ] && [ ! -L "$service_account_candidate" ] \
        && [ "$(stat -c '%u' "$service_account_candidate")" = "$(id -u)" ] \
        || cleanup_failed=1
      rm -f -- "$service_account_candidate" || cleanup_failed=1
      [ ! -e "$service_account_candidate" ] || cleanup_failed=1
    fi
    if (( service_account_evidence_published == 1 )); then
      rm -f -- "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT" || cleanup_failed=1
      [ ! -e "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT" ] || cleanup_failed=1
    fi
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

( set -C; : >"$service_account_candidate" ) || die "Service Account candidate ownership unavailable"
service_account_candidate_owned=1
chmod 600 "$service_account_candidate"
python3 "$service_account_parser" "$service_account_file" --expected-path "$service_account_file" \
  >"$service_account_candidate" || die "Service Account artifact rejected"
chmod 600 "$service_account_candidate"
python3 - "$service_account_candidate" \
  "$EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256" "$EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256" \
  "$EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256" "$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256" <<'PY' \
  || die "Service Account identity binding mismatch"
import json, sys
value=json.load(open(sys.argv[1], encoding="utf-8"))
if value.get("schemaVersion") != "diis-google-service-account-binding-v1": raise SystemExit(1)
if value.get("authMode") != "service-account-file": raise SystemExit(1)
if [value.get(key) for key in ("principalSha256","projectSha256","keyIdentitySha256","credentialArtifactSha256")] != sys.argv[2:]: raise SystemExit(1)
PY

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
local_candidate_image_id=$(docker image inspect --format '{{.Id}}' "$EXPECTED_CANDIDATE_IMAGE") \
  || die "reviewed candidate image unavailable"
[ "$local_candidate_image_id" = "$EXPECTED_CANDIDATE_IMAGE_ID" ] \
  || die "reviewed candidate image ID mismatch"

export CANDIDATE_BACKUP_BIN_VOLUME_NAME="$candidate_tool_volume"
export CANDIDATE_MINIO_DATA_VOLUME_NAME="$EXPECTED_MINIO_VOLUME"
export BACKUP_LOCK_HOST_PATH="$lock_parent"
export W10D_ATTEMPT_ID
export EXPECTED_OFFSITE_CONFIG_FINGERPRINT EXPECTED_OFFSITE_PROVIDER EXPECTED_OFFSITE_ORIGIN
export EXPECTED_TEAM_DRIVE_SHA256 EXPECTED_ROOT_FOLDER_SHA256
export EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256 EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256
export EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256 EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256
docker compose --project-name "$project_name" --env-file "$ENV_FILE" \
  -f "$base_compose" -f "$candidate_compose" config --quiet
created=1
docker compose --project-name "$project_name" --env-file "$ENV_FILE" \
  -f "$base_compose" -f "$candidate_compose" up --detach --no-deps --no-build --pull never pg-backup

credential_source=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/diis-secrets/google-service-account.json"}}{{.Source}}{{end}}{{end}}' \
  "$CANDIDATE_CONTAINER")
credential_rw=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/diis-secrets/google-service-account.json"}}{{.RW}}{{end}}{{end}}' \
  "$CANDIDATE_CONTAINER")
[ "$credential_source" = "$service_account_file" ] && [ "$credential_rw" = false ] \
  || die "candidate Service Account mount mismatch"
mounted_credential_sha=$(docker exec "$CANDIDATE_CONTAINER" \
  sha256sum /run/diis-secrets/google-service-account.json | awk '{print $1}')
[ "$mounted_credential_sha" = "$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256" ] \
  || die "candidate Service Account artifact drift"

[ "$(docker container inspect --format '{{.Config.Image}}' "$CANDIDATE_CONTAINER")" = "$EXPECTED_CANDIDATE_IMAGE" ] \
  || die "candidate image reference mismatch"
[ "$(docker container inspect --format '{{.Image}}' "$CANDIDATE_CONTAINER")" = "$EXPECTED_CANDIDATE_IMAGE_ID" ] \
  || die "candidate image ID mismatch"
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
actual_lock_source=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lock/diis-backup"}}{{.Source}}{{end}}{{end}}' \
  "$CANDIDATE_CONTAINER")
[ "$actual_lock_source" = "$lock_parent" ] || die "candidate canonical writer lock mount mismatch"
for binding in 'BACKUP_SCHEDULE_ENABLED=0' 'BACKUP_BUCKET_CREATION_ALLOWED=0' \
  'OFFSITE_RETENTION_APPLY=0' 'BACKUP_LOCK_BOOTSTRAP_REQUIRED=1' \
  'BACKUP_LOCK_DIR=/var/lock/diis-backup/backup.lock'; do
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CANDIDATE_CONTAINER" \
    | grep -Fqx "$binding" || die "candidate safety binding mismatch"
done
for expected_binding in \
  "OFFSITE_CONFIG_FINGERPRINT=$EXPECTED_OFFSITE_CONFIG_FINGERPRINT" \
  "OFFSITE_EXPECTED_PROVIDER=$EXPECTED_OFFSITE_PROVIDER" \
  "OFFSITE_EXPECTED_ORIGIN=$EXPECTED_OFFSITE_ORIGIN" \
  "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256=$EXPECTED_TEAM_DRIVE_SHA256" \
  "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256=$EXPECTED_ROOT_FOLDER_SHA256" \
  "OFFSITE_EXPECTED_AUTH_MODE=service-account-file" \
  "OFFSITE_EXPECTED_PRINCIPAL_SHA256=$EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256" \
  "OFFSITE_EXPECTED_PROJECT_SHA256=$EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256" \
  "OFFSITE_EXPECTED_KEY_IDENTITY_SHA256=$EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256" \
  "OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256=$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256"; do
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CANDIDATE_CONTAINER" \
    | grep -Fqx "$expected_binding" || die "candidate recovery binding mismatch"
done

mv "$service_account_candidate" "$SERVICE_ACCOUNT_EVIDENCE_OUTPUT"
service_account_candidate_owned=0
service_account_evidence_published=1

printf 'CANDIDATE_READY attemptId=%s project=%s toolVolume=%s schedule=0 bucketCreate=0 retention=0 serviceAccountBinding=verified\n' \
  "$W10D_ATTEMPT_ID" "$project_name" "$candidate_tool_volume"

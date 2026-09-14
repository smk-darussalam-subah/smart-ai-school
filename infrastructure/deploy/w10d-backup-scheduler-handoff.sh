#!/bin/bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEST_BOUNDARY="$SCRIPT_DIR/../../scripts/w10d-test-boundary.sh"
[ -f "$TEST_BOUNDARY" ] && [ ! -L "$TEST_BOUNDARY" ] || { printf 'ERROR: test boundary unavailable\n' >&2; exit 1; }
# shellcheck source=../../scripts/w10d-test-boundary.sh
. "$TEST_BOUNDARY"

LEGACY_CONTAINER=${LEGACY_CONTAINER:-smk-pg-backup}
CANDIDATE_CONTAINER=${CANDIDATE_CONTAINER:-smk-pg-backup-candidate}
LEGACY_HOLD_NAME=${LEGACY_HOLD_NAME:?LEGACY_HOLD_NAME is required}
ROLLBACK_DIR=${ROLLBACK_DIR:?ROLLBACK_DIR is required}
REPO_DIR=${REPO_DIR:-/home/appuser/smart-ai-school}
BACKUP_WRITER_LOCK=${BACKUP_WRITER_LOCK:-/var/lock/diis-backup/backup.lock}
HANDOFF_CONFIRMATION=${HANDOFF_CONFIRMATION:-}
EXPECTED_CANDIDATE_IMAGE=${EXPECTED_CANDIDATE_IMAGE:?EXPECTED_CANDIDATE_IMAGE is required}
EXPECTED_CANDIDATE_IMAGE_ID=${EXPECTED_CANDIDATE_IMAGE_ID:?EXPECTED_CANDIDATE_IMAGE_ID is required}
EXPECTED_CANDIDATE_TOOL_VOLUME=${EXPECTED_CANDIDATE_TOOL_VOLUME:?EXPECTED_CANDIDATE_TOOL_VOLUME is required}
EXPECTED_MINIO_VOLUME=${EXPECTED_MINIO_VOLUME:?EXPECTED_MINIO_VOLUME is required}
EXPECTED_BACKUP_LOCK_HOST_PATH=${EXPECTED_BACKUP_LOCK_HOST_PATH:?EXPECTED_BACKUP_LOCK_HOST_PATH is required}
EXPECTED_OFFSITE_PROVIDER=${EXPECTED_OFFSITE_PROVIDER:?EXPECTED_OFFSITE_PROVIDER is required}
EXPECTED_OFFSITE_ORIGIN=${EXPECTED_OFFSITE_ORIGIN:?EXPECTED_OFFSITE_ORIGIN is required}
EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}
EXPECTED_MAIN_TREE=${EXPECTED_MAIN_TREE:?EXPECTED_MAIN_TREE is required}
ACCEPTANCE_BUNDLE=${ACCEPTANCE_BUNDLE:?ACCEPTANCE_BUNDLE is required}
EXPECTED_ACCEPTANCE_BUNDLE_SHA256=${EXPECTED_ACCEPTANCE_BUNDLE_SHA256:?EXPECTED_ACCEPTANCE_BUNDLE_SHA256 is required}
ROOT_CRON_EVIDENCE=${ROOT_CRON_EVIDENCE:?ROOT_CRON_EVIDENCE is required}
MANUAL_BACKUP_MANIFEST=${MANUAL_BACKUP_MANIFEST:?MANUAL_BACKUP_MANIFEST is required}
MANUAL_BACKUP_SIDECAR=${MANUAL_BACKUP_SIDECAR:?MANUAL_BACKUP_SIDECAR is required}
OFFSITE_PROVENANCE=${OFFSITE_PROVENANCE:?OFFSITE_PROVENANCE is required}
DB_RESTORE_PROOF=${DB_RESTORE_PROOF:?DB_RESTORE_PROOF is required}
OBJECT_RESTORE_PROOF=${OBJECT_RESTORE_PROOF:?OBJECT_RESTORE_PROOF is required}
TOOL_EVIDENCE=${TOOL_EVIDENCE:?TOOL_EVIDENCE is required}
SERVICE_ACCOUNT_EVIDENCE=${SERVICE_ACCOUNT_EVIDENCE:?SERVICE_ACCOUNT_EVIDENCE is required}
REDACT_HELPER="$REPO_DIR/scripts/docker-container-redacted-manifest.py"
ACCEPTANCE_HELPER="$REPO_DIR/scripts/validate-w10d-candidate-acceptance.py"
COMPLETION_LIBRARY="$REPO_DIR/scripts/w10d_completion_validation.py"
TOOL_CAPTURE_HELPER="$REPO_DIR/scripts/capture-w10d-candidate-tool-evidence.sh"
SERVICE_ACCOUNT_HELPER="$REPO_DIR/scripts/google-service-account-binding.py"
SERVICE_ACCOUNT_HOST_FILE=${SERVICE_ACCOUNT_HOST_FILE:-/etc/diis/google-service-account.json}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
w10d_init_test_boundary || die "test root is not one canonical private direct child of /tmp"
w10d_bind_host_lock /home/appuser/.local/state/diis-deploy/deploy.lock \
  || die "host lock must use canonical production identity or confined test override"
for value in "${DIIS_ACCEPTANCE_TEST_MODE:-}" "${DIIS_ACCEPTANCE_TEST_PAUSE_MARKER:-}" \
  "${DIIS_ACCEPTANCE_TEST_PAUSE_RELEASE:-}"; do
  w10d_no_test_value "$value" || die "inherited acceptance test control forbidden"
done
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
  for path in "$REPO_DIR" "$HOST_LOCK" "$BACKUP_WRITER_LOCK" "$ROLLBACK_DIR" \
    "$SERVICE_ACCOUNT_HOST_FILE" "$ACCEPTANCE_BUNDLE" "$ROOT_CRON_EVIDENCE" \
    "$MANUAL_BACKUP_MANIFEST" "$MANUAL_BACKUP_SIDECAR" "$OFFSITE_PROVENANCE" \
    "$DB_RESTORE_PROOF" "$OBJECT_RESTORE_PROOF" "$TOOL_EVIDENCE" \
    "$SERVICE_ACCOUNT_EVIDENCE" "${TEST_BACKUP_LOCK_HOST_PATH:-}" \
    "${TEST_BACKUP_WRITER_LOCK:-}"; do
    w10d_test_path_confined "$path" || die "test path escapes canonical private test root"
  done
fi
[ "$SERVICE_ACCOUNT_HOST_FILE" = /etc/diis/google-service-account.json ] \
  || { [ "$W10D_TEST_MODE" = 1 ] && [ "${ALLOW_TEST_CREDENTIAL_PATH:-0}" = 1 ] \
    && w10d_test_path_confined "$SERVICE_ACCOUNT_HOST_FILE"; } \
  || die "Service Account host path must be canonical"
safe_name() { [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$ ]]; }
for name in "$LEGACY_CONTAINER" "$CANDIDATE_CONTAINER" "$LEGACY_HOLD_NAME" \
  "$EXPECTED_CANDIDATE_TOOL_VOLUME" "$EXPECTED_MINIO_VOLUME"; do
  safe_name "$name" || die "runtime resource name invalid"
done
[ "$LEGACY_HOLD_NAME" != "$LEGACY_CONTAINER" ] || die "legacy hold name must differ"
[ "$LEGACY_HOLD_NAME" != "$CANDIDATE_CONTAINER" ] || die "legacy hold name must differ"
[ "$EXPECTED_CANDIDATE_TOOL_VOLUME" != docker_backup_bin ] || die "legacy tool volume forbidden"
[ "$HANDOFF_CONFIRMATION" = HANDOFF_EXACT_W10D_BACKUP_SCHEDULER_ONCE ] \
  || die "exact scheduler handoff confirmation is required"
case "$ROLLBACK_DIR" in /*) ;; *) die "rollback directory must be absolute" ;; esac
case "$EXPECTED_BACKUP_LOCK_HOST_PATH" in /*) ;; *) die "backup lock host path must be absolute" ;; esac
[ "$BACKUP_WRITER_LOCK" = "$EXPECTED_BACKUP_LOCK_HOST_PATH/backup.lock" ] \
  || die "backup writer lock binding mismatch"
if [ "$EXPECTED_BACKUP_LOCK_HOST_PATH" != /var/lock/diis-backup ]; then
  [ "$W10D_TEST_MODE" = 1 ] \
    && [ "${ALLOW_TEST_BACKUP_LOCK_PATH:-0}" = 1 ] \
    && [ "${TEST_BACKUP_LOCK_HOST_PATH:-}" = "$EXPECTED_BACKUP_LOCK_HOST_PATH" ] \
    && [ "${TEST_BACKUP_WRITER_LOCK:-}" = "$BACKUP_WRITER_LOCK" ] \
    && [[ "$EXPECTED_BACKUP_LOCK_HOST_PATH:$REPO_DIR" == /tmp/*:/tmp/* ]] \
    || die "backup writer lock must use canonical production identity"
fi
[ "$EXPECTED_OFFSITE_PROVIDER" = google ] || die "off-site provider binding invalid"
[ "$EXPECTED_OFFSITE_ORIGIN" = provider-default ] || die "off-site origin binding invalid"
[ -d "$ROLLBACK_DIR" ] || die "rollback directory unavailable"
[ ! -L "$ROLLBACK_DIR" ] && [ "$(stat -c '%a:%u' "$ROLLBACK_DIR")" = "700:$(id -u)" ] \
  || die "rollback directory owner or mode invalid"
[ -z "$(find "$ROLLBACK_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] \
  || die "rollback directory must be empty"

for path in "$ACCEPTANCE_BUNDLE" "$ROOT_CRON_EVIDENCE" "$MANUAL_BACKUP_MANIFEST" "$MANUAL_BACKUP_SIDECAR" \
  "$OFFSITE_PROVENANCE" "$DB_RESTORE_PROOF" "$OBJECT_RESTORE_PROOF" "$TOOL_EVIDENCE" \
  "$SERVICE_ACCOUNT_EVIDENCE"; do
  [ -f "$path" ] && [ ! -L "$path" ] || die "required evidence file unavailable"
  [ "$(stat -c '%a' "$path")" = 600 ] || die "evidence file mode must be 0600"
  evidence_parent=$(dirname "$path")
  [ -d "$evidence_parent" ] && [ ! -L "$evidence_parent" ] \
    && [ "$(stat -c '%a:%u' "$evidence_parent")" = "700:$(id -u)" ] \
    || die "evidence parent owner or mode invalid"
done
for command in docker flock pgrep sha256sum stat find python3 git cmp id readlink sort xargs; do
  command -v "$command" >/dev/null 2>&1 || die "$command unavailable"
done
[ -f "$REDACT_HELPER" ] || die "redacted rollback helper unavailable"
[ -f "$ACCEPTANCE_HELPER" ] || die "candidate acceptance helper unavailable"
[ -f "$COMPLETION_LIBRARY" ] && [ ! -L "$COMPLETION_LIBRARY" ] \
  || die "strict completion library unavailable"
[ -f "$TOOL_CAPTURE_HELPER" ] || die "candidate tool capture helper unavailable"
[ -f "$SERVICE_ACCOUNT_HELPER" ] && [ ! -L "$SERVICE_ACCOUNT_HELPER" ] \
  || die "Service Account binding helper unavailable"
[ "$(id -u)" = 0 ] || die "handoff credential revalidation requires exact privileged gate"
lock_parent=$(dirname "$BACKUP_WRITER_LOCK")
[ -d "$lock_parent" ] && [ ! -L "$lock_parent" ] || die "backup lock bootstrap unavailable"
if [ "$lock_parent" = /var/lock/diis-backup ]; then
  app_uid=$(id -u appuser 2>/dev/null) || die "appuser identity unavailable"
  app_gid=$(id -g appuser 2>/dev/null) || die "appuser group unavailable"
  [ "$(readlink -f "$lock_parent")" = /run/lock/diis-backup ] \
    && [ "$(stat -c '%a:%u:%g' "$lock_parent")" = "750:$app_uid:$app_gid" ] \
    || die "backup lock bootstrap contract mismatch"
fi

cd "$REPO_DIR"
[ "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA" ] || die "checkout SHA mismatch"
[ "$(git rev-parse HEAD^{tree})" = "$EXPECTED_MAIN_TREE" ] || die "checkout tree mismatch"
[ -z "$(git status --porcelain --untracked-files=normal)" ] || die "checkout is not clean"
[ "$(sha256sum "$ACCEPTANCE_BUNDLE" | awk '{print $1}')" = "$EXPECTED_ACCEPTANCE_BUNDLE_SHA256" ] \
  || die "candidate acceptance bundle hash mismatch"

mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || die "production host lock is already held"
# shellcheck source=../docker/scripts/backup-lib.sh
source "$REPO_DIR/infrastructure/docker/scripts/backup-lib.sh"
BACKUP_LOCK_BOOTSTRAP_REQUIRED=1
export BACKUP_LOCK_BOOTSTRAP_REQUIRED

state=precheck
mutation_started=0
backup_lock_acquired=0
legacy_renamed=0
candidate_renamed=0

container_exists() { docker container inspect "$1" >/dev/null 2>&1; }
container_running() {
  [ "$(docker container inspect --format '{{.State.Running}}' "$1" 2>/dev/null)" = true ]
}
cron_count() {
  docker exec "$1" sh -c "crontab -l 2>/dev/null | awk 'NF && \$1 !~ /^#/ {n++} END {print n+0}'"
}
pause_crond() { docker exec "$1" sh -c 'pid=$(pgrep -x crond | head -n 1); [ -n "$pid" ]; kill -STOP "$pid"'; }
resume_crond() { docker exec "$1" sh -c 'pid=$(pgrep -x crond | head -n 1); [ -n "$pid" ]; kill -CONT "$pid"'; }
install_captured_legacy_cron() { docker exec -i "$1" crontab - <"$ROLLBACK_DIR/legacy-root.cron"; }
install_candidate_cron() {
  printf '%s\n' '0 2 * * * PATH=/opt/backup-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh /backup.sh >> /var/log/backup.log 2>&1' \
    | docker exec -i "$1" crontab -
}
remove_cron() { docker exec "$1" sh -c 'crontab -r 2>/dev/null || true'; }

rollback() {
  original_code=$?
  trap - EXIT HUP INT TERM
  set +e
  if (( mutation_started == 1 )); then
    # A signal can arrive after Docker completed a rename but before Bash updated
    # the in-memory flag. Reconcile the observable name topology first so rollback
    # is correct on both sides of each command boundary.
    if container_exists "$LEGACY_HOLD_NAME"; then
      legacy_renamed=1
      if container_exists "$LEGACY_CONTAINER" && ! container_exists "$CANDIDATE_CONTAINER"; then
        candidate_renamed=1
      fi
    fi
    current_candidate=$CANDIDATE_CONTAINER
    (( candidate_renamed == 0 )) || current_candidate=$LEGACY_CONTAINER
    current_legacy=$LEGACY_CONTAINER
    (( legacy_renamed == 0 )) || current_legacy=$LEGACY_HOLD_NAME
    container_exists "$current_candidate" && pause_crond "$current_candidate" >/dev/null 2>&1
    container_exists "$current_legacy" && docker start "$current_legacy" >/dev/null 2>&1
    container_exists "$current_legacy" && install_captured_legacy_cron "$current_legacy" >/dev/null 2>&1
    container_exists "$current_candidate" && remove_cron "$current_candidate" >/dev/null 2>&1
    container_exists "$current_legacy" && resume_crond "$current_legacy" >/dev/null 2>&1
    if (( candidate_renamed == 1 )); then
      docker rename "$LEGACY_CONTAINER" "$CANDIDATE_CONTAINER" >/dev/null 2>&1
      candidate_renamed=0
    fi
    if (( legacy_renamed == 1 )); then
      docker rename "$LEGACY_HOLD_NAME" "$LEGACY_CONTAINER" >/dev/null 2>&1
      legacy_renamed=0
    fi
    container_exists "$LEGACY_CONTAINER" && docker start "$LEGACY_CONTAINER" >/dev/null 2>&1
    current_cron="$ROLLBACK_DIR/legacy-root.current"
    docker exec "$LEGACY_CONTAINER" crontab -l >"$current_cron" 2>/dev/null
    if container_running "$LEGACY_CONTAINER" \
      && cmp -s "$ROLLBACK_DIR/legacy-root.cron" "$current_cron" \
      && [ "$(cron_count "$CANDIDATE_CONTAINER" 2>/dev/null)" = 0 ]; then
      printf 'ROLLBACK_OK state=%s legacyCron=exact candidateSchedule=disabled retry=prohibited\n' "$state" >&2
    else
      printf 'ROLLBACK_AMBIGUOUS state=%s retry=prohibited operatorAction=required\n' "$state" >&2
    fi
  else
    printf 'HANDOFF_ABORTED_BEFORE_MUTATION state=%s retry=prohibited\n' "$state" >&2
  fi
  if (( backup_lock_acquired == 1 )); then
    release_directory_lock "$BACKUP_WRITER_LOCK" >/dev/null 2>&1 || original_code=77
  fi
  exit "$original_code"
}
trap rollback EXIT
trap 'state=signal-hup; exit 129' HUP
trap 'state=signal-int; exit 130' INT
trap 'state=signal-term; exit 143' TERM

# This lock is shared with every backup.sh instance. It is acquired before the
# first process observation and held through final authority verification.
acquire_directory_lock "$BACKUP_WRITER_LOCK"
backup_lock_acquired=1

container_exists "$LEGACY_CONTAINER" || die "legacy container unavailable"
container_exists "$CANDIDATE_CONTAINER" || die "candidate container unavailable"
! container_exists "$LEGACY_HOLD_NAME" || die "legacy hold name already exists"
container_running "$LEGACY_CONTAINER" || die "legacy container not running"
container_running "$CANDIDATE_CONTAINER" || die "candidate container not running"
[ "$(cron_count "$LEGACY_CONTAINER")" = 1 ] || die "legacy must have exactly one scheduler"
[ "$(cron_count "$CANDIDATE_CONTAINER")" = 0 ] || die "candidate must start scheduler-disabled"
if pgrep -af '(/backup\.sh|offsite-replication\.sh|pg_dump)' | grep -v -F "$$" >/dev/null 2>&1; then
  die "backup writer is active despite acquired writer lock"
fi

runtime_manifest="$ROLLBACK_DIR/candidate-runtime-redacted.json"
python3 "$REDACT_HELPER" "$CANDIDATE_CONTAINER" >"$runtime_manifest"
docker exec "$LEGACY_CONTAINER" crontab -l >"$ROLLBACK_DIR/legacy-root.cron"
[ "$(awk 'NF && $1 !~ /^#/ {n++} END {print n+0}' "$ROLLBACK_DIR/legacy-root.cron")" = 1 ] \
  || die "legacy cron capture is not exactly one active entry"
python3 "$REDACT_HELPER" "$LEGACY_CONTAINER" >"$ROLLBACK_DIR/legacy-container-redacted.json"
docker cp "$LEGACY_CONTAINER:/backup.sh" "$ROLLBACK_DIR/legacy-backup.sh" >/dev/null
actual_tool_evidence="$ROLLBACK_DIR/candidate-tool-evidence.actual.json"
sh "$TOOL_CAPTURE_HELPER" "$CANDIDATE_CONTAINER" "$EXPECTED_CANDIDATE_TOOL_VOLUME" \
  "$actual_tool_evidence" >"$ROLLBACK_DIR/candidate-tool-capture.status"
cmp -s "$TOOL_EVIDENCE" "$actual_tool_evidence" \
  || die "candidate tool bytes or versions drift from approved evidence"
actual_service_account_evidence="$ROLLBACK_DIR/service-account-evidence.actual.json"
python3 "$SERVICE_ACCOUNT_HELPER" "$SERVICE_ACCOUNT_HOST_FILE" \
  --expected-path "$SERVICE_ACCOUNT_HOST_FILE" >"$actual_service_account_evidence" \
  || die "actual Service Account artifact rejected"
cmp -s "$SERVICE_ACCOUNT_EVIDENCE" "$actual_service_account_evidence" \
  || die "actual Service Account identity or artifact drift"
chmod 600 "$ROLLBACK_DIR"/*

evidence_snapshot="$ROLLBACK_DIR/acceptance-evidence-snapshot"
mkdir -m 0700 "$evidence_snapshot" || die "acceptance snapshot directory creation failed"
acceptance_test_args=()
if [ "$EXPECTED_BACKUP_LOCK_HOST_PATH" != /var/lock/diis-backup ]; then
  acceptance_test_args=(--test-root "$W10D_CANONICAL_TEST_ROOT" \
    --test-lock-host-path "$EXPECTED_BACKUP_LOCK_HOST_PATH")
fi
env -u DIIS_W10D_TEST_ROOT -u DIIS_ACCEPTANCE_TEST_MODE \
  -u DIIS_ACCEPTANCE_TEST_PAUSE_MARKER -u DIIS_ACCEPTANCE_TEST_PAUSE_RELEASE \
  python3 "$ACCEPTANCE_HELPER" --expected-bundle-sha256 "$EXPECTED_ACCEPTANCE_BUNDLE_SHA256" \
  --snapshot-dir "$evidence_snapshot" --expected-owner-uid "$(id -u)" \
  "${acceptance_test_args[@]}" \
  "$ACCEPTANCE_BUNDLE" "$EXPECTED_MAIN_SHA" "$EXPECTED_MAIN_TREE" \
  "$CANDIDATE_CONTAINER" "$REPO_DIR" "$runtime_manifest" "$ROOT_CRON_EVIDENCE" \
  "$MANUAL_BACKUP_MANIFEST" "$MANUAL_BACKUP_SIDECAR" "$OFFSITE_PROVENANCE" "$DB_RESTORE_PROOF" \
  "$OBJECT_RESTORE_PROOF" "$actual_tool_evidence" "$actual_service_account_evidence" \
  || die "candidate acceptance evidence rejected"
find "$evidence_snapshot" -maxdepth 1 -type f -print0 | LC_ALL=C sort -z \
  | xargs -0 sha256sum >"$ROLLBACK_DIR/acceptance-evidence.sha256"
chmod 600 "$ROLLBACK_DIR/acceptance-evidence.sha256"

[ "$(docker container inspect --format '{{.Config.Image}}' "$CANDIDATE_CONTAINER")" = "$EXPECTED_CANDIDATE_IMAGE" ] \
  || die "candidate image reference mismatch"
[ "$(docker container inspect --format '{{.Image}}' "$CANDIDATE_CONTAINER")" = "$EXPECTED_CANDIDATE_IMAGE_ID" ] \
  || die "candidate image ID mismatch"
docker image inspect --format '{{json .RepoDigests}}' "$EXPECTED_CANDIDATE_IMAGE_ID" \
  | grep -Fq "${EXPECTED_CANDIDATE_IMAGE#*@}" || die "candidate RepoDigest missing"
actual_tool_volume=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/opt/backup-bin"}}{{.Name}}{{end}}{{end}}' "$CANDIDATE_CONTAINER")
[ "$actual_tool_volume" = "$EXPECTED_CANDIDATE_TOOL_VOLUME" ] \
  || die "candidate tool volume mismatch"
actual_minio_volume=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lib/diis-minio-target"}}{{.Name}}{{end}}{{end}}' "$CANDIDATE_CONTAINER")
[ "$actual_minio_volume" = "$EXPECTED_MINIO_VOLUME" ] || die "candidate MinIO volume mismatch"
actual_lock_source=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lock/diis-backup"}}{{.Source}}{{end}}{{end}}' "$CANDIDATE_CONTAINER")
[ "$actual_lock_source" = "$EXPECTED_BACKUP_LOCK_HOST_PATH" ] || die "candidate lock mount mismatch"
legacy_lock_source=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/var/lock/diis-backup"}}{{.Source}}{{end}}{{end}}' "$LEGACY_CONTAINER")
[ "$legacy_lock_source" = "$EXPECTED_BACKUP_LOCK_HOST_PATH" ] || die "legacy lock mount mismatch"
for container in "$CANDIDATE_CONTAINER" "$LEGACY_CONTAINER"; do
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$container" \
    | grep -Fqx 'BACKUP_LOCK_DIR=/var/lock/diis-backup/backup.lock' \
    || die "container lock environment mismatch"
done
actual_credential_source=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/diis-secrets/google-service-account.json"}}{{.Source}}{{end}}{{end}}' "$CANDIDATE_CONTAINER")
actual_credential_rw=$(docker container inspect --format \
  '{{range .Mounts}}{{if eq .Destination "/run/diis-secrets/google-service-account.json"}}{{.RW}}{{end}}{{end}}' "$CANDIDATE_CONTAINER")
[ "$actual_credential_source" = "$SERVICE_ACCOUNT_HOST_FILE" ] && [ "$actual_credential_rw" = false ] \
  || die "candidate Service Account mount drift"
expected_credential_sha=$(python3 - "$actual_service_account_evidence" <<'PY'
import json,sys
print(json.load(open(sys.argv[1],encoding='utf-8'))['credentialArtifactSha256'])
PY
)
actual_credential_sha=$(docker exec "$CANDIDATE_CONTAINER" \
  sha256sum /run/diis-secrets/google-service-account.json | awk '{print $1}')
[ "$actual_credential_sha" = "$expected_credential_sha" ] \
  || die "mounted Service Account bytes drift"
for binding in 'OFFSITE_RETENTION_APPLY=0' 'BACKUP_BUCKET_CREATION_ALLOWED=0' \
  'BACKUP_SCHEDULE_ENABLED=0' 'BACKUP_LOCK_BOOTSTRAP_REQUIRED=1' \
  "OFFSITE_EXPECTED_PROVIDER=$EXPECTED_OFFSITE_PROVIDER" \
  "OFFSITE_EXPECTED_ORIGIN=$EXPECTED_OFFSITE_ORIGIN"; do
  docker container inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$CANDIDATE_CONTAINER" \
    | grep -Fqx "$binding" || die "candidate safety environment mismatch"
done

# Re-read and byte-compare immediately before the first mutation.
docker exec "$LEGACY_CONTAINER" crontab -l >"$ROLLBACK_DIR/legacy-root.pre-mutation"
cmp -s "$ROLLBACK_DIR/legacy-root.cron" "$ROLLBACK_DIR/legacy-root.pre-mutation" \
  || die "legacy cron changed after capture"
sha256sum --check --status "$ROLLBACK_DIR/acceptance-evidence.sha256" \
  || die "acceptance evidence snapshot drifted before mutation"
find "$ROLLBACK_DIR" -maxdepth 1 -type f ! -name SHA256SUMS -print0 \
  | LC_ALL=C sort -z | xargs -0 sha256sum >"$ROLLBACK_DIR/SHA256SUMS"
chmod 600 "$ROLLBACK_DIR/SHA256SUMS"

mutation_started=1
pause_crond "$LEGACY_CONTAINER"; state=legacy-paused
pause_crond "$CANDIDATE_CONTAINER"; state=both-paused
install_candidate_cron "$CANDIDATE_CONTAINER"; state=candidate-installed-paused
remove_cron "$LEGACY_CONTAINER"; state=legacy-removed-candidate-paused
resume_crond "$CANDIDATE_CONTAINER"; state=candidate-active
[ "$(cron_count "$LEGACY_CONTAINER")" = 0 ] || die "legacy scheduler removal not proven"
[ "$(cron_count "$CANDIDATE_CONTAINER")" = 1 ] || die "candidate scheduler activation not proven"

docker stop --time 30 "$LEGACY_CONTAINER" >/dev/null; state=legacy-stopped
docker rename "$LEGACY_CONTAINER" "$LEGACY_HOLD_NAME"; legacy_renamed=1; state=legacy-held
docker rename "$CANDIDATE_CONTAINER" "$LEGACY_CONTAINER"; candidate_renamed=1; state=candidate-canonical-name

container_running "$LEGACY_CONTAINER" || die "new authority not running"
[ "$(cron_count "$LEGACY_CONTAINER")" = 1 ] || die "new authority scheduler mismatch"
container_exists "$LEGACY_HOLD_NAME" || die "legacy rollback container missing"
[ "$(docker container inspect --format '{{.State.Running}}' "$LEGACY_HOLD_NAME")" = false ] \
  || die "legacy hold container unexpectedly running"

release_directory_lock "$BACKUP_WRITER_LOCK" || die "backup writer lock release failed"
backup_lock_acquired=0
trap - EXIT HUP INT TERM
printf 'HANDOFF_OK authority=%s schedulerCount=1 legacyRollback=%s cleanupDeferred=1\n' \
  "$LEGACY_CONTAINER" "$LEGACY_HOLD_NAME"

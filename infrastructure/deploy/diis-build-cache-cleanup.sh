#!/bin/bash

set -Eeuo pipefail
umask 077

EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}
EXPECTED_MAIN_TREE=${EXPECTED_MAIN_TREE:?EXPECTED_MAIN_TREE is required}
CLEANUP_CONFIRMATION=${CLEANUP_CONFIRMATION:-}
REPO_DIR=${REPO_DIR:-/home/appuser/smart-ai-school}
WALL_TIMEOUT=15m
MAX_WALL_SECONDS=900
KILL_GRACE_SECONDS=30
ELIGIBILITY_TIMEOUT=150s
OBSERVATION_TIMEOUT=150s
SHORT_OBSERVATION_TIMEOUT=30s
PREMUTATION_MAX_SECONDS=300
POSTCHECK_MAX_SECONDS=300
TARGET_FREE_BYTES=${TARGET_FREE_BYTES:-25769803776}
RESERVED_BYTES=${RESERVED_BYTES:-8589934592}
MIN_FREE_PERCENT=${MIN_FREE_PERCENT:-30}
ELIGIBILITY_MARGIN_BYTES=2147483648
BUILDKIT_BUILDER=default
BUILDKIT_FILTER_AGE=until=1h
BUILDKIT_FILTER_INUSE=inuse=false
BUILDKIT_FILTER_PRIVATE=private=true
NO_TOUCH_HELPER="$REPO_DIR/scripts/docker-no-touch-digest.py"
READONLY_HELPER="$REPO_DIR/scripts/production-recovery-readonly-summary.sh"
ELIGIBILITY_HELPER="$REPO_DIR/scripts/parse-buildkit-eligibility.py"
BACKUP_LIB="$REPO_DIR/infrastructure/docker/scripts/backup-lib.sh"
TEST_BOUNDARY="$REPO_DIR/scripts/w10d-test-boundary.sh"
BACKUP_WRITER_LOCK=${BACKUP_WRITER_LOCK:-/var/lock/diis-backup/backup.lock}
APPROVED_WINDOW_START_EPOCH=${APPROVED_WINDOW_START_EPOCH:?APPROVED_WINDOW_START_EPOCH is required}
APPROVED_WINDOW_END_EPOCH=${APPROVED_WINDOW_END_EPOCH:?APPROVED_WINDOW_END_EPOCH is required}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[ -f "$TEST_BOUNDARY" ] && [ ! -L "$TEST_BOUNDARY" ] || die "test boundary unavailable"
# shellcheck source=../../scripts/w10d-test-boundary.sh
. "$TEST_BOUNDARY"
w10d_init_test_boundary || die "test root is not one canonical private direct child of /tmp"
w10d_bind_host_lock /home/appuser/.local/state/diis-deploy/deploy.lock \
  || die "host lock must use canonical production identity or confined test override"
if [ "$W10D_TEST_MODE" = 0 ]; then
  w10d_no_test_value "${ALLOW_TEST_BACKUP_LOCK_PATH:-}" \
    || die "test control forbidden in production mode"
  [ -z "${TEST_BACKUP_WRITER_LOCK:-}" ] || die "test path forbidden in production mode"
else
  [ "${ALLOW_TEST_BACKUP_LOCK_PATH:-0}" = 1 ] || die "explicit test confirmation is required"
  for path in "$REPO_DIR" "$HOST_LOCK" "$BACKUP_WRITER_LOCK" "${TEST_BACKUP_WRITER_LOCK:-}"; do
    w10d_test_path_confined "$path" || die "test path escapes canonical private test root"
  done
  test_summary_root="$W10D_CANONICAL_TEST_ROOT/cleanup-summary-temp"
  if [ ! -e "$test_summary_root" ]; then
    mkdir -m 0700 "$test_summary_root" || die "test summary root creation failed"
  fi
  [ -d "$test_summary_root" ] && [ ! -L "$test_summary_root" ] \
    && [ "$(stat -c '%a:%u' "$test_summary_root")" = "700:$(id -u)" ] \
    || die "test summary root is not private"
  export SUMMARY_TEMP_ROOT="$test_summary_root"
  export ALLOW_TEST_SUMMARY_TEMP_ROOT=1
fi

case "$EXPECTED_MAIN_SHA" in *[!0-9a-f]*|'') die "EXPECTED_MAIN_SHA invalid" ;; esac
case "$EXPECTED_MAIN_TREE" in *[!0-9a-f]*|'') die "EXPECTED_MAIN_TREE invalid" ;; esac
[ "$CLEANUP_CONFIRMATION" = PRUNE_EXACT_BUILDKIT_CACHE_WITH_SHARED_HOST_LOCK ] \
  || die "exact cleanup confirmation is required"
for value in "$TARGET_FREE_BYTES" "$RESERVED_BYTES" "$MIN_FREE_PERCENT"; do
  [[ "$value" =~ ^[0-9]+$ ]] || die "numeric cleanup binding invalid"
done
[[ "$APPROVED_WINDOW_START_EPOCH" =~ ^[0-9]+$ ]] || die "window start invalid"
[[ "$APPROVED_WINDOW_END_EPOCH" =~ ^[0-9]+$ ]] || die "window end invalid"
(( TARGET_FREE_BYTES >= RESERVED_BYTES )) || die "target must be >= reserved bytes"
(( TARGET_FREE_BYTES <= 9223372034707292159 )) || die "target exceeds safe arithmetic bound"
(( MIN_FREE_PERCENT >= 1 && MIN_FREE_PERCENT <= 100 )) || die "MIN_FREE_PERCENT invalid"

for command in docker git python3 flock timeout df awk sha256sum cmp pgrep mktemp date readlink stat id; do
  command -v "$command" >/dev/null 2>&1 || die "$command unavailable"
done
for helper in "$NO_TOUCH_HELPER" "$READONLY_HELPER" "$ELIGIBILITY_HELPER" "$BACKUP_LIB"; do
  [ -f "$helper" ] && [ ! -L "$helper" ] || die "reviewed helper unavailable"
done
case "$BACKUP_WRITER_LOCK" in /*) ;; *) die "backup writer lock must be absolute" ;; esac
[ "$BACKUP_WRITER_LOCK" = /var/lock/diis-backup/backup.lock ] \
  || { [ "$W10D_TEST_MODE" = 1 ] && [ "${ALLOW_TEST_BACKUP_LOCK_PATH:-0}" = 1 ] \
    && [ "${TEST_BACKUP_WRITER_LOCK:-}" = "$BACKUP_WRITER_LOCK" ] \
    && [[ "$BACKUP_WRITER_LOCK:$REPO_DIR" == /tmp/*:/tmp/* ]]; } \
  || die "backup writer lock must use canonical production identity"
lock_parent=$(dirname "$BACKUP_WRITER_LOCK")
[ -d "$lock_parent" ] && [ ! -L "$lock_parent" ] || die "backup lock bootstrap is not installed"
if [ "$lock_parent" = /var/lock/diis-backup ]; then
  [ "$(readlink -f "$lock_parent")" = /run/lock/diis-backup ] \
    || die "backup lock parent canonical target mismatch"
  [ "$(stat -c '%a:%u:%g' "$lock_parent")" = "750:$(id -u):$(id -g)" ] \
    || die "backup lock bootstrap owner group or mode mismatch"
fi

now_epoch=$(date -u +%s)
(( APPROVED_WINDOW_END_EPOCH > APPROVED_WINDOW_START_EPOCH )) || die "approved window invalid"
(( APPROVED_WINDOW_END_EPOCH - APPROVED_WINDOW_START_EPOCH <= 3600 )) \
  || die "approved window exceeds one hour"
(( now_epoch >= APPROVED_WINDOW_START_EPOCH && now_epoch <= APPROVED_WINDOW_END_EPOCH )) \
  || die "outside approved execution window"
pre_mutation_deadline=$((now_epoch + PREMUTATION_MAX_SECONDS))
operation_deadline=$((pre_mutation_deadline + MAX_WALL_SECONDS + KILL_GRACE_SECONDS + POSTCHECK_MAX_SECONDS))
(( operation_deadline <= APPROVED_WINDOW_END_EPOCH )) \
  || die "remaining approved window is shorter than bounded cleanup and observation duration"
for ((offset = 0; offset <= PREMUTATION_MAX_SECONDS + MAX_WALL_SECONDS + KILL_GRACE_SECONDS + POSTCHECK_MAX_SECONDS; offset += 60)); do
  sample_hm=$(TZ=Asia/Jakarta date -d "@$((now_epoch + offset))" +%H%M)
  sample_minutes=$((10#${sample_hm:0:2} * 60 + 10#${sample_hm:2:2}))
  if (( (sample_minutes >= 100 && sample_minutes <= 140) \
    || (sample_minutes >= 1120 && sample_minutes <= 1160) )); then
    die "maximum cleanup interval overlaps known backup schedule"
  fi
done

cd "$REPO_DIR"
[ "$(timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA" ] \
  || die "checkout SHA mismatch"
[ "$(timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" git rev-parse HEAD^{tree})" = "$EXPECTED_MAIN_TREE" ] \
  || die "checkout tree mismatch"
[ -z "$(timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" \
  git status --porcelain --untracked-files=normal)" ] || die "checkout is not clean"

mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || die "production host lock is already held"
if timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" \
  pgrep -af '(docker build|docker buildx build|buildctl|/backup\.sh|offsite-replication\.sh)' \
  | grep -v -F "$$" >/dev/null 2>&1; then
  die "active build or backup writer detected"
fi

evidence_dir=$(mktemp -d /tmp/diis-buildkit-cleanup.XXXXXXXX)
chmod 700 "$evidence_dir"
prune_started=0
backup_lock_acquired=0
partial_reason=
postcheck_done=0
before_ready=0
prune_pid=

free_metrics() {
  local metrics
  metrics=$(timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" \
    df -PB1 /var/lib/docker | awk 'NR==2 {printf "%s %s", $4, int(($4*100)/$2)}')
  [[ "$metrics" =~ ^[0-9]+\ [0-9]+$ ]] || return 1
  printf '%s\n' "$metrics"
}

validate_summary() {
  python3 - "$1" <<'PY'
import json, re, sys
value=json.load(open(sys.argv[1], encoding="utf-8"))
expected={
 "schemaVersion","runningContainers","unhealthyContainers","successfulMigrations","backupState",
 "backupReason","targetCompletionCount","legacyDumpCount","backupAggregateBytes",
 "backupPathSetSha256","backupContentSetSha256","legacyTargetValidity","databaseReady","webHealthy","apiHealthy",
}
if set(value) != expected: raise SystemExit(1)
if value["schemaVersion"]!="diis-production-readonly-summary-v3": raise SystemExit(1)
state=value["backupState"]
counts=(value["targetCompletionCount"],value["legacyDumpCount"],value["backupAggregateBytes"])
if state not in {"target-complete","legacy-observed","transition-observed"}: raise SystemExit(1)
if any(type(item) is not int or item < 0 for item in counts): raise SystemExit(1)
if counts[2] <= 0: raise SystemExit(1)
for key in ("backupPathSetSha256","backupContentSetSha256"):
 if not re.fullmatch(r"[a-f0-9]{64}",str(value[key])): raise SystemExit(1)
if value["legacyTargetValidity"] is not False: raise SystemExit(1)
if state=="target-complete" and not (counts[0]>0 and counts[1]==0): raise SystemExit(1)
if state=="legacy-observed" and not (counts[0]==0 and counts[1]>0): raise SystemExit(1)
if state=="transition-observed" and not (counts[0]>0 and counts[1]>0): raise SystemExit(1)
PY
}

capture_no_touch() {
  local label=$1 surface
  for surface in containers images volumes networks; do
    timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" \
      python3 "$NO_TOUCH_HELPER" "$surface" >"$evidence_dir/${label}-${surface}.json" || return 1
  done
}

capture_eligibility() {
  local label=$1 raw
  raw="$evidence_dir/${label}-buildkit.ndjson"
  timeout --signal=TERM --kill-after=10s "$ELIGIBILITY_TIMEOUT" \
    docker buildx du \
      --builder "$BUILDKIT_BUILDER" \
      --filter "$BUILDKIT_FILTER_AGE" \
      --filter "$BUILDKIT_FILTER_INUSE" \
      --filter "$BUILDKIT_FILTER_PRIVATE" \
      --format=json \
      --timeout 2m >"$raw" 2>/dev/null || return 1
  python3 "$ELIGIBILITY_HELPER" "$raw" --reserved-bytes "$RESERVED_BYTES" \
    >"$evidence_dir/${label}-eligibility.json"
}

eligibility_metrics() {
  python3 - "$1" <<'PY'
import json, re, sys
value=json.load(open(sys.argv[1],encoding="utf-8"))
if set(value)!={"schemaVersion","builder","filters","eligibleRecordCount","eligiblePrivateBytes","reservedBytes","deletableBytesLowerBound","canonicalSha256"}: raise SystemExit(1)
if value["schemaVersion"]!="diis-buildkit-eligibility-v2" or value["builder"]!="default" or value["filters"]!=["until=1h","inuse=false","private=true"]: raise SystemExit(1)
if type(value["eligibleRecordCount"]) is not int or value["eligibleRecordCount"]<0: raise SystemExit(1)
for key in ("eligiblePrivateBytes","reservedBytes","deletableBytesLowerBound"):
 if type(value[key]) is not int or value[key]<0: raise SystemExit(1)
if value["deletableBytesLowerBound"]!=max(0,value["eligiblePrivateBytes"]-value["reservedBytes"]): raise SystemExit(1)
if not re.fullmatch(r"[a-f0-9]{64}",str(value["canonicalSha256"])): raise SystemExit(1)
print(value["eligibleRecordCount"],value["deletableBytesLowerBound"],value["canonicalSha256"])
PY
}

run_postchecks() {
  local surface
  postcheck_done=1
  read -r free_after percent_after < <(free_metrics) || { [ -n "$partial_reason" ] || partial_reason=observability-failed; return; }
  capture_no_touch after || { [ -n "$partial_reason" ] || partial_reason=observability-failed; return; }
  timeout --signal=TERM --kill-after=5s "$OBSERVATION_TIMEOUT" \
    bash "$READONLY_HELPER" >"$evidence_dir/after-production.json" 2>/dev/null \
    && validate_summary "$evidence_dir/after-production.json" \
    || { [ -n "$partial_reason" ] || partial_reason=observability-failed; return; }
  for surface in containers images volumes networks; do
    cmp -s "$evidence_dir/before-${surface}.json" "$evidence_dir/after-${surface}.json" \
      || { [ -n "$partial_reason" ] || partial_reason=no-touch-drift; }
  done
  cmp -s "$evidence_dir/before-production.json" "$evidence_dir/after-production.json" \
    || { [ -n "$partial_reason" ] || partial_reason=no-touch-drift; }
  (( free_after >= TARGET_FREE_BYTES )) || { [ -n "$partial_reason" ] || partial_reason=target-not-reached; }
  (( percent_after >= MIN_FREE_PERCENT )) || { [ -n "$partial_reason" ] || partial_reason=percent-not-reached; }
}

finalize() {
  local original_code=$? release_failed=0 evidence_cleanup_failed=0
  trap - EXIT HUP INT TERM
  set +e
  if [ -n "$prune_pid" ] && kill -0 "$prune_pid" 2>/dev/null; then
    kill -TERM "$prune_pid" 2>/dev/null
    wait "$prune_pid" 2>/dev/null
    [ -n "$partial_reason" ] || partial_reason=signal
  fi
  if (( prune_started == 1 && postcheck_done == 0 && before_ready == 1 )); then
    run_postchecks
  fi
  if (( backup_lock_acquired == 1 )); then
    release_directory_lock "$BACKUP_WRITER_LOCK" >/dev/null 2>&1 || release_failed=1
    backup_lock_acquired=0
  fi
  rm -rf -- "$evidence_dir" || evidence_cleanup_failed=1
  if (( prune_started == 1 )); then
    (( release_failed == 0 )) || partial_reason=lock-release-failed
    (( evidence_cleanup_failed == 0 )) || { [ -n "$partial_reason" ] || partial_reason=observability-failed; }
    if (( original_code != 0 )) || [ -n "$partial_reason" ]; then
      [ -n "$partial_reason" ] || partial_reason=observability-failed
      printf 'PARTIAL_IRREVERSIBLE reason=%s no_retry=1\n' "$partial_reason" >&2
      exit 75
    fi
  elif (( release_failed != 0 || evidence_cleanup_failed != 0 )); then
    exit 77
  fi
  exit "$original_code"
}
handle_signal() {
  local signal_code=$1
  partial_reason=signal
  trap - HUP INT TERM
  if [ -n "$prune_pid" ] && kill -0 "$prune_pid" 2>/dev/null; then
    kill -TERM "$prune_pid" 2>/dev/null || true
    wait "$prune_pid" 2>/dev/null || true
    prune_pid=
  fi
  exit "$signal_code"
}
trap finalize EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

timeout --signal=TERM --kill-after=5s "$OBSERVATION_TIMEOUT" \
  bash "$READONLY_HELPER" >"$evidence_dir/before-production.json"
validate_summary "$evidence_dir/before-production.json" || die "production recovery observation invalid"
read -r free_before percent_before < <(free_metrics) || die "free-space observation invalid"
if (( free_before >= TARGET_FREE_BYTES && percent_before >= MIN_FREE_PERCENT )); then
  printf 'CLEANUP_NOOP freeBytes=%s freePercent=%s targetAlreadyMet=1\n' "$free_before" "$percent_before"
  exit 0
fi

capture_eligibility initial || die "initial BuildKit eligibility observation failed"
read -r eligible_count eligible_bytes eligible_sha < <(
  eligibility_metrics "$evidence_dir/initial-eligibility.json"
) || die "initial BuildKit eligibility proof invalid"
deficit=$((TARGET_FREE_BYTES - free_before))
(( deficit < 0 )) && deficit=0
required_eligible=$((deficit + ELIGIBILITY_MARGIN_BYTES))
(( eligible_bytes >= required_eligible )) \
  || die "eligible BuildKit bytes are below deficit plus safety margin"

# The shared writer parent is created only by the separately approved H2 bootstrap.
# shellcheck source=../docker/scripts/backup-lib.sh
source "$BACKUP_LIB"
BACKUP_LOCK_BOOTSTRAP_REQUIRED=1
export BACKUP_LOCK_BOOTSTRAP_REQUIRED
acquire_directory_lock "$BACKUP_WRITER_LOCK"
backup_lock_acquired=1
if timeout --signal=TERM --kill-after=5s "$SHORT_OBSERVATION_TIMEOUT" \
  pgrep -af '(docker build|docker buildx build|buildctl|/backup\.sh|offsite-replication\.sh)' \
  | grep -v -F "$$" >/dev/null 2>&1; then
  die "active build or backup writer detected after locks"
fi

capture_no_touch before
timeout --signal=TERM --kill-after=5s "$OBSERVATION_TIMEOUT" \
  bash "$READONLY_HELPER" >"$evidence_dir/before-production-locked.json" \
  || die "locked recovery observation timed out or failed"
validate_summary "$evidence_dir/before-production-locked.json" || die "locked recovery observation invalid"
cmp -s "$evidence_dir/before-production.json" "$evidence_dir/before-production-locked.json" \
  || die "recovery state drifted before prune"
mv "$evidence_dir/before-production-locked.json" "$evidence_dir/before-production.json"
read -r locked_free locked_percent < <(free_metrics) || die "locked free-space observation invalid"
if (( locked_free >= TARGET_FREE_BYTES && locked_percent >= MIN_FREE_PERCENT )); then
  release_directory_lock "$BACKUP_WRITER_LOCK" || die "backup writer lock release failed"
  backup_lock_acquired=0
  printf 'CLEANUP_NOOP freeBytes=%s freePercent=%s targetAlreadyMet=1 lockedRecheck=1\n' \
    "$locked_free" "$locked_percent"
  exit 0
fi
capture_eligibility locked || die "locked BuildKit eligibility observation failed"
cmp -s "$evidence_dir/initial-eligibility.json" "$evidence_dir/locked-eligibility.json" \
  || die "BuildKit eligibility drifted after locks"
read -r locked_count locked_bytes locked_sha < <(
  eligibility_metrics "$evidence_dir/locked-eligibility.json"
) || die "locked BuildKit eligibility proof invalid"
[ "$eligible_count:$eligible_bytes:$eligible_sha" = "$locked_count:$locked_bytes:$locked_sha" ] \
  || die "BuildKit eligibility metrics drifted after locks"
locked_deficit=$((TARGET_FREE_BYTES - locked_free))
(( locked_deficit < 0 )) && locked_deficit=0
locked_required=$((locked_deficit + ELIGIBILITY_MARGIN_BYTES))
(( locked_bytes >= locked_required )) || die "locked eligibility is below required safety bound"
before_ready=1
printf 'PRECHECK_OK freeBytes=%s freePercent=%s eligibleCount=%s deletableBytesLowerBound=%s eligibilitySha256=%s sharedLock=held\n' \
  "$locked_free" "$locked_percent" "$locked_count" "$locked_bytes" "$locked_sha"

pre_prune_epoch=$(date -u +%s)
[[ "$pre_prune_epoch" =~ ^[0-9]+$ ]] || die "pre-prune time observation invalid"
(( pre_prune_epoch <= pre_mutation_deadline )) || die "pre-mutation deadline expired"
final_operation_deadline=$((pre_prune_epoch + MAX_WALL_SECONDS + KILL_GRACE_SECONDS + POSTCHECK_MAX_SECONDS))
(( final_operation_deadline <= APPROVED_WINDOW_END_EPOCH )) \
  || die "remaining approved window expired before prune"
for ((offset = 0; offset <= MAX_WALL_SECONDS + KILL_GRACE_SECONDS + POSTCHECK_MAX_SECONDS; offset += 60)); do
  sample_hm=$(TZ=Asia/Jakarta date -d "@$((pre_prune_epoch + offset))" +%H%M)
  sample_minutes=$((10#${sample_hm:0:2} * 60 + 10#${sample_hm:2:2}))
  if (( (sample_minutes >= 100 && sample_minutes <= 140) \
    || (sample_minutes >= 1120 && sample_minutes <= 1160) )); then
    die "remaining cleanup interval overlaps known backup schedule"
  fi
done

prune_started=1
set +e
timeout --signal=TERM --kill-after=30s "$WALL_TIMEOUT" \
  docker buildx prune \
    --builder "$BUILDKIT_BUILDER" \
    --force \
    --filter "$BUILDKIT_FILTER_AGE" \
    --filter "$BUILDKIT_FILTER_INUSE" \
    --filter "$BUILDKIT_FILTER_PRIVATE" \
    --min-free-space "$TARGET_FREE_BYTES" \
    --reserved-space "$RESERVED_BYTES" \
    --timeout 2m 9>&- &
prune_pid=$!
wait "$prune_pid"
prune_rc=$?
prune_pid=
set -e
if (( prune_rc != 0 )); then
  case "$prune_rc" in 124|137) partial_reason=prune-timeout ;; *) partial_reason=prune-failed ;; esac
  exit 75
fi

run_postchecks
[ -z "$partial_reason" ] || exit 75
release_directory_lock "$BACKUP_WRITER_LOCK" || { partial_reason=lock-release-failed; exit 75; }
backup_lock_acquired=0
printf 'CLEANUP_OK freeBytesBefore=%s freePercentBefore=%s freeBytesAfter=%s freePercentAfter=%s noRetry=1\n' \
  "$locked_free" "$locked_percent" "$free_after" "$percent_after"

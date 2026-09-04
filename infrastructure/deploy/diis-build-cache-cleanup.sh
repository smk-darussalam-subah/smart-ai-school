#!/bin/bash

set -Eeuo pipefail
umask 077

EXPECTED_MAIN_SHA=${EXPECTED_MAIN_SHA:?EXPECTED_MAIN_SHA is required}
EXPECTED_MAIN_TREE=${EXPECTED_MAIN_TREE:?EXPECTED_MAIN_TREE is required}
CLEANUP_CONFIRMATION=${CLEANUP_CONFIRMATION:-}
REPO_DIR=${REPO_DIR:-/home/appuser/smart-ai-school}
HOST_LOCK=${HOST_LOCK:-/home/appuser/.local/state/diis-deploy/deploy.lock}
WALL_TIMEOUT=15m
MAX_WALL_SECONDS=900
KILL_GRACE_SECONDS=30
TARGET_FREE_BYTES=${TARGET_FREE_BYTES:-25769803776}
RESERVED_BYTES=${RESERVED_BYTES:-8589934592}
MIN_FREE_PERCENT=${MIN_FREE_PERCENT:-30}
NO_TOUCH_HELPER="$REPO_DIR/scripts/docker-no-touch-digest.py"
READONLY_HELPER="$REPO_DIR/scripts/production-recovery-readonly-summary.sh"
BACKUP_LIB="$REPO_DIR/infrastructure/docker/scripts/backup-lib.sh"
BACKUP_WRITER_LOCK=${BACKUP_WRITER_LOCK:-/var/lock/diis-backup/backup.lock}
APPROVED_WINDOW_START_EPOCH=${APPROVED_WINDOW_START_EPOCH:?APPROVED_WINDOW_START_EPOCH is required}
APPROVED_WINDOW_END_EPOCH=${APPROVED_WINDOW_END_EPOCH:?APPROVED_WINDOW_END_EPOCH is required}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

case "$EXPECTED_MAIN_SHA" in *[!0-9a-f]*|'') die "EXPECTED_MAIN_SHA invalid" ;; esac
case "$EXPECTED_MAIN_TREE" in *[!0-9a-f]*|'') die "EXPECTED_MAIN_TREE invalid" ;; esac
[ "$CLEANUP_CONFIRMATION" = PRUNE_EXACT_BUILDKIT_CACHE_WITH_SHARED_HOST_LOCK ] \
  || die "exact cleanup confirmation is required"
[[ "$TARGET_FREE_BYTES" =~ ^[0-9]+$ ]] || die "TARGET_FREE_BYTES invalid"
[[ "$RESERVED_BYTES" =~ ^[0-9]+$ ]] || die "RESERVED_BYTES invalid"
[[ "$MIN_FREE_PERCENT" =~ ^[0-9]+$ ]] || die "MIN_FREE_PERCENT invalid"
[[ "$APPROVED_WINDOW_START_EPOCH" =~ ^[0-9]+$ ]] || die "window start invalid"
[[ "$APPROVED_WINDOW_END_EPOCH" =~ ^[0-9]+$ ]] || die "window end invalid"
(( TARGET_FREE_BYTES >= RESERVED_BYTES )) || die "target must be >= reserved bytes"
(( MIN_FREE_PERCENT >= 1 && MIN_FREE_PERCENT <= 100 )) || die "MIN_FREE_PERCENT invalid"

for command in docker git python3 flock timeout df awk sha256sum cmp pgrep mktemp date; do
  command -v "$command" >/dev/null 2>&1 || die "$command unavailable"
done
[ -f "$NO_TOUCH_HELPER" ] || die "no-touch digest helper unavailable"
[ -f "$READONLY_HELPER" ] || die "production read-only helper unavailable"
[ -f "$BACKUP_LIB" ] || die "backup lock library unavailable"
case "$BACKUP_WRITER_LOCK" in /*) ;; *) die "backup writer lock must be absolute" ;; esac
now_epoch=$(date -u +%s)
(( APPROVED_WINDOW_END_EPOCH > APPROVED_WINDOW_START_EPOCH )) || die "approved window invalid"
(( APPROVED_WINDOW_END_EPOCH - APPROVED_WINDOW_START_EPOCH <= 3600 )) \
  || die "approved window exceeds one hour"
(( now_epoch >= APPROVED_WINDOW_START_EPOCH && now_epoch <= APPROVED_WINDOW_END_EPOCH )) \
  || die "outside approved execution window"
operation_deadline=$((now_epoch + MAX_WALL_SECONDS + KILL_GRACE_SECONDS))
(( operation_deadline <= APPROVED_WINDOW_END_EPOCH )) \
  || die "remaining approved window is shorter than maximum cleanup duration"
for ((offset = 0; offset <= MAX_WALL_SECONDS + KILL_GRACE_SECONDS; offset += 60)); do
  sample_hm=$(TZ=Asia/Jakarta date -d "@$((now_epoch + offset))" +%H%M)
  sample_minutes=$((10#${sample_hm:0:2} * 60 + 10#${sample_hm:2:2}))
  if (( (sample_minutes >= 100 && sample_minutes <= 140) \
    || (sample_minutes >= 1120 && sample_minutes <= 1160) )); then
    die "maximum cleanup interval overlaps known backup schedule"
  fi
done

cd "$REPO_DIR"
[ "$(git rev-parse HEAD)" = "$EXPECTED_MAIN_SHA" ] || die "checkout SHA mismatch"
[ "$(git rev-parse HEAD^{tree})" = "$EXPECTED_MAIN_TREE" ] || die "checkout tree mismatch"
[ -z "$(git status --porcelain --untracked-files=normal)" ] || die "checkout is not clean"

mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || die "production host lock is already held"

# The same lock is held by deploy-production.sh. Every authorized manual Docker
# build/maintenance command must also run through this wrapper's critical section.
if pgrep -af '(docker build|docker buildx build|buildctl|/backup\.sh|offsite-replication\.sh)' \
  | grep -v -F "$$" >/dev/null 2>&1; then
  die "active build or backup writer detected"
fi

evidence_dir=$(mktemp -d /tmp/diis-buildkit-cleanup.XXXXXXXX)
chmod 700 "$evidence_dir"
phase=precheck
prune_started=0
prune_completed=0
backup_lock_acquired=0

capture_no_touch() {
  local label=$1
  for surface in containers images volumes networks; do
    python3 "$NO_TOUCH_HELPER" "$surface" >"$evidence_dir/${label}-${surface}.json"
  done
}

free_metrics() {
  df -PB1 /var/lib/docker | awk 'NR==2 {printf "%s %s\n", $4, int(($4*100)/$2)}'
}

finalize() {
  local code=$?
  trap - EXIT HUP INT TERM
  set +e
  capture_no_touch after
  postcheck_rc=$?
  bash "$READONLY_HELPER" >"$evidence_dir/after-production.json" || postcheck_rc=1
  read -r free_after percent_after < <(free_metrics)
  digest_match=1
  for surface in containers images volumes networks; do
    cmp -s "$evidence_dir/before-${surface}.json" "$evidence_dir/after-${surface}.json" || digest_match=0
  done
  cmp -s "$evidence_dir/before-production.json" "$evidence_dir/after-production.json" \
    || digest_match=0
  if (( prune_started == 1 && prune_completed == 0 )); then
    printf 'PARTIAL_IRREVERSIBLE outcome=unknown no_retry=1 phase=%s freeBytes=%s freePercent=%s noTouchDigestMatch=%s\n' \
      "$phase" "$free_after" "$percent_after" "$digest_match" >&2
    code=75
  elif (( postcheck_rc != 0 || digest_match != 1 )); then
    printf 'POSTCHECK_FAILED phase=%s freeBytes=%s freePercent=%s noTouchDigestMatch=%s\n' \
      "$phase" "$free_after" "$percent_after" "$digest_match" >&2
    code=76
  fi
  if (( backup_lock_acquired == 1 )); then
    release_directory_lock "$BACKUP_WRITER_LOCK" >/dev/null 2>&1 || code=77
    backup_lock_acquired=0
  fi
  rm -rf -- "$evidence_dir"
  exit "$code"
}
trap finalize EXIT
trap 'phase=signal-hup; exit 129' HUP
trap 'phase=signal-int; exit 130' INT
trap 'phase=signal-term; exit 143' TERM

# Use the identical writer-lock protocol as backup.sh. The shared host bind makes
# a backup attempt after this point fail before pg_dump, closing the pgrep race.
# shellcheck source=../docker/scripts/backup-lib.sh
source "$BACKUP_LIB"
acquire_directory_lock "$BACKUP_WRITER_LOCK"
backup_lock_acquired=1

capture_no_touch before
bash "$READONLY_HELPER" >"$evidence_dir/before-production.json"
read -r free_before percent_before < <(free_metrics)
printf 'PRECHECK_OK freeBytes=%s freePercent=%s sharedLock=held\n' "$free_before" "$percent_before"

phase=prune
prune_started=1
# buildx --timeout only limits loading builder status. /usr/bin/timeout is the
# independent wall-clock bound for the complete prune process.
if ! timeout --signal=TERM --kill-after=30s "$WALL_TIMEOUT" \
  docker buildx prune \
    --builder default \
    --force \
    --filter until=1h \
    --filter inuse=false \
    --min-free-space "$TARGET_FREE_BYTES" \
    --reserved-space "$RESERVED_BYTES" \
    --timeout 2m; then
  phase=prune-failed-or-timed-out
  exit 75
fi
prune_completed=1
phase=postcheck

read -r free_after percent_after < <(free_metrics)
(( free_after >= TARGET_FREE_BYTES )) || die "absolute free-space target not reached"
(( percent_after >= MIN_FREE_PERCENT )) || die "percentage free-space target not reached"
printf 'CLEANUP_OK freeBytesBefore=%s freePercentBefore=%s freeBytesAfter=%s freePercentAfter=%s noRetry=1\n' \
  "$free_before" "$percent_before" "$free_after" "$percent_after"

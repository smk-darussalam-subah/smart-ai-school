#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT/infrastructure/docker/scripts/backup-lib.sh"

[ "$#" -eq 2 ] || backup_die "usage: prepare-object-restore-target.sh ATTEMPT_ID TARGET_PARENT_REMOTE"
ATTEMPT_ID=$1
TARGET_PARENT=$2
echo "$ATTEMPT_ID" | grep -Eq '^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$' \
  || backup_die "attempt ID object restore tidak valid"
safe_remote_base "$TARGET_PARENT"
require_command rclone
[ "${OBJECT_TARGET_CREATE_CONFIRMATION:-}" = CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET ] \
  || backup_die "konfirmasi create target disposable tidak cocok"

target="${TARGET_PARENT%/}/${ATTEMPT_ID}"
marker="${target}/.diis-disposable-restore-target-v1"
[ "$target" != "${OFFSITE_CRYPT_REMOTE:-}" ] || backup_die "target tidak boleh sama dengan crypt source"

# Parent must already exist. This script never creates a provider account, bucket,
# or unbounded parent; only the exact attempt prefix below it.
parent_dirs=$(rclone lsf "$TARGET_PARENT" --dirs-only --max-depth 1) \
  || backup_die "parent target disposable tidak dapat diobservasi"
printf '%s\n' "$parent_dirs" | grep -Fqx "${ATTEMPT_ID}/" \
  && backup_die "target attempt sudah ada"

created=0
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if [ "$code" -ne 0 ] && [ "$created" -eq 1 ]; then
    rclone purge "$target" >/dev/null 2>&1 || cleanup_failed=1
    cleanup_parent_dirs=$(rclone lsf "$TARGET_PARENT" --dirs-only --max-depth 1)
    observe_rc=$?
    if [ "$observe_rc" -ne 0 ]; then
      cleanup_failed=1
    elif printf '%s\n' "$cleanup_parent_dirs" | grep -Fqx "${ATTEMPT_ID}/"; then
      cleanup_failed=1
    fi
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s retry=prohibited\n' "$ATTEMPT_ID" >&2
    code=74
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

created=1
rclone mkdir "$target"
printf '{"schemaVersion":"diis-disposable-object-target-v1","attemptId":"%s"}\n' "$ATTEMPT_ID" \
  | rclone rcat "$marker"
target_entries=$(rclone lsf "$target" --recursive --files-only) \
  || backup_die "target disposable tidak dapat diobservasi setelah create"
[ "$target_entries" = .diis-disposable-restore-target-v1 ] \
  || backup_die "marker target disposable tidak dapat diverifikasi"
printf 'OBJECT_RESTORE_TARGET_READY attemptId=%s target=%s\n' "$ATTEMPT_ID" "$target"

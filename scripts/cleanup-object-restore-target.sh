#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT/infrastructure/docker/scripts/backup-lib.sh"

[ "$#" -eq 2 ] || backup_die "usage: cleanup-object-restore-target.sh ATTEMPT_ID TARGET_PARENT_REMOTE"
ATTEMPT_ID=$1
TARGET_PARENT=$2
echo "$ATTEMPT_ID" | grep -Eq '^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$' \
  || backup_die "attempt ID object cleanup tidak valid"
safe_remote_base "$TARGET_PARENT"
require_command rclone
[ "${OBJECT_TARGET_CLEANUP_CONFIRMATION:-}" = DELETE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET ] \
  || backup_die "konfirmasi cleanup target disposable tidak cocok"

target="${TARGET_PARENT%/}/${ATTEMPT_ID}"
marker="${target}/.diis-disposable-restore-target-v1"
marker_value=$(rclone cat "$marker" 2>/dev/null) || backup_die "marker target disposable tidak tersedia"
printf '%s' "$marker_value" | grep -Fq '"schemaVersion":"diis-disposable-object-target-v1"' \
  || backup_die "schema marker target disposable tidak valid"
printf '%s' "$marker_value" | grep -Fq "\"attemptId\":\"${ATTEMPT_ID}\"" \
  || backup_die "attempt ID marker target disposable tidak cocok"

rclone purge "$target"
parent_dirs=$(rclone lsf "$TARGET_PARENT" --dirs-only --max-depth 1) \
  || backup_die "parent target tidak dapat diobservasi setelah purge"
if printf '%s\n' "$parent_dirs" | grep -Fqx "${ATTEMPT_ID}/"; then
  backup_die "absence proof target disposable gagal"
fi
printf 'OBJECT_RESTORE_TARGET_REMOVED attemptId=%s target=%s\n' "$ATTEMPT_ID" "$target"

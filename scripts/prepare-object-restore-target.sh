#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -n "${W10D_COMPLETION_VALIDATOR+x}" ] \
  || [ -n "${W10D_COMPLETION_VALIDATOR_PATH+x}" ] \
  || [ -n "${W10D_CAPTURE_HELPER_PATH+x}" ] \
  || [ -n "${W10D_DU_PARSER_PATH+x}" ]; then
  printf '%s\n' 'W10D_RUNTIME_SELECTOR_REJECTED' >&2
  exit 64
fi
. "$ROOT/infrastructure/docker/scripts/backup-lib.sh"
W10D_CAPTURE_HELPER_PATH="$ROOT/scripts/bounded-command-capture.py"

[ "$#" -eq 2 ] || backup_die "usage: prepare-object-restore-target.sh ATTEMPT_ID TARGET_PARENT_REMOTE"
ATTEMPT_ID=$1
TARGET_PARENT=$2
echo "$ATTEMPT_ID" | grep -Eq '^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$' \
  || backup_die "attempt ID object restore tidak valid"
safe_remote_base "$TARGET_PARENT"
require_command rclone
require_command python3
require_command mktemp
[ "${OBJECT_TARGET_CREATE_CONFIRMATION:-}" = CREATE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET ] \
  || backup_die "konfirmasi create target disposable tidak cocok"

target="${TARGET_PARENT%/}/${ATTEMPT_ID}"
marker="${target}/.diis-disposable-restore-target-v3"

OBSERVE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/diis-object-target-create.XXXXXXXX")
chmod 700 "$OBSERVE_DIR"
CONFIG_FILE="$OBSERVE_DIR/target-config.raw"
SOURCE_CRYPT_CONFIG_FILE="$OBSERVE_DIR/source-crypt-config.raw"
SOURCE_BACKING_CONFIG_FILE="$OBSERVE_DIR/source-backing-config.raw"
PARENT_RAW="$OBSERVE_DIR/parent-before.raw"
PARENT_LIST="$OBSERVE_DIR/parent-before.canonical"
TARGET_RAW="$OBSERVE_DIR/target-after.raw"
TARGET_LIST="$OBSERVE_DIR/target-after.canonical"
MARKER_FILE="$OBSERVE_DIR/marker.json"
CLEANUP_PURGE_OUTPUT="$OBSERVE_DIR/purge-cleanup.raw"
CLEANUP_PARENT_RAW="$OBSERVE_DIR/parent-cleanup.raw"
CLEANUP_PARENT_LIST="$OBSERVE_DIR/parent-cleanup.canonical"
created=0
SUCCESS_PENDING=0
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if [ "$code" -ne 0 ] && [ "$created" -eq 1 ]; then
    w10d_capture_command "$CLEANUP_PURGE_OUTPUT" 4096 rclone purge "$target" \
      || cleanup_failed=1
    if ! (w10d_capture_command "$CLEANUP_PARENT_RAW" 1048576 rclone lsf "$TARGET_PARENT" \
      --dirs-only --max-depth 1); then
      cleanup_failed=1
    elif ! (w10d_canonicalize_inventory "$CLEANUP_PARENT_RAW" "$CLEANUP_PARENT_LIST"); then
      cleanup_failed=1
    elif grep -Fqx "${ATTEMPT_ID}/" "$CLEANUP_PARENT_LIST"; then
      cleanup_failed=1
    fi
  fi
  for cleanup_file in "$CONFIG_FILE" "$SOURCE_CRYPT_CONFIG_FILE" \
    "$SOURCE_BACKING_CONFIG_FILE" "$PARENT_RAW" "$PARENT_LIST" "$TARGET_RAW" \
    "$TARGET_LIST" "$MARKER_FILE" \
    "${PARENT_LIST}.sorted" "${PARENT_LIST}.unique" \
    "${TARGET_LIST}.sorted" "${TARGET_LIST}.unique" \
    "$CLEANUP_PURGE_OUTPUT" "$CLEANUP_PARENT_RAW" "$CLEANUP_PARENT_LIST" \
    "${CLEANUP_PARENT_LIST}.sorted" "${CLEANUP_PARENT_LIST}.unique"; do
    [ -e "$cleanup_file" ] || continue
    rm -f -- "$cleanup_file" >/dev/null 2>&1 || cleanup_failed=1
    [ ! -e "$cleanup_file" ] || cleanup_failed=1
  done
  rmdir "$OBSERVE_DIR" >/dev/null 2>&1 || cleanup_failed=1
  [ ! -e "$OBSERVE_DIR" ] || cleanup_failed=1
  if [ "$cleanup_failed" -ne 0 ]; then
    printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=local-evidence retry=prohibited\n' \
      "$ATTEMPT_ID" >&2
    code=74
  elif [ "$code" -eq 0 ] && [ "$SUCCESS_PENDING" -eq 1 ]; then
    if ! printf 'OBJECT_RESTORE_TARGET_READY attemptId=%s target=%s\n' "$ATTEMPT_ID" "$target"; then
      printf 'OBJECT_TARGET_SUCCESS_AMBIGUOUS attemptId=%s phase=success-marker retry=prohibited\n' \
        "$ATTEMPT_ID" >&2
      code=74
    fi
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_object_target_authority "$ATTEMPT_ID" "$TARGET_PARENT" "$target" "$CONFIG_FILE" \
  "$SOURCE_CRYPT_CONFIG_FILE" "$SOURCE_BACKING_CONFIG_FILE"
TARGET_PARENT=$OBJECT_TARGET_CANONICAL_PARENT
target=$OBJECT_TARGET_CANONICAL_TARGET
marker="${target}/.diis-disposable-restore-target-v3"

# Parent must already exist. This script never creates a provider account, bucket,
# or unbounded parent; only the exact attempt prefix below it.
w10d_capture_command "$PARENT_RAW" 1048576 rclone lsf "$TARGET_PARENT" \
  --dirs-only --max-depth 1 \
  || backup_die "parent target disposable tidak dapat diobservasi"
w10d_canonicalize_inventory "$PARENT_RAW" "$PARENT_LIST"
grep -Fqx "${ATTEMPT_ID}/" "$PARENT_LIST" \
  && backup_die "target attempt sudah ada"

created=1
rclone mkdir "$target"
write_disposable_target_marker "$ATTEMPT_ID" | rclone rcat "$marker"
w10d_capture_command "$TARGET_RAW" 1048576 rclone lsf "$target" --recursive --files-only \
  || backup_die "target disposable tidak dapat diobservasi setelah create"
w10d_canonicalize_inventory "$TARGET_RAW" "$TARGET_LIST"
[ "$(wc -l <"$TARGET_LIST" | tr -d '[:space:]')" = 1 ] \
  && grep -Fqx .diis-disposable-restore-target-v3 "$TARGET_LIST" \
  || backup_die "marker target disposable tidak dapat diverifikasi"
w10d_capture_command "$MARKER_FILE" 4096 rclone cat "$marker" \
  || backup_die "marker target disposable tidak dapat dibaca setelah create"
validate_disposable_target_marker "$MARKER_FILE" "$ATTEMPT_ID" \
  || backup_die "marker target disposable tidak cocok dengan authority approved"
SUCCESS_PENDING=1

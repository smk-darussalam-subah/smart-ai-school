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

[ "$#" -eq 2 ] || backup_die "usage: cleanup-object-restore-target.sh ATTEMPT_ID TARGET_PARENT_REMOTE"
ATTEMPT_ID=$1
TARGET_PARENT=$2
echo "$ATTEMPT_ID" | grep -Eq '^w10d-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$' \
  || backup_die "attempt ID object cleanup tidak valid"
safe_remote_base "$TARGET_PARENT"
require_command rclone
require_command python3
require_command mktemp
[ "${OBJECT_TARGET_CLEANUP_CONFIRMATION:-}" = DELETE_EXACT_DISPOSABLE_OBJECT_RESTORE_TARGET ] \
  || backup_die "konfirmasi cleanup target disposable tidak cocok"

target="${TARGET_PARENT%/}/${ATTEMPT_ID}"
marker="${target}/.diis-disposable-restore-target-v3"
OBSERVE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/diis-object-target-cleanup.XXXXXXXX")
chmod 700 "$OBSERVE_DIR"
CONFIG_FILE="$OBSERVE_DIR/target-config.raw"
SOURCE_CRYPT_CONFIG_FILE="$OBSERVE_DIR/source-crypt-config.raw"
SOURCE_BACKING_CONFIG_FILE="$OBSERVE_DIR/source-backing-config.raw"
MARKER_FILE="$OBSERVE_DIR/marker.json"
PURGE_OUTPUT="$OBSERVE_DIR/purge.raw"
PARENT_RAW="$OBSERVE_DIR/parent-after.raw"
PARENT_LIST="$OBSERVE_DIR/parent-after.canonical"
PURGE_STARTED=0
AMBIGUITY_REPORTED=0
SUCCESS_PENDING=0
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  if [ "$code" -ne 0 ] && [ "$PURGE_STARTED" -eq 1 ] \
    && [ "$AMBIGUITY_REPORTED" -eq 0 ]; then
    printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=purge-boundary retry=prohibited\n' \
      "$ATTEMPT_ID" >&2
    code=74
  fi
  cleanup_failed=0
  for cleanup_file in "$CONFIG_FILE" "$SOURCE_CRYPT_CONFIG_FILE" \
    "$SOURCE_BACKING_CONFIG_FILE" "$MARKER_FILE" "$PURGE_OUTPUT" "$PARENT_RAW" "$PARENT_LIST" \
    "${PARENT_LIST}.sorted" "${PARENT_LIST}.unique"; do
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
    if ! printf 'OBJECT_RESTORE_TARGET_REMOVED attemptId=%s target=%s\n' "$ATTEMPT_ID" "$target"; then
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
w10d_capture_command "$MARKER_FILE" 4096 rclone cat "$marker" \
  || backup_die "marker target disposable tidak tersedia"
validate_disposable_target_marker "$MARKER_FILE" "$ATTEMPT_ID" \
  || backup_die "marker target disposable tidak valid"

PURGE_STARTED=1
if ! w10d_capture_command "$PURGE_OUTPUT" 4096 rclone purge "$target"; then
  AMBIGUITY_REPORTED=1
  printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=purge retry=prohibited\n' \
    "$ATTEMPT_ID" >&2
  exit 74
fi
if ! w10d_capture_command "$PARENT_RAW" 1048576 rclone lsf "$TARGET_PARENT" \
  --dirs-only --max-depth 1; then
  AMBIGUITY_REPORTED=1
  printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=post-purge-observation retry=prohibited\n' \
    "$ATTEMPT_ID" >&2
  exit 74
fi
if ! (w10d_canonicalize_inventory "$PARENT_RAW" "$PARENT_LIST"); then
  AMBIGUITY_REPORTED=1
  printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=post-purge-parse retry=prohibited\n' \
    "$ATTEMPT_ID" >&2
  exit 74
fi
if grep -Fqx "${ATTEMPT_ID}/" "$PARENT_LIST"; then
  AMBIGUITY_REPORTED=1
  printf 'OBJECT_TARGET_CLEANUP_AMBIGUOUS attemptId=%s phase=absence-proof retry=prohibited\n' \
    "$ATTEMPT_ID" >&2
  exit 74
fi
SUCCESS_PENDING=1

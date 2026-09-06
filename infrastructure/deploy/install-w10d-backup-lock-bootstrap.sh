#!/bin/bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEST_BOUNDARY="$SCRIPT_DIR/../../scripts/w10d-test-boundary.sh"
[ -f "$TEST_BOUNDARY" ] && [ ! -L "$TEST_BOUNDARY" ] \
  || { printf 'LOCK_BOOTSTRAP_REJECTED reason=test-boundary-unavailable\n' >&2; exit 65; }
# shellcheck source=../../scripts/w10d-test-boundary.sh
. "$TEST_BOUNDARY"

CONFIRMATION=${LOCK_BOOTSTRAP_CONFIRMATION:-}
EXPECTED_INSTALLER_SHA256=${EXPECTED_INSTALLER_SHA256:?EXPECTED_INSTALLER_SHA256 is required}
EXPECTED_RULE_SHA256=${EXPECTED_RULE_SHA256:?EXPECTED_RULE_SHA256 is required}
RULE_SOURCE=${RULE_SOURCE:?RULE_SOURCE is required}
ROOT_PREFIX=${ROOT_PREFIX:-}
OWNER_NAME=${LOCK_OWNER_NAME:-appuser}
GROUP_NAME=${LOCK_GROUP_NAME:-appuser}
RULE_DEST="$ROOT_PREFIX/etc/tmpfiles.d/diis-backup-lock.conf"
LOCK_TARGET="$ROOT_PREFIX/var/lock/diis-backup"
CANONICAL_TARGET="$ROOT_PREFIX/run/lock/diis-backup"
INSTALL_GUARD="$ROOT_PREFIX/run/lock/.diis-backup-bootstrap.guard"

die() { printf 'LOCK_BOOTSTRAP_REJECTED reason=%s\n' "$1" >&2; exit 65; }
[ "$CONFIRMATION" = INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP ] || die confirmation-mismatch
w10d_init_test_boundary || die unsafe-test-root
if [ "$W10D_TEST_MODE" = 0 ]; then
  w10d_no_test_value "${ALLOW_TEST_ROOT:-}" || die test-control-forbidden
  for value in "${DIIS_TEST_FAULT:-}" "${DIIS_TEST_HOLD_AFTER_GUARD_SECONDS:-}" \
    "${DIIS_TEST_SIGNAL_AFTER_RULE:-}" "${DIIS_TEST_SIGNAL_AFTER_DIRECTORY:-}" \
    "${DIIS_TEST_CHECK_MOUNTPOINT:-}"; do
    w10d_no_test_value "$value" || die test-control-forbidden
  done
  [ "$(id -u)" = 0 ] || die root-required
  [ -z "$ROOT_PREFIX" ] || die root-prefix-forbidden
else
  [ "${ALLOW_TEST_ROOT:-0}" = 1 ] || die test-mode-confirmation-missing
  w10d_test_path_confined "$ROOT_PREFIX" || die unsafe-test-root
  w10d_test_path_confined "$RULE_SOURCE" || die unsafe-test-rule-source
fi

for command in sha256sum stat readlink install mv rm rmdir mkdir id getent cat awk chown mountpoint dirname sleep; do
  command -v "$command" >/dev/null 2>&1 || die command-unavailable
done
for value in "$EXPECTED_INSTALLER_SHA256" "$EXPECTED_RULE_SHA256"; do
  [[ "$value" =~ ^[a-f0-9]{64}$ ]] || die invalid-hash
done
[ -f "$0" ] && [ ! -L "$0" ] || die installer-source-invalid
[ -f "$RULE_SOURCE" ] && [ ! -L "$RULE_SOURCE" ] || die rule-source-invalid
rule_mode=$(stat -c '%a' "$RULE_SOURCE")
[ "$rule_mode" -lt 1000 ] || die rule-source-mode-invalid
if [ "$W10D_TEST_MODE" = 0 ]; then (( (8#$rule_mode & 8#022) == 0 )) || die rule-source-writable; fi
[ "$(sha256sum "$0" | awk '{print $1}')" = "$EXPECTED_INSTALLER_SHA256" ] || die installer-hash-mismatch
[ "$(sha256sum "$RULE_SOURCE" | awk '{print $1}')" = "$EXPECTED_RULE_SHA256" ] || die rule-hash-mismatch
[ "$(cat "$RULE_SOURCE")" = 'd /var/lock/diis-backup 0750 appuser appuser - -' ] || die rule-content-mismatch

owner_uid=$(id -u "$OWNER_NAME" 2>/dev/null) || die owner-unavailable
group_record=$(getent group "$GROUP_NAME" 2>/dev/null) || die group-unavailable
group_gid=$(printf '%s\n' "$group_record" | awk -F: 'NF == 4 { print $3 }')
[[ "$group_gid" =~ ^[0-9]+$ ]] || die group-unavailable

mkdir -p "$(dirname "$RULE_DEST")" "$ROOT_PREFIX/run/lock"
[ -d "$(dirname "$RULE_DEST")" ] && [ ! -L "$(dirname "$RULE_DEST")" ] || die destination-parent-invalid
[ -d "$ROOT_PREFIX/run/lock" ] && [ ! -L "$ROOT_PREFIX/run/lock" ] || die canonical-parent-invalid

guard_acquired=0
created_rule=0
created_dir=0
candidate="${RULE_DEST}.candidate.$$"
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  rm -f -- "$candidate"
  if (( code != 0 )); then
    (( created_dir == 0 )) || rmdir -- "$CANONICAL_TARGET" >/dev/null 2>&1
    (( created_rule == 0 )) || rm -f -- "$RULE_DEST" >/dev/null 2>&1
    if (( created_dir == 1 )) && [ -e "$CANONICAL_TARGET" ]; then code=74; fi
    if (( created_rule == 1 )) && [ -e "$RULE_DEST" ]; then code=74; fi
  fi
  if (( guard_acquired == 1 )); then
    rmdir -- "$INSTALL_GUARD" >/dev/null 2>&1 || code=74
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -m 0700 "$INSTALL_GUARD" 2>/dev/null || die installer-concurrency-ambiguous
guard_acquired=1
if [ "$W10D_TEST_MODE" = 1 ] && [ -n "${DIIS_TEST_HOLD_AFTER_GUARD_SECONDS:-}" ]; then
  [[ "$DIIS_TEST_HOLD_AFTER_GUARD_SECONDS" =~ ^[0-9]+$ ]] || die invalid-test-hold
  sleep "$DIIS_TEST_HOLD_AFTER_GUARD_SECONDS"
fi

# Validate every pre-existing target without changing its owner, mode, or bytes.
if [ -e "$RULE_DEST" ] || [ -L "$RULE_DEST" ]; then
  [ -f "$RULE_DEST" ] && [ ! -L "$RULE_DEST" ] || die destination-rule-invalid
  [ "$(sha256sum "$RULE_DEST" | awk '{print $1}')" = "$EXPECTED_RULE_SHA256" ] || die destination-rule-drift
  if [ "$W10D_TEST_MODE" = 1 ]; then
    [ "$(stat -c '%a' "$RULE_DEST")" = 644 ] || die destination-rule-metadata-drift
  else
    [ "$(stat -c '%a:%u:%g' "$RULE_DEST")" = '644:0:0' ] || die destination-rule-metadata-drift
  fi
  rule_exists=1
else
  rule_exists=0
fi
if [ -e "$LOCK_TARGET" ] || [ -L "$LOCK_TARGET" ]; then
  [ -d "$LOCK_TARGET" ] && [ ! -L "$LOCK_TARGET" ] || die target-invalid
  [ "$(readlink -f "$LOCK_TARGET")" = "$CANONICAL_TARGET" ] || die target-canonical-mismatch
  [ -d "$CANONICAL_TARGET" ] && [ ! -L "$CANONICAL_TARGET" ] || die target-type-mismatch
  [ "$(stat -c '%a:%u:%g' "$CANONICAL_TARGET")" = "750:$owner_uid:$group_gid" ] || die target-metadata-drift
  if [ "$W10D_TEST_MODE" = 0 ] || [ "${DIIS_TEST_CHECK_MOUNTPOINT:-0}" = 1 ]; then
    [ "$(stat -c '%d' "$CANONICAL_TARGET")" = "$(stat -c '%d' "$(dirname "$CANONICAL_TARGET")")" ] || die target-wrong-mount
    ! mountpoint -q "$CANONICAL_TARGET" || die target-is-mountpoint
  fi
  target_exists=1
else
  target_exists=0
fi

if (( rule_exists == 0 )); then
  install -m 0644 "$RULE_SOURCE" "$candidate"
  if [ "$W10D_TEST_MODE" = 0 ]; then chown 0:0 "$candidate"; fi
  [ "$(sha256sum "$candidate" | awk '{print $1}')" = "$EXPECTED_RULE_SHA256" ] || die candidate-rule-hash-mismatch
  mv -T "$candidate" "$RULE_DEST"
  created_rule=1
fi
if [ "$W10D_TEST_MODE" = 1 ] && [ "${DIIS_TEST_FAULT:-}" = after-rule ]; then die injected-after-rule; fi
if [ "$W10D_TEST_MODE" = 1 ] && [ -n "${DIIS_TEST_SIGNAL_AFTER_RULE:-}" ]; then
  kill -s "$DIIS_TEST_SIGNAL_AFTER_RULE" "$$"
fi
if (( target_exists == 0 )); then
  mkdir -m 0750 "$LOCK_TARGET"
  created_dir=1
  if [ "$W10D_TEST_MODE" = 0 ]; then chown "$owner_uid:$group_gid" "$LOCK_TARGET"; fi
fi
if [ "$W10D_TEST_MODE" = 1 ] && [ "${DIIS_TEST_FAULT:-}" = after-directory ]; then die injected-after-directory; fi
if [ "$W10D_TEST_MODE" = 1 ] && [ -n "${DIIS_TEST_SIGNAL_AFTER_DIRECTORY:-}" ]; then
  kill -s "$DIIS_TEST_SIGNAL_AFTER_DIRECTORY" "$$"
fi

[ "$(readlink -f "$LOCK_TARGET")" = "$CANONICAL_TARGET" ] || die target-canonical-mismatch
[ "$(stat -c '%a:%u:%g' "$CANONICAL_TARGET")" = "750:$owner_uid:$group_gid" ] || die target-metadata-drift
[ "$(sha256sum "$RULE_DEST" | awk '{print $1}')" = "$EXPECTED_RULE_SHA256" ] || die installed-rule-drift

created_rule=0
created_dir=0
rmdir -- "$INSTALL_GUARD" || die guard-release-failed
guard_acquired=0
trap - EXIT HUP INT TERM
printf 'LOCK_BOOTSTRAP_OK pathSha256=%s ownerUid=%s groupGid=%s mode=0750 ruleSha256=%s\n' \
  "$(printf '%s' /var/lock/diis-backup | sha256sum | awk '{print $1}')" \
  "$owner_uid" "$group_gid" "$EXPECTED_RULE_SHA256"

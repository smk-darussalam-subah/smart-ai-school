#!/bin/sh
# Mounted as /backup.sh only in the separately approved legacy-compatibility gate.
set -eu
umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

stop() { printf '%s\n' 'LEGACY_WRITER_STOP quarantine-retained reconcile-before-retry' >&2; exit 74; }
library=/backup-lib.sh
legacy=/legacy-backup.sh
lock=/var/lock/diis-backup/backup.lock
expected=bc530d0a9110319684e7e4b60db56a3da1e1d979d9b1b6d8dc7887c209ff204e
library_sha=bf881caf29af389e1d0d328e9b5816d570154b72b873ea82aac6d1be418e8e5a

case "${W10D_TEST_MODE:-0}" in
  0) [ -z "${DIIS_W10D_TEST_ROOT:-}" ] && [ -z "${W10D_TEST_RESULT:-}" ] || stop ;;
  1)
    root=${DIIS_W10D_TEST_ROOT:?}
    [ "$(dirname "$root")" = /tmp ] && [ "$(readlink -f "$root")" = "$root" ] \
      && [ ! -L "$root" ] && [ "$(stat -c '%a:%u' "$root")" = "700:$(id -u)" ] || stop
    library=$root/backup-lib.sh
    legacy=$root/legacy-backup.sh
    lock=$root/locks/backup.lock
    # The only synthetic payload is fixed here, not a caller-supplied program/hash.
    case "${W10D_TEST_RESULT:-success}" in
      success) expected=$(printf '#!/bin/sh\nexit 0\n' | sha256sum | awk '{print $1}') ;;
      failure) expected=$(printf '#!/bin/sh\nexit 1\n' | sha256sum | awk '{print $1}') ;;
      signal) expected=$(printf '#!/bin/sh\nkill -TERM "$PPID"\nexit 1\n' | sha256sum | awk '{print $1}') ;;
      *) stop ;;
    esac
    ;;
  *) stop ;;
esac
for file in "$library" "$legacy"; do
  [ -f "$file" ] && [ ! -L "$file" ] && [ "$(stat -c '%h' "$file")" = 1 ] || stop
done
[ "$(sha256sum "$library" | awk '{print $1}')" = "$library_sha" ] || stop
[ "$(sha256sum "$legacy" | awk '{print $1}')" = "$expected" ] || stop
command -v timeout >/dev/null || stop
# No environment-selected lock behavior in this bridge.
BACKUP_LOCK_TEST_MODE=0
BACKUP_LOCK_BOOTSTRAP_REQUIRED=1
export BACKUP_LOCK_TEST_MODE BACKUP_LOCK_BOOTSTRAP_REQUIRED
. "$library"
acquire_directory_lock "$lock"
# Publish a persistent sentinel before any legacy producer. Even wrapper death or
# reboot cannot make a subsequent writer reclaim this as an ordinary stale lock.
trap stop HUP INT TERM
printf '{"schema":"diis-legacy-writer-quarantine-v1"}\n' >"$lock/application-owner.json"
owner_boot=$(sed -n '1p' "$lock/owner")
owner_pid=$(sed -n '2p' "$lock/owner")
owner_start=$(sed -n '3p' "$lock/owner")
printf '%s\n%s\n%s\n%s\n%s\n' "$owner_boot" "$owner_pid" "$owner_start" \
  "$LOCK_OWNER_TOKEN" diis-application-quarantine:legacy-backup >"$lock/owner.bridge"
mv "$lock/owner.bridge" "$lock/owner"
# Legacy bytes are fixed; its output is never forwarded to public logs. A timeout
# or failure retains quarantine and requires producer reconciliation, not retry.
timeout -s TERM -k 30 1800 sh "$legacy" >/dev/null 2>&1 || stop
[ "$(sha256sum "$legacy" | awk '{print $1}')" = "$expected" ] || stop
[ "$(sed -n '4p' "$lock/owner")" = "$LOCK_OWNER_TOKEN" ] || stop
rm "$lock/application-owner.json" || stop
release_directory_lock "$lock" || stop
trap - HUP INT TERM
printf '%s\n' 'LEGACY_WRITER_FINISHED canonical-lock-released'

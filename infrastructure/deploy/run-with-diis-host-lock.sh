#!/bin/bash

set -Eeuo pipefail

HOST_LOCK=${HOST_LOCK:-/home/appuser/.local/state/diis-deploy/deploy.lock}
[ "${HOST_LOCK_CONFIRMATION:-}" = RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK ] \
  || { echo 'ERROR: exact host-lock confirmation required' >&2; exit 64; }
[ "$#" -gt 0 ] || { echo 'ERROR: command required' >&2; exit 64; }
command -v flock >/dev/null 2>&1 || { echo 'ERROR: flock unavailable' >&2; exit 70; }
mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || { echo 'ERROR: production host lock is already held' >&2; exit 75; }
exec "$@"

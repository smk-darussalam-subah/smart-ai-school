#!/bin/bash

set -Eeuo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TEST_BOUNDARY="$SCRIPT_DIR/../../scripts/w10d-test-boundary.sh"
[ -f "$TEST_BOUNDARY" ] && [ ! -L "$TEST_BOUNDARY" ] \
  || { echo 'ERROR: test boundary unavailable' >&2; exit 65; }
# shellcheck source=../../scripts/w10d-test-boundary.sh
. "$TEST_BOUNDARY"
w10d_init_test_boundary \
  || { echo 'ERROR: test root is not one canonical private direct child of /tmp' >&2; exit 65; }
w10d_bind_host_lock /home/appuser/.local/state/diis-deploy/deploy.lock \
  || { echo 'ERROR: host lock must use canonical production identity or confined test override' >&2; exit 65; }
[ "${HOST_LOCK_CONFIRMATION:-}" = RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK ] \
  || { echo 'ERROR: exact host-lock confirmation required' >&2; exit 64; }
[ "$#" -gt 0 ] || { echo 'ERROR: command required' >&2; exit 64; }
command -v flock >/dev/null 2>&1 || { echo 'ERROR: flock unavailable' >&2; exit 70; }
mkdir -p "$(dirname "$HOST_LOCK")"
exec 9>"$HOST_LOCK"
flock -n 9 || { echo 'ERROR: production host lock is already held' >&2; exit 75; }
exec "$@"

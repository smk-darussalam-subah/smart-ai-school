#!/bin/sh

# Shared fail-closed boundary for test controls used by W10-D operator source.
# A test root is never inferred. When explicitly supplied it must be one real,
# private, caller-owned directory directly below /tmp.
w10d_init_test_boundary() {
  W10D_TEST_MODE=0
  W10D_CANONICAL_TEST_ROOT=''
  [ -n "${DIIS_W10D_TEST_ROOT:-}" ] || return 0
  command -v readlink >/dev/null 2>&1 || return 1
  command -v stat >/dev/null 2>&1 || return 1
  command -v id >/dev/null 2>&1 || return 1
  command -v dirname >/dev/null 2>&1 || return 1
  [ -d "$DIIS_W10D_TEST_ROOT" ] && [ ! -L "$DIIS_W10D_TEST_ROOT" ] || return 1
  W10D_CANONICAL_TEST_ROOT=$(readlink -f -- "$DIIS_W10D_TEST_ROOT") || return 1
  [ "$W10D_CANONICAL_TEST_ROOT" = "$DIIS_W10D_TEST_ROOT" ] || return 1
  [ "$(dirname -- "$W10D_CANONICAL_TEST_ROOT")" = /tmp ] || return 1
  [ "$(stat -c '%a:%u' -- "$W10D_CANONICAL_TEST_ROOT")" = "700:$(id -u)" ] || return 1
  W10D_TEST_MODE=1
}

w10d_test_path_confined() {
  [ "${W10D_TEST_MODE:-0}" = 1 ] || return 1
  [ -n "${1:-}" ] || return 1
  candidate=$(readlink -m -- "$1") || return 1
  case "$candidate" in
    "$W10D_CANONICAL_TEST_ROOT"/*) return 0 ;;
    *) return 1 ;;
  esac
}

w10d_no_test_value() {
  value=${1:-}
  [ -z "$value" ] || [ "$value" = 0 ]
}

w10d_bind_host_lock() {
  canonical=$1
  supplied=${HOST_LOCK+x}
  supplied_value=${HOST_LOCK:-}
  if [ "${W10D_TEST_MODE:-0}" = 1 ]; then
    [ "${ALLOW_TEST_HOST_LOCK:-0}" = 1 ] || return 1
    [ -n "$supplied_value" ] || return 1
    w10d_test_path_confined "$supplied_value" || return 1
    [ ! -L "$supplied_value" ] || return 1
    lock_parent=$(dirname -- "$supplied_value")
    while [ "$lock_parent" != / ] && [ "$lock_parent" != . ]; do
      [ ! -L "$lock_parent" ] || return 1
      [ "$lock_parent" = "$W10D_CANONICAL_TEST_ROOT" ] && break
      lock_parent=$(dirname -- "$lock_parent")
    done
    HOST_LOCK=$(readlink -m -- "$supplied_value") || return 1
  else
    [ -z "$supplied" ] || return 1
    [ -z "${ALLOW_TEST_HOST_LOCK:-}" ] || [ "${ALLOW_TEST_HOST_LOCK:-}" = 0 ] || return 1
    HOST_LOCK=$canonical
  fi
  export HOST_LOCK
}

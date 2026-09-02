#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "worker" ]]; then
  root=$2
  label=$3
  timeout_seconds=$4
  hold_seconds=$5
  lock_file="$root/deploy.lock"
  owner_file="$root/owner"
  exec 9>"$lock_file"
  if ! flock --wait "$timeout_seconds" 9; then
    printf '%s-timeout\n' "$label" >>"$root/events"
    exit 73
  fi
  printf 'state=active run_id=%s branch=staging sha=%040d\n' "$label" 0 >"$owner_file"
  printf '%s-acquired\n' "$label" >>"$root/events"
  printf '%s\n' "$label" >>"$root/mutations"
  sleep "$hold_seconds"
  printf '%s-released\n' "$label" >>"$root/events"
  exit 0
fi

command -v flock >/dev/null
ROOT=$(mktemp -d /tmp/diis-deploy-lock-contract.XXXXXX)
WORKER_PIDS=()

cleanup() {
  local pid
  for pid in "${WORKER_PIDS[@]}"; do
    kill "$pid" >/dev/null 2>&1 || true
    wait "$pid" >/dev/null 2>&1 || true
  done
  case "$ROOT" in
    /tmp/diis-deploy-lock-contract.*) rm -rf -- "$ROOT" ;;
    *) exit 97 ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_event() {
  local event worker_pid attempt
  event=$1
  worker_pid=$2
  for attempt in $(seq 1 100); do
    if grep -Fq "$event" "$ROOT/events"; then
      return 0
    fi
    if ! kill -0 "$worker_pid" >/dev/null 2>&1; then
      wait "$worker_pid" || true
      echo "DEPLOY_LOCK_CONTRACT_ERROR reason=worker-exited-before-event event=$event" >&2
      return 1
    fi
    sleep 0.05
  done
  echo "DEPLOY_LOCK_CONTRACT_ERROR reason=event-timeout event=$event" >&2
  return 1
}

: >"$ROOT/events"
: >"$ROOT/mutations"
bash "$0" worker "$ROOT" first 5 1 &
first_pid=$!
WORKER_PIDS+=("$first_pid")
wait_for_event first-acquired "$first_pid"
bash "$0" worker "$ROOT" second 5 0 &
second_pid=$!
WORKER_PIDS+=("$second_pid")
wait "$first_pid"
wait "$second_pid"
WORKER_PIDS=()
mapfile -t serialized_events <"$ROOT/events"
[[ "${serialized_events[*]}" == \
  'first-acquired first-released second-acquired second-released' ]]
[[ "$(wc -l <"$ROOT/mutations")" -eq 2 ]]
echo 'PARALLEL_DEPLOY_SERIALIZED_OK'

: >"$ROOT/events"
: >"$ROOT/mutations"
bash "$0" worker "$ROOT" holder 5 1 &
holder_pid=$!
WORKER_PIDS+=("$holder_pid")
wait_for_event holder-acquired "$holder_pid"
set +e
bash "$0" worker "$ROOT" rejected 0 0
rejected_status=$?
set -e
[[ "$rejected_status" -eq 73 ]]
wait "$holder_pid"
WORKER_PIDS=()
grep -Fq 'rejected-timeout' "$ROOT/events"
! grep -Fqx 'rejected' "$ROOT/mutations"
[[ "$(wc -l <"$ROOT/mutations")" -eq 1 ]]
echo 'BOUNDED_LOCK_TIMEOUT_NO_MUTATION_OK'

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=../diis-appointment-operations.sh
. "$SCRIPT_DIR/../diis-appointment-operations.sh"

ROOT=$(mktemp -d /tmp/diis-appointment-operations.XXXXXX)
cleanup() {
  case "$ROOT" in
    /tmp/diis-appointment-operations.*) rm -rf -- "$ROOT" ;;
    *) exit 97 ;;
  esac
}
trap cleanup EXIT HUP INT TERM

TARGETS=(policy script runbook operations service timer)

cat >"$ROOT/systemctl-stub" <<'EOF'
#!/usr/bin/env bash
set -eu
case "$1" in
  daemon-reload) printf 'daemon-reload\n' >>"$DAEMON_RELOAD_LOG" ;;
  is-enabled) printf 'disabled\n' ;;
  is-active) printf 'inactive\n' ;;
  *) exit 64 ;;
esac
EOF
chmod 700 "$ROOT/systemctl-stub"

seed_baseline() {
  scenario=$1
  rm -rf -- "$ROOT/host" "$ROOT/new" "$ROOT/rollback"
  mkdir -p "$ROOT/host" "$ROOT/new" "$ROOT/rollback"
  for target in "${TARGETS[@]}"; do
    printf 'new-%s\n' "$target" >"$ROOT/new/$target"
    if [[ "$scenario" == all-present || "$target" =~ ^(policy|script|operations|service)$ ]]; then
      printf 'baseline-%s\n' "$target" >"$ROOT/host/$target"
      chmod 640 "$ROOT/host/$target"
      cp -a -- "$ROOT/host/$target" "$ROOT/rollback/$target.baseline"
      : >"$ROOT/rollback/$target.present"
    else
      : >"$ROOT/rollback/$target.absent"
    fi
  done
  : >"$ROOT/daemon-reload.log"
}

configure_transaction() {
  DIIS_ROLLBACK_DIR=$ROOT/rollback
  DIIS_POLICY_TARGET=$ROOT/host/policy
  DIIS_SCRIPT_TARGET=$ROOT/host/script
  DIIS_RUNBOOK_TARGET=$ROOT/host/runbook
  DIIS_OPERATIONS_TARGET=$ROOT/host/operations
  DIIS_SERVICE_TARGET=$ROOT/host/service
  DIIS_TIMER_TARGET=$ROOT/host/timer
  DIIS_POLICY_NEW=$ROOT/host/policy.new
  DIIS_SCRIPT_NEW=$ROOT/host/script.new
  DIIS_RUNBOOK_NEW=$ROOT/host/runbook.new
  DIIS_OPERATIONS_NEW=$ROOT/host/operations.new
  DIIS_SERVICE_NEW=$ROOT/host/service.new
  DIIS_TIMER_NEW=$ROOT/host/timer.new
  DIIS_SYSTEMCTL_PATH=$ROOT/systemctl-stub
  DIIS_VISUDO_PATH=/bin/true
  DAEMON_RELOAD_LOG=$ROOT/daemon-reload.log
  export DAEMON_RELOAD_LOG
}

diis_cleanup_installation() {
  :
}

verify_baseline() {
  for target in "${TARGETS[@]}"; do
    if [[ -e "$ROOT/rollback/$target.present" ]]; then
      cmp -s "$ROOT/rollback/$target.baseline" "$ROOT/host/$target"
      [[ $(stat -c '%a' "$ROOT/rollback/$target.baseline") == \
        "$(stat -c '%a' "$ROOT/host/$target")" ]]
    else
      [[ ! -e "$ROOT/host/$target" ]]
    fi
    [[ ! -e "$ROOT/host/$target.new" ]]
    [[ ! -e "$ROOT/host/$target.rollback" ]]
  done
  [[ $(wc -l <"$ROOT/daemon-reload.log") -eq 1 ]]
}

run_interrupted_transaction() (
  set -eu
  mode=$1
  stop_after=$2
  configure_transaction
  diis_arm_install_traps
  index=0
  for target in "${TARGETS[@]}"; do
    cp -- "$ROOT/new/$target" "$ROOT/host/$target.new"
  done
  for target in "${TARGETS[@]}"; do
    mv -f -- "$ROOT/host/$target.new" "$ROOT/host/$target"
    index=$((index + 1))
    if [[ "$index" -eq "$stop_after" ]]; then
      case "$mode" in
        command-failure) exit 42 ;;
        explicit-exit) exit 0 ;;
        signal) kill -TERM "$BASHPID"; sleep 1; exit 90 ;;
        *) exit 91 ;;
      esac
    fi
  done
  DIIS_INSTALL_COMMITTED=true
)

rollback_cases=0
for scenario in all-present mixed-presence; do
  for stop_after in 1 2 3 4 5 6; do
    seed_baseline "$scenario"
    set +e
    run_interrupted_transaction command-failure "$stop_after"
    status=$?
    set -e
    [[ "$status" -eq 42 ]]
    verify_baseline
    rollback_cases=$((rollback_cases + 1))
  done
done

seed_baseline all-present
set +e
run_interrupted_transaction explicit-exit 3
status=$?
set -e
[[ "$status" -eq 97 ]]
verify_baseline
rollback_cases=$((rollback_cases + 1))

seed_baseline mixed-presence
set +e
run_interrupted_transaction signal 4
status=$?
set -e
[[ "$status" -eq 143 ]]
verify_baseline
rollback_cases=$((rollback_cases + 1))

[[ "$rollback_cases" -eq 14 ]]
echo 'CANONICAL_TRANSACTIONAL_ROLLBACK_OK=14/14'

cat >"$ROOT/systemctl-observer-stub" <<'EOF'
#!/usr/bin/env bash
set -eu
index=$(cat "$INDEX_FILE")
line=$(sed -n "${index}p" "$SAMPLE_FILE")
if [[ -z "$line" ]]; then
  line=$(tail -n 1 "$SAMPLE_FILE")
fi
read -r jobs service_state service_start last_trigger <<<"$line"
case "$1" in
  is-active)
    printf '%s\n' "$service_state"
    ;;
  show)
    case "$*" in
      *ExecMainStartTimestampMonotonic*) printf '%s\n' "$service_start" ;;
      *LastTriggerUSec*) printf '%s\n' "$last_trigger" ;;
      *) exit 65 ;;
    esac
    ;;
  list-jobs)
    printf '%s\n' "$((index + 1))" >"$INDEX_FILE"
    case "$jobs" in
      0) ;;
      1) printf '1 diis-appointment-due-activation.service start waiting\n' ;;
      error) exit 72 ;;
      *) exit 73 ;;
    esac
    ;;
  *) exit 64 ;;
esac
EOF
chmod 700 "$ROOT/systemctl-observer-stub"

configure_observer() {
  DIIS_SYSTEMCTL_PATH=$ROOT/systemctl-observer-stub
  DIIS_SERVICE_UNIT=diis-appointment-due-activation.service
  DIIS_TIMER_UNIT=diis-appointment-due-activation.timer
  DIIS_SERVICE_START_BEFORE=0
  DIIS_LAST_TRIGGER_BEFORE=0
  DIIS_QUIET_SAMPLES_REQUIRED=3
  DIIS_MAX_OBSERVATION_ATTEMPTS=8
  DIIS_OBSERVATION_SLEEP_SECONDS=0
  SAMPLE_FILE=$ROOT/samples
  INDEX_FILE=$ROOT/sample-index
  export SAMPLE_FILE INDEX_FILE
  printf '1\n' >"$INDEX_FILE"
}

cat >"$ROOT/samples" <<'EOF'
0 inactive 0 0
1 inactive 0 0
1 activating 1 1
0 inactive 1 1
0 inactive 1 1
0 inactive 1 1
0 inactive 1 1
EOF
configure_observer
diis_wait_for_quiet_window
[[ "$DIIS_SERVICE_START_FINAL" == 1 ]]
[[ "$DIIS_LAST_TRIGGER_FINAL" == 1 ]]
[[ $(cat "$INDEX_FILE") -gt 3 ]]
echo 'CANONICAL_DELAYED_CATCHUP_OK'

cat >"$ROOT/samples" <<'EOF'
error inactive 0 0
EOF
configure_observer
if diis_wait_for_quiet_window; then
  echo 'ERROR: list-jobs failure was treated as an empty queue' >&2
  exit 1
else
  status=$?
fi
[[ "$status" -eq 4 ]]
echo 'CANONICAL_LIST_JOBS_FAILURE_FAIL_CLOSED_OK'

cat >"$ROOT/samples" <<'EOF'
1 activating 0 0
1 activating 1 1
1 activating 2 2
1 activating 3 3
1 activating 4 4
1 activating 5 5
1 activating 6 6
1 activating 7 7
EOF
configure_observer
if diis_wait_for_quiet_window; then
  echo 'ERROR: unstable observation sequence unexpectedly settled' >&2
  exit 1
else
  status=$?
fi
[[ "$status" -eq 6 ]]
echo 'CANONICAL_UNSTABLE_SEQUENCE_FAIL_CLOSED_OK'

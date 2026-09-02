#!/usr/bin/env bash

# Canonical transactional-install and timer-observation functions.
# The caller must assign every DIIS_* path to an approved absolute value.

diis_require_install_config() {
  : "${DIIS_ROLLBACK_DIR:?}"
  : "${DIIS_POLICY_TARGET:?}"
  : "${DIIS_SCRIPT_TARGET:?}"
  : "${DIIS_RUNBOOK_TARGET:?}"
  : "${DIIS_OPERATIONS_TARGET:?}"
  : "${DIIS_SERVICE_TARGET:?}"
  : "${DIIS_TIMER_TARGET:?}"
  : "${DIIS_POLICY_NEW:?}"
  : "${DIIS_SCRIPT_NEW:?}"
  : "${DIIS_RUNBOOK_NEW:?}"
  : "${DIIS_OPERATIONS_NEW:?}"
  : "${DIIS_SERVICE_NEW:?}"
  : "${DIIS_TIMER_NEW:?}"
  : "${DIIS_SYSTEMCTL_PATH:?}"
  : "${DIIS_VISUDO_PATH:?}"
}

diis_restore_target() {
  label=$1
  target=$2
  temporary=$3
  /usr/bin/rm -f -- "$temporary" "$target.rollback"
  if test -e "$DIIS_ROLLBACK_DIR/$label.present"; then
    /usr/bin/cp -a -- "$DIIS_ROLLBACK_DIR/$label.baseline" "$target.rollback"
    /usr/bin/mv -f -- "$target.rollback" "$target"
  else
    /usr/bin/rm -f -- "$target"
  fi
}

diis_verify_restored_target() {
  label=$1
  target=$2
  if test -e "$DIIS_ROLLBACK_DIR/$label.present"; then
    /usr/bin/cmp --silent "$DIIS_ROLLBACK_DIR/$label.baseline" "$target"
    test "$(/usr/bin/stat -c '%U:%G %a' "$DIIS_ROLLBACK_DIR/$label.baseline")" \
      = "$(/usr/bin/stat -c '%U:%G %a' "$target")"
  else
    test ! -e "$target"
  fi
}

diis_rollback_installation() {
  diis_require_install_config || return 1
  rollback_failed=0
  diis_restore_target policy "$DIIS_POLICY_TARGET" "$DIIS_POLICY_NEW" \
    || rollback_failed=1
  diis_restore_target script "$DIIS_SCRIPT_TARGET" "$DIIS_SCRIPT_NEW" \
    || rollback_failed=1
  diis_restore_target runbook "$DIIS_RUNBOOK_TARGET" "$DIIS_RUNBOOK_NEW" \
    || rollback_failed=1
  diis_restore_target operations "$DIIS_OPERATIONS_TARGET" "$DIIS_OPERATIONS_NEW" \
    || rollback_failed=1
  diis_restore_target service "$DIIS_SERVICE_TARGET" "$DIIS_SERVICE_NEW" \
    || rollback_failed=1
  diis_restore_target timer "$DIIS_TIMER_TARGET" "$DIIS_TIMER_NEW" \
    || rollback_failed=1
  "$DIIS_SYSTEMCTL_PATH" daemon-reload || rollback_failed=1
  "$DIIS_VISUDO_PATH" -cf /etc/sudoers >/dev/null || rollback_failed=1
  "$DIIS_SYSTEMCTL_PATH" is-enabled diis-appointment-due-activation.timer 2>&1 \
    | /usr/bin/grep -Eq 'disabled|not-found' || rollback_failed=1
  test "$("$DIIS_SYSTEMCTL_PATH" is-active \
    diis-appointment-due-activation.timer 2>/dev/null || true)" = inactive \
    || rollback_failed=1
  diis_verify_restored_target policy "$DIIS_POLICY_TARGET" || rollback_failed=1
  diis_verify_restored_target script "$DIIS_SCRIPT_TARGET" || rollback_failed=1
  diis_verify_restored_target runbook "$DIIS_RUNBOOK_TARGET" || rollback_failed=1
  diis_verify_restored_target operations "$DIIS_OPERATIONS_TARGET" \
    || rollback_failed=1
  diis_verify_restored_target service "$DIIS_SERVICE_TARGET" || rollback_failed=1
  diis_verify_restored_target timer "$DIIS_TIMER_TARGET" || rollback_failed=1
  test "$rollback_failed" -eq 0
}

diis_install_exit() {
  install_status=$?
  trap - EXIT ERR HUP INT TERM
  if test "${DIIS_INSTALL_COMMITTED:-false}" != true; then
    test "$install_status" -ne 0 || install_status=97
    if ! diis_rollback_installation; then
      echo 'ERROR: transactional bootstrap rollback could not restore baseline' >&2
      install_status=98
    fi
  fi
  if declare -F diis_cleanup_installation >/dev/null 2>&1; then
    if ! diis_cleanup_installation; then
      echo 'ERROR: transactional bootstrap cleanup failed' >&2
      install_status=99
    fi
  fi
  exit "$install_status"
}

diis_install_signal() {
  exit "$1"
}

diis_arm_install_traps() {
  DIIS_INSTALL_COMMITTED=false
  trap diis_install_exit EXIT
  trap 'diis_install_signal 129' HUP
  trap 'diis_install_signal 130' INT
  trap 'diis_install_signal 143' TERM
}

diis_related_jobs_present() {
  jobs_output=$("$DIIS_SYSTEMCTL_PATH" list-jobs --no-legend --plain) || return 2
  if printf '%s\n' "$jobs_output" \
    | /usr/bin/grep -Eq 'diis-appointment-due-activation\.(service|timer)'; then
    return 0
  fi
  return 1
}

diis_wait_for_quiet_window() {
  : "${DIIS_SYSTEMCTL_PATH:?}"
  : "${DIIS_SERVICE_UNIT:?}"
  : "${DIIS_TIMER_UNIT:?}"
  : "${DIIS_SERVICE_START_BEFORE:?}"
  : "${DIIS_LAST_TRIGGER_BEFORE:?}"
  : "${DIIS_QUIET_SAMPLES_REQUIRED:?}"
  : "${DIIS_MAX_OBSERVATION_ATTEMPTS:?}"
  : "${DIIS_OBSERVATION_SLEEP_SECONDS:?}"

  quiet_samples=0
  previous_start=$DIIS_SERVICE_START_BEFORE
  previous_last_trigger=$DIIS_LAST_TRIGGER_BEFORE
  DIIS_SERVICE_START_FINAL=
  DIIS_LAST_TRIGGER_FINAL=

  _attempt=1
  while test "$_attempt" -le "$DIIS_MAX_OBSERVATION_ATTEMPTS"; do
    service_state=$("$DIIS_SYSTEMCTL_PATH" is-active "$DIIS_SERVICE_UNIT" \
      2>/dev/null || true)
    current_start=$("$DIIS_SYSTEMCTL_PATH" show "$DIIS_SERVICE_UNIT" \
      -p ExecMainStartTimestampMonotonic --value) || return 3
    current_last_trigger=$("$DIIS_SYSTEMCTL_PATH" show "$DIIS_TIMER_UNIT" \
      -p LastTriggerUSec --value) || return 3

    jobs_state=none
    if diis_related_jobs_present; then
      jobs_state=present
    else
      jobs_status=$?
      case "$jobs_status" in
        1) jobs_state=none ;;
        *) return 4 ;;
      esac
    fi

    case "$service_state" in
      activating|active|deactivating) quiet_samples=0 ;;
      inactive)
        if test "$jobs_state" = present; then
          quiet_samples=0
        elif test "$current_start" = "$previous_start" \
          && test "$current_last_trigger" = "$previous_last_trigger"; then
          quiet_samples=$((quiet_samples + 1))
        else
          quiet_samples=0
        fi
        ;;
      *) return 5 ;;
    esac

    previous_start=$current_start
    previous_last_trigger=$current_last_trigger
    if test "$quiet_samples" -ge "$DIIS_QUIET_SAMPLES_REQUIRED"; then
      DIIS_SERVICE_START_FINAL=$current_start
      DIIS_LAST_TRIGGER_FINAL=$current_last_trigger
      export DIIS_SERVICE_START_FINAL DIIS_LAST_TRIGGER_FINAL
      return 0
    fi
    /usr/bin/sleep "$DIIS_OBSERVATION_SLEEP_SECONDS"
    _attempt=$((_attempt + 1))
  done
  return 6
}

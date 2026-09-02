#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INGRESS_SCRIPT="$SCRIPT_DIR/../diis-shared-ingress.sh"
ROOT=$(mktemp -d /tmp/diis-shared-ingress-contract.XXXXXX)

cleanup() {
  case "$ROOT" in
    /tmp/diis-shared-ingress-contract.*) rm -rf -- "$ROOT" ;;
    *) exit 97 ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$ROOT/bin" "$ROOT/production/infrastructure/nginx" \
  "$ROOT/production/infrastructure/docker" "$ROOT/staging/infrastructure/nginx" \
  "$ROOT/production/infrastructure/nginx/certs" "$ROOT/state" "$ROOT/recovery"
touch "$ROOT/production/infrastructure/docker/docker-compose.yml"
touch "$ROOT/production/infrastructure/docker/.env"

cat >"$ROOT/route-stable.conf" <<'EOF'
events {}
http {
  server {
    listen 443 ssl;
    server_name smkdarussalamsubah.sch.id www.smkdarussalamsubah.sch.id;
    location / { set $up_web smk-web:3000; proxy_pass http://$up_web$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name api.smkdarussalamsubah.sch.id;
    location / { set $up_api smk-api:3001; proxy_pass http://$up_api$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name staging.smkdarussalamsubah.sch.id;
    location / { set $up_staging_web smk-staging-web:3000; proxy_pass http://$up_staging_web$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name staging-api.smkdarussalamsubah.sch.id;
    location / { set $up_staging_api smk-staging-api:3001; proxy_pass http://$up_staging_api$request_uri; }
  }
}
EOF
cp "$ROOT/route-stable.conf" "$ROOT/route-previous.conf"
printf '%s\n' '# previous-version' >>"$ROOT/route-previous.conf"
cp "$ROOT/route-stable.conf" "$ROOT/route-candidate.conf"
printf '%s\n' '# candidate-version' >>"$ROOT/route-candidate.conf"

cat >"$ROOT/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$STUB_LOG"

case "${1:-}" in
  inspect)
    if [[ "${2:-}" == "smk-nginx" ]] && [[ " $* " == *" {{.Image}} "* ]]; then
      printf 'sha256:synthetic-nginx-image\n'
    elif [[ "${2:-}" == "smk-nginx" ]]; then
      printf 'running\n'
    elif [[ "${2:-}" == diis-nginx-candidate-* ]] && \
      [[ -f "$STUB_STATE/candidate-running" ]]; then
      if [[ -f "$STUB_STATE/candidate-observability-fail" ]]; then
        exit 80
      fi
      printf 'running\n'
    else
      exit 1
    fi
    ;;
  ps)
    [[ " $* " == *" -a "* ]]
    if [[ -f "$STUB_STATE/candidate-running" ]]; then
      if [[ -f "$STUB_STATE/candidate-observability-fail" ]]; then
        exit 81
      fi
      cat "$STUB_STATE/candidate-name"
    fi
    ;;
  network)
    case "${2:-}" in
      inspect)
        [[ ! -f "$STUB_STATE/network-missing" ]]
        if [[ " $* " == *" --format "* ]] && [[ -f "$STUB_STATE/connected" ]]; then
          printf 'smk-nginx\n'
        fi
        ;;
      connect)
        target=${4:-}
        if [[ "$target" == diis-nginx-candidate-* ]]; then
          [[ -f "$STUB_STATE/candidate-running" ]]
          if [[ -f "$STUB_STATE/candidate-signal-on-connect" ]]; then
            kill -TERM "$PPID"
            exit 76
          fi
          : >"$STUB_STATE/candidate-network-connected"
          exit 0
        fi
        [[ "$target" == "smk-nginx" ]]
        if [[ -f "$STUB_STATE/signal-on-connect" ]] && \
          [[ ! -f "$STUB_STATE/signal-sent" ]]; then
          : >"$STUB_STATE/signal-sent"
          kill -TERM "$PPID"
          exit 76
        fi
        if [[ -f "$STUB_STATE/connect-fail-once" ]] && \
          [[ ! -f "$STUB_STATE/connect-failed" ]]; then
          : >"$STUB_STATE/connect-failed"
          exit 71
        fi
        : >"$STUB_STATE/connected"
        ;;
      *) exit 64 ;;
    esac
    ;;
  exec)
    if [[ "${2:-}" == diis-nginx-candidate-* ]]; then
      [[ -f "$STUB_STATE/candidate-running" ]]
      [[ "${3:-}" == "nginx" && "${4:-}" == "-t" ]]
      [[ ! -f "$STUB_STATE/candidate-invalid" ]]
    elif [[ "${2:-}" == "smk-nginx" && "${3:-}" == "nginx" && "${4:-}" == "-t" ]]; then
      if [[ -f "$STUB_STATE/runtime-invalid" ]]; then
        exit 72
      fi
    elif [[ "${2:-}" == "smk-nginx" && "${3:-}" == "sha256sum" && \
      "${4:-}" == "/etc/nginx/nginx.conf" ]]; then
      sha256sum "$STUB_STATE/runtime.conf"
    else
      exit 64
    fi
    ;;
  run)
    if [[ -f "$STUB_STATE/candidate-invalid" ]]; then
      exit 73
    fi
    [[ " $* " == *" --detach "* ]]
    previous=
    candidate_name=
    for argument in "$@"; do
      if [[ "$previous" == '--name' ]]; then
        candidate_name=$argument
        break
      fi
      previous=$argument
    done
    [[ "$candidate_name" == diis-nginx-candidate-* ]]
    : >"$STUB_STATE/candidate-running"
    printf '%s\n' "$candidate_name" >"$STUB_STATE/candidate-name"
    printf 'synthetic-candidate-id\n'
    ;;
  port)
    [[ "${2:-}" == diis-nginx-candidate-* ]]
    [[ "${3:-}" == "443/tcp" ]]
    [[ -f "$STUB_STATE/candidate-running" ]]
    printf '127.0.0.1:24443\n'
    ;;
  rm)
    [[ "${2:-}" == "-f" ]]
    [[ "${3:-}" == diis-nginx-candidate-* ]]
    if [[ -f "$STUB_STATE/candidate-rm-fail" ]]; then
      exit 79
    fi
    rm -f "$STUB_STATE/candidate-running" "$STUB_STATE/candidate-network-connected" \
      "$STUB_STATE/candidate-name"
    ;;
  compose)
    if [[ " $* " == *" run "* ]]; then
      if [[ -f "$STUB_STATE/candidate-invalid" ]]; then
        exit 73
      fi
      exit 0
    fi
    if [[ " $* " == *" up "* ]]; then
      count=0
      [[ ! -f "$STUB_STATE/up-count" ]] || count=$(cat "$STUB_STATE/up-count")
      count=$((count + 1))
      printf '%s\n' "$count" >"$STUB_STATE/up-count"
      rm -f "$STUB_STATE/connected"
      fail_count=0
      [[ ! -f "$STUB_STATE/recreate-fail-count" ]] || \
        fail_count=$(cat "$STUB_STATE/recreate-fail-count")
      if [[ "$count" -le "$fail_count" ]]; then
        exit 74
      fi
      cp "$DIIS_PRODUCTION_NGINX_CONFIG" "$STUB_STATE/runtime.conf"
      exit 0
    fi
    ;;
  *) exit 64 ;;
esac
EOF
chmod 700 "$ROOT/bin/docker"

cat >"$ROOT/bin/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$STUB_CURL_LOG"
if [[ " $* " == *" --resolve "* ]]; then
  [[ -f "$STUB_STATE/candidate-running" ]]
  [[ -f "$STUB_STATE/candidate-network-connected" ]]
  [[ ! -f "$STUB_STATE/candidate-upstream-fail" ]]
  url=${!#}
  case "$url" in
    *staging-api.smkdarussalamsubah.sch.id*) marker=$STUB_MARKER_STAGING_API ;;
    *staging.smkdarussalamsubah.sch.id*) marker=$STUB_MARKER_STAGING_WEB ;;
    *api.smkdarussalamsubah.sch.id*) marker=$STUB_MARKER_PRODUCTION_API ;;
    *smkdarussalamsubah.sch.id*) marker=$STUB_MARKER_PRODUCTION_WEB ;;
    *) exit 82 ;;
  esac
  printf '%s\n200' "$marker"
  exit 0
fi
count=0
[[ ! -f "$STUB_STATE/curl-count" ]] || count=$(cat "$STUB_STATE/curl-count")
count=$((count + 1))
printf '%s\n' "$count" >"$STUB_STATE/curl-count"
if [[ -f "$STUB_STATE/health-fail-call" ]]; then
  fail_call=$(cat "$STUB_STATE/health-fail-call")
  if [[ "$count" -eq "$fail_call" ]] && [[ ! -f "$STUB_STATE/health-failed" ]]; then
    : >"$STUB_STATE/health-failed"
    exit 75
  fi
fi
EOF
chmod 700 "$ROOT/bin/curl"

cat >"$ROOT/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 700 "$ROOT/bin/sleep"

cat >"$ROOT/bin/git" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == "-C" ]]
shift 2
case "${1:-}" in
  branch)
    [[ "${2:-}" == "--show-current" ]]
    printf 'main\n'
    ;;
  rev-parse)
    case "${2:-}" in
      HEAD) printf '%s\n' "$STUB_MAIN_SHA" ;;
      'HEAD^{tree}') printf '%s\n' "$STUB_MAIN_TREE" ;;
      *) exit 64 ;;
    esac
    ;;
  status)
    if [[ -f "$STUB_STATE/production-dirty" ]]; then
      printf ' M infrastructure/nginx/nginx.conf\n'
    fi
    ;;
  *) exit 64 ;;
esac
EOF
chmod 700 "$ROOT/bin/git"

cat >"$ROOT/bin/cp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count=0
[[ ! -f "$STUB_STATE/helper-cp-count" ]] || count=$(cat "$STUB_STATE/helper-cp-count")
count=$((count + 1))
printf '%s\n' "$count" >"$STUB_STATE/helper-cp-count"
if [[ -f "$STUB_STATE/helper-cp-fail-call" ]] && \
  [[ "$count" -eq "$(cat "$STUB_STATE/helper-cp-fail-call")" ]]; then
  exit 77
fi
/bin/cp "$@"
EOF
chmod 700 "$ROOT/bin/cp"

cat >"$ROOT/bin/mv" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
count=0
[[ ! -f "$STUB_STATE/helper-mv-count" ]] || count=$(cat "$STUB_STATE/helper-mv-count")
count=$((count + 1))
printf '%s\n' "$count" >"$STUB_STATE/helper-mv-count"
if [[ -f "$STUB_STATE/helper-mv-fail-call" ]] && \
  [[ "$count" -eq "$(cat "$STUB_STATE/helper-mv-fail-call")" ]]; then
  exit 78
fi
/bin/mv "$@"
EOF
chmod 700 "$ROOT/bin/mv"

export STUB_STATE="$ROOT/state"
export STUB_LOG="$ROOT/docker.log"
export STUB_CURL_LOG="$ROOT/curl.log"
export DIIS_ROLLBACK_CONFIG="$ROOT/rollback.conf"
export STUB_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export STUB_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export STUB_MARKER_PRODUCTION_WEB=DIIS_PRODUCTION_WEB
export STUB_MARKER_PRODUCTION_API=DIIS_PRODUCTION_API
export STUB_MARKER_STAGING_WEB=DIIS_STAGING_WEB
export STUB_MARKER_STAGING_API=DIIS_STAGING_API

export DIIS_DOCKER_BIN="$ROOT/bin/docker"
export DIIS_CURL_BIN="$ROOT/bin/curl"
export DIIS_GIT_BIN="$ROOT/bin/git"
export DIIS_CP_BIN="$ROOT/bin/cp"
export DIIS_MV_BIN="$ROOT/bin/mv"
export DIIS_SLEEP_BIN="$ROOT/bin/sleep"
export DIIS_PRODUCTION_WORK_DIR="$ROOT/production"
export DIIS_STAGING_WORK_DIR="$ROOT/staging"
export DIIS_PRODUCTION_COMPOSE_DIR="$ROOT/production/infrastructure/docker"
export DIIS_PRODUCTION_NGINX_CONFIG="$ROOT/production/infrastructure/nginx/nginx.conf"
export DIIS_STAGING_NGINX_CONFIG="$ROOT/staging/infrastructure/nginx/nginx.conf"
export DIIS_PRODUCTION_NGINX_CERTS="$ROOT/production/infrastructure/nginx/certs"
export DIIS_INGRESS_RECOVERY_DIR="$ROOT/recovery"
export DIIS_INGRESS_HEALTH_URLS='https://production-web.invalid/ https://production-api.invalid/health https://staging-web.invalid/ https://staging-api.invalid/health'
export DIIS_MAX_RECREATE_ATTEMPTS=3
export DIIS_RETRY_DELAY_SECONDS=0
export DIIS_DEPLOY_RUN_ID=$$
export DIIS_DEPLOY_RUN_ATTEMPT=1
export DIIS_CANDIDATE_MARKER_PRODUCTION_WEB=$STUB_MARKER_PRODUCTION_WEB
export DIIS_CANDIDATE_MARKER_PRODUCTION_API=$STUB_MARKER_PRODUCTION_API
export DIIS_CANDIDATE_MARKER_STAGING_WEB=$STUB_MARKER_STAGING_WEB
export DIIS_CANDIDATE_MARKER_STAGING_API=$STUB_MARKER_STAGING_API

reset_state() {
  rm -rf -- "$ROOT/state"
  mkdir -p "$ROOT/state"
  rm -rf -- "$ROOT/recovery"
  mkdir -p "$ROOT/recovery"
  : >"$ROOT/docker.log"
  : >"$ROOT/curl.log"
  cp "$ROOT/route-stable.conf" "$DIIS_PRODUCTION_NGINX_CONFIG"
  cp "$ROOT/route-stable.conf" "$DIIS_STAGING_NGINX_CONFIG"
  cp "$ROOT/route-previous.conf" "$ROOT/rollback.conf"
  : >"$ROOT/state/connected"
  cp "$ROOT/route-stable.conf" "$ROOT/state/runtime.conf"
  cp "$ROOT/route-stable.conf" "$ROOT/main-authority.conf"
}

assert_recovery_permissions() {
  # Git Bash runs on NTFS and cannot prove Linux mode bits faithfully. The same
  # harness performs these assertions on WSL/Linux, which matches the VPS.
  if [[ -n "${MSYSTEM:-}" ]]; then
    return 0
  fi
  [[ "$(stat -c '%a' "$ROOT/recovery")" == '700' ]]
  while IFS= read -r recovery_file; do
    [[ "$(stat -c '%a' "$recovery_file")" == '600' ]]
  done < <(find "$ROOT/recovery" -maxdepth 1 -type f)
}

assert_shared_ingress_untouched() {
  ! grep -Fq 'compose ' "$ROOT/docker.log"
  ! grep -Fq 'network connect smk-staging-net smk-nginx' "$ROOT/docker.log"
  ! grep -Fq 'rm -f smk-nginx' "$ROOT/docker.log"
  cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-stable.conf"
}

assert_candidate_cleanup() {
  [[ ! -f "$ROOT/state/candidate-running" ]]
  [[ ! -f "$ROOT/state/candidate-network-connected" ]]
}

prepare_production_candidate() {
  cp "$ROOT/route-candidate.conf" "$DIIS_PRODUCTION_NGINX_CONFIG"
  cp "$ROOT/route-previous.conf" "$ROOT/rollback.conf"
  cp "$ROOT/route-previous.conf" "$ROOT/state/runtime.conf"
}

expected_digest() {
  local digest_line
  digest_line=$(sha256sum "$DIIS_PRODUCTION_NGINX_CONFIG")
  printf '%s\n' "${digest_line%% *}"
}

run_ingress() {
  bash "$INGRESS_SCRIPT" "$@"
}

main_authority_digest() {
  local digest_line
  digest_line=$(sha256sum "$ROOT/main-authority.conf")
  printf '%s\n' "${digest_line%% *}"
}

run_staging_ingress() {
  local mode authority_digest
  mode=$1
  authority_digest=$(main_authority_digest)
  run_ingress "$mode" "$STUB_MAIN_SHA" "$STUB_MAIN_TREE" \
    "$authority_digest" "$ROOT/main-authority.conf"
}

reset_state
run_staging_ingress preflight-staging >"$ROOT/staging-preflight.out"
run_staging_ingress post-staging >"$ROOT/staging-post.out"
assert_shared_ingress_untouched
assert_candidate_cleanup
grep -Eq '^run ' "$ROOT/docker.log"
grep -Fq -- '--publish 127.0.0.1::443' "$ROOT/docker.log"
[[ "$(grep -c -- '--resolve ' "$ROOT/curl.log")" -eq 8 ]]
grep -Fq 'SHARED_INGRESS_POSTCHECK environment=staging status=pass' \
  "$ROOT/staging-post.out"
echo 'STAGING_NO_MUTATION_OK'

reset_state
cp "$ROOT/route-candidate.conf" "$DIIS_STAGING_NGINX_CONFIG"
run_staging_ingress preflight-staging >"$ROOT/staging-candidate.out"
grep -Fq 'status=validated-not-activated' "$ROOT/staging-candidate.out"
grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTING status=pass routes=4' \
  "$ROOT/staging-candidate.out"
assert_shared_ingress_untouched
assert_candidate_cleanup
echo 'LEGITIMATE_STAGING_CANDIDATE_VALIDATION_OK'

reset_state
sed -i 's/set $up_staging_web smk-staging-web:3000;/set $up_staging_web smk-web:3000;/' \
  "$DIIS_STAGING_NGINX_CONFIG"
if run_staging_ingress preflight-staging >"$ROOT/cross-environment-swap.out" 2>&1; then
  echo 'ERROR: production/staging route swap was accepted' >&2
  exit 1
fi
grep -Fq 'reason=route-contract-mismatch-staging.smkdarussalamsubah.sch.id' \
  "$ROOT/cross-environment-swap.out"
! grep -Eq '^run .*--detach' "$ROOT/docker.log"
assert_shared_ingress_untouched
assert_candidate_cleanup
echo 'CROSS_ENV_ROUTE_SWAP_FAIL_CLOSED_OK'

reset_state
sed -i 's/set $up_web smk-web:3000;/set $up_web smk-api:3001;/' \
  "$DIIS_STAGING_NGINX_CONFIG"
if run_staging_ingress preflight-staging >"$ROOT/web-api-swap.out" 2>&1; then
  echo 'ERROR: web/API route swap was accepted' >&2
  exit 1
fi
grep -Fq 'reason=route-contract-mismatch-smkdarussalamsubah.sch.id' \
  "$ROOT/web-api-swap.out"
! grep -Eq '^run .*--detach' "$ROOT/docker.log"
assert_shared_ingress_untouched
assert_candidate_cleanup
echo 'WEB_API_ROUTE_SWAP_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/candidate-upstream-fail"
if run_staging_ingress preflight-staging >"$ROOT/candidate-routing-failure.out" 2>&1; then
  echo 'ERROR: candidate with unreachable upstream was accepted' >&2
  exit 1
fi
grep -Fq 'reason=candidate-routing-failed' "$ROOT/candidate-routing-failure.out"
grep -Fq 'reason=candidate-validation-failed' "$ROOT/candidate-routing-failure.out"
assert_shared_ingress_untouched
assert_candidate_cleanup
echo 'INVALID_CANDIDATE_ROUTING_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/candidate-signal-on-connect"
set +e
run_staging_ingress preflight-staging >"$ROOT/candidate-signal.out" 2>&1
candidate_signal_status=$?
set -e
[[ "$candidate_signal_status" -eq 143 ]]
assert_shared_ingress_untouched
assert_candidate_cleanup
echo 'CANDIDATE_SIGNAL_CLEANUP_OK'

reset_state
: >"$ROOT/state/candidate-rm-fail"
set +e
run_staging_ingress preflight-staging >"$ROOT/candidate-cleanup-failure.out" 2>&1
candidate_cleanup_status=$?
set -e
[[ "$candidate_cleanup_status" -eq 92 ]]
grep -Fq 'SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=diis-nginx-candidate-' \
  "$ROOT/candidate-cleanup-failure.out"
grep -Fq 'reason=cleanup-failed' "$ROOT/candidate-cleanup-failure.out"
! grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTING status=pass' \
  "$ROOT/candidate-cleanup-failure.out"
! grep -Fq 'SHARED_INGRESS_PREFLIGHT environment=staging status=pass' \
  "$ROOT/candidate-cleanup-failure.out"
assert_shared_ingress_untouched
[[ -f "$ROOT/state/candidate-running" ]]

set +e
run_staging_ingress preflight-staging >"$ROOT/candidate-cleanup-retry.out" 2>&1
candidate_cleanup_retry_status=$?
set -e
[[ "$candidate_cleanup_retry_status" -eq 92 ]]
grep -Fq 'reason=candidate-container-name-in-use' "$ROOT/candidate-cleanup-retry.out"
grep -Fq 'SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=diis-nginx-candidate-' \
  "$ROOT/candidate-cleanup-retry.out"
! grep -Fq 'SHARED_INGRESS_PREFLIGHT environment=staging status=pass' \
  "$ROOT/candidate-cleanup-retry.out"
assert_shared_ingress_untouched
rm -f "$ROOT/state/candidate-rm-fail"
"$DIIS_DOCKER_BIN" rm -f \
  "diis-nginx-candidate-${DIIS_DEPLOY_RUN_ID}-${DIIS_DEPLOY_RUN_ATTEMPT}" >/dev/null
assert_candidate_cleanup
echo 'CANDIDATE_CLEANUP_FAILURE_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/candidate-observability-fail"
set +e
run_staging_ingress preflight-staging >"$ROOT/candidate-observability-failure.out" 2>&1
candidate_observability_status=$?
set -e
[[ "$candidate_observability_status" -eq 92 ]]
grep -Fq 'SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=diis-nginx-candidate-' \
  "$ROOT/candidate-observability-failure.out"
grep -Fq 'reason=cleanup-failed' "$ROOT/candidate-observability-failure.out"
! grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTING status=pass' \
  "$ROOT/candidate-observability-failure.out"
! grep -Fq 'SHARED_INGRESS_PREFLIGHT environment=staging status=pass' \
  "$ROOT/candidate-observability-failure.out"
assert_shared_ingress_untouched
[[ -f "$ROOT/state/candidate-running" ]]

set +e
run_staging_ingress preflight-staging >"$ROOT/candidate-observability-retry.out" 2>&1
candidate_observability_retry_status=$?
set -e
[[ "$candidate_observability_retry_status" -eq 92 ]]
grep -Fq 'reason=candidate-observability-unavailable' \
  "$ROOT/candidate-observability-retry.out"
grep -Fq 'SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=diis-nginx-candidate-' \
  "$ROOT/candidate-observability-retry.out"
assert_shared_ingress_untouched
rm -f "$ROOT/state/candidate-observability-fail"
"$DIIS_DOCKER_BIN" rm -f \
  "diis-nginx-candidate-${DIIS_DEPLOY_RUN_ID}-${DIIS_DEPLOY_RUN_ATTEMPT}" >/dev/null
assert_candidate_cleanup
echo 'CANDIDATE_INSPECT_FAILURE_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/production-dirty"
if run_staging_ingress preflight-staging >"$ROOT/production-drift.out" 2>&1; then
  echo 'ERROR: dirty production checkout was accepted' >&2
  exit 1
fi
grep -Fq 'reason=production-checkout-not-authoritative' "$ROOT/production-drift.out"
! grep -Fq 'compose ' "$ROOT/docker.log"
! grep -Eq '^run .*--detach' "$ROOT/docker.log"
echo 'PRODUCTION_CHECKOUT_DRIFT_FAIL_CLOSED_OK'

reset_state
authority_digest=$(main_authority_digest)
if run_ingress preflight-staging cccccccccccccccccccccccccccccccccccccccc \
  "$STUB_MAIN_TREE" "$authority_digest" "$ROOT/main-authority.conf" \
  >"$ROOT/main-sha-mismatch.out" 2>&1; then
  echo 'ERROR: mismatched authoritative main SHA was accepted' >&2
  exit 1
fi
grep -Fq 'reason=production-checkout-not-authoritative' "$ROOT/main-sha-mismatch.out"
! grep -Eq '^run .*--detach' "$ROOT/docker.log"
echo 'MAIN_SHA_MISMATCH_FAIL_CLOSED_OK'

reset_state
printf 'stale-runtime-config\n' >"$ROOT/state/runtime.conf"
if run_staging_ingress post-staging >"$ROOT/runtime-drift.out" 2>&1; then
  echo 'ERROR: stale runtime config was accepted' >&2
  cat "$ROOT/runtime-drift.out" >&2
  exit 1
fi
grep -Fq 'reason=runtime-config-digest-mismatch' "$ROOT/runtime-drift.out"
! grep -Fq 'compose ' "$ROOT/docker.log"
! grep -Fq 'network connect smk-staging-net smk-nginx' "$ROOT/docker.log"
assert_candidate_cleanup
echo 'RUNTIME_DIGEST_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/candidate-invalid"
prepare_production_candidate
digest=$(expected_digest)
if run_ingress preflight-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/invalid-config.out" 2>&1; then
  echo 'ERROR: invalid candidate config was accepted' >&2
  exit 1
fi
grep -Fq 'reason=candidate-nginx-config-invalid' "$ROOT/invalid-config.out"
[[ ! -f "$ROOT/state/up-count" ]]
echo 'INVALID_CONFIG_FAIL_CLOSED_OK'

reset_state
printf '3\n' >"$ROOT/state/recreate-fail-count"
prepare_production_candidate
digest=$(expected_digest)
if run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/three-failures.out" 2>&1; then
  echo 'ERROR: three recreate failures returned success' >&2
  exit 1
fi
[[ "$(cat "$ROOT/state/up-count")" -eq 4 ]]
grep -Fq 'reason=nginx-recreate-exhausted' "$ROOT/three-failures.out"
grep -Fq 'SHARED_INGRESS_ROLLBACK status=pass' "$ROOT/three-failures.out"
! grep -Fq 'SHARED_INGRESS_ROLLOUT environment=production status=pass' \
  "$ROOT/three-failures.out"
cmp -s "$DIIS_PRODUCTION_NGINX_CONFIG" "$ROOT/route-candidate.conf"
cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-previous.conf"
[[ -f "$ROOT/state/connected" ]]
[[ ! -f "$ROOT/rollback.conf" ]]
[[ "$(find "$ROOT/production/infrastructure/nginx" -maxdepth 1 -name '*.diis-candidate.*' | wc -l)" -eq 0 ]]
echo 'THREE_RECREATE_FAILURES_ROLLBACK_OK'

reset_state
: >"$ROOT/state/connect-fail-once"
prepare_production_candidate
digest=$(expected_digest)
if run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/reconnect-failure.out" 2>&1; then
  echo 'ERROR: reconnect failure returned success' >&2
  exit 1
fi
[[ "$(cat "$ROOT/state/up-count")" -eq 2 ]]
grep -Fq 'reason=staging-network-connect-failed' "$ROOT/reconnect-failure.out"
grep -Fq 'SHARED_INGRESS_ROLLBACK status=pass' "$ROOT/reconnect-failure.out"
[[ -f "$ROOT/state/connected" ]]
cmp -s "$DIIS_PRODUCTION_NGINX_CONFIG" "$ROOT/route-candidate.conf"
cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-previous.conf"
[[ ! -f "$ROOT/rollback.conf" ]]
echo 'RECONNECT_FAILURE_ROLLBACK_OK'

reset_state
printf '5\n' >"$ROOT/state/health-fail-call"
prepare_production_candidate
digest=$(expected_digest)
if run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/health-failure.out" 2>&1; then
  echo 'ERROR: post-change health failure returned success' >&2
  exit 1
fi
[[ "$(cat "$ROOT/state/up-count")" -eq 2 ]]
grep -Fq 'reason=public-health-failed' "$ROOT/health-failure.out"
grep -Fq 'SHARED_INGRESS_ROLLBACK status=pass' "$ROOT/health-failure.out"
[[ -f "$ROOT/state/connected" ]]
cmp -s "$DIIS_PRODUCTION_NGINX_CONFIG" "$ROOT/route-candidate.conf"
cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-previous.conf"
echo 'POST_HEALTH_FAILURE_ROLLBACK_OK'

reset_state
: >"$ROOT/state/signal-on-connect"
prepare_production_candidate
digest=$(expected_digest)
set +e
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/signal.out" 2>&1
signal_status=$?
set -e
[[ "$signal_status" -eq 143 ]]
grep -Fq 'SHARED_INGRESS_ROLLBACK status=pass' "$ROOT/signal.out"
cmp -s "$DIIS_PRODUCTION_NGINX_CONFIG" "$ROOT/route-candidate.conf"
cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-previous.conf"
[[ -f "$ROOT/state/connected" ]]
echo 'SIGNAL_ROLLBACK_OK'

reset_state
printf '6\n' >"$ROOT/state/recreate-fail-count"
prepare_production_candidate
digest=$(expected_digest)
set +e
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/rollback-failure.out" 2>&1
rollback_status=$?
set -e
[[ "$rollback_status" -eq 90 ]]
grep -Fq 'SHARED_INGRESS_ROLLBACK status=failed' "$ROOT/rollback-failure.out"
grep -Fq 'SHARED_INGRESS_RECOVERY_REQUIRED' "$ROOT/rollback-failure.out"
! grep -Fq 'SHARED_INGRESS_ROLLOUT environment=production status=pass' \
  "$ROOT/rollback-failure.out"
[[ ! -f "$ROOT/rollback.conf" ]]
[[ "$(find "$ROOT/recovery" -maxdepth 1 -type f -name 'rollback-*' | wc -l)" -eq 1 ]]
[[ "$(find "$ROOT/recovery" -maxdepth 1 -type f -name 'recovery-required-*' | wc -l)" -eq 1 ]]
assert_recovery_permissions
echo 'ROLLBACK_FAILURE_FAIL_CLOSED_OK'

reset_state
: >"$ROOT/state/connect-fail-once"
printf '2\n' >"$ROOT/state/helper-cp-fail-call"
prepare_production_candidate
digest=$(expected_digest)
set +e
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/copy-failure.out" 2>&1
copy_failure_status=$?
set -e
[[ "$copy_failure_status" -eq 90 ]]
grep -Fq 'SHARED_INGRESS_RECOVERY_REQUIRED' "$ROOT/copy-failure.out"
[[ ! -f "$ROOT/rollback.conf" ]]
[[ "$(find "$ROOT/recovery" -maxdepth 1 -type f -name 'rollback-*' | wc -l)" -eq 1 ]]
echo 'COPY_FAILURE_RECOVERY_PRESERVED_OK'

reset_state
: >"$ROOT/state/connect-fail-once"
printf '1\n' >"$ROOT/state/helper-mv-fail-call"
prepare_production_candidate
digest=$(expected_digest)
set +e
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/move-failure.out" 2>&1
move_failure_status=$?
set -e
[[ "$move_failure_status" -eq 90 ]]
grep -Fq 'SHARED_INGRESS_RECOVERY_REQUIRED' "$ROOT/move-failure.out"
[[ ! -f "$ROOT/rollback.conf" ]]
[[ "$(find "$ROOT/recovery" -maxdepth 1 -type f -name 'rollback-*' | wc -l)" -eq 1 ]]
[[ "$(find "$ROOT/recovery" -maxdepth 1 -type f -name 'atomic-candidate-*' | wc -l)" -eq 1 ]]
echo 'MOVE_FAILURE_RECOVERY_PRESERVED_OK'

reset_state
cp "$DIIS_PRODUCTION_NGINX_CONFIG" "$ROOT/rollback.conf"
digest=$(expected_digest)
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/production-noop.out"
[[ ! -f "$ROOT/state/up-count" ]]
! grep -Fq 'network connect' "$ROOT/docker.log"
[[ ! -f "$ROOT/rollback.conf" ]]
grep -Fq "SHARED_INGRESS_ROLLOUT environment=production status=unchanged digest=$digest" \
  "$ROOT/production-noop.out"
echo 'PRODUCTION_NOOP_OK'

reset_state
prepare_production_candidate
digest=$(expected_digest)
run_ingress preflight-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/production-preflight.out"
run_ingress rollout-production "$digest" "$ROOT/rollback.conf" \
  >"$ROOT/production-success.out"
[[ "$(cat "$ROOT/state/up-count")" -eq 1 ]]
[[ -f "$ROOT/state/connected" ]]
cmp -s "$ROOT/state/runtime.conf" "$ROOT/route-candidate.conf"
[[ ! -f "$ROOT/rollback.conf" ]]
[[ "$(find "$ROOT/production/infrastructure/nginx" -maxdepth 1 -name '*.diis-candidate.*' | wc -l)" -eq 0 ]]
grep -Fq "SHARED_INGRESS_ROLLOUT environment=production status=pass digest=$digest" \
  "$ROOT/production-success.out"
echo 'PRODUCTION_ROLLOUT_OK'

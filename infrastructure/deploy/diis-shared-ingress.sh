#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-}
EXPECTED_CONFIG_SHA=${2:-}
ROLLBACK_CONFIG=${3:-}
AUTHORITATIVE_MAIN_SHA=${2:-}
AUTHORITATIVE_MAIN_TREE=${3:-}
AUTHORITATIVE_CONFIG_SHA=${4:-}
AUTHORITATIVE_CONFIG=${5:-}

DOCKER_BIN=${DIIS_DOCKER_BIN:-docker}
CURL_BIN=${DIIS_CURL_BIN:-curl}
GIT_BIN=${DIIS_GIT_BIN:-git}
SHA256_BIN=${DIIS_SHA256_BIN:-sha256sum}
RUNTIME_SHA256_BIN=${DIIS_RUNTIME_SHA256_BIN:-sha256sum}
CP_BIN=${DIIS_CP_BIN:-cp}
MV_BIN=${DIIS_MV_BIN:-mv}
RM_BIN=${DIIS_RM_BIN:-rm}
SLEEP_BIN=${DIIS_SLEEP_BIN:-sleep}

PRODUCTION_WORK_DIR=${DIIS_PRODUCTION_WORK_DIR:-/home/appuser/smart-ai-school}
STAGING_WORK_DIR=${DIIS_STAGING_WORK_DIR:-/opt/diis-staging/smart-ai-school}
PRODUCTION_COMPOSE_DIR=${DIIS_PRODUCTION_COMPOSE_DIR:-$PRODUCTION_WORK_DIR/infrastructure/docker}
PRODUCTION_CONFIG=${DIIS_PRODUCTION_NGINX_CONFIG:-$PRODUCTION_WORK_DIR/infrastructure/nginx/nginx.conf}
PRODUCTION_CERTS=${DIIS_PRODUCTION_NGINX_CERTS:-$PRODUCTION_WORK_DIR/infrastructure/nginx/certs}
STAGING_CONFIG=${DIIS_STAGING_NGINX_CONFIG:-$STAGING_WORK_DIR/infrastructure/nginx/nginx.conf}
NGINX_CONTAINER=${DIIS_NGINX_CONTAINER:-smk-nginx}
NGINX_RUNTIME_CONFIG=${DIIS_NGINX_RUNTIME_CONFIG:-/etc/nginx/nginx.conf}
STAGING_NETWORK=${DIIS_STAGING_NETWORK:-smk-staging-net}
PRODUCTION_NETWORK=${DIIS_PRODUCTION_NETWORK:-smk-network}
MAX_RECREATE_ATTEMPTS=${DIIS_MAX_RECREATE_ATTEMPTS:-3}
RETRY_DELAY_SECONDS=${DIIS_RETRY_DELAY_SECONDS:-5}
HEALTH_URLS=${DIIS_INGRESS_HEALTH_URLS:-https://smkdarussalamsubah.sch.id/ https://api.smkdarussalamsubah.sch.id/health https://staging.smkdarussalamsubah.sch.id/ https://staging-api.smkdarussalamsubah.sch.id/health}
RECOVERY_DIR=${DIIS_INGRESS_RECOVERY_DIR:-/home/appuser/.local/state/diis-deploy/ingress-recovery}

MUTATION_STARTED=0
ROLLBACK_IN_PROGRESS=0
PRESERVE_ON_CLEANUP=0
NEW_CONFIG_SNAPSHOT=
ATOMIC_CANDIDATES=()
ATOMIC_SEQUENCE=0
CANDIDATE_CONTAINER=
PRODUCTION_WEB_MARKER=${DIIS_CANDIDATE_MARKER_PRODUCTION_WEB:-}
PRODUCTION_API_MARKER=${DIIS_CANDIDATE_MARKER_PRODUCTION_API:-}
STAGING_WEB_MARKER=${DIIS_CANDIDATE_MARKER_STAGING_WEB:-}
STAGING_API_MARKER=${DIIS_CANDIDATE_MARKER_STAGING_API:-}

log() {
  printf '%s\n' "$*"
}

fail() {
  log "SHARED_INGRESS_ERROR reason=$1"
  return 1
}

require_file() {
  if [[ ! -f "$1" ]]; then
    fail "missing-file"
    return 1
  fi
}

config_digest() {
  local digest_line
  digest_line=$("$SHA256_BIN" "$1")
  printf '%s\n' "${digest_line%% *}"
}

runtime_config_digest() {
  local digest_line
  digest_line=$("$DOCKER_BIN" exec "$NGINX_CONTAINER" \
    "$RUNTIME_SHA256_BIN" "$NGINX_RUNTIME_CONFIG") || return 1
  printf '%s\n' "${digest_line%% *}"
}

verify_runtime_digest() {
  local expected actual
  expected=$1
  actual=$(runtime_config_digest) || {
    fail "runtime-config-digest-unavailable"
    return 1
  }
  if [[ "$actual" != "$expected" ]]; then
    log "SHARED_INGRESS_RUNTIME_CONFIG expected=$expected actual=$actual"
    fail "runtime-config-digest-mismatch"
    return 1
  fi
  log "SHARED_INGRESS_RUNTIME_CONFIG digest=$actual"
}

verify_expected_digest() {
  local actual
  if [[ ! "$EXPECTED_CONFIG_SHA" =~ ^[0-9a-f]{64}$ ]]; then
    fail "invalid-expected-config-digest"
    return 1
  fi
  actual=$(config_digest "$PRODUCTION_CONFIG")
  if [[ "$actual" != "$EXPECTED_CONFIG_SHA" ]]; then
    fail "config-digest-mismatch"
    return 1
  fi
  log "SHARED_INGRESS_CONFIG digest=$actual"
}

verify_digest() {
  local file expected actual
  file=$1
  expected=$2
  if [[ ! "$expected" =~ ^[0-9a-f]{64}$ ]]; then
    fail "invalid-config-digest"
    return 1
  fi
  require_file "$file" || return 1
  actual=$(config_digest "$file")
  if [[ "$actual" != "$expected" ]]; then
    fail "config-digest-mismatch"
    return 1
  fi
}

container_running() {
  local state
  state=$("$DOCKER_BIN" inspect "$NGINX_CONTAINER" --format '{{.State.Status}}') || return 1
  [[ "$state" == "running" ]]
}

network_has_container() {
  local members
  members=$("$DOCKER_BIN" network inspect "$STAGING_NETWORK" \
    --format '{{range .Containers}}{{println .Name}}{{end}}') || return 1
  while IFS= read -r member; do
    [[ "$member" == "$NGINX_CONTAINER" ]] && return 0
  done <<<"$members"
  return 1
}

verify_runtime_topology() {
  if ! container_running; then
    fail "nginx-not-running"
    return 1
  fi
  if ! "$DOCKER_BIN" network inspect "$STAGING_NETWORK" >/dev/null 2>&1; then
    fail "staging-network-missing"
    return 1
  fi
  if ! network_has_container; then
    fail "nginx-not-connected-to-staging-network"
    return 1
  fi
  if ! "$DOCKER_BIN" exec "$NGINX_CONTAINER" nginx -t >/dev/null; then
    fail "runtime-nginx-config-invalid"
    return 1
  fi
}

verify_public_health() {
  local url
  local -a health_urls
  read -r -a health_urls <<<"$HEALTH_URLS"
  for url in "${health_urls[@]}"; do
    if ! "$CURL_BIN" --fail --silent --show-error --location --max-time 20 \
      --output /dev/null "$url"; then
      fail "public-health-failed"
      return 1
    fi
  done
  log "SHARED_INGRESS_HEALTH environments=production,staging status=pass"
}

verify_main_authority() {
  local actual_branch actual_head actual_tree checkout_status
  if [[ ! "$AUTHORITATIVE_MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || \
    [[ ! "$AUTHORITATIVE_MAIN_TREE" =~ ^[0-9a-f]{40}$ ]]; then
    fail "invalid-main-authority"
    return 1
  fi
  verify_digest "$AUTHORITATIVE_CONFIG" "$AUTHORITATIVE_CONFIG_SHA" || return 1

  actual_branch=$("$GIT_BIN" -C "$PRODUCTION_WORK_DIR" branch --show-current) || return 1
  actual_head=$("$GIT_BIN" -C "$PRODUCTION_WORK_DIR" rev-parse HEAD) || return 1
  actual_tree=$("$GIT_BIN" -C "$PRODUCTION_WORK_DIR" rev-parse 'HEAD^{tree}') || return 1
  checkout_status=$("$GIT_BIN" -C "$PRODUCTION_WORK_DIR" status \
    --porcelain=v1 --untracked-files=all) || return 1
  if [[ "$actual_branch" != "main" || "$actual_head" != "$AUTHORITATIVE_MAIN_SHA" || \
    "$actual_tree" != "$AUTHORITATIVE_MAIN_TREE" || -n "$checkout_status" ]]; then
    fail "production-checkout-not-authoritative"
    return 1
  fi
  log "SHARED_INGRESS_AUTHORITY main_sha=$actual_head main_tree=$actual_tree digest=$AUTHORITATIVE_CONFIG_SHA"
}

candidate_container_state() {
  local observed
  if "$DOCKER_BIN" inspect "$CANDIDATE_CONTAINER" >/dev/null 2>&1; then
    return 0
  fi
  observed=$(
    "$DOCKER_BIN" ps -a --filter "name=^/${CANDIDATE_CONTAINER}$" --format '{{.Names}}'
  ) || return 2
  if [[ -z "$observed" ]]; then
    return 1
  fi
  if [[ "$observed" == "$CANDIDATE_CONTAINER" ]]; then
    return 0
  fi
  return 2
}

candidate_recovery_required() {
  log "SHARED_INGRESS_CANDIDATE_RECOVERY_REQUIRED container=$CANDIDATE_CONTAINER"
  return 1
}

candidate_container_cleanup() {
  local state
  if [[ -z "$CANDIDATE_CONTAINER" ]]; then
    return 0
  fi
  if candidate_container_state; then
    if ! "$DOCKER_BIN" rm -f "$CANDIDATE_CONTAINER" >/dev/null; then
      candidate_recovery_required
      return 1
    fi
  else
    state=$?
    if [[ "$state" -ne 1 ]]; then
      candidate_recovery_required
      return 1
    fi
  fi
  CANDIDATE_CONTAINER=
}

server_block_for_host() {
  local config host
  config=$1
  host=$2
  awk -v expected_host="$host" '
    function inspect_server_name(line, names, token_count, token_index) {
      names = line
      sub(/^[[:space:]]*server_name[[:space:]]+/, "", names)
      sub(/;.*/, "", names)
      token_count = split(names, tokens, /[[:space:]]+/)
      for (token_index = 1; token_index <= token_count; token_index++) {
        if (tokens[token_index] == expected_host) return 1
      }
      return 0
    }
    {
      line = $0
      sub(/[[:space:]]*#.*/, "", line)
      if (!capturing && line ~ /^[[:space:]]*server[[:space:]]*\{/) {
        capturing = 1
        server_depth = depth + 1
        block = ""
        has_host = 0
      }
      if (capturing) {
        block = block line "\n"
        if (line ~ /^[[:space:]]*server_name[[:space:]]+/ && inspect_server_name(line)) {
          has_host = 1
        }
      }
      brace_line = line
      opens = gsub(/\{/, "", brace_line)
      brace_line = line
      closes = gsub(/\}/, "", brace_line)
      depth += opens - closes
      if (capturing && depth < server_depth) {
        if (has_host) printf "__DIIS_SERVER_BLOCK__\n%s", block
        capturing = 0
      }
    }
  ' "$config"
}

verify_route_binding() {
  local config host variable target block block_count candidate_variable
  config=$1
  host=$2
  variable=$3
  target=$4
  block=$(server_block_for_host "$config" "$host") || return 1
  block_count=$(grep -Fc '__DIIS_SERVER_BLOCK__' <<<"$block" || true)
  if [[ "$block_count" -ne 1 ]] || \
    ! grep -Fq "set \$$variable $target;" <<<"$block" || \
    ! grep -Fq "proxy_pass http://\$$variable\$request_uri;" <<<"$block"; then
    fail "route-contract-mismatch-$host"
    return 1
  fi
  for candidate_variable in up_web up_api up_staging_web up_staging_api; do
    if [[ "$candidate_variable" != "$variable" ]] && \
      grep -Fq "proxy_pass http://\$$candidate_variable\$request_uri;" <<<"$block"; then
      fail "route-contract-cross-binding-$host"
      return 1
    fi
  done
}

verify_route_contract() {
  local config
  config=$1
  verify_route_binding "$config" smkdarussalamsubah.sch.id up_web smk-web:3000 || return 1
  verify_route_binding "$config" api.smkdarussalamsubah.sch.id up_api smk-api:3001 || return 1
  verify_route_binding "$config" staging.smkdarussalamsubah.sch.id \
    up_staging_web smk-staging-web:3000 || return 1
  verify_route_binding "$config" staging-api.smkdarussalamsubah.sch.id \
    up_staging_api smk-staging-api:3001 || return 1
  log "SHARED_INGRESS_ROUTE_CONTRACT status=pass routes=4"
}

validate_route_marker() {
  [[ -z "$1" || "$1" =~ ^[A-Za-z0-9._:-]{1,128}$ ]]
}

candidate_route_request() {
  local host path port expected_marker code response body
  host=$1
  path=$2
  port=$3
  expected_marker=$4
  if [[ -n "$expected_marker" ]]; then
    response=$("$CURL_BIN" --silent --show-error --insecure --noproxy '*' --max-time 20 \
      --max-filesize 1024 --resolve "${host}:${port}:127.0.0.1" \
      --write-out $'\n%{http_code}' "https://${host}:${port}${path}") || return 1
    code=${response##*$'\n'}
    body=${response%$'\n'*}
    if [[ "$code" != '200' || "$body" != "$expected_marker" ]]; then
      log "SHARED_INGRESS_CANDIDATE_ROUTE_IDENTITY_MISMATCH host=$host"
      return 1
    fi
    return 0
  fi
  code=$("$CURL_BIN" --silent --show-error --insecure --noproxy '*' --max-time 20 \
    --resolve "${host}:${port}:127.0.0.1" --output /dev/null \
    --write-out '%{http_code}' "https://${host}:${port}${path}") || return 1
  [[ "$code" == '200' ]]
}

candidate_routing_test() {
  local candidate image port_line candidate_port run_id run_attempt host path expected_marker
  local attempt ready marker state
  candidate=$1
  require_file "$candidate" || return 1
  verify_route_contract "$candidate" || return 1
  for marker in "$PRODUCTION_WEB_MARKER" "$PRODUCTION_API_MARKER" \
    "$STAGING_WEB_MARKER" "$STAGING_API_MARKER"; do
    if ! validate_route_marker "$marker"; then
      fail "invalid-route-marker"
      return 1
    fi
  done
  if [[ ! -d "$PRODUCTION_CERTS" ]]; then
    fail "production-certs-missing"
    return 1
  fi
  image=$("$DOCKER_BIN" inspect "$NGINX_CONTAINER" --format '{{.Image}}') || return 1
  run_id=${DIIS_DEPLOY_RUN_ID:-$$}
  run_attempt=${DIIS_DEPLOY_RUN_ATTEMPT:-1}
  if [[ ! "$run_id" =~ ^[1-9][0-9]*$ ]] || [[ ! "$run_attempt" =~ ^[1-9][0-9]*$ ]]; then
    fail "invalid-candidate-run-identity"
    return 1
  fi
  CANDIDATE_CONTAINER="diis-nginx-candidate-${run_id}-${run_attempt}"
  if candidate_container_state; then
    fail "candidate-container-name-in-use"
    return 1
  else
    state=$?
    if [[ "$state" -ne 1 ]]; then
      candidate_recovery_required
      fail "candidate-observability-unavailable"
      return 1
    fi
  fi
  if ! "$DOCKER_BIN" run --detach --rm --name "$CANDIDATE_CONTAINER" \
    --label diis.validation=shared-ingress-candidate \
    --label "diis.run-id=$run_id" \
    --network "$PRODUCTION_NETWORK" --publish 127.0.0.1::443 --read-only \
    --memory 128m --cpus 0.50 --pids-limit 64 --stop-timeout 5 \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=16m \
    --tmpfs /var/run:rw,noexec,nosuid,size=1m \
    --tmpfs /tmp:rw,noexec,nosuid,size=1m \
    --mount "type=bind,src=$candidate,dst=/etc/nginx/nginx.conf,readonly" \
    --mount "type=bind,src=$PRODUCTION_CERTS,dst=/etc/nginx/certs,readonly" \
    --entrypoint nginx "$image" -g 'daemon off;' >/dev/null; then
    fail "candidate-nginx-start-failed"
    return 1
  fi
  if ! "$DOCKER_BIN" network connect "$STAGING_NETWORK" "$CANDIDATE_CONTAINER"; then
    fail "candidate-staging-network-connect-failed"
    return 1
  fi
  ready=0
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if "$DOCKER_BIN" exec "$CANDIDATE_CONTAINER" nginx -t >/dev/null 2>&1; then
      ready=1
      break
    fi
    "$SLEEP_BIN" 1
  done
  if [[ "$ready" -ne 1 ]]; then
    fail "candidate-nginx-config-invalid"
    return 1
  fi
  port_line=$("$DOCKER_BIN" port "$CANDIDATE_CONTAINER" 443/tcp) || {
    fail "candidate-port-unavailable"
    return 1
  }
  candidate_port=${port_line##*:}
  if [[ ! "$candidate_port" =~ ^[1-9][0-9]*$ ]]; then
    fail "candidate-port-invalid"
    return 1
  fi

  while IFS='|' read -r host path expected_marker; do
    if ! candidate_route_request "$host" "$path" "$candidate_port" "$expected_marker"; then
      fail "candidate-routing-failed"
      return 1
    fi
  done <<EOF
smkdarussalamsubah.sch.id|/health|$PRODUCTION_WEB_MARKER
api.smkdarussalamsubah.sch.id|/health|$PRODUCTION_API_MARKER
staging.smkdarussalamsubah.sch.id|/health|$STAGING_WEB_MARKER
staging-api.smkdarussalamsubah.sch.id|/health|$STAGING_API_MARKER
EOF

  if ! candidate_container_cleanup; then
    fail "candidate-cleanup-failed"
    return 1
  fi
  log "SHARED_INGRESS_CANDIDATE_ROUTING status=pass routes=4"
}

compose_config_test() {
  (
    cd "$PRODUCTION_COMPOSE_DIR"
    "$DOCKER_BIN" compose -f docker-compose.yml --env-file .env \
      run --rm --no-deps nginx nginx -t >/dev/null
  )
}

compose_recreate() {
  (
    cd "$PRODUCTION_COMPOSE_DIR"
    "$DOCKER_BIN" compose -f docker-compose.yml --env-file .env \
      up -d --no-deps --force-recreate nginx
  )
}

connect_staging_network() {
  if ! "$DOCKER_BIN" network inspect "$STAGING_NETWORK" >/dev/null 2>&1; then
    fail "staging-network-missing"
    return 1
  fi
  if network_has_container; then
    return 0
  fi
  if ! "$DOCKER_BIN" network connect "$STAGING_NETWORK" "$NGINX_CONTAINER"; then
    fail "staging-network-connect-failed"
    return 1
  fi
  if ! network_has_container; then
    fail "staging-network-membership-not-confirmed"
    return 1
  fi
}

recreate_with_retry() {
  local attempt recreated
  if [[ ! "$MAX_RECREATE_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
    fail "invalid-recreate-attempts"
    return 1
  fi
  recreated=0
  for ((attempt = 1; attempt <= MAX_RECREATE_ATTEMPTS; attempt++)); do
    if compose_recreate; then
      recreated=1
      log "SHARED_INGRESS_RECREATE attempt=$attempt status=pass"
      break
    fi
    log "SHARED_INGRESS_RECREATE attempt=$attempt status=failed"
    if [[ "$attempt" -lt "$MAX_RECREATE_ATTEMPTS" ]]; then
      "$SLEEP_BIN" "$RETRY_DELAY_SECONDS"
    fi
  done
  if [[ "$recreated" -ne 1 ]]; then
    fail "nginx-recreate-exhausted"
    return 1
  fi
}

atomic_replace() {
  local source target candidate
  source=$1
  target=$2
  ATOMIC_SEQUENCE=$((ATOMIC_SEQUENCE + 1))
  candidate="${target}.diis-candidate.$$.${ATOMIC_SEQUENCE}"
  ATOMIC_CANDIDATES+=("$candidate")
  "$CP_BIN" -p "$source" "$candidate"
  "$MV_BIN" -f "$candidate" "$target"
}

cleanup_atomic_candidates() {
  local candidate
  for candidate in "${ATOMIC_CANDIDATES[@]}"; do
    if [[ -e "$candidate" ]]; then
      "$RM_BIN" -f "$candidate"
    fi
  done
}

consume_rollback_snapshot() {
  if [[ -n "$ROLLBACK_CONFIG" && -f "$ROLLBACK_CONFIG" ]]; then
    "$RM_BIN" -f "$ROLLBACK_CONFIG"
  fi
}

preserve_recovery_file() {
  local source kind destination digest
  source=$1
  kind=$2
  [[ -e "$source" ]] || return 0
  destination="$RECOVERY_DIR/${kind}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  "$MV_BIN" -f "$source" "$destination" || return 1
  chmod 600 "$destination" || return 1
  digest=$(config_digest "$destination") || return 1
  log "SHARED_INGRESS_RECOVERY_ARTIFACT kind=$kind path=$destination digest=$digest"
}

preserve_recovery_evidence() {
  local candidate index
  umask 077
  mkdir -p "$RECOVERY_DIR" || return 1
  chmod 700 "$RECOVERY_DIR" || return 1
  preserve_recovery_file "$ROLLBACK_CONFIG" rollback || return 1
  index=0
  for candidate in "${ATOMIC_CANDIDATES[@]}"; do
    if [[ -e "$candidate" ]]; then
      index=$((index + 1))
      preserve_recovery_file "$candidate" "atomic-candidate-$index" || return 1
    fi
  done
  printf 'status=rollback-failed retained_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    >"$RECOVERY_DIR/recovery-required-$$.marker" || return 1
  chmod 600 "$RECOVERY_DIR/recovery-required-$$.marker" || return 1
  log "SHARED_INGRESS_RECOVERY_REQUIRED path=$RECOVERY_DIR"
}

restore_reviewed_source_config() {
  [[ -n "$NEW_CONFIG_SNAPSHOT" ]] || return 1
  atomic_replace "$NEW_CONFIG_SNAPSHOT" "$PRODUCTION_CONFIG"
  [[ "$(config_digest "$PRODUCTION_CONFIG")" == "$EXPECTED_CONFIG_SHA" ]]
}

rollback_runtime() {
  local rollback_ok
  [[ "$ROLLBACK_IN_PROGRESS" -eq 0 ]] || return 1
  ROLLBACK_IN_PROGRESS=1
  rollback_ok=1

  log "SHARED_INGRESS_ROLLBACK status=starting"
  atomic_replace "$ROLLBACK_CONFIG" "$PRODUCTION_CONFIG" || rollback_ok=0
  if [[ "$rollback_ok" -eq 1 ]]; then
    recreate_with_retry || rollback_ok=0
  fi
  if [[ "$rollback_ok" -eq 1 ]]; then
    connect_staging_network || rollback_ok=0
  fi
  if [[ "$rollback_ok" -eq 1 ]]; then
    "$DOCKER_BIN" exec "$NGINX_CONTAINER" nginx -t >/dev/null || rollback_ok=0
  fi
  if [[ "$rollback_ok" -eq 1 ]]; then
    verify_runtime_digest "$(config_digest "$ROLLBACK_CONFIG")" || rollback_ok=0
  fi

  # Restore the reviewed source inode after the rollback container has bound the
  # previous config. The failed deployment remains source-clean and fail-closed.
  restore_reviewed_source_config || rollback_ok=0
  if [[ "$rollback_ok" -eq 1 ]]; then
    verify_public_health || rollback_ok=0
  fi

  if [[ "$rollback_ok" -eq 1 ]]; then
    log "SHARED_INGRESS_ROLLBACK status=pass"
    return 0
  fi
  log "SHARED_INGRESS_ROLLBACK status=failed"
  return 1
}

cleanup() {
  local cleanup_failed
  cleanup_failed=0
  candidate_container_cleanup || cleanup_failed=1
  if [[ -n "$NEW_CONFIG_SNAPSHOT" && -f "$NEW_CONFIG_SNAPSHOT" ]]; then
    "$RM_BIN" -f "$NEW_CONFIG_SNAPSHOT" || cleanup_failed=1
  fi
  if [[ "$PRESERVE_ON_CLEANUP" -eq 0 ]]; then
    cleanup_atomic_candidates || cleanup_failed=1
  fi
  return "$cleanup_failed"
}

on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "$status" -ne 0 && "$MUTATION_STARTED" -eq 1 ]]; then
    if rollback_runtime; then
      consume_rollback_snapshot
    else
      PRESERVE_ON_CLEANUP=1
      if preserve_recovery_evidence; then
        status=90
      else
        status=91
      fi
    fi
  fi
  if ! cleanup; then
    log "SHARED_INGRESS_ERROR reason=cleanup-failed"
    status=92
  fi
  exit "$status"
}

trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

preflight_staging() {
  verify_main_authority || return 1
  if ! candidate_routing_test "$STAGING_CONFIG"; then
    fail "candidate-validation-failed"
    return 1
  fi
  verify_runtime_topology || return 1
  verify_runtime_digest "$AUTHORITATIVE_CONFIG_SHA" || return 1
  verify_public_health || return 1
  log "SHARED_INGRESS_CANDIDATE environment=staging status=validated-not-activated digest=$(config_digest "$STAGING_CONFIG")"
  log "SHARED_INGRESS_PREFLIGHT environment=staging status=pass"
}

post_staging() {
  verify_main_authority || return 1
  if ! candidate_routing_test "$STAGING_CONFIG"; then
    fail "candidate-validation-failed"
    return 1
  fi
  verify_runtime_topology || return 1
  verify_runtime_digest "$AUTHORITATIVE_CONFIG_SHA" || return 1
  verify_public_health || return 1
  log "SHARED_INGRESS_POSTCHECK environment=staging status=pass"
}

preflight_production() {
  require_file "$PRODUCTION_CONFIG" || return 1
  require_file "$ROLLBACK_CONFIG" || return 1
  verify_expected_digest || return 1
  verify_route_contract "$PRODUCTION_CONFIG" || return 1
  if ! compose_config_test; then
    fail "candidate-nginx-config-invalid"
    return 1
  fi
  verify_runtime_topology || return 1
  verify_runtime_digest "$(config_digest "$ROLLBACK_CONFIG")" || return 1
  verify_public_health || return 1
  log "SHARED_INGRESS_PREFLIGHT environment=production status=pass"
}

rollout_production() {
  local rollback_digest
  require_file "$PRODUCTION_CONFIG" || return 1
  require_file "$ROLLBACK_CONFIG" || return 1
  verify_expected_digest || return 1
  verify_route_contract "$PRODUCTION_CONFIG" || return 1
  if ! compose_config_test; then
    fail "candidate-nginx-config-invalid"
    return 1
  fi
  verify_runtime_topology || return 1
  rollback_digest=$(config_digest "$ROLLBACK_CONFIG")
  verify_runtime_digest "$rollback_digest" || return 1
  verify_public_health || return 1

  if [[ "$EXPECTED_CONFIG_SHA" == "$rollback_digest" ]]; then
    log "SHARED_INGRESS_ROLLOUT environment=production status=unchanged digest=$EXPECTED_CONFIG_SHA"
    consume_rollback_snapshot
    return 0
  fi

  NEW_CONFIG_SNAPSHOT=$(mktemp /tmp/diis-nginx-reviewed.XXXXXX)
  "$CP_BIN" -p "$PRODUCTION_CONFIG" "$NEW_CONFIG_SNAPSHOT"
  MUTATION_STARTED=1

  recreate_with_retry || return 1
  connect_staging_network || return 1
  if ! "$DOCKER_BIN" exec "$NGINX_CONTAINER" nginx -t >/dev/null; then
    fail "runtime-nginx-config-invalid"
    return 1
  fi
  verify_runtime_digest "$EXPECTED_CONFIG_SHA" || return 1
  verify_public_health || return 1

  MUTATION_STARTED=0
  consume_rollback_snapshot
  cleanup_atomic_candidates
  log "SHARED_INGRESS_ROLLOUT environment=production status=pass digest=$EXPECTED_CONFIG_SHA"
}

case "$MODE" in
  verify-route-contract)
    require_file "$EXPECTED_CONFIG_SHA"
    verify_route_contract "$EXPECTED_CONFIG_SHA"
    ;;
  preflight-staging) preflight_staging ;;
  post-staging) post_staging ;;
  preflight-production) preflight_production ;;
  rollout-production) rollout_production ;;
  *)
    log "Usage: $0 {verify-route-contract|preflight-staging|post-staging|preflight-production|rollout-production} [mode arguments]"
    exit 64
    ;;
esac

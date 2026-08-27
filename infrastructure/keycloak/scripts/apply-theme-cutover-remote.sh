#!/usr/bin/env bash
set -Eeuo pipefail
set +x

readonly confirmation_phrase='APPLY_DIIS_SHARED_AUTH_THEME'
readonly work_dir=${DIIS_WORK_DIR:-/home/appuser/smart-ai-school}
readonly docker_dir="$work_dir/infrastructure/docker"
readonly theme_root="$work_dir/infrastructure/keycloak/themes/diis/login"
readonly manifest="$work_dir/infrastructure/keycloak/diis-login-theme.sha256"
readonly verifier="$work_dir/infrastructure/keycloak/scripts/verify-theme-bundle.sh"
readonly preflight="$work_dir/infrastructure/keycloak/scripts/verify-theme-cutover-preflight.sh"
readonly container=${DIIS_KEYCLOAK_CONTAINER:-smk-keycloak}
readonly realm=${DIIS_KEYCLOAK_REALM:-diis}
readonly auth_origin=${DIIS_AUTH_ORIGIN:-https://auth.smkdarussalamsubah.sch.id}
readonly auth_probe_client_id=${DIIS_AUTH_PROBE_CLIENT_ID:-diis-web}
readonly auth_probe_redirect_uri=${DIIS_AUTH_PROBE_REDIRECT_URI:-https://smkdarussalamsubah.sch.id/api/auth/callback/keycloak}
readonly run_id=${DIIS_RUN_ID:-manual}
readonly kc_config="/tmp/diis-theme-cutover-${run_id//[^a-zA-Z0-9._-]/_}.config"

mutation_started=0
previous_theme=''

fail() {
  echo "THEME_CUTOVER_FAILED reason=$1" >&2
  return 1
}

require_env() {
  local name=$1
  [[ -n "${!name:-}" ]] || fail "missing-env:$name"
}

container_env() {
  local name=$1
  docker inspect "$container" --format '{{range .Config.Env}}{{println .}}{{end}}' |
    sed -n "s/^${name}=//p" | head -n 1
}

remove_kcadm_config() {
  docker exec "$container" rm -f "$kc_config" >/dev/null 2>&1 || true
}

authenticate_kcadm() {
  local admin_user admin_password
  admin_user=$(container_env KEYCLOAK_ADMIN)
  admin_password=$(container_env KEYCLOAK_ADMIN_PASSWORD)
  [[ -n "$admin_user" && -n "$admin_password" ]] || fail "admin-credential-unavailable"
  remove_kcadm_config
  docker exec "$container" /opt/keycloak/bin/kcadm.sh config credentials \
    --config "$kc_config" \
    --server http://localhost:8080 \
    --realm master \
    --user "$admin_user" \
    --password "$admin_password" >/dev/null
  unset admin_password admin_user
}

read_login_theme() {
  local response
  response=$(docker exec "$container" /opt/keycloak/bin/kcadm.sh get \
    --config "$kc_config" "realms/$realm" --fields loginTheme)
  sed -n 's/.*"loginTheme"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$response"
}

set_login_theme() {
  local theme=$1
  docker exec "$container" /opt/keycloak/bin/kcadm.sh update \
    --config "$kc_config" "realms/$realm" -s "loginTheme=$theme" >/dev/null
}

wait_for_health() {
  local attempt health
  for attempt in $(seq 1 30); do
    health=$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' 2>/dev/null || true)
    printf 'KEYCLOAK_HEALTH attempt=%s status=%s\n' "$attempt" "${health:-missing}"
    [[ "$health" == healthy ]] && return 0
    sleep 4
  done
  fail "health-timeout"
}

verify_mount() {
  local expected_source mount_record
  expected_source=$(cd "$work_dir/infrastructure/keycloak/themes/diis" && pwd -P)
  mount_record=$(docker inspect "$container" --format \
    '{{range .Mounts}}{{if eq .Destination "/opt/keycloak/themes/diis"}}{{.Source}}|{{.RW}}{{end}}{{end}}')
  [[ "$mount_record" == "$expected_source|false" ]] || fail "theme-mount-mismatch"
  echo "THEME_MOUNT_OK destination=/opt/keycloak/themes/diis read_only=true"
}

verify_runtime_bundle() {
  local expected_hash relative_path actual_hash count=0
  while read -r expected_hash relative_path; do
    [[ -n "$expected_hash" && -n "$relative_path" ]] || continue
    actual_hash=$(docker exec "$container" sha256sum "/opt/keycloak/themes/diis/login/$relative_path" |
      awk '{print $1}')
    [[ "$actual_hash" == "$expected_hash" ]] || fail "runtime-hash-mismatch:$relative_path"
    printf 'THEME_RUNTIME_FILE_OK path=%s sha256=%s\n' "$relative_path" "$actual_hash"
    count=$((count + 1))
  done < "$manifest"
  [[ $count -eq 5 ]] || fail "runtime-file-count"
  docker exec "$container" test -f /opt/keycloak/themes/diis/login/resources/js/login.js ||
    fail "runtime-login-js-missing"
  echo "THEME_RUNTIME_BUNDLE_OK file_count=5"
}

verify_public_auth() {
  local discovery login_page
  discovery=$(curl --fail --silent --show-error --max-time 15 \
    "$auth_origin/realms/$realm/.well-known/openid-configuration")
  grep -Fq "\"issuer\":\"$auth_origin/realms/$realm\"" <<<"${discovery// /}" ||
    fail "issuer-mismatch"

  login_page=$(curl --fail --silent --show-error --location --max-time 20 \
    --get "$auth_origin/realms/$realm/protocol/openid-connect/auth" \
    --data-urlencode "client_id=$auth_probe_client_id" \
    --data-urlencode 'response_type=code' \
    --data-urlencode 'scope=openid' \
    --data-urlencode "redirect_uri=$auth_probe_redirect_uri")
  grep -Eq 'id="kc-(form-login|page-title)"|class="[^"]*login-pf' <<<"$login_page" ||
    fail "login-page-unavailable"
  echo "KEYCLOAK_PUBLIC_AUTH_OK discovery=true login_page=true"
}

contain_failure() {
  local exit_code=$?
  trap - ERR
  set +e
  if [[ $mutation_started -eq 1 ]]; then
    local safe_theme=$previous_theme
    [[ -n "$safe_theme" && "$safe_theme" != diis ]] || safe_theme=keycloak
    echo "THEME_CUTOVER_CONTAINMENT_BEGIN safe_theme=$safe_theme"
    if wait_for_health && authenticate_kcadm && set_login_theme "$safe_theme" && verify_public_auth; then
      echo "THEME_CUTOVER_CONTAINMENT_OK safe_theme=$safe_theme"
    else
      echo "THEME_CUTOVER_CONTAINMENT_FAILED operator_action_required=true" >&2
    fi
  fi
  remove_kcadm_config
  exit "$exit_code"
}

cleanup() {
  remove_kcadm_config
}

trap contain_failure ERR
trap cleanup EXIT

require_env DIIS_EXPECTED_SHA
require_env DIIS_PREVIOUS_PRODUCTION_SHA
require_env DIIS_CONFIRMATION
[[ "$DIIS_CONFIRMATION" == "$confirmation_phrase" ]] || fail "confirmation-mismatch"

bash "$preflight" "$work_dir" "$DIIS_EXPECTED_SHA" "$DIIS_PREVIOUS_PRODUCTION_SHA" main
bash "$verifier" "$theme_root" "$manifest"

initial_health=$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}')
[[ "$initial_health" == healthy ]] || fail "initial-health-not-healthy"
verify_mount

image_id=$(docker inspect "$container" --format '{{.Image}}')
echo "THEME_CUTOVER_BASELINE head=$DIIS_EXPECTED_SHA previous_sha=$DIIS_PREVIOUS_PRODUCTION_SHA image_id=$image_id health=$initial_health"

authenticate_kcadm
previous_theme=$(read_login_theme)
[[ -n "$previous_theme" ]] || previous_theme=keycloak
echo "THEME_CUTOVER_REALM_BASELINE login_theme=$previous_theme"
verify_public_auth

cutover_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mutation_started=1
docker compose --project-directory "$docker_dir" -f "$docker_dir/docker-compose.yml" \
  --env-file "$docker_dir/.env" up -d --no-deps --force-recreate keycloak

wait_for_health
verify_mount
verify_runtime_bundle
authenticate_kcadm
set_login_theme diis
[[ "$(read_login_theme)" == diis ]] || fail "realm-theme-verification"
verify_public_auth

error_count=$(docker logs "$container" --since "$cutover_started_at" --tail 300 2>&1 |
  grep -Eic '(^|[[:space:]])ERROR([[:space:]]|$)|HTTP[^0-9]*5[0-9][0-9]' || true)
[[ "$error_count" -eq 0 ]] || fail "bounded-log-errors:$error_count"

mutation_started=0
echo "THEME_CUTOVER_OK head=$DIIS_EXPECTED_SHA realm=$realm login_theme=diis health=healthy bounded_log_errors=0"
echo "THEME_SOURCE_ROLLBACK_REQUIRES_GITFLOW previous_production_sha=$DIIS_PREVIOUS_PRODUCTION_SHA"

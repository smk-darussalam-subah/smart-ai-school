#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
keycloak_root=$(cd "$script_dir/.." && pwd -P)
source_theme="$keycloak_root/themes/diis/login"
source_manifest="$keycloak_root/diis-login-theme.sha256"
temp_root=$(mktemp -d)
repo="$temp_root/repo"
mock_bin="$temp_root/bin"
state_root="$temp_root/state"

cleanup() {
  rm -rf "$temp_root"
}
trap cleanup EXIT

mkdir -p \
  "$repo/infrastructure/docker" \
  "$repo/infrastructure/keycloak/scripts" \
  "$repo/infrastructure/keycloak/themes/diis/login" \
  "$mock_bin" \
  "$state_root"
cp "$script_dir/apply-theme-cutover-remote.sh" \
  "$script_dir/verify-theme-bundle.sh" \
  "$script_dir/verify-theme-cutover-preflight.sh" \
  "$repo/infrastructure/keycloak/scripts/"
cp "$source_manifest" "$repo/infrastructure/keycloak/diis-login-theme.sha256"
cp -R "$source_theme/." "$repo/infrastructure/keycloak/themes/diis/login/"
printf 'services:\n  keycloak:\n    image: disposable\n' > "$repo/infrastructure/docker/docker-compose.yml"
printf 'DISPOSABLE_ONLY=true\n' > "$repo/infrastructure/docker/.env"

git -C "$repo" init -q -b main
git -C "$repo" config user.name "DIIS Containment Test"
git -C "$repo" config user.email "diis-containment@example.invalid"
git -C "$repo" add -- infrastructure
git -C "$repo" commit -qm "test: previous production"
previous_sha=$(git -C "$repo" rev-parse HEAD)
printf 'target\n' > "$repo/target-marker.txt"
git -C "$repo" add -- target-marker.txt
git -C "$repo" commit -qm "test: target production"
expected_sha=$(git -C "$repo" rev-parse HEAD)

cat > "$mock_bin/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
set -euo pipefail

state=$DIIS_MOCK_STATE_DIR
command_name=${1:-}
shift || true

case "$command_name" in
  inspect)
    format=${*: -1}
    if [[ "$format" == *'.Config.Env'* ]]; then
      printf 'KEYCLOAK_ADMIN=mock-admin\n'
      printf 'KEYCLOAK_ADMIN_PASSWORD=mock-secret-never-print\n'
    elif [[ "$format" == *'.State.Health'* ]]; then
      if [[ -f "$state/pre-mutation-unhealthy" && ! -f "$state/recreated" ]]; then
        printf 'unhealthy\n'
      else
        printf 'healthy\n'
      fi
    elif [[ "$format" == *'.Mounts'* ]]; then
      printf '%s|false\n' "$DIIS_MOCK_MOUNT_SOURCE"
    elif [[ "$format" == *'.Image'* ]]; then
      printf 'sha256:mock-keycloak-image\n'
    else
      printf 'unsupported docker inspect format\n' >&2
      exit 70
    fi
    ;;
  exec)
    shift
    tool=${1:-}
    shift || true
    case "$tool" in
      rm)
        rm -f "$state/kcadm-config"
        printf 'removed\n' >> "$state/config-cleanup.log"
        ;;
      /opt/keycloak/bin/kcadm.sh)
        subcommand=${1:-}
        shift || true
        case "$subcommand" in
          config)
            : > "$state/kcadm-config"
            ;;
          get)
            printf '{"loginTheme":"%s"}\n' "$(cat "$state/theme")"
            ;;
          update)
            theme_setting=''
            while [[ $# -gt 0 ]]; do
              if [[ "$1" == -s && ${2:-} == loginTheme=* ]]; then
                theme_setting=${2#loginTheme=}
                break
              fi
              shift
            done
            [[ -n "$theme_setting" ]] || exit 71
            if [[ -f "$state/fail-containment" && "$theme_setting" != diis ]]; then
              exit 72
            fi
            printf '%s\n' "$theme_setting" > "$state/theme"
            printf '%s\n' "$theme_setting" >> "$state/theme-updates.log"
            ;;
          *) exit 73 ;;
        esac
        ;;
      sha256sum)
        relative_path=${1#/opt/keycloak/themes/diis/login/}
        sha256sum "$DIIS_MOCK_THEME_ROOT/$relative_path"
        ;;
      test)
        [[ ${1:-} == -f ]] || exit 74
        relative_path=${2#/opt/keycloak/themes/diis/login/}
        test -f "$DIIS_MOCK_THEME_ROOT/$relative_path"
        ;;
      *) exit 75 ;;
    esac
    ;;
  compose)
    printf '%s\n' "$*" >> "$state/compose.log"
    : > "$state/recreated"
    ;;
  logs)
    if [[ -f "$state/fail-post-check" ]]; then
      printf 'ERROR forced post-mutation verification failure\n'
    fi
    ;;
  *)
    printf 'unsupported docker command: %s\n' "$command_name" >&2
    exit 76
    ;;
esac
MOCK_DOCKER

cat > "$mock_bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "$DIIS_MOCK_STATE_DIR/curl.log"
args=$*
if [[ "$args" == *'/.well-known/openid-configuration'* ]]; then
  printf '{"issuer":"%s/realms/%s"}\n' "$DIIS_AUTH_ORIGIN" "$DIIS_KEYCLOAK_REALM"
elif [[ "$args" == *'/protocol/openid-connect/auth'* ]]; then
  [[ "$args" == *'--data-urlencode client_id=diis-web'* ]]
  [[ "$args" == *'--data-urlencode response_type=code'* ]]
  [[ "$args" == *'--data-urlencode scope=openid'* ]]
  [[ "$args" == *'--data-urlencode redirect_uri=https://smkdarussalamsubah.sch.id/api/auth/callback/keycloak'* ]]
  printf '<html><body class="login-pf"><h1 id="kc-page-title">Sign in</h1></body></html>\n'
elif [[ "$args" == *'/account'* ]]; then
  printf '<html><head><title>Account Management</title></head></html>\n'
else
  printf 'unexpected curl request\n' >&2
  exit 22
fi
MOCK_CURL
chmod +x "$mock_bin/docker" "$mock_bin/curl"

run_remote_failure() {
  local name=$1
  local initial_theme=$2
  local failure_mode=$3
  local expected_theme=$4
  local expected_containment=$5
  local state="$state_root/$name"
  local output_file="$state/output.log"
  local status

  mkdir -p "$state"
  printf '%s\n' "$initial_theme" > "$state/theme"
  case "$failure_mode" in
    pre-mutation) : > "$state/pre-mutation-unhealthy" ;;
    post-mutation) : > "$state/fail-post-check" ;;
    containment-failure)
      : > "$state/fail-post-check"
      : > "$state/fail-containment"
      ;;
    *) return 90 ;;
  esac

  set +e
  PATH="$mock_bin:$PATH" \
    DIIS_WORK_DIR="$repo" \
    DIIS_EXPECTED_SHA="$expected_sha" \
    DIIS_PREVIOUS_PRODUCTION_SHA="$previous_sha" \
    DIIS_CONFIRMATION='APPLY_DIIS_SHARED_AUTH_THEME' \
    DIIS_RUN_ID="containment-$name" \
    DIIS_KEYCLOAK_CONTAINER='mock-keycloak' \
    DIIS_KEYCLOAK_REALM='diis-mock' \
    DIIS_AUTH_ORIGIN='https://auth.example.invalid' \
    DIIS_MOCK_STATE_DIR="$state" \
    DIIS_MOCK_MOUNT_SOURCE="$(cd "$repo/infrastructure/keycloak/themes/diis" && pwd -P)" \
    DIIS_MOCK_THEME_ROOT="$repo/infrastructure/keycloak/themes/diis/login" \
    bash "$repo/infrastructure/keycloak/scripts/apply-theme-cutover-remote.sh" \
      > "$output_file" 2>&1
  status=$?
  set -e

  [[ $status -ne 0 ]] || { echo "Expected nonzero status for $name" >&2; return 1; }
  [[ "$(cat "$state/theme")" == "$expected_theme" ]] || {
    echo "Unexpected final theme for $name" >&2
    return 1
  }
  [[ ! -e "$state/kcadm-config" ]] || { echo "Temporary config remains for $name" >&2; return 1; }
  ! grep -Fq 'mock-secret-never-print' "$output_file" || {
    echo "Secret leaked for $name" >&2
    return 1
  }

  if [[ "$failure_mode" == pre-mutation ]]; then
    [[ ! -e "$state/recreated" ]] || { echo "Pre-mutation case recreated Keycloak" >&2; return 1; }
    [[ ! -e "$state/theme-updates.log" ]] || { echo "Pre-mutation case changed theme" >&2; return 1; }
    grep -Fq 'reason=initial-health-not-healthy' "$output_file"
    return
  fi

  [[ -e "$state/recreated" ]] || { echo "Post-mutation case did not recreate Keycloak" >&2; return 1; }
  grep -Fq -- 'up -d --no-deps --force-recreate keycloak' "$state/compose.log"
  ! grep -Eq '(^|[[:space:]])(postgres|redis|api|web|nginx|worker)([[:space:]]|$)' "$state/compose.log" || {
    echo "Unexpected service targeted for $name" >&2
    return 1
  }
  grep -Fq 'diis' "$state/theme-updates.log"

  if [[ "$expected_containment" == success ]]; then
    grep -Fq "THEME_CUTOVER_CONTAINMENT_OK safe_theme=$expected_theme" "$output_file"
    grep -Fq "$expected_theme" "$state/theme-updates.log"
    [[ $(wc -l < "$state/curl.log") -ge 6 ]] || {
      echo "Public auth was not reverified after containment for $name" >&2
      return 1
    }
  else
    grep -Fq 'THEME_CUTOVER_CONTAINMENT_FAILED operator_action_required=true' "$output_file"
  fi
}

run_remote_failure 'before-mutation' 'legacy-theme' 'pre-mutation' 'legacy-theme' 'none'
run_remote_failure 'restore-previous' 'legacy-theme' 'post-mutation' 'legacy-theme' 'success'
run_remote_failure 'fallback-built-in' 'diis' 'post-mutation' 'keycloak' 'success'
run_remote_failure 'operator-required' 'diis' 'containment-failure' 'diis' 'failure'

for curl_log in "$state_root"/*/curl.log; do
  grep -Fq '/protocol/openid-connect/auth' "$curl_log"
  grep -Fq -- '--data-urlencode client_id=diis-web' "$curl_log"
  grep -Fq -- '--data-urlencode redirect_uri=https://smkdarussalamsubah.sch.id/api/auth/callback/keycloak' "$curl_log"
  ! grep -Fq '/account' "$curl_log"
done

echo 'THEME_CONTAINMENT_TESTS_OK cases=4'

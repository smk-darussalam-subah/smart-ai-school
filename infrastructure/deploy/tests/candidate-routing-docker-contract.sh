#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INGRESS_SCRIPT="$SCRIPT_DIR/../diis-shared-ingress.sh"
ROOT=$(mktemp -d /tmp/diis-candidate-routing.XXXXXX)
SUFFIX="$$"
LABEL="diis.candidate-routing-test=$SUFFIX"
PRODUCTION_NETWORK="diis-route-prod-$SUFFIX"
STAGING_NETWORK="diis-route-staging-$SUFFIX"
SHARED_CONTAINER="diis-route-shared-$SUFFIX"
PROD_WEB="diis-route-prod-web-$SUFFIX"
PROD_API="diis-route-prod-api-$SUFFIX"
STAGING_WEB="diis-route-staging-web-$SUFFIX"
STAGING_API="diis-route-staging-api-$SUFFIX"
RUN_ID=$((900000 + SUFFIX))
REAL_CURL=$(command -v curl)
IMAGE=${DIIS_CANDIDATE_TEST_NGINX_IMAGE:-nginx@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10}

if [[ ! "$IMAGE" =~ ^(nginx@sha256:[0-9a-f]{64}|sha256:[0-9a-f]{64})$ ]]; then
  echo 'CANDIDATE_TEST_IMAGE_REJECTED reason=mutable-or-invalid-reference' >&2
  exit 64
fi

cleanup() {
  set +e
  docker rm -f "diis-nginx-candidate-$RUN_ID-1" \
    "diis-nginx-candidate-$RUN_ID-2" "diis-nginx-candidate-$RUN_ID-3" \
    "diis-nginx-candidate-$RUN_ID-4" "$SHARED_CONTAINER" "$PROD_WEB" \
    "$PROD_API" "$STAGING_WEB" "$STAGING_API" >/dev/null 2>&1
  docker network rm "$PRODUCTION_NETWORK" "$STAGING_NETWORK" >/dev/null 2>&1
  case "$ROOT" in
    /tmp/diis-candidate-routing.*) rm -rf -- "$ROOT" ;;
    *) exit 97 ;;
  esac
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null
command -v openssl >/dev/null
docker info >/dev/null

mkdir -p "$ROOT/certs" "$ROOT/production" "$ROOT/staging"
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -subj '/CN=smkdarussalamsubah.sch.id' \
  -keyout "$ROOT/certs/origin.key" -out "$ROOT/certs/origin.pem" >/dev/null 2>&1

cat >"$ROOT/production-web.conf" <<'EOF'
events {}
http { server { listen 3000; location = /health { return 200 "DIIS_PRODUCTION_WEB"; } } }
EOF
cat >"$ROOT/production-api.conf" <<'EOF'
events {}
http { server { listen 3001; location = /health { return 200 "DIIS_PRODUCTION_API"; } } }
EOF
cat >"$ROOT/staging-web.conf" <<'EOF'
events {}
http { server { listen 3000; location = /health { return 200 "DIIS_STAGING_WEB"; } } }
EOF
cat >"$ROOT/staging-api.conf" <<'EOF'
events {}
http { server { listen 3001; location = /health { return 200 "DIIS_STAGING_API"; } } }
EOF
cat >"$ROOT/production-web-as-api.conf" <<'EOF'
events {}
http { server { listen 3000; location = /health { return 200 "DIIS_PRODUCTION_API"; } } }
EOF
cat >"$ROOT/production-api-as-web.conf" <<'EOF'
events {}
http { server { listen 3001; location = /health { return 200 "DIIS_PRODUCTION_WEB"; } } }
EOF
cat >"$ROOT/stable.conf" <<'EOF'
events {}
http { server { listen 80; location = /health { return 200 "stable\n"; } } }
EOF
cat >"$ROOT/candidate.conf" <<'EOF'
events {}
http {
  resolver 127.0.0.11 valid=1s ipv6=off;
  ssl_certificate /etc/nginx/certs/origin.pem;
  ssl_certificate_key /etc/nginx/certs/origin.key;
  server {
    listen 443 ssl;
    server_name smkdarussalamsubah.sch.id;
    location = /health { set $up_web smk-web:3000; proxy_pass http://$up_web$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name api.smkdarussalamsubah.sch.id;
    location = /health { set $up_api smk-api:3001; proxy_pass http://$up_api$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name staging.smkdarussalamsubah.sch.id;
    location = /health { set $up_staging_web smk-staging-web:3000; proxy_pass http://$up_staging_web$request_uri; }
  }
  server {
    listen 443 ssl;
    server_name staging-api.smkdarussalamsubah.sch.id;
    location = /health { set $up_staging_api smk-staging-api:3001; proxy_pass http://$up_staging_api$request_uri; }
  }
}
EOF
cp "$ROOT/stable.conf" "$ROOT/production/nginx.conf"

cat >"$ROOT/git-stub" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == '-C' ]]
shift 2
case "${1:-}:${2:-}" in
  branch:--show-current) printf 'main\n' ;;
  rev-parse:HEAD) printf '%s\n' "$STUB_MAIN_SHA" ;;
  'rev-parse:HEAD^{tree}') printf '%s\n' "$STUB_MAIN_TREE" ;;
  status:--porcelain=v1) ;;
  *) exit 64 ;;
esac
EOF
chmod 700 "$ROOT/git-stub"

cat >"$ROOT/curl-stub" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *' --resolve '* ]]; then
  exec "$REAL_CURL" "$@"
fi
exit 0
EOF
chmod 700 "$ROOT/curl-stub"

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE" >/dev/null
IMAGE_ID=$(docker image inspect "$IMAGE" --format '{{.Id}}')
if [[ ! "$IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo 'CANDIDATE_TEST_IMAGE_REJECTED reason=invalid-resolved-image-id' >&2
  exit 64
fi
echo "CANDIDATE_TEST_IMAGE digest=$IMAGE_ID"
docker network create --label "$LABEL" "$PRODUCTION_NETWORK" >/dev/null
docker network create --label "$LABEL" "$STAGING_NETWORK" >/dev/null

start_upstream() {
  local name network alias config
  name=$1
  network=$2
  alias=$3
  config=$4
  docker run --detach --name "$name" --label "$LABEL" --network "$network" \
    --network-alias "$alias" --read-only --tmpfs /var/cache/nginx \
    --tmpfs /var/run --mount "type=bind,src=$config,dst=/etc/nginx/nginx.conf,readonly" \
    --entrypoint nginx "$IMAGE" -g 'daemon off;' >/dev/null
}

replace_upstream() {
  local name network alias config
  name=$1
  network=$2
  alias=$3
  config=$4
  docker rm -f "$name" >/dev/null
  start_upstream "$name" "$network" "$alias" "$config"
}

start_upstream "$PROD_WEB" "$PRODUCTION_NETWORK" smk-web "$ROOT/production-web.conf"
start_upstream "$PROD_API" "$PRODUCTION_NETWORK" smk-api "$ROOT/production-api.conf"
start_upstream "$STAGING_WEB" "$STAGING_NETWORK" smk-staging-web "$ROOT/staging-web.conf"
start_upstream "$STAGING_API" "$STAGING_NETWORK" smk-staging-api "$ROOT/staging-api.conf"
docker run --detach --name "$SHARED_CONTAINER" --label "$LABEL" \
  --network "$PRODUCTION_NETWORK" --read-only --tmpfs /var/cache/nginx --tmpfs /var/run \
  --mount "type=bind,src=$ROOT/stable.conf,dst=/etc/nginx/nginx.conf,readonly" \
  --entrypoint nginx "$IMAGE" -g 'daemon off;' >/dev/null
docker network connect "$STAGING_NETWORK" "$SHARED_CONTAINER"

export STUB_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
export STUB_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
export REAL_CURL
export DIIS_DOCKER_BIN=docker
export DIIS_CURL_BIN="$ROOT/curl-stub"
export DIIS_GIT_BIN="$ROOT/git-stub"
export DIIS_PRODUCTION_WORK_DIR="$ROOT/production"
export DIIS_PRODUCTION_NGINX_CONFIG="$ROOT/production/nginx.conf"
export DIIS_PRODUCTION_NGINX_CERTS="$ROOT/certs"
export DIIS_STAGING_NGINX_CONFIG="$ROOT/candidate.conf"
export DIIS_NGINX_CONTAINER="$SHARED_CONTAINER"
export DIIS_PRODUCTION_NETWORK="$PRODUCTION_NETWORK"
export DIIS_STAGING_NETWORK="$STAGING_NETWORK"
export DIIS_INGRESS_HEALTH_URLS='https://health-check-is-stubbed.invalid/'
export DIIS_DEPLOY_RUN_ID="$RUN_ID"
export DIIS_DEPLOY_RUN_ATTEMPT=1
export DIIS_CANDIDATE_MARKER_PRODUCTION_WEB=DIIS_PRODUCTION_WEB
export DIIS_CANDIDATE_MARKER_PRODUCTION_API=DIIS_PRODUCTION_API
export DIIS_CANDIDATE_MARKER_STAGING_WEB=DIIS_STAGING_WEB
export DIIS_CANDIDATE_MARKER_STAGING_API=DIIS_STAGING_API

authority_digest=$(sha256sum "$ROOT/stable.conf")
authority_digest=${authority_digest%% *}
shared_id=$(docker inspect "$SHARED_CONTAINER" --format '{{.Id}}')
shared_digest=$(docker exec "$SHARED_CONTAINER" sha256sum /etc/nginx/nginx.conf)
shared_digest=${shared_digest%% *}

assert_shared_unchanged() {
  local current_digest
  [[ "$(docker inspect "$SHARED_CONTAINER" --format '{{.Id}}')" == "$shared_id" ]]
  current_digest=$(docker exec "$SHARED_CONTAINER" sha256sum /etc/nginx/nginx.conf)
  current_digest=${current_digest%% *}
  [[ "$current_digest" == "$shared_digest" ]]
}

bash "$INGRESS_SCRIPT" preflight-staging "$STUB_MAIN_SHA" "$STUB_MAIN_TREE" \
  "$authority_digest" "$ROOT/stable.conf" >"$ROOT/healthy.out"
grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTING status=pass routes=4' "$ROOT/healthy.out"
[[ -z "$(docker ps -aq --filter "label=diis.run-id=$RUN_ID")" ]]
echo 'REAL_CANDIDATE_ROUTING_HEALTHY_OK'

replace_upstream "$PROD_WEB" "$PRODUCTION_NETWORK" smk-web "$ROOT/staging-web.conf"
replace_upstream "$STAGING_WEB" "$STAGING_NETWORK" smk-staging-web "$ROOT/production-web.conf"
export DIIS_DEPLOY_RUN_ATTEMPT=2
set +e
bash "$INGRESS_SCRIPT" preflight-staging "$STUB_MAIN_SHA" "$STUB_MAIN_TREE" \
  "$authority_digest" "$ROOT/stable.conf" >"$ROOT/cross-environment.out" 2>&1
cross_environment_status=$?
set -e
[[ "$cross_environment_status" -ne 0 ]]
grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTE_IDENTITY_MISMATCH' \
  "$ROOT/cross-environment.out"
[[ -z "$(docker ps -aq --filter "label=diis.run-id=$RUN_ID")" ]]
assert_shared_unchanged
echo 'REAL_CANDIDATE_CROSS_ENV_SWAP_REJECTED_OK'

replace_upstream "$PROD_WEB" "$PRODUCTION_NETWORK" smk-web "$ROOT/production-web-as-api.conf"
replace_upstream "$STAGING_WEB" "$STAGING_NETWORK" smk-staging-web "$ROOT/staging-web.conf"
replace_upstream "$PROD_API" "$PRODUCTION_NETWORK" smk-api "$ROOT/production-api-as-web.conf"
export DIIS_DEPLOY_RUN_ATTEMPT=3
set +e
bash "$INGRESS_SCRIPT" preflight-staging "$STUB_MAIN_SHA" "$STUB_MAIN_TREE" \
  "$authority_digest" "$ROOT/stable.conf" >"$ROOT/web-api.out" 2>&1
web_api_status=$?
set -e
[[ "$web_api_status" -ne 0 ]]
grep -Fq 'SHARED_INGRESS_CANDIDATE_ROUTE_IDENTITY_MISMATCH' "$ROOT/web-api.out"
[[ -z "$(docker ps -aq --filter "label=diis.run-id=$RUN_ID")" ]]
assert_shared_unchanged
echo 'REAL_CANDIDATE_WEB_API_SWAP_REJECTED_OK'

replace_upstream "$PROD_WEB" "$PRODUCTION_NETWORK" smk-web "$ROOT/production-web.conf"
replace_upstream "$PROD_API" "$PRODUCTION_NETWORK" smk-api "$ROOT/production-api.conf"

# Keep the reviewed route contract intact and remove only its runtime target. This
# proves that an unavailable upstream fails during the real candidate probe.
docker rm -f "$STAGING_API" >/dev/null
export DIIS_STAGING_NGINX_CONFIG="$ROOT/candidate.conf"
export DIIS_DEPLOY_RUN_ATTEMPT=4
set +e
bash "$INGRESS_SCRIPT" preflight-staging "$STUB_MAIN_SHA" "$STUB_MAIN_TREE" \
  "$authority_digest" "$ROOT/stable.conf" >"$ROOT/bad.out" 2>&1
bad_status=$?
set -e
[[ "$bad_status" -ne 0 ]]
grep -Fq 'reason=candidate-routing-failed' "$ROOT/bad.out"
[[ -z "$(docker ps -aq --filter "label=diis.run-id=$RUN_ID")" ]]
assert_shared_unchanged
echo 'REAL_CANDIDATE_ROUTING_FAILURE_CLEANUP_OK'

cleanup
trap - EXIT HUP INT TERM
[[ -z "$(docker ps -aq --filter "label=$LABEL")" ]]
! docker network inspect "$PRODUCTION_NETWORK" >/dev/null 2>&1
! docker network inspect "$STAGING_NETWORK" >/dev/null 2>&1
echo 'REAL_CANDIDATE_ROUTING_CLEANUP_ZERO_OK'

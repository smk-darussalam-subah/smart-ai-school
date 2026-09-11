#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
WORKFLOW="$ROOT/infrastructure/n8n/workflows/backup-daily.json"
SMTP_FIXTURE="$ROOT/infrastructure/docker/tests/fixtures/n8n-smtp-sink.js"
N8N_IMAGE='n8nio/n8n@sha256:9f1f8e4c093c9924338bd168e3f813f746041d13b337753af0dbdd329e7b50f7'
MINIO_IMAGE='minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e'
MC_IMAGE='minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727'
MODE=${1:-run}
case "$MODE" in run|--cleanup-probe) ;; *) printf 'unsupported mode\n' >&2; exit 64 ;; esac
PREFIX=${DIIS_TEST_PREFIX:-"diis-n8n-monitor-test-$$"}
[[ $PREFIX =~ ^diis-n8n-monitor-test-[0-9]+(-cleanup-(fault|signal))?$ ]] \
  || { printf 'unsafe disposable prefix\n' >&2; exit 64; }
if [[ -n ${DIIS_TEST_CLEANUP_FAULT:-} && ($MODE != --cleanup-probe || $DIIS_TEST_CLEANUP_FAULT != network-remove) ]]; then
  printf 'unsafe cleanup fault control\n' >&2
  exit 64
fi
if [[ -n ${DIIS_TEST_CLEANUP_SCENARIO:-} && ($MODE != --cleanup-probe || $DIIS_TEST_CLEANUP_SCENARIO != signal) ]]; then
  printf 'unsafe cleanup signal control\n' >&2
  exit 64
fi
NETWORK="$PREFIX-net"
STATE_VOLUME="$PREFIX-state"
SMTP_VOLUME="$PREFIX-smtp"
MINIO="$PREFIX-minio"
SMTP_OK="$PREFIX-smtp-ok"
SMTP_REJECT="$PREFIX-smtp-reject"
TMP=$(mktemp -d)
chmod 0755 "$TMP"
PASSED=0
FINALIZING=0
NETWORK_CREATED=0
STATE_VOLUME_CREATED=0
SMTP_VOLUME_CREATED=0
MINIO_CREATED=0
SMTP_OK_CREATED=0
SMTP_REJECT_CREATED=0

bounded_docker() {
  timeout 20s docker "$@"
}

resource_absent() {
  local kind=$1 name=$2 output
  case "$kind" in
    container) output=$(bounded_docker ps -a --filter "name=^/${name}$" --format '{{.Names}}') || return 2 ;;
    volume) output=$(bounded_docker volume ls --filter "name=^${name}$" --format '{{.Name}}') || return 2 ;;
    network) output=$(bounded_docker network ls --filter "name=^${name}$" --format '{{.Name}}') || return 2 ;;
    *) return 2 ;;
  esac
  ! grep -Fxq "$name" <<<"$output"
}

prefix_resources_absent() {
  local containers networks volumes combined
  containers=$(bounded_docker ps -a --format '{{.Names}}') || return 2
  networks=$(bounded_docker network ls --format '{{.Name}}') || return 2
  volumes=$(bounded_docker volume ls --format '{{.Name}}') || return 2
  combined=$(printf '%s\n%s\n%s\n' "$containers" "$networks" "$volumes")
  ! awk -v prefix="$PREFIX" 'index($0, prefix) == 1 { found=1 } END { exit found ? 0 : 1 }' <<<"$combined"
}

cleanup_resources() {
  local cleanup_rc=0
  if [[ $MINIO_CREATED == 1 ]] && ! bounded_docker rm -f "$MINIO" >/dev/null 2>&1; then cleanup_rc=1; fi
  if [[ $SMTP_OK_CREATED == 1 ]] && ! bounded_docker rm -f "$SMTP_OK" >/dev/null 2>&1; then cleanup_rc=1; fi
  if [[ $SMTP_REJECT_CREATED == 1 ]] && ! bounded_docker rm -f "$SMTP_REJECT" >/dev/null 2>&1; then cleanup_rc=1; fi
  if [[ $STATE_VOLUME_CREATED == 1 ]] && ! bounded_docker volume rm "$STATE_VOLUME" >/dev/null 2>&1; then cleanup_rc=1; fi
  if [[ $SMTP_VOLUME_CREATED == 1 ]] && ! bounded_docker volume rm "$SMTP_VOLUME" >/dev/null 2>&1; then cleanup_rc=1; fi
  if [[ $NETWORK_CREATED == 1 ]]; then
    if [[ ${DIIS_TEST_CLEANUP_FAULT:-} == network-remove ]]; then
      cleanup_rc=1
    elif ! bounded_docker network rm "$NETWORK" >/dev/null 2>&1; then
      cleanup_rc=1
    fi
  fi

  if ! resource_absent container "$MINIO" || ! resource_absent container "$SMTP_OK" \
    || ! resource_absent container "$SMTP_REJECT" || ! resource_absent volume "$STATE_VOLUME" \
    || ! resource_absent volume "$SMTP_VOLUME" || ! resource_absent network "$NETWORK" \
    || ! prefix_resources_absent; then
    cleanup_rc=1
  fi
  case "$TMP" in
    /tmp/tmp.*) rm -rf -- "$TMP" || cleanup_rc=1 ;;
    *) cleanup_rc=1 ;;
  esac
  [[ ! -e "$TMP" ]] || cleanup_rc=1
  return "$cleanup_rc"
}

finalize() {
  local primary_rc=$1 cleanup_rc=0
  [[ $FINALIZING == 0 ]] || exit "$primary_rc"
  FINALIZING=1
  trap - EXIT HUP INT TERM
  cleanup_resources || cleanup_rc=$?
  if [[ $primary_rc == 0 && $cleanup_rc == 0 ]]; then
    if [[ $MODE == run ]]; then
      pass 'disposable cleanup and bounded absence proof'
      printf '1..%d\n' "$PASSED"
    fi
    exit 0
  fi
  if [[ $cleanup_rc != 0 ]]; then
    printf 'not ok %d - disposable cleanup or absence proof failed\n' "$((PASSED + 1))" >&2
    [[ $primary_rc != 0 ]] || primary_rc=74
  fi
  exit "$primary_rc"
}

trap 'finalize $?' EXIT
trap 'finalize 129' HUP
trap 'finalize 130' INT
trap 'finalize 143' TERM

fail() {
  printf 'not ok %d - %s\n' "$((PASSED + 1))" "$1" >&2
  exit 1
}

pass() {
  PASSED=$((PASSED + 1))
  printf 'ok %d - %s\n' "$PASSED" "$1"
}

run_cleanup_probe() {
  bounded_docker network create "$NETWORK" >/dev/null
  NETWORK_CREATED=1
  bounded_docker volume create "$STATE_VOLUME" >/dev/null
  STATE_VOLUME_CREATED=1
  printf 'CLEANUP_PROBE_READY\n'
  if [[ ${DIIS_TEST_CLEANUP_SCENARIO:-} == signal ]]; then
    while :; do sleep 1; done
  fi
  finalize 0
}

run_cleanup_contract() {
  local fault_prefix="${PREFIX}-cleanup-fault" signal_prefix="${PREFIX}-cleanup-signal"
  local fault_out="$TMP/cleanup-fault.out" signal_out="$TMP/cleanup-signal.out"
  local child_pid child_rc

  set +e
  DIIS_TEST_PREFIX="$fault_prefix" DIIS_TEST_CLEANUP_FAULT=network-remove \
    "$0" --cleanup-probe >"$fault_out" 2>&1
  child_rc=$?
  set -e
  [[ $child_rc == 74 ]] || fail 'cleanup-failure control did not fail with status 74'
  ! grep -Eq '^1\.\.[0-9]+$' "$fault_out" || fail 'cleanup-failure control emitted a TAP success plan'
  bounded_docker network rm "${fault_prefix}-net" >/dev/null \
    || fail 'cleanup-failure control residue could not be removed by its owner test'
  resource_absent network "${fault_prefix}-net" \
    || fail 'cleanup-failure control residue absence not proven'

  DIIS_TEST_PREFIX="$signal_prefix" DIIS_TEST_CLEANUP_SCENARIO=signal \
    "$0" --cleanup-probe >"$signal_out" 2>&1 &
  child_pid=$!
  for _ in $(seq 1 20); do
    grep -q '^CLEANUP_PROBE_READY$' "$signal_out" 2>/dev/null && break
    sleep 0.25
  done
  grep -q '^CLEANUP_PROBE_READY$' "$signal_out" \
    || { kill -TERM "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; fail 'signal cleanup control did not become ready'; }
  kill -TERM "$child_pid"
  set +e
  wait "$child_pid"
  child_rc=$?
  set -e
  [[ $child_rc == 143 ]] || fail 'signal cleanup control did not preserve signal status'
  ! grep -Eq '^1\.\.[0-9]+$' "$signal_out" || fail 'signal cleanup control emitted a TAP success plan'
  resource_absent volume "${signal_prefix}-state" && resource_absent network "${signal_prefix}-net" \
    || fail 'signal cleanup control did not prove resource absence'
}

if [[ $MODE == --cleanup-probe ]]; then
  run_cleanup_probe
fi

run_cleanup_contract

run_n8n() {
  docker run --rm --network "$NETWORK" -v "$STATE_VOLUME:/home/node/.n8n" \
    -e N8N_ENCRYPTION_KEY=diis-synthetic-monitor-test-key-not-operational \
    -e N8N_RUNNERS_ENABLED=false -e N8N_LOG_LEVEL=info "$N8N_IMAGE" "$@"
}

mc() {
  docker run --rm --network "$NETWORK" -v "$TMP:/work:ro" \
    -e MC_HOST_local=http://synthetic-access:synthetic-secret@minio:9000 \
    "$MC_IMAGE" "$@"
}

smtp_count() {
  docker exec "$SMTP_OK" sh -c 'test -f /evidence/messages.ndjson && wc -l </evidence/messages.ndjson || printf 0' | tr -d '[:space:]'
}

assert_execution() {
  local file=$1 expected=$2 last_node=$3
  python3 - "$file" "$expected" "$last_node" <<'PY'
import json, sys
raw = open(sys.argv[1], encoding='utf-8').read()
start = raw.find('{')
if start < 0:
    raise SystemExit('execution JSON missing')
value, _ = json.JSONDecoder().raw_decode(raw[start:])
if value.get('status') != sys.argv[2]:
    raise SystemExit(f"status mismatch: {value.get('status')}")
last = value.get('data', {}).get('resultData', {}).get('lastNodeExecuted')
if last != sys.argv[3]:
    raise SystemExit(f'last node mismatch: {last}')
PY
}

assert_no_sensitive_mail() {
  local messages
  messages=$(docker exec "$SMTP_OK" sh -c 'cat /evidence/messages.ndjson 2>/dev/null || true')
  if grep -Eiq 'synthetic-secret|invalid-secret|http://minio|postgres/monitor/latest\.json|AuthorizationParametersError' <<<"$messages"; then
    fail 'SMTP body leaked credential, endpoint, object key, or raw provider error'
  fi
}

bounded_docker network create "$NETWORK" >/dev/null
NETWORK_CREATED=1
bounded_docker volume create "$STATE_VOLUME" >/dev/null
STATE_VOLUME_CREATED=1
bounded_docker volume create "$SMTP_VOLUME" >/dev/null
SMTP_VOLUME_CREATED=1
docker run -d --name "$MINIO" --network "$NETWORK" --network-alias minio \
  -e MINIO_ROOT_USER=synthetic-access -e MINIO_ROOT_PASSWORD=synthetic-secret \
  "$MINIO_IMAGE" server /data >/dev/null
MINIO_CREATED=1
docker run -d --user root --name "$SMTP_OK" --network "$NETWORK" --network-alias smtp-ok \
  -e SMTP_OUTPUT=/evidence/messages.ndjson -v "$SMTP_VOLUME:/evidence" \
  -v "$SMTP_FIXTURE:/fixture/smtp.js:ro" --entrypoint node "$N8N_IMAGE" /fixture/smtp.js >/dev/null
SMTP_OK_CREATED=1
docker run -d --name "$SMTP_REJECT" --network "$NETWORK" --network-alias smtp-reject \
  -e SMTP_REJECT=1 -e SMTP_OUTPUT=/tmp/messages.ndjson -v "$SMTP_FIXTURE:/fixture/smtp.js:ro" \
  --entrypoint node "$N8N_IMAGE" /fixture/smtp.js >/dev/null
SMTP_REJECT_CREATED=1

for _ in $(seq 1 30); do
  if mc ready local >/dev/null 2>&1; then break; fi
  sleep 1
done
mc ready local >/dev/null 2>&1 || fail 'disposable MinIO did not become ready'
mc mb --ignore-existing local/diis-backup >/dev/null

python3 - "$WORKFLOW" "$TMP" <<'PY'
import copy, json, pathlib, sys
source = json.load(open(sys.argv[1], encoding='utf-8'))
out = pathlib.Path(sys.argv[2])
credentials = [
  {'id':'diis-synthetic-s3','name':'MinIO Backup Readonly S3 Credential','type':'s3','data':{
    'endpoint':'http://minio:9000','region':'us-east-1','accessKeyId':'synthetic-access',
    'secretAccessKey':'synthetic-secret','forcePathStyle':True,'ignoreSSLIssues':False}},
  {'id':'diis-synthetic-s3-invalid','name':'Synthetic Invalid S3 Credential','type':'s3','data':{
    'endpoint':'http://minio:9000','region':'us-east-1','accessKeyId':'synthetic-invalid',
    'secretAccessKey':'invalid-secret','forcePathStyle':True,'ignoreSSLIssues':False}},
  {'id':'diis-synthetic-smtp','name':'DIIS School SMTP','type':'smtp','data':{
    'user':'synthetic','password':'synthetic','host':'smtp-ok','port':2525,'secure':False,'disableStartTls':True}},
  {'id':'diis-synthetic-smtp-reject','name':'Synthetic Reject SMTP','type':'smtp','data':{
    'user':'synthetic','password':'synthetic','host':'smtp-reject','port':2525,'secure':False,'disableStartTls':True}},
]
json.dump(credentials, open(out/'credentials.json','w',encoding='utf-8'))

def variant(name, workflow_id, s3_id='diis-synthetic-s3', smtp_id='diis-synthetic-smtp'):
    value = copy.deepcopy(source)
    value['id'] = workflow_id
    value['name'] = name
    trigger = next(node for node in value['nodes'] if node['type'] == 'n8n-nodes-base.scheduleTrigger')
    old_trigger_name = trigger['name']
    trigger['name'] = 'Synthetic test trigger'
    trigger['type'] = 'n8n-nodes-base.manualTrigger'
    trigger['typeVersion'] = 1
    trigger['parameters'] = {}
    value['connections']['Synthetic test trigger'] = value['connections'].pop(old_trigger_name)
    for node in value['nodes']:
        if 's3' in node.get('credentials', {}):
            node['credentials']['s3']['id'] = s3_id
            node['credentials']['s3']['name'] = 'Synthetic Invalid S3 Credential' if s3_id.endswith('invalid') else 'MinIO Backup Readonly S3 Credential'
        if 'smtp' in node.get('credentials', {}):
            node['credentials']['smtp']['id'] = smtp_id
            node['credentials']['smtp']['name'] = 'Synthetic Reject SMTP' if smtp_id.endswith('reject') else 'DIIS School SMTP'
    json.dump(value, open(out/f'{workflow_id}.json','w',encoding='utf-8'))

variant('DIIS monitor test normal', 'diis-monitor-normal')
variant('DIIS monitor test invalid auth', 'diis-monitor-auth-failure', s3_id='diis-synthetic-s3-invalid')
variant('DIIS monitor test SMTP rejection', 'diis-monitor-smtp-rejection', smtp_id='diis-synthetic-smtp-reject')
PY
chmod 0644 "$TMP"/*.json

if ! docker run --rm --network "$NETWORK" -v "$STATE_VOLUME:/home/node/.n8n" -v "$TMP:/work:ro" \
  -e N8N_ENCRYPTION_KEY=diis-synthetic-monitor-test-key-not-operational "$N8N_IMAGE" \
  import:credentials --input=/work/credentials.json >"$TMP/import-credentials.out" 2>&1; then
  sed -E 's/(synthetic-secret|invalid-secret)/<redacted>/g' "$TMP/import-credentials.out" >&2
  fail 'synthetic credential import failed'
fi
for workflow in diis-monitor-normal diis-monitor-auth-failure diis-monitor-smtp-rejection; do
  docker run --rm --network "$NETWORK" -v "$STATE_VOLUME:/home/node/.n8n" -v "$TMP:/work:ro" \
    -e N8N_ENCRYPTION_KEY=diis-synthetic-monitor-test-key-not-operational "$N8N_IMAGE" \
    import:workflow --input="/work/$workflow.json" >/dev/null
done

cat >"$TMP/healthy.json" <<EOF
{"schemaVersion":"diis-backup-telemetry-v1","createdEpoch":$(date +%s),"backupBytes":100,"estimatedDatabaseBytes":200,"growth7Status":"available","growth7Bytes":-20,"growth30Status":"available","growth30Bytes":-50,"targetTotalBytes":1000,"targetFreeBytes":600,"projectedFreePercent":40,"projectedDaysToFull":-1,"offsiteStatus":"complete","restoreStatus":"success","restoreAgeDays":1}
EOF
cp "$TMP/healthy.json" "$TMP/latest.json"
mc cp /work/latest.json local/diis-backup/postgres/monitor/latest.json >/dev/null

if ! run_n8n execute --id=diis-monitor-normal --rawOutput >"$TMP/healthy.out" 2>"$TMP/healthy.err"; then
  sed -E 's/(synthetic-secret|invalid-secret)/<redacted>/g' "$TMP/healthy.err" >&2
  sed -E 's/(synthetic-secret|invalid-secret)/<redacted>/g' "$TMP/healthy.out" >&2
  fail 'healthy execution failed'
fi
assert_execution "$TMP/healthy.out" success 'Alert diperlukan?' || fail 'healthy execution result invalid'
[[ $(smtp_count) == 0 ]] || fail 'healthy execution sent email'
pass 'healthy signed-negative growth telemetry succeeds without SMTP delivery'

cat >"$TMP/alert.json" <<EOF
{"schemaVersion":"diis-backup-telemetry-v1","createdEpoch":$(date +%s),"backupBytes":100,"estimatedDatabaseBytes":100,"growth7Status":"available","growth7Bytes":5,"growth30Status":"available","growth30Bytes":10,"targetTotalBytes":1000,"targetFreeBytes":300,"projectedFreePercent":20,"projectedDaysToFull":900,"offsiteStatus":"complete","restoreStatus":"success","restoreAgeDays":1}
EOF
cp "$TMP/alert.json" "$TMP/latest.json"
mc cp /work/latest.json local/diis-backup/postgres/monitor/latest.json >/dev/null
if ! run_n8n execute --id=diis-monitor-normal --rawOutput >"$TMP/alert.out" 2>"$TMP/alert.err"; then
  sed -E 's/(synthetic-secret|invalid-secret)/<redacted>/g' "$TMP/alert.err" >&2
  sed -E 's/(synthetic-secret|invalid-secret)/<redacted>/g' "$TMP/alert.out" >&2
  fail 'valid alert execution failed'
fi
assert_execution "$TMP/alert.out" success 'Kirim email alert teredaksi' || fail 'valid alert result invalid'
[[ $(smtp_count) == 1 ]] || fail 'valid alert was not delivered exactly once'
pass 'valid capacity alert reaches disposable SMTP exactly once'

mc rm --force local/diis-backup/postgres/monitor/latest.json >/dev/null
before=$(smtp_count)
if run_n8n execute --id=diis-monitor-normal --rawOutput >"$TMP/missing.out" 2>"$TMP/missing.err"; then
  fail 'missing telemetry became successful execution'
fi
assert_execution "$TMP/missing.out" error 'Tandai monitor gagal' || fail 'missing telemetry result invalid'
[[ $(smtp_count) == $((before + 1)) ]] || fail 'missing telemetry alert count invalid'
pass 'missing object alerts once and remains failed explicitly'

printf 'not-json\n' >"$TMP/latest.json"
mc cp /work/latest.json local/diis-backup/postgres/monitor/latest.json >/dev/null
before=$(smtp_count)
if run_n8n execute --id=diis-monitor-normal --rawOutput >"$TMP/malformed.out" 2>"$TMP/malformed.err"; then
  fail 'malformed telemetry became successful execution'
fi
assert_execution "$TMP/malformed.out" error 'Tandai monitor gagal' || fail 'malformed telemetry result invalid'
[[ $(smtp_count) == $((before + 1)) ]] || fail 'malformed telemetry alert count invalid'
pass 'malformed JSON alerts once and remains failed explicitly'

cp "$TMP/healthy.json" "$TMP/latest.json"
mc cp /work/latest.json local/diis-backup/postgres/monitor/latest.json >/dev/null
before=$(smtp_count)
if run_n8n execute --id=diis-monitor-auth-failure --rawOutput >"$TMP/auth.out" 2>"$TMP/auth.err"; then
  fail 'S3 auth failure became successful execution'
fi
assert_execution "$TMP/auth.out" error 'Tandai monitor gagal' || fail 'S3 auth failure result invalid'
[[ $(smtp_count) == $((before + 1)) ]] || fail 'S3 auth failure alert count invalid'
pass 'S3 authentication failure alerts once and remains failed explicitly'

cp "$TMP/alert.json" "$TMP/latest.json"
mc cp /work/latest.json local/diis-backup/postgres/monitor/latest.json >/dev/null
if run_n8n execute --id=diis-monitor-smtp-rejection --rawOutput >"$TMP/smtp-reject.out" 2>"$TMP/smtp-reject.err"; then
  fail 'SMTP rejection became successful execution'
fi
assert_execution "$TMP/smtp-reject.out" error 'Kirim email alert teredaksi' || fail 'SMTP rejection result invalid'
pass 'SMTP rejection remains an explicit failed execution'

assert_no_sensitive_mail
pass 'failure notifications remain redacted'

finalize 0

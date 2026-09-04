#!/usr/bin/env bash

set -Eeuo pipefail
export PYTHONDONTWRITEBYTECODE=1

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
CLEANUP="$ROOT/infrastructure/deploy/diis-build-cache-cleanup.sh"
HANDOFF="$ROOT/infrastructure/deploy/w10d-backup-scheduler-handoff.sh"
CANDIDATE_CREATE="$ROOT/infrastructure/deploy/create-w10d-backup-candidate.sh"
HOST_LOCK_WRAPPER="$ROOT/infrastructure/deploy/run-with-diis-host-lock.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
CANDIDATE_COMPOSE="$ROOT/infrastructure/docker/docker-compose.backup-candidate.yml"
CRON_SUMMARY="$ROOT/scripts/root-cron-summary.py"
TOOL_CAPTURE="$ROOT/scripts/capture-w10d-candidate-tool-evidence.sh"
TMP=$(mktemp -d)
PASSED=0
cleanup() {
  if [ "${KEEP_TEST_TMP:-0}" = 1 ]; then
    printf 'preserved test temp: %s\n' "$TMP" >&2
  else
    rm -rf "$TMP"
  fi
}
trap cleanup EXIT HUP INT TERM
pass() { PASSED=$((PASSED + 1)); printf 'ok %d - %s\n' "$PASSED" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
assert_grep() { grep -Eq -- "$1" "$2" || fail "$3"; }

bash -n "$CLEANUP" "$HANDOFF" "$CANDIDATE_CREATE" "$HOST_LOCK_WRAPPER" "$TOOL_CAPTURE" \
  "$ROOT/scripts/production-recovery-readonly-summary.sh"
PYTHONPYCACHEPREFIX="$TMP/pycache" python3 -m py_compile "$CRON_SUMMARY" "$ROOT/scripts/docker-no-touch-digest.py" \
  "$ROOT/scripts/docker-container-redacted-manifest.py" \
  "$ROOT/scripts/validate-w10d-candidate-acceptance.py"
pass 'operator scripts parse successfully'

tool_capture_bin="$TMP/tool-capture-bin"
mkdir -p "$tool_capture_bin" "$TMP/tool-capture-evidence"
cat >"$tool_capture_bin/docker" <<'SH'
#!/bin/sh
set -eu
case "$1 $2" in
  'container inspect') echo diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 ;;
  'exec smk-pg-backup-candidate')
    shift 2
    case "$*" in
      *'sha256sum /opt/backup-bin/mc'*)
        printf '%s  %s\n' \
          01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891 /opt/backup-bin/mc \
          7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad /opt/backup-bin/rclone.zip \
          "${TOOL_CAPTURE_EXEC_SHA:-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}" /opt/backup-bin/rclone
        ;;
      *'unzip -p /opt/backup-bin/rclone.zip'*)
        echo "${TOOL_CAPTURE_ARCHIVE_SHA:-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}"
        ;;
      '/opt/backup-bin/mc --version') echo 'mc version RELEASE.2025-08-13T08-35-41Z (commit-id=test)' ;;
      '/opt/backup-bin/rclone version') echo 'rclone v1.70.3' ;;
      *) exit 91 ;;
    esac
    ;;
  *) exit 92 ;;
esac
SH
chmod +x "$tool_capture_bin/docker"
tool_capture_output="$TMP/tool-capture-evidence/tool.json"
PATH="$tool_capture_bin:$PATH" sh "$TOOL_CAPTURE" smk-pg-backup-candidate \
  diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 "$tool_capture_output" >/dev/null \
  || fail 'matching pinned archive entry and executable were rejected'
python3 - "$tool_capture_output" <<'PY' || fail 'tool evidence did not bind archive entry provenance'
import json, sys
value=json.load(open(sys.argv[1],encoding='utf-8'))
assert value['schemaVersion']=='diis-backup-tool-evidence-v3'
assert value['rcloneArchiveEntry']=='rclone-v1.70.3-linux-amd64/rclone'
assert value['rcloneArchiveEntrySha256']==value['rcloneSha256']
PY
drift_output="$TMP/tool-capture-evidence/drift.json"
if PATH="$tool_capture_bin:$PATH" TOOL_CAPTURE_EXEC_SHA=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd \
  sh "$TOOL_CAPTURE" smk-pg-backup-candidate \
    diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 "$drift_output" \
    >"$TMP/tool-capture-evidence/drift.out" 2>"$TMP/tool-capture-evidence/drift.err"; then
  fail 'different rclone executable claiming the pinned version was accepted'
fi
[ ! -e "$drift_output" ] || fail 'rejected rclone executable published tool evidence'
assert_grep 'executable does not match pinned archive entry' "$TMP/tool-capture-evidence/drift.err" \
  'archive/executable mismatch rejection missing'
pass 'tool evidence proves rclone executable bytes come from the pinned archive entry'

python3 - "$CRON_SUMMARY" <<'PY' || fail 'root cron semantic classifier failed'
import hashlib
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("root_cron_summary", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
lines = module.active_lines("# comment\n17 1 * * * /usr/local/bin/nightly\n")
digest = hashlib.sha256("\n".join(lines).encode()).hexdigest()
assert len(lines) == 1
assert module.classify(lines, digest, "", "ambiguous")[0] == "ambiguous"
assert module.classify(lines, digest, digest, "ambiguous")[0] == "ambiguous"
assert module.classify(lines, digest, digest, "no-writer")[0] == "clear-attested"
assert module.classify([], hashlib.sha256(b"").hexdigest(), "", "ambiguous")[0] == "clear"
variants = [
    module.active_lines("1 * * * * first\n2 * * * * second\n"),
    module.active_lines("2 * * * * second\n1 * * * * first\n"),
    module.active_lines("1 * * * * first\n2  * * * * second\n"),
]
digests = {hashlib.sha256("\n".join(value).encode()).hexdigest() for value in variants}
assert len(digests) == 3
PY
pass 'root cron attestation preserves order and significant whitespace without false-clear'

accept_repo="$TMP/accept-repo"
mkdir -p "$accept_repo/infrastructure/docker/scripts" "$accept_repo/scripts" "$TMP/accept-evidence"
for relative in infrastructure/docker/docker-compose.yml \
  infrastructure/docker/docker-compose.backup-candidate.yml \
  infrastructure/docker/scripts/backup.sh infrastructure/docker/scripts/backup-lib.sh \
  infrastructure/docker/scripts/offsite-replication.sh infrastructure/docker/scripts/restore-objects.sh \
  scripts/restore-drill.sh scripts/capture-w10d-candidate-tool-evidence.sh \
  scripts/docker-container-redacted-manifest.py; do
  mkdir -p "$accept_repo/$(dirname "$relative")"
  cp "$ROOT/$relative" "$accept_repo/$relative"
done
git -C "$accept_repo" init -q
git -C "$accept_repo" config user.email test@example.invalid
git -C "$accept_repo" config user.name 'Contract Test'
git -C "$accept_repo" add .
git -C "$accept_repo" commit -qm fixture
accept_sha=$(git -C "$accept_repo" rev-parse HEAD)
accept_tree=$(git -C "$accept_repo" rev-parse 'HEAD^{tree}')
acceptance="$TMP/accept-evidence/candidate-acceptance.json"
python3 - "$accept_repo" "$TMP/accept-evidence" "$acceptance" "$accept_sha" "$accept_tree" <<'PY'
import hashlib, json, pathlib, sys
repo, evidence, bundle_path, sha, tree = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3]), sys.argv[4], sys.argv[5]
h=lambda p: hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
finger='5'*64; dump='6'*64; objects='7'*64; prov_sha=''
toolvol='diis-backup-bin-w10d-20260903t120000z-a1b2c3d4'; container_id='d'*64
attempt='w10d-20260903t120000z-a1b2c3d4'
runtime={'schemaVersion':'diis-container-rollback-redacted-v2','containerId':container_id,'name':'/smk-pg-backup-candidate','imageReference':'postgres:16@sha256:'+'8'*64,'imageId':'sha256:'+'9'*64,
 'entrypoint':['docker-entrypoint.sh'],'command':['sh','-c','reviewed-command'],'workingDir':'','user':'','restartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0},'networkMode':'smk-network','networkNames':['smk-network'],
 'mounts':[{'Destination':'/opt/backup-bin','Name':toolvol,'RW':True},{'Destination':'/var/lib/diis-minio-target','Name':'docker_minio_data','RW':False},{'Destination':'/var/lock/diis-backup','Source':'/var/lock/diis-backup','RW':True},{'Destination':'/run/diis-secrets/rclone.conf','RW':False}],
 'environmentNames':['BACKUP_LOCK_DIR','BACKUP_BUCKET_CREATION_ALLOWED','BACKUP_SCHEDULE_ENABLED','OFFSITE_CONFIG_FINGERPRINT','OFFSITE_EXPECTED_ROOT_FOLDER_SHA256','OFFSITE_EXPECTED_TEAM_DRIVE_SHA256','OFFSITE_RETENTION_APPLY'],'environmentValuesSha256':'e'*64,
 'identityLabels':{'com.diis.w10d.attempt':attempt,'com.diis.w10d.role':'backup-candidate'},'labelsSha256':'f'*64}
root={'schemaVersion':'diis-root-cron-summary-v2','status':'none','activeCount':0,'canonicalSha256':hashlib.sha256(b'').hexdigest(),'digestSemantics':'ordered-active-records-exact-whitespace-v1','semanticClassification':'clear','operatorAttestationBound':False}
backup_id='20260903T000000Z-7000'
manual={'schemaVersion':'diis-backup-v1','status':'complete','offsiteStatus':'complete','backupId':backup_id,'offsiteConfigFingerprint':finger,'sha256':dump,'bytes':2048,'objectManifestSha256':objects,'objectCount':1}
provenance={'schemaVersion':'diis-offsite-restore-input-v1','source':'independent-crypt','backupId':backup_id,'offsiteConfigFingerprint':finger,'dumpSha256':dump,'dumpBytes':2048,'objectManifestSha256':objects,'objectCount':1,'dumpFile':backup_id+'.dump','sidecarFile':backup_id+'.sha256','completionFile':backup_id+'.complete.json','objectManifestFile':backup_id+'.objects.tsv'}
files={'runtime.json':runtime,'root.json':root,'manual.json':manual,'provenance.json':provenance}
for name,value in files.items(): (evidence/name).write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
prov_sha=h(evidence/'provenance.json')
db={'schemaVersion':'diis-restore-proof-v2','status':'success','backupId':backup_id,'source':'independent-crypt','sourceProvenanceSha256':prov_sha,'dumpSha256':dump,'objectManifestSha256':objects}
obj={'schemaVersion':'diis-object-restore-proof-v1','status':'success','backupId':backup_id,'source':'independent-crypt','sourceProvenanceSha256':prov_sha,'objectManifestSha256':objects,'objectCount':1}
tool={'schemaVersion':'diis-backup-tool-evidence-v3','toolVolume':toolvol,'mcSha256':'01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891','rcloneZipSha256':'7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad','rcloneArchiveEntry':'rclone-v1.70.3-linux-amd64/rclone','rcloneArchiveEntrySha256':'c'*64,'rcloneSha256':'c'*64,'mcVersion':'RELEASE.2025-08-13T08-35-41Z','rcloneVersion':'v1.70.3'}
for name,value in {'db.json':db,'object.json':obj,'tool.json':tool}.items(): (evidence/name).write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
contract={key:runtime[key] for key in ('entrypoint','command','workingDir','user','restartPolicy','networkMode','networkNames','mounts','environmentNames','environmentValuesSha256','identityLabels','labelsSha256')}
bundle={'schemaVersion':'diis-w10d-backup-candidate-acceptance-v2','status':'accepted','mainSha':sha,'mainTree':tree,'candidateContainer':'smk-pg-backup-candidate','candidateContainerId':container_id,'candidateAttemptId':attempt,'offsiteSource':'independent-crypt','localMinioFallback':False,'retentionApply':False,'manualBackupStatus':'complete','dbRestoreStatus':'success','objectRestoreStatus':'success','candidateImageReference':runtime['imageReference'],'candidateImageId':runtime['imageId'],'candidateToolVolume':toolvol,'minioSourceVolume':'docker_minio_data','backupLockHostPath':'/var/lock/diis-backup','rcloneConfigFingerprint':finger,'candidateRuntimeContract':contract,'candidateRuntimeContractSha256':hashlib.sha256(json.dumps(contract,sort_keys=True,separators=(',',':')).encode()).hexdigest()}
for key,name in {'candidateRuntimeManifestSha256':'runtime.json','rootCronEvidenceSha256':'root.json','manualBackupManifestSha256':'manual.json','offsiteRetrievalProvenanceSha256':'provenance.json','dbRestoreProofSha256':'db.json','objectRestoreProofSha256':'object.json','toolEvidenceSha256':'tool.json'}.items(): bundle[key]=h(evidence/name)
for key,name in {'backupScriptSha256':'infrastructure/docker/scripts/backup.sh','backupLibrarySha256':'infrastructure/docker/scripts/backup-lib.sh','offsiteScriptSha256':'infrastructure/docker/scripts/offsite-replication.sh','objectRestoreScriptSha256':'infrastructure/docker/scripts/restore-objects.sh','databaseRestoreScriptSha256':'scripts/restore-drill.sh','baseComposeSha256':'infrastructure/docker/docker-compose.yml','candidateComposeSha256':'infrastructure/docker/docker-compose.backup-candidate.yml','toolCaptureScriptSha256':'scripts/capture-w10d-candidate-tool-evidence.sh','runtimeManifestScriptSha256':'scripts/docker-container-redacted-manifest.py'}.items(): bundle[key]=h(repo/name)
bundle_path.write_text(json.dumps(bundle,separators=(',',':'))+'\n',encoding='utf-8')
PY
chmod 600 "$TMP/accept-evidence"/*.json
accept_args=("$acceptance" "$accept_sha" "$accept_tree" smk-pg-backup-candidate "$accept_repo" \
  "$TMP/accept-evidence/runtime.json" "$TMP/accept-evidence/root.json" \
  "$TMP/accept-evidence/manual.json" "$TMP/accept-evidence/provenance.json" \
  "$TMP/accept-evidence/db.json" "$TMP/accept-evidence/object.json" "$TMP/accept-evidence/tool.json")
python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" "${accept_args[@]}" \
  || fail 'valid checkout-bound candidate acceptance was rejected'
sed 's/"localMinioFallback":false/"localMinioFallback":true/' "$acceptance" >"$TMP/local-fallback.json"
chmod 600 "$TMP/local-fallback.json"
if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" "$TMP/local-fallback.json" \
  "${accept_args[@]:1}"; then
  fail 'local MinIO fallback was accepted as independent restore proof'
fi
cp "$TMP/accept-evidence/db.json" "$TMP/accept-evidence/db.valid.json"
printf '\n' >>"$TMP/accept-evidence/db.json"
if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" "${accept_args[@]}"; then
  fail 'tampered runtime evidence was accepted through a stale bundle hash'
fi
mv "$TMP/accept-evidence/db.valid.json" "$TMP/accept-evidence/db.json"
git -C "$accept_repo" status --porcelain >/dev/null
python3 - "$acceptance" "$TMP/accept-evidence" <<'PY'
import hashlib, json, pathlib, sys
bundle_path, evidence = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
base_bundle=json.load(open(bundle_path,encoding='utf-8'))
base_runtime=json.load(open(evidence/'runtime.json',encoding='utf-8'))
base_tool=json.load(open(evidence/'tool.json',encoding='utf-8'))
def write_case(name, runtime=None, tool=None):
    case=evidence/name; case.mkdir()
    bundle=dict(base_bundle)
    if runtime is not None:
        path=case/'runtime.json'; path.write_text(json.dumps(runtime,separators=(',',':'))+'\n')
        bundle['candidateRuntimeManifestSha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    else: path=evidence/'runtime.json'
    if tool is not None:
        tool_path=case/'tool.json'; tool_path.write_text(json.dumps(tool,separators=(',',':'))+'\n')
        bundle['toolEvidenceSha256']=hashlib.sha256(tool_path.read_bytes()).hexdigest()
    else: tool_path=evidence/'tool.json'
    bundle_out=case/'bundle.json'; bundle_out.write_text(json.dumps(bundle,separators=(',',':'))+'\n')
    return
runtime=dict(base_runtime); runtime['command']=['sh','-c','drifted-command']; write_case('changed-command',runtime=runtime)
runtime=dict(base_runtime); runtime['mounts']=list(runtime['mounts'])+[{'Destination':'/unexpected','Source':'/host','RW':True}]; write_case('extra-mount',runtime=runtime)
runtime=dict(base_runtime); runtime['environmentValuesSha256']='1'*64; write_case('changed-env',runtime=runtime)
runtime=dict(base_runtime); runtime['identityLabels']=dict(runtime['identityLabels']); runtime['identityLabels']['com.diis.w10d.attempt']='w10d-20260903t120000z-deadbeef'; write_case('changed-label',runtime=runtime)
tool=dict(base_tool); tool['mcSha256']='2'*64; write_case('changed-tool',tool=tool)
tool=dict(base_tool); tool['rcloneVersion']='v9.99.9'; write_case('changed-version',tool=tool)
tool=dict(base_tool); tool['rcloneSha256']='3'*64; write_case('changed-executable-provenance',tool=tool)
PY
for case in changed-command extra-mount changed-env changed-label; do
  chmod 600 "$TMP/accept-evidence/$case"/*.json
  if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
    "$TMP/accept-evidence/$case/bundle.json" "${accept_args[1]}" "${accept_args[2]}" \
    "${accept_args[3]}" "${accept_args[4]}" "$TMP/accept-evidence/$case/runtime.json" \
    "${accept_args[@]:6:5}" "$TMP/accept-evidence/tool.json"; then
    fail "runtime drift case $case was accepted"
  fi
done
for case in changed-tool changed-version changed-executable-provenance; do
  chmod 600 "$TMP/accept-evidence/$case"/*.json
  if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
    "$TMP/accept-evidence/$case/bundle.json" "${accept_args[@]:1:5}" \
    "${accept_args[@]:6:5}" "$TMP/accept-evidence/$case/tool.json"; then
    fail "$case drift was accepted"
  fi
done
pass 'candidate acceptance binds runtime and pinned archive provenance and rejects all modeled drift'

compose_cli=(docker)
compose_base=$COMPOSE
compose_candidate=$CANDIDATE_COMPOSE
if ! docker compose version >/dev/null 2>&1; then
  command -v docker.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1 \
    || fail 'Docker Compose CLI unavailable for config render'
  compose_cli=(docker.exe)
  compose_base=$(wslpath -w "$COMPOSE")
  compose_candidate=$(wslpath -w "$CANDIDATE_COMPOSE")
  export WSLENV="${WSLENV:+$WSLENV:}CANDIDATE_BACKUP_BIN_VOLUME_NAME:CANDIDATE_MINIO_DATA_VOLUME_NAME:W10D_ATTEMPT_ID"
fi

if env -u CANDIDATE_BACKUP_BIN_VOLUME_NAME -u CANDIDATE_MINIO_DATA_VOLUME_NAME \
  -u W10D_ATTEMPT_ID "${compose_cli[@]}" compose -f "$compose_base" -f "$compose_candidate" \
  config --quiet >"$TMP/compose-unbound.out" 2>"$TMP/compose-unbound.err"; then
  fail 'candidate compose rendered without explicit volume bindings'
fi
assert_grep 'required variable.*is missing a value' "$TMP/compose-unbound.err" \
  'candidate compose did not fail on a missing required binding'
env CANDIDATE_BACKUP_BIN_VOLUME_NAME=diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 \
  CANDIDATE_MINIO_DATA_VOLUME_NAME=docker_minio_data \
  W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 \
  "${compose_cli[@]}" compose -f "$compose_base" -f "$compose_candidate" \
  config >"$TMP/candidate-compose.yml" 2>/dev/null \
  || fail 'candidate compose rejected explicit isolated bindings'
assert_grep 'name: diis-backup-bin-w10d-20260903t120000z-a1b2c3d4' "$TMP/candidate-compose.yml" \
  'candidate compose did not render exact isolated tool volume'
if grep -Eq 'source: docker_backup_bin' "$TMP/candidate-compose.yml"; then
  fail 'candidate compose retained legacy tool volume after explicit binding'
fi
pass 'candidate compose fails closed without exact volume bindings and cannot fall back to legacy tools'

launcher_repo="$TMP/launcher-repo"
launcher_bin="$TMP/launcher-bin"
launcher_state="$TMP/launcher-state"
mkdir -p "$launcher_repo/infrastructure/docker/scripts" "$launcher_bin" "$launcher_state"
cp "$COMPOSE" "$launcher_repo/infrastructure/docker/docker-compose.yml"
cp "$CANDIDATE_COMPOSE" "$launcher_repo/infrastructure/docker/docker-compose.backup-candidate.yml"
cp "$ROOT/infrastructure/docker/scripts/backup-lib.sh" "$launcher_repo/infrastructure/docker/scripts/"
cat >"$launcher_bin/git" <<'SH'
#!/bin/sh
case "$*" in
  'rev-parse HEAD') echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  'rev-parse HEAD^{tree}') echo bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
  'status --porcelain --untracked-files=normal') : ;;
  *) exit 90 ;;
esac
SH
cat >"$launcher_bin/docker" <<'SH'
#!/bin/sh
set -eu
state=${LAUNCHER_STATE:?}
printf '%s\n' "$*" >>"$state/docker.log"
case "$1 $2" in
  'container inspect')
    [ -f "$state/candidate-created" ] || exit 1
    if [ "${3:-}" = --format ]; then format=$4; else format=; fi
    case "$format" in
      *Config.Image*) echo 'postgres:16.4-alpine3.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c' ;;
      *com.diis.w10d.attempt*) echo w10d-20260903t120000z-a1b2c3d4 ;;
      *'/opt/backup-bin'*) echo diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 ;;
      *'/var/lib/diis-minio-target'*) echo docker_minio_data ;;
      *Config.Env*) printf '%s\n' BACKUP_SCHEDULE_ENABLED=0 BACKUP_BUCKET_CREATION_ALLOWED=0 OFFSITE_RETENTION_APPLY=0 ;;
      *) echo '[{}]' ;;
    esac
    ;;
  'container ls')
    [ "${LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL:-0}" != 1 ] || exit 69
    if [ "${LAUNCHER_CONTAINER_OBSERVE_FAIL:-0}" = 1 ] && [ -f "$state/candidate-was-created" ]; then exit 70; fi
    if [ -f "$state/candidate-created" ]; then echo smk-pg-backup-candidate; fi
    ;;
  'rm --force')
    [ "${LAUNCHER_CONTAINER_RM_FAIL:-0}" != 1 ] || exit 71
    rm -f "$state/candidate-created"
    ;;
  'volume inspect')
    case "$3" in
      docker_backup_bin|docker_minio_data) echo '[{}]' ;;
      diis-backup-bin-w10d-20260903t120000z-a1b2c3d4)
        [ -f "$state/volume-created" ] && echo '[{}]' || exit 1
        ;;
      *) exit 2 ;;
    esac
    ;;
  'volume ls')
    [ "${LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL:-0}" != 1 ] || exit 71
    if [ "${LAUNCHER_VOLUME_OBSERVE_FAIL:-0}" = 1 ] && [ -f "$state/volume-was-created" ]; then exit 72; fi
    if [ -f "$state/volume-created" ]; then echo diis-backup-bin-w10d-20260903t120000z-a1b2c3d4; fi
    ;;
  'volume rm')
    [ "${LAUNCHER_VOLUME_RM_FAIL:-0}" != 1 ] || exit 73
    rm -f "$state/volume-created"
    ;;
  'compose --project-name')
    [ "$3" = diis-w10d-20260903t120000z-a1b2c3d4 ] || exit 3
    [ "$CANDIDATE_BACKUP_BIN_VOLUME_NAME" = diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 ] || exit 4
    [ "$CANDIDATE_MINIO_DATA_VOLUME_NAME" = docker_minio_data ] || exit 5
    case "$*" in
      *' up '*)
        touch "$state/candidate-created" "$state/volume-created" \
          "$state/candidate-was-created" "$state/volume-was-created"
        if [ -n "${LAUNCHER_SIGNAL:-}" ]; then kill -s "$LAUNCHER_SIGNAL" "$PPID"; sleep 0.1; fi
        [ "${LAUNCHER_PRIMARY_FAIL:-0}" != 1 ] || exit 74
        ;;
    esac
    ;;
  *) exit 6 ;;
esac
SH
chmod +x "$launcher_bin"/*
printf 'POSTGRES_PASSWORD=test-only-placeholder\n' >"$launcher_state/env"
chmod 600 "$launcher_state/env"
env PATH="$launcher_bin:$PATH" LAUNCHER_STATE="$launcher_state" REPO_DIR="$launcher_repo" \
  HOST_LOCK="$launcher_state/deploy.lock" BACKUP_WRITER_LOCK="$launcher_state/writer/backup.lock" \
  EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 EXPECTED_MINIO_VOLUME=docker_minio_data \
  ENV_FILE="$launcher_state/env" CANDIDATE_CONFIRMATION=CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE \
  bash "$CANDIDATE_CREATE" >"$launcher_state/out" 2>"$launcher_state/err" \
  || { cat "$launcher_state/err" >&2; fail 'candidate launcher success path failed'; }
assert_grep 'CANDIDATE_READY.*toolVolume=diis-backup-bin-w10d' "$launcher_state/out" \
  'candidate launcher readiness proof missing'
if grep -Eq 'volume rm docker_backup_bin|rename .*docker_backup_bin|rm --force smk-pg-backup($| )' \
  "$launcher_state/docker.log"; then
  fail 'candidate launcher mutated legacy container or tool volume'
fi
assert_grep 'compose --project-name diis-w10d-20260903t120000z-a1b2c3d4' "$launcher_state/docker.log" \
  'candidate launcher did not use attempt-specific Compose project'
pass 'candidate launcher creates only an attempt-scoped candidate and leaves legacy tools untouched'

run_launcher_failure() {
  local state=$1
  mkdir -p "$state"
  printf 'POSTGRES_PASSWORD=test-only-placeholder\n' >"$state/env"
  chmod 600 "$state/env"
  env PATH="$launcher_bin:$PATH" LAUNCHER_STATE="$state" REPO_DIR="$launcher_repo" \
    HOST_LOCK="$state/deploy.lock" BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 EXPECTED_MINIO_VOLUME=docker_minio_data \
    ENV_FILE="$state/env" CANDIDATE_CONFIRMATION=CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE \
    LAUNCHER_PRIMARY_FAIL="${LAUNCHER_PRIMARY_FAIL:-0}" \
    LAUNCHER_CONTAINER_RM_FAIL="${LAUNCHER_CONTAINER_RM_FAIL:-0}" \
    LAUNCHER_VOLUME_RM_FAIL="${LAUNCHER_VOLUME_RM_FAIL:-0}" \
    LAUNCHER_CONTAINER_OBSERVE_FAIL="${LAUNCHER_CONTAINER_OBSERVE_FAIL:-0}" \
    LAUNCHER_VOLUME_OBSERVE_FAIL="${LAUNCHER_VOLUME_OBSERVE_FAIL:-0}" \
    LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL="${LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL:-0}" \
    LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL="${LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL:-0}" \
    LAUNCHER_SIGNAL="${LAUNCHER_SIGNAL:-}" bash "$CANDIDATE_CREATE" \
    >"$state/out" 2>"$state/err"
}
state="$TMP/launcher-primary-fail"
if LAUNCHER_PRIMARY_FAIL=1 run_launcher_failure "$state"; then fail 'partial launcher unexpectedly succeeded'; fi
[ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
  || fail 'partial launcher cleanup did not prove exact absence'
if grep -q CANDIDATE_CLEANUP_AMBIGUOUS "$state/err"; then fail 'successful cleanup reported ambiguous'; fi
for case_name in container-rm volume-rm container-observe volume-observe; do
  state="$TMP/launcher-$case_name"
  case "$case_name" in
    container-rm) LAUNCHER_PRIMARY_FAIL=1 LAUNCHER_CONTAINER_RM_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$? ;;
    volume-rm) LAUNCHER_PRIMARY_FAIL=1 LAUNCHER_VOLUME_RM_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$? ;;
    container-observe) LAUNCHER_PRIMARY_FAIL=1 LAUNCHER_CONTAINER_OBSERVE_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$? ;;
    volume-observe) LAUNCHER_PRIMARY_FAIL=1 LAUNCHER_VOLUME_OBSERVE_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$? ;;
  esac
  [ "$rc" -eq 78 ] || fail "$case_name cleanup did not return ambiguous status 78"
  assert_grep 'CANDIDATE_CLEANUP_AMBIGUOUS.*retry=prohibited' "$state/err" \
    "$case_name cleanup ambiguity marker missing"
done
for resource in container volume; do
  state="$TMP/launcher-precreate-$resource"
  mkdir -p "$state"
  if [ "$resource" = container ]; then
    touch "$state/candidate-created"
    LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$?
  else
    touch "$state/volume-created"
    LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL=1 run_launcher_failure "$state" && rc=0 || rc=$?
  fi
  [ "$rc" -eq 78 ] || fail "$resource pre-create observation failure did not return status 78"
  assert_grep "CANDIDATE_PRECREATE_OBSERVATION_AMBIGUOUS resource=$resource retry=prohibited" \
    "$state/err" "$resource pre-create ambiguity marker missing"
  ! grep -q 'compose --project-name' "$state/docker.log" \
    || fail "$resource pre-create ambiguity reached Compose mutation"
  if [ "$resource" = container ]; then
    [ -e "$state/candidate-created" ] || fail 'ambiguous pre-create mutated existing candidate'
  else
    [ -e "$state/volume-created" ] || fail 'ambiguous pre-create mutated existing tool volume'
  fi
done
pass 'candidate pre-create distinguishes exact absence from observation failure without mutation'
for signal_name in HUP INT TERM; do
  state="$TMP/launcher-signal-$signal_name"
  if LAUNCHER_SIGNAL="$signal_name" run_launcher_failure "$state"; then
    fail "$signal_name candidate launcher unexpectedly succeeded"
  fi
  [ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
    || fail "$signal_name candidate launcher left residual resources"
done
pass 'candidate creator proves absence or returns explicit ambiguous no-retry on cleanup and signals'

assert_grep 'BACKUP_SCHEDULE_ENABLED: "0"' "$CANDIDATE_COMPOSE" \
  'candidate scheduler must default disabled'
assert_grep 'BACKUP_BUCKET_CREATION_ALLOWED: "0"' "$CANDIDATE_COMPOSE" \
  'candidate bucket creation must default disabled'
assert_grep 'BACKUP_LOCK_DIR: /var/lock/diis-backup/backup.lock' "$COMPOSE" \
  'shared writer lock mount is missing'
assert_grep 'BACKUP_BIN_VOLUME_NAME' "$COMPOSE" 'candidate tool volume override is missing'
assert_grep 'MINIO_DATA_VOLUME_NAME' "$COMPOSE" 'exact production MinIO volume binding is missing'
assert_grep "'OFFSITE_RETENTION_APPLY=0'" "$HANDOFF" 'candidate retention dry-run check is missing'
assert_grep 'trap rollback EXIT' "$HANDOFF" 'state-aware rollback trap missing'
assert_grep 'docker rename.*LEGACY_HOLD_NAME' "$HANDOFF" 'legacy container is not retained for rollback'
assert_grep 'docker-container-redacted-manifest.py' "$HANDOFF" 'secret-free rollback manifest is missing'
if grep -Eq 'docker container inspect.*>.*rollback|docker inspect.*>.*rollback' "$HANDOFF"; then
  fail 'raw Docker inspect could expose environment values in rollback evidence'
fi
assert_grep 'validate-w10d-candidate-acceptance.py' "$HANDOFF" \
  'candidate acceptance validator is not handoff-bound'
assert_grep 'retry=prohibited' "$HANDOFF" 'ambiguous handoff retry policy missing'
pass 'candidate cutover source encodes isolated tools one authority and retained legacy rollback'

handoff_repo="$TMP/handoff-repo"
handoff_bin="$TMP/handoff-bin"
mkdir -p "$handoff_repo/infrastructure/docker/scripts" "$handoff_repo/scripts" "$handoff_bin"
cp "$ROOT/infrastructure/docker/scripts/backup-lib.sh" "$handoff_repo/infrastructure/docker/scripts/"
cp "$TOOL_CAPTURE" "$handoff_repo/scripts/capture-w10d-candidate-tool-evidence.sh"
cat >"$handoff_repo/scripts/docker-container-redacted-manifest.py" <<'PY'
import json
print(json.dumps({'schemaVersion':'test-redacted'}))
PY
cat >"$handoff_repo/scripts/validate-w10d-candidate-acceptance.py" <<'PY'
raise SystemExit(0)
PY
cat >"$handoff_bin/git" <<'SH'
#!/bin/sh
case "$*" in
  'rev-parse HEAD') echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  'rev-parse HEAD^{tree}') echo bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
  'status --porcelain --untracked-files=normal') : ;;
  *) exit 90 ;;
esac
SH
cat >"$handoff_bin/pgrep" <<'SH'
#!/bin/sh
exit 1
SH
cat >"$handoff_bin/docker" <<'SH'
#!/bin/sh
set -eu
state=${HANDOFF_STATE:?}
printf '%s\n' "$*" >>"$state/docker.log"
mutate() {
  [ ! -f "$state/failed-once" ] || return 0
  count=$(cat "$state/count"); count=$((count + 1)); echo "$count" >"$state/count"
  if [ "$count" = "${HANDOFF_HOLD_AT:-0}" ]; then
    touch "$state/blocked"
    if [ -n "${HANDOFF_SIGNAL:-}" ]; then
      kill -s "$HANDOFF_SIGNAL" "$PPID"
    fi
    sleep 0.1
  fi
  if [ "$count" = "${HANDOFF_FAIL_AT:-0}" ]; then
    touch "$state/failed-once"
    exit 99
  fi
}
exists() { [ -d "$state/containers/$1" ]; }
running() { cat "$state/containers/$1/running"; }
case "$1 $2" in
  'container inspect')
    if [ "${3:-}" = --format ]; then format=$4; name=$5; else format=; name=$3; fi
    exists "$name" || exit 1
    case "$format" in
      *State.Running*) running "$name" ;;
      *Config.Image*) echo 'postgres:16@sha256:8888888888888888888888888888888888888888888888888888888888888888' ;;
      *'.Image'*) echo 'sha256:9999999999999999999999999999999999999999999999999999999999999999' ;;
      *'/opt/backup-bin'*) echo 'diis-backup-bin-w10d-20260903t120000z-a1b2c3d4' ;;
      *'/var/lib/diis-minio-target'*) echo docker_minio_data ;;
      *'/var/lock/diis-backup'*) echo "$HANDOFF_LOCK_PARENT" ;;
      *Config.Env*) printf '%s\n' OFFSITE_RETENTION_APPLY=0 BACKUP_BUCKET_CREATION_ALLOWED=0 BACKUP_SCHEDULE_ENABLED=0 ;;
      *) echo '[{}]' ;;
    esac
    ;;
  'image inspect') echo '["postgres:16@sha256:8888888888888888888888888888888888888888888888888888888888888888"]' ;;
  'exec smk-pg-backup'|'exec smk-pg-backup-candidate'|'exec smk-pg-backup-legacy-hold')
    name=$2; shift 2
    case "$*" in
      *'sha256sum /opt/backup-bin/mc'*)
        printf '%s  %s\n' \
          01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891 /opt/backup-bin/mc \
          7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad /opt/backup-bin/rclone.zip \
          "${HANDOFF_RCLONE_SHA:-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}" /opt/backup-bin/rclone
        ;;
      *'unzip -p /opt/backup-bin/rclone.zip'*)
        echo "${HANDOFF_RCLONE_ARCHIVE_SHA:-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc}"
        ;;
      '/opt/backup-bin/mc --version') echo 'mc version RELEASE.2025-08-13T08-35-41Z (commit-id=test)' ;;
      '/opt/backup-bin/rclone version') echo "rclone ${HANDOFF_RCLONE_VERSION:-v1.70.3}" ;;
      *"awk 'NF"*) awk 'NF && $1 !~ /^#/ {n++} END {print n+0}' "$state/containers/$name/cron" ;;
      *'kill -STOP'*) mutate ;;
      *'kill -CONT'*) mutate ;;
      *'crontab -r'*) mutate; : >"$state/containers/$name/cron" ;;
      'crontab -l') cat "$state/containers/$name/cron" ;;
      *) exit 91 ;;
    esac
    ;;
  'exec -i')
    name=$3; shift 3
    [ "$*" = 'crontab -' ] || exit 92
    mutate
    cat >"$state/containers/$name/cron"
    ;;
  'cp smk-pg-backup:/backup.sh') printf '%s\n' '#!/bin/sh' >"$3" ;;
  'start smk-pg-backup'|'start smk-pg-backup-legacy-hold') echo true >"$state/containers/$2/running" ;;
  'stop --time')
    name=$4; mutate; echo false >"$state/containers/$name/running"
    ;;
  'rename smk-pg-backup'|'rename smk-pg-backup-candidate'|'rename smk-pg-backup-legacy-hold')
    old=$2; new=$3; mutate; mv "$state/containers/$old" "$state/containers/$new"
    ;;
  *) printf 'unexpected fake docker command: %s\n' "$*" >&2; exit 93 ;;
esac
SH
chmod +x "$handoff_bin"/*

legacy_cron='17 1 * * * PATH=/opt/backup-bin:/usr/bin sh /backup.sh --legacy-exact'
init_handoff_state() {
  local state=$1
  mkdir -p "$state/containers/smk-pg-backup" "$state/containers/smk-pg-backup-candidate"
  printf '%s\n' "$legacy_cron" >"$state/containers/smk-pg-backup/cron"
  : >"$state/containers/smk-pg-backup-candidate/cron"
  echo true >"$state/containers/smk-pg-backup/running"
  echo true >"$state/containers/smk-pg-backup-candidate/running"
  echo legacy >"$state/containers/smk-pg-backup/role"
  echo candidate >"$state/containers/smk-pg-backup-candidate/role"
  echo 0 >"$state/count"
  mkdir -m 700 "$state/rollback"
  mkdir "$state/evidence"
  for name in acceptance root manual provenance db object tool; do
    printf '{}\n' >"$state/evidence/$name.json"
    chmod 600 "$state/evidence/$name.json"
  done
  printf '%s\n' '{"schemaVersion":"diis-backup-tool-evidence-v3","toolVolume":"diis-backup-bin-w10d-20260903t120000z-a1b2c3d4","mcSha256":"01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891","rcloneZipSha256":"7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad","rcloneArchiveEntry":"rclone-v1.70.3-linux-amd64/rclone","rcloneArchiveEntrySha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","rcloneSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","mcVersion":"RELEASE.2025-08-13T08-35-41Z","rcloneVersion":"v1.70.3"}' \
    >"$state/evidence/tool.json"
}
run_handoff() {
  local state=$1 fail_at=${2:-0} hold_at=${3:-0}
  local acceptance_sha
  acceptance_sha=$(sha256sum "$state/evidence/acceptance.json" | awk '{print $1}')
  env PATH="$handoff_bin:$PATH" HANDOFF_STATE="$state" HANDOFF_FAIL_AT="$fail_at" \
    HANDOFF_HOLD_AT="$hold_at" HANDOFF_SIGNAL="${HANDOFF_SIGNAL:-}" \
    HANDOFF_RCLONE_SHA="${HANDOFF_RCLONE_SHA:-}" \
    HANDOFF_RCLONE_VERSION="${HANDOFF_RCLONE_VERSION:-}" \
    HANDOFF_LOCK_PARENT="$state/writer" REPO_DIR="$handoff_repo" \
    HOST_LOCK="$state/deploy.lock" BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    LEGACY_HOLD_NAME=smk-pg-backup-legacy-hold ROLLBACK_DIR="$state/rollback" \
    HANDOFF_CONFIRMATION=HANDOFF_EXACT_W10D_BACKUP_SCHEDULER_ONCE \
    EXPECTED_CANDIDATE_IMAGE='postgres:16@sha256:8888888888888888888888888888888888888888888888888888888888888888' \
    EXPECTED_CANDIDATE_IMAGE_ID='sha256:9999999999999999999999999999999999999999999999999999999999999999' \
    EXPECTED_CANDIDATE_TOOL_VOLUME=diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 \
    EXPECTED_MINIO_VOLUME=docker_minio_data EXPECTED_BACKUP_LOCK_HOST_PATH="$state/writer" \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    ACCEPTANCE_BUNDLE="$state/evidence/acceptance.json" \
    EXPECTED_ACCEPTANCE_BUNDLE_SHA256="$acceptance_sha" ROOT_CRON_EVIDENCE="$state/evidence/root.json" \
    MANUAL_BACKUP_MANIFEST="$state/evidence/manual.json" OFFSITE_PROVENANCE="$state/evidence/provenance.json" \
    DB_RESTORE_PROOF="$state/evidence/db.json" OBJECT_RESTORE_PROOF="$state/evidence/object.json" \
    TOOL_EVIDENCE="$state/evidence/tool.json" bash "$HANDOFF"
}
assert_rollback_state() {
  local state=$1
  [ "$(cat "$state/containers/smk-pg-backup/role")" = legacy ] || fail 'rollback lost legacy authority'
  [ "$(cat "$state/containers/smk-pg-backup/running")" = true ] || fail 'rollback left legacy stopped'
  [ "$(cat "$state/containers/smk-pg-backup/cron")" = "$legacy_cron" ] || fail 'rollback did not restore exact legacy cron bytes'
  [ "$(cat "$state/containers/smk-pg-backup-candidate/role")" = candidate ] || fail 'rollback lost candidate identity'
  [ ! -s "$state/containers/smk-pg-backup-candidate/cron" ] || fail 'rollback left candidate scheduler active'
  [ ! -d "$state/containers/smk-pg-backup-legacy-hold" ] || fail 'rollback left duplicate legacy name'
  [ ! -d "$state/writer/backup.lock" ] || fail 'rollback leaked backup writer lock'
}
for boundary in $(seq 1 8); do
  state="$TMP/handoff-fail-$boundary"; init_handoff_state "$state"
  if run_handoff "$state" "$boundary" >"$state/out" 2>"$state/err"; then
    fail "handoff failure boundary $boundary unexpectedly succeeded"
  fi
  assert_grep 'ROLLBACK_OK.*retry=prohibited' "$state/err" "handoff boundary $boundary lacked exact rollback proof"
  assert_rollback_state "$state"
done
pass 'handoff rolls back exact one-authority state at every cron stop and rename command failure'

for signal_name in HUP INT TERM; do
  for boundary in $(seq 1 8); do
    state="$TMP/handoff-signal-${signal_name}-${boundary}"; init_handoff_state "$state"
    if HANDOFF_SIGNAL="$signal_name" run_handoff "$state" 0 "$boundary" >"$state/out" 2>"$state/err"; then
      fail "$signal_name handoff boundary $boundary unexpectedly succeeded"
    fi
    [ -f "$state/blocked" ] || fail "handoff did not reach $signal_name boundary $boundary"
    assert_grep 'ROLLBACK_OK.*retry=prohibited' "$state/err" \
      "$signal_name boundary $boundary lacked rollback proof"
    assert_rollback_state "$state"
  done
done
pass 'handoff HUP INT and TERM each restore exact one-authority state at every command boundary'

state="$TMP/handoff-success"; init_handoff_state "$state"
run_handoff "$state" >"$state/out" 2>"$state/err" || { cat "$state/err" >&2; fail 'handoff success path failed'; }
assert_grep 'HANDOFF_OK.*schedulerCount=1' "$state/out" 'handoff success proof missing'
[ "$(cat "$state/containers/smk-pg-backup/role")" = candidate ] || fail 'candidate did not become canonical authority'
[ "$(cat "$state/containers/smk-pg-backup-legacy-hold/role")" = legacy ] || fail 'legacy rollback container not retained'
[ ! -d "$state/writer/backup.lock" ] || fail 'successful handoff leaked backup writer lock'
pass 'handoff success produces exactly one active candidate authority and retained legacy rollback'

state="$TMP/handoff-tool-drift"; init_handoff_state "$state"
if HANDOFF_RCLONE_SHA=dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd \
  run_handoff "$state" >"$state/out" 2>"$state/err"; then
  fail 'handoff accepted actual candidate tool byte drift'
fi
assert_grep 'executable does not match pinned archive entry' "$state/err" \
  'handoff archive/executable drift rejection missing'
[ "$(cat "$state/count")" = 0 ] || fail 'tool drift reached handoff mutation boundary'
assert_rollback_state "$state"
pass 'handoff rehashes actual candidate tools and rejects byte drift before mutation'

state="$TMP/handoff-version-drift"; init_handoff_state "$state"
if HANDOFF_RCLONE_VERSION=v9.99.9 run_handoff "$state" >"$state/out" 2>"$state/err"; then
  fail 'handoff accepted actual candidate tool version drift'
fi
assert_grep 'rclone version drift' "$state/err" 'handoff version drift rejection missing'
[ "$(cat "$state/count")" = 0 ] || fail 'tool version drift reached handoff mutation boundary'
assert_rollback_state "$state"
pass 'handoff rejects actual candidate tool version drift before mutation'

assert_grep '/home/appuser/.local/state/diis-deploy/deploy.lock' "$HOST_LOCK_WRAPPER" \
  'manual build wrapper does not share the deploy lock'
pass 'manual production builds have the same fail-fast host lock entrypoint'

repo="$TMP/repo"
fake="$TMP/bin"
mkdir -p "$repo/scripts" "$repo/infrastructure/docker/scripts" "$fake"
cp "$ROOT/scripts/docker-no-touch-digest.py" "$repo/scripts/"
cp "$ROOT/scripts/production-recovery-readonly-summary.sh" "$repo/scripts/"
cp "$ROOT/infrastructure/docker/scripts/backup-lib.sh" "$repo/infrastructure/docker/scripts/"
cat >"$fake/git" <<'SH'
#!/bin/sh
case "$*" in
  'rev-parse HEAD') printf '%s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ;;
  'rev-parse HEAD^{tree}') printf '%s\n' bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb ;;
  'status --porcelain --untracked-files=normal') : ;;
  *) exit 90 ;;
esac
SH
cat >"$fake/pgrep" <<'SH'
#!/bin/sh
exit 1
SH
cat >"$fake/df" <<'SH'
#!/bin/sh
echo 'Filesystem 1-blocks Used Available Use% Mounted on'
echo 'mock 80000000000 40000000000 40000000000 50% /var/lib/docker'
SH
cat >"$fake/docker" <<'SH'
#!/bin/sh
set -eu
case "$1 $2" in
  'ps -aq') echo c1 ;;
  'ps -q') echo c1 ;;
  'ps --filter') : ;;
  'image ls') echo i1 ;;
  'volume ls') echo v1 ;;
  'network ls') echo n1 ;;
  'container inspect')
    printf '%s\n' '[{"Id":"c1","Name":"/app","Image":"i1","Config":{"Env":[],"Labels":{}},"HostConfig":{},"State":{"Status":"running","Running":true},"NetworkSettings":{"Networks":{}},"Mounts":[]}]'
    ;;
  'image inspect') printf '%s\n' '[{"Id":"i1","RepoTags":[],"RepoDigests":[],"Size":1}]' ;;
  'volume inspect') printf '%s\n' '[{"Name":"v1","Driver":"local","Scope":"local"}]' ;;
  'network inspect') printf '%s\n' '[{"Name":"n1","Id":"n1","Driver":"bridge","Containers":{}}]' ;;
  'buildx prune')
    [ "${CLEANUP_FAULT:-}" != hold ] || sleep 3
    [ "${CLEANUP_FAULT:-}" != fail ] || exit 91
    ;;
  'exec smk-postgres')
    case "$*" in *pg_isready*) : ;; *) echo 46 ;; esac
    ;;
  'exec smk-pg-backup') echo '3 100000 abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd' ;;
  *) printf 'unexpected docker args: %s\n' "$*" >&2; exit 92 ;;
esac
SH
chmod +x "$fake"/*
cat >"$fake/curl" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$fake/curl"
cat >"$fake/date" <<'SH'
#!/bin/sh
if [ "$*" = '-u +%s' ]; then printf '%s\n' 1788426000; else exec /usr/bin/date "$@"; fi
SH
cat >"$fake/timeout" <<'SH'
#!/bin/sh
[ "${CLEANUP_FAULT:-}" != slow ] || exit 124
while [ "${1#--}" != "$1" ]; do shift; done
shift
exec "$@"
SH
chmod +x "$fake/date" "$fake/timeout"

run_cleanup() {
  env PATH="$fake:$PATH" REPO_DIR="$repo" HOST_LOCK="$TMP/deploy.lock" \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    CLEANUP_CONFIRMATION=PRUNE_EXACT_BUILDKIT_CACHE_WITH_SHARED_HOST_LOCK \
    BACKUP_WRITER_LOCK="$TMP/backup-writer.lock" CLEANUP_FAULT="${CLEANUP_FAULT:-}" \
    APPROVED_WINDOW_START_EPOCH=1788425990 \
    APPROVED_WINDOW_END_EPOCH=1788427200 \
    bash "$CLEANUP"
}

run_cleanup >"$TMP/cleanup-success.out" 2>"$TMP/cleanup-success.err" \
  || { cat "$TMP/cleanup-success.err" >&2; fail 'bounded cleanup success path failed'; }
assert_grep 'CLEANUP_OK' "$TMP/cleanup-success.out" 'cleanup success marker missing'
pass 'cleanup holds shared lock and preserves no-touch digests on success'

CLEANUP_FAULT=hold run_cleanup >"$TMP/cleanup-hold.out" 2>"$TMP/cleanup-hold.err" &
cleanup_pid=$!
for _ in $(seq 1 50); do [ -f "$TMP/backup-writer.lock/owner" ] && break; sleep 0.05; done
[ -f "$TMP/backup-writer.lock/owner" ] || fail 'cleanup did not acquire backup writer lock'
if BACKUP_WRITER_LOCK="$TMP/backup-writer.lock" bash -c \
  '. "$1"; acquire_directory_lock "$BACKUP_WRITER_LOCK"' _ \
  "$repo/infrastructure/docker/scripts/backup-lib.sh" 2>"$TMP/writer-contender.err"; then
  fail 'backup writer acquired lock while cleanup prune was active'
fi
wait "$cleanup_pid" || { cat "$TMP/cleanup-hold.err" >&2; fail 'held cleanup did not complete'; }
[[ ! -d "$TMP/backup-writer.lock" ]] || fail 'cleanup did not release backup writer lock'
pass 'cleanup and backup writer are mutually exclusive for the complete prune interval'

flock "$TMP/deploy.lock" -c 'sleep 3' &
lock_pid=$!
sleep 0.2
if run_cleanup >/dev/null 2>"$TMP/cleanup-lock.err"; then fail 'concurrent cleanup acquired held lock'; fi
wait "$lock_pid"
assert_grep 'host lock is already held' "$TMP/cleanup-lock.err" 'concurrency rejection missing'
pass 'cleanup rejects concurrent deploy build or maintenance lock holder'

if CLEANUP_FAULT=slow run_cleanup >"$TMP/cleanup-timeout.out" 2>"$TMP/cleanup-timeout.err"; then
  fail 'wall-clock timeout unexpectedly succeeded'
fi
assert_grep 'PARTIAL_IRREVERSIBLE.*no_retry=1' "$TMP/cleanup-timeout.err" \
  'partial irreversible timeout classification missing'
pass 'cleanup wall-clock timeout runs postcheck and prohibits hidden retry'

assert_grep 'docker buildx prune' "$CLEANUP" 'exact buildx prune command missing'
assert_grep 'timeout --signal=TERM --kill-after=30s' "$CLEANUP" 'external wall-clock bound missing'
assert_grep '--timeout 2m' "$CLEANUP" 'builder-status timeout missing'
assert_grep '--filter until=1h' "$CLEANUP" 'age filter missing'
assert_grep '--filter inuse=false' "$CLEANUP" 'in-use filter missing'
assert_grep '--min-free-space' "$CLEANUP" 'free-space target missing'
assert_grep '--reserved-space' "$CLEANUP" 'cache reserve missing'
if grep -Eq 'docker (system|image|volume|network|container) prune|buildx prune.*(--all|-a)' "$CLEANUP"; then
  fail 'broad cleanup command found'
fi
pass 'cleanup command remains build-cache-only and explicitly bounded'

printf '1..%s\n' "$PASSED"

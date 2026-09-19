#!/usr/bin/env bash

set -Eeuo pipefail
export PYTHONDONTWRITEBYTECODE=1

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
# Immutable historical contract. Current cleanup behavior is exercised by
# capacity-lifecycle-contract.py and the real nested-daemon lab, not these mocks.
CLEANUP="$ROOT/infrastructure/deploy/tests/fixtures/historical-build-cache-cleanup.sh"
[ "$(sha256sum "$CLEANUP" | cut -d ' ' -f1)" = 8a3e862d5c113d648c01d77efeea41745f7ad2ccad7a3fc2f9fb92eab22bdda9 ] || exit 65
HANDOFF="$ROOT/infrastructure/deploy/w10d-backup-scheduler-handoff.sh"
CANDIDATE_CREATE="$ROOT/infrastructure/deploy/create-w10d-backup-candidate.sh"
HOST_LOCK_WRAPPER="$ROOT/infrastructure/deploy/run-with-diis-host-lock.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
CANDIDATE_COMPOSE="$ROOT/infrastructure/docker/docker-compose.backup-candidate.yml"
PG_BACKUP_IMAGE='registry.invalid/diis-pg-backup:test@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
PG_BACKUP_IMAGE_ID='sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
export PG_BACKUP_IMAGE
CRON_SUMMARY="$ROOT/scripts/root-cron-summary.py"
TOOL_CAPTURE="$ROOT/scripts/capture-w10d-candidate-tool-evidence.sh"
TMP=$(mktemp -d)
chmod 700 "$TMP"
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
assert_not_grep() { ! grep -Eq -- "$1" "$2" || fail "$3"; }

bash -n "$CLEANUP" "$HANDOFF" "$CANDIDATE_CREATE" "$HOST_LOCK_WRAPPER" "$TOOL_CAPTURE" \
  "$ROOT/scripts/production-recovery-readonly-summary.sh"
PYTHONPYCACHEPREFIX="$TMP/pycache" python3 -m py_compile "$CRON_SUMMARY" "$ROOT/scripts/docker-no-touch-digest.py" \
  "$ROOT/scripts/docker-container-redacted-manifest.py" \
  "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
  "$ROOT/scripts/bounded-command-capture.py" "$ROOT/scripts/w10d_completion_validation.py" \
  "$ROOT/scripts/google-service-account-binding.py" \
  "$ROOT/scripts/parse-buildkit-eligibility.py" \
  "$ROOT/scripts/parse-minio-du-observation.py"
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
  scripts/docker-container-redacted-manifest.py scripts/google-service-account-binding.py; do
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
runtime={'schemaVersion':'diis-container-rollback-redacted-v5','containerId':container_id,'name':'/smk-pg-backup-candidate','imageReference':'postgres:16@sha256:'+'8'*64,'imageId':'sha256:'+'9'*64,
 'entrypoint':['docker-entrypoint.sh'],'command':['sh','-c','reviewed-command'],'workingDir':'','user':'','restartPolicy':{'Name':'unless-stopped','MaximumRetryCount':0},'networkMode':'smk-network','networkNames':['smk-network'],
 'mounts':[{'Type':None,'Name':toolvol,'Source':None,'Destination':'/opt/backup-bin','RW':True,'Propagation':None},{'Type':None,'Name':'docker_minio_data','Source':None,'Destination':'/var/lib/diis-minio-target','RW':False,'Propagation':None},{'Type':None,'Name':None,'Source':'/var/lock/diis-backup','Destination':'/var/lock/diis-backup','RW':True,'Propagation':None},{'Type':None,'Name':None,'Source':'/etc/diis/rclone.conf','Destination':'/run/diis-secrets/rclone.conf','RW':False,'Propagation':None},{'Type':'bind','Name':None,'Source':'/etc/diis/google-service-account.json','Destination':'/run/diis-secrets/google-service-account.json','RW':False,'Propagation':None}],
 'environmentNames':['BACKUP_LOCK_BOOTSTRAP_REQUIRED','BACKUP_LOCK_DIR','BACKUP_BUCKET_CREATION_ALLOWED','BACKUP_SCHEDULE_ENABLED','OFFSITE_CONFIG_FINGERPRINT','OFFSITE_EXPECTED_AUTH_MODE','OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256','OFFSITE_EXPECTED_KEY_IDENTITY_SHA256','OFFSITE_EXPECTED_ORIGIN','OFFSITE_EXPECTED_PRINCIPAL_SHA256','OFFSITE_EXPECTED_PROJECT_SHA256','OFFSITE_EXPECTED_PROVIDER','OFFSITE_EXPECTED_ROOT_FOLDER_SHA256','OFFSITE_EXPECTED_TEAM_DRIVE_SHA256','OFFSITE_RETENTION_APPLY'],'environmentValuesSha256':'e'*64,
 'identityLabels':{'com.diis.w10d.attempt':attempt,'com.diis.w10d.role':'backup-candidate'},'labelsSha256':'f'*64}
runtime['credentialMounts']={'/run/diis-secrets/rclone.conf':[runtime['mounts'][3]],'/run/diis-secrets/google-service-account.json':[runtime['mounts'][4]]}
root={'schemaVersion':'diis-root-cron-summary-v2','status':'none','activeCount':0,'canonicalSha256':hashlib.sha256(b'').hexdigest(),'digestSemantics':'ordered-active-records-exact-whitespace-v1','semanticClassification':'clear','operatorAttestationBound':False}
backup_id='20260903T000000Z-7000'
manual={'schemaVersion':'diis-backup-v1','status':'complete','backupId':backup_id,'class':'daily','protectionState':'none','createdAt':'2026-09-03T00:00:00Z','createdEpoch':1788393600,'dailyKey':'2026-09-03','weeklyKey':'2026-W36','monthlyKey':'2026-09','sha256':dump,'bytes':2048,'archiveValidated':True,'offsiteStatus':'complete','offsiteConfigFingerprint':finger,'objectStatus':'verified','objectManifestSha256':objects,'objectCount':1,'tableCount':46,'userCount':40,'studentCount':20,'targetTotalBytes':20000000000,'targetFreeBytes':10000000000}
provenance={'schemaVersion':'diis-offsite-restore-input-v1','source':'independent-crypt','backupId':backup_id,'offsiteConfigFingerprint':finger,'dumpSha256':dump,'dumpBytes':2048,'objectManifestSha256':objects,'objectCount':1,'dumpFile':backup_id+'.dump','sidecarFile':backup_id+'.sha256','completionFile':backup_id+'.complete.json','objectManifestFile':backup_id+'.objects.tsv','createdAt':'2026-09-03T00:10:00Z'}
sa={'schemaVersion':'diis-google-service-account-binding-v1','authMode':'service-account-file','principalSha256':'1'*64,'projectSha256':'2'*64,'keyIdentitySha256':'3'*64,'credentialArtifactSha256':'4'*64}
runtime['recoveryBindings']={'BACKUP_SCHEDULE_ENABLED':'0','BACKUP_BUCKET_CREATION_ALLOWED':'0','OFFSITE_RETENTION_APPLY':'0','BACKUP_LOCK_BOOTSTRAP_REQUIRED':'1','BACKUP_LOCK_DIR':'/var/lock/diis-backup/backup.lock','OFFSITE_CONFIG_FINGERPRINT':finger,'OFFSITE_EXPECTED_PROVIDER':'google','OFFSITE_EXPECTED_ORIGIN':'provider-default','OFFSITE_EXPECTED_TEAM_DRIVE_SHA256':'a'*64,'OFFSITE_EXPECTED_ROOT_FOLDER_SHA256':'b'*64,'OFFSITE_EXPECTED_AUTH_MODE':'service-account-file','OFFSITE_EXPECTED_PRINCIPAL_SHA256':sa['principalSha256'],'OFFSITE_EXPECTED_PROJECT_SHA256':sa['projectSha256'],'OFFSITE_EXPECTED_KEY_IDENTITY_SHA256':sa['keyIdentitySha256'],'OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256':sa['credentialArtifactSha256']}
files={'runtime.json':runtime,'root.json':root,'manual.json':manual,'provenance.json':provenance}
for name,value in files.items(): (evidence/name).write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
(evidence/'manual.sha256').write_text(f'{dump}  {backup_id}.dump\n',encoding='utf-8')
prov_sha=h(evidence/'provenance.json')
db={'schemaVersion':'diis-restore-proof-v3','status':'success','backupId':backup_id,'source':'independent-crypt','sourceProvenanceSha256':prov_sha,'dumpSha256':dump,'objectManifestSha256':objects,'tableCount':46,'userCount':40,'studentCount':20,'createdEpoch':1788394800}
obj={'schemaVersion':'diis-object-restore-proof-v1','status':'success','backupId':backup_id,'source':'independent-crypt','sourceProvenanceSha256':prov_sha,'objectManifestSha256':objects,'objectCount':1,'createdEpoch':1788394860}
tool={'schemaVersion':'diis-backup-tool-evidence-v3','toolVolume':toolvol,'mcSha256':'01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891','rcloneZipSha256':'7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad','rcloneArchiveEntry':'rclone-v1.70.3-linux-amd64/rclone','rcloneArchiveEntrySha256':'c'*64,'rcloneSha256':'c'*64,'mcVersion':'RELEASE.2025-08-13T08-35-41Z','rcloneVersion':'v1.70.3'}
for name,value in {'db.json':db,'object.json':obj,'tool.json':tool,'service-account.json':sa}.items(): (evidence/name).write_text(json.dumps(value,separators=(',',':'))+'\n',encoding='utf-8')
contract={key:runtime[key] for key in ('entrypoint','command','workingDir','user','restartPolicy','networkMode','networkNames','mounts','environmentNames','environmentValuesSha256','identityLabels','labelsSha256','credentialMounts','recoveryBindings')}
bundle={'schemaVersion':'diis-w10d-backup-candidate-acceptance-v5','status':'accepted','mainSha':sha,'mainTree':tree,'candidateContainer':'smk-pg-backup-candidate','candidateContainerId':container_id,'candidateAttemptId':attempt,'offsiteSource':'independent-crypt','localMinioFallback':False,'retentionApply':False,'manualBackupStatus':'complete','dbRestoreStatus':'success','objectRestoreStatus':'success','candidateImageReference':runtime['imageReference'],'candidateImageId':runtime['imageId'],'candidateToolVolume':toolvol,'minioSourceVolume':'docker_minio_data','backupLockHostPath':'/var/lock/diis-backup','rcloneConfigFingerprint':finger,'sharedDriveSha256':'a'*64,'sharedDriveRootFolderSha256':'b'*64,'offsiteProvider':'google','offsiteOrigin':'provider-default','candidateRuntimeContract':contract,'candidateRuntimeContractSha256':hashlib.sha256(json.dumps(contract,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'serviceAccountAuthMode':'service-account-file','serviceAccountPrincipalSha256':sa['principalSha256'],'serviceAccountProjectSha256':sa['projectSha256'],'serviceAccountKeyIdentitySha256':sa['keyIdentitySha256'],'serviceAccountArtifactSha256':sa['credentialArtifactSha256'],'candidateEnvironmentNamesSha256':hashlib.sha256(json.dumps(runtime['environmentNames'],sort_keys=True,separators=(',',':')).encode()).hexdigest()}
bundle['schemaVersion']='diis-w10d-backup-candidate-acceptance-v6'
for key,name in {'candidateRuntimeManifestSha256':'runtime.json','rootCronEvidenceSha256':'root.json','manualBackupManifestSha256':'manual.json','offsiteRetrievalProvenanceSha256':'provenance.json','dbRestoreProofSha256':'db.json','objectRestoreProofSha256':'object.json','toolEvidenceSha256':'tool.json','serviceAccountEvidenceSha256':'service-account.json'}.items(): bundle[key]=h(evidence/name)
bundle['manualBackupSidecarSha256']=h(evidence/'manual.sha256')
bundle['manualBackupManifestProducerExitCode']=0
bundle['manualBackupSidecarProducerExitCode']=0
for key,name in {'backupScriptSha256':'infrastructure/docker/scripts/backup.sh','backupLibrarySha256':'infrastructure/docker/scripts/backup-lib.sh','offsiteScriptSha256':'infrastructure/docker/scripts/offsite-replication.sh','objectRestoreScriptSha256':'infrastructure/docker/scripts/restore-objects.sh','databaseRestoreScriptSha256':'scripts/restore-drill.sh','baseComposeSha256':'infrastructure/docker/docker-compose.yml','candidateComposeSha256':'infrastructure/docker/docker-compose.backup-candidate.yml','toolCaptureScriptSha256':'scripts/capture-w10d-candidate-tool-evidence.sh','runtimeManifestScriptSha256':'scripts/docker-container-redacted-manifest.py','serviceAccountParserSha256':'scripts/google-service-account-binding.py'}.items(): bundle[key]=h(repo/name)
bundle_path.write_text(json.dumps(bundle,separators=(',',':'))+'\n',encoding='utf-8')
PY
chmod 700 "$TMP/accept-evidence"
chmod 600 "$TMP/accept-evidence"/*.json "$TMP/accept-evidence/manual.sha256"
accept_args=("$acceptance" "$accept_sha" "$accept_tree" smk-pg-backup-candidate "$accept_repo" \
  "$TMP/accept-evidence/runtime.json" "$TMP/accept-evidence/root.json" \
  "$TMP/accept-evidence/manual.json" "$TMP/accept-evidence/manual.sha256" "$TMP/accept-evidence/provenance.json" \
  "$TMP/accept-evidence/db.json" "$TMP/accept-evidence/object.json" "$TMP/accept-evidence/tool.json" \
  "$TMP/accept-evidence/service-account.json")
run_accept() {
  local bundle=$1 snapshot rc
  shift
  snapshot=$(mktemp -d "$TMP/accept-snapshot.XXXXXX")
  chmod 700 "$snapshot"
  python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
    --expected-bundle-sha256 "$(sha256sum "$bundle" | awk '{print $1}')" \
    --snapshot-dir "$snapshot" --expected-owner-uid "$(id -u)" --test-root "$TMP" \
    "$bundle" "$@"
  rc=$?
  rm -rf "$snapshot"
  return "$rc"
}
run_accept "${accept_args[@]}" \
  || fail 'valid checkout-bound candidate acceptance was rejected'

inherited_snapshot=$(mktemp -d "$TMP/accept-inherited-snapshot.XXXXXX"); chmod 700 "$inherited_snapshot"
arbitrary_marker=$(mktemp); rm -f "$arbitrary_marker"
if DIIS_ACCEPTANCE_TEST_MODE=1 DIIS_ACCEPTANCE_TEST_PAUSE_MARKER="$arbitrary_marker" \
  python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
  --expected-bundle-sha256 "$(sha256sum "$acceptance" | awk '{print $1}')" \
  --snapshot-dir "$inherited_snapshot" --expected-owner-uid "$(id -u)" "${accept_args[@]}"; then
  fail 'production acceptance inherited test environment'
fi
[ ! -e "$arbitrary_marker" ] || fail 'rejected acceptance wrote arbitrary marker'
if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
  --expected-bundle-sha256 "$(sha256sum "$acceptance" | awk '{print $1}')" \
  --snapshot-dir "$inherited_snapshot" --expected-owner-uid "$(id -u)" \
  --test-root / "${accept_args[@]}"; then
  fail 'acceptance allowed root filesystem as test root'
fi
rm -rf "$inherited_snapshot"
pass 'production acceptance rejects inherited or unconfined test controls before evidence mutation'

cp "$TMP/accept-evidence/manual.json" "$TMP/manual-before-race.json"
race_snapshot=$(mktemp -d "$TMP/accept-race-snapshot.XXXXXX"); chmod 700 "$race_snapshot"
python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
    --expected-bundle-sha256 "$(sha256sum "$acceptance" | awk '{print $1}')" \
    --snapshot-dir "$race_snapshot" --expected-owner-uid "$(id -u)" --test-root "$TMP" \
    --test-pause-marker "$TMP/accept-race.marker" --test-pause-release "$TMP/accept-race.release" \
    "${accept_args[@]}" \
    >"$TMP/accept-race.out" 2>"$TMP/accept-race.err" &
race_accept_pid=$!
for _ in $(seq 1 100); do [ -f "$TMP/accept-race.marker" ] && break; sleep 0.02; done
[ -f "$TMP/accept-race.marker" ] || fail 'acceptance did not reach immutable snapshot boundary'
printf '\n' >>"$TMP/accept-evidence/manual.json"
touch "$TMP/accept-race.release"
wait "$race_accept_pid" || { cat "$TMP/accept-race.err" >&2; fail 'post-snapshot source swap altered acceptance'; }
mv "$TMP/manual-before-race.json" "$TMP/accept-evidence/manual.json"
rm -rf "$race_snapshot"

wrong_parent="$TMP/accept-wrong-owner"; mkdir -m 700 "$wrong_parent"
cp "$acceptance" "$wrong_parent/bundle.json"; chmod 600 "$wrong_parent/bundle.json"
chown 65534:65534 "$wrong_parent" "$wrong_parent/bundle.json"
wrong_snapshot=$(mktemp -d "$TMP/accept-wrong-snapshot.XXXXXX"); chmod 700 "$wrong_snapshot"
if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
  --expected-bundle-sha256 "$(sha256sum "$wrong_parent/bundle.json" | awk '{print $1}')" \
  --snapshot-dir "$wrong_snapshot" --expected-owner-uid "$(id -u)" --test-root "$TMP" \
  "$wrong_parent/bundle.json" "${accept_args[@]:1}"; then
  fail 'wrong-owner acceptance evidence was accepted'
fi
rm -rf "$wrong_snapshot"
real_parent="$TMP/accept-real-parent"; mkdir -m 700 "$real_parent"
cp "$acceptance" "$real_parent/bundle.json"; chmod 600 "$real_parent/bundle.json"
ln -s "$real_parent" "$TMP/accept-linked-parent"
linked_snapshot=$(mktemp -d "$TMP/accept-linked-snapshot.XXXXXX"); chmod 700 "$linked_snapshot"
if python3 "$ROOT/scripts/validate-w10d-candidate-acceptance.py" \
  --expected-bundle-sha256 "$(sha256sum "$real_parent/bundle.json" | awk '{print $1}')" \
  --snapshot-dir "$linked_snapshot" --expected-owner-uid "$(id -u)" --test-root "$TMP" \
  "$TMP/accept-linked-parent/bundle.json" "${accept_args[@]:1}"; then
  fail 'symlink-parent acceptance evidence was accepted'
fi
rm -rf "$linked_snapshot"
pass 'acceptance snapshots evidence once and rejects wrong-owner or symlink-parent inputs'

sed 's/"localMinioFallback":false/"localMinioFallback":true/' "$acceptance" >"$TMP/local-fallback.json"
chmod 600 "$TMP/local-fallback.json"
if run_accept "$TMP/local-fallback.json" \
  "${accept_args[@]:1}"; then
  fail 'local MinIO fallback was accepted as independent restore proof'
fi
cp "$TMP/accept-evidence/db.json" "$TMP/accept-evidence/db.valid.json"
printf '\n' >>"$TMP/accept-evidence/db.json"
if run_accept "${accept_args[@]}"; then
  fail 'tampered runtime evidence was accepted through a stale bundle hash'
fi
mv "$TMP/accept-evidence/db.valid.json" "$TMP/accept-evidence/db.json"
python3 - "$acceptance" "$TMP/accept-evidence" <<'PY'
import hashlib, json, pathlib, sys
bundle_path, evidence = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
raw=bundle_path.read_text()
(evidence/'duplicate-bundle.json').write_text(raw.replace('"status":"accepted"','"status":"rejected","status":"accepted"',1))
bundle=json.loads(raw); bundle['unexpected']='rejected'; (evidence/'unknown-bundle.json').write_text(json.dumps(bundle,separators=(',',':'))+'\n')
bundle=json.loads(raw); del bundle['candidateAttemptId']; (evidence/'missing-bundle.json').write_text(json.dumps(bundle,separators=(',',':'))+'\n')
manual=json.loads((evidence/'manual.json').read_text()); manual['objectCount']=True
(evidence/'bool-manual.json').write_text(json.dumps(manual,separators=(',',':'))+'\n')
bundle=json.loads(raw); bundle['manualBackupManifestSha256']=hashlib.sha256((evidence/'bool-manual.json').read_bytes()).hexdigest()
(evidence/'bool-bundle.json').write_text(json.dumps(bundle,separators=(',',':'))+'\n')
bundle=json.loads(raw); bundle['manualBackupSidecarProducerExitCode']=71
(evidence/'producer-failed-bundle.json').write_text(json.dumps(bundle,separators=(',',':'))+'\n')
PY
chmod 600 "$TMP/accept-evidence"/{duplicate,unknown,missing,bool}-bundle.json \
  "$TMP/accept-evidence/bool-manual.json" "$TMP/accept-evidence/producer-failed-bundle.json"
for strict_case in duplicate unknown missing; do
  if run_accept \
    "$TMP/accept-evidence/$strict_case-bundle.json" "${accept_args[@]:1}"; then
    fail "$strict_case acceptance bundle was accepted"
  fi
done
if run_accept \
  "$TMP/accept-evidence/bool-bundle.json" "${accept_args[@]:1:6}" \
  "$TMP/accept-evidence/bool-manual.json" "${accept_args[@]:8}"; then
  fail 'bool-as-int manual evidence was accepted'
fi
if run_accept "$TMP/accept-evidence/producer-failed-bundle.json" "${accept_args[@]:1}"; then
  fail 'nonzero sidecar producer status was accepted'
fi
pass 'candidate acceptance rejects duplicate unknown missing and bool-as-int evidence fields'

python3 - "$acceptance" "$TMP/accept-evidence" <<'PY'
import hashlib,json,pathlib,sys
bundle_path,evidence=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2])
base_bundle=json.loads(bundle_path.read_text()); base_manual=json.loads((evidence/'manual.json').read_text())
cases={}
value=dict(base_manual); value['protectionState']='protected'; cases['class-protection']=(value,None)
value=dict(base_manual); value['createdEpoch']+=1; cases['epoch']=(value,None)
value=dict(base_manual); value['dailyKey']='2026-09-04'; cases['daily-key']=(value,None)
value=dict(base_manual); value['sha256']='0'*64; cases['zero-hash']=(value,None)
value=dict(base_manual); value['tableCount']=0; cases['zero-table']=(value,None)
value=dict(base_manual); value['studentCount']=41; cases['student-exceeds-user']=(value,None)
value=dict(base_manual); value['targetFreeBytes']=value['targetTotalBytes']+1; cases['free-exceeds-total']=(value,None)
value=dict(base_manual); value['targetProjectedFreePercent']=49; cases['unverifiable-projected-claim']=(value,None)
cases['sidecar-mismatch']=(dict(base_manual),'d'*64+'  '+base_manual['backupId']+'.dump\n')
for name,(manual,sidecar_override) in cases.items():
    case=evidence/('completion-'+name); case.mkdir(mode=0o700)
    manual_path=case/'manual.json'; manual_path.write_text(json.dumps(manual,separators=(',',':'))+'\n')
    sidecar_path=case/'manual.sha256'
    sidecar_path.write_text(sidecar_override or (evidence/'manual.sha256').read_text())
    manual_path.chmod(0o600); sidecar_path.chmod(0o600)
    bundle=dict(base_bundle)
    bundle['manualBackupManifestSha256']=hashlib.sha256(manual_path.read_bytes()).hexdigest()
    bundle['manualBackupSidecarSha256']=hashlib.sha256(sidecar_path.read_bytes()).hexdigest()
    out=case/'bundle.json'; out.write_text(json.dumps(bundle,separators=(',',':'))+'\n'); out.chmod(0o600)
PY
for completion_case in class-protection epoch daily-key zero-hash zero-table student-exceeds-user \
  free-exceeds-total unverifiable-projected-claim sidecar-mismatch; do
  case_dir="$TMP/accept-evidence/completion-$completion_case"
  if run_accept "$case_dir/bundle.json" "${accept_args[@]:1:6}" \
    "$case_dir/manual.json" "$case_dir/manual.sha256" "${accept_args[@]:9}"; then
    fail "strict completion case $completion_case was accepted"
  fi
done
pass 'candidate acceptance reuses strict completion time class hash and sidecar semantics'

restore_mismatch="$TMP/accept-evidence/restore-count-mismatch"
mkdir -m 700 "$restore_mismatch"
python3 - "$acceptance" "$TMP/accept-evidence/db.json" "$restore_mismatch" <<'PY'
import hashlib,json,pathlib,sys
bundle_path,db_path,out=map(pathlib.Path,sys.argv[1:])
db=json.loads(db_path.read_text()); db['studentCount']=19
(out/'db.json').write_text(json.dumps(db,separators=(',',':'))+'\n')
bundle=json.loads(bundle_path.read_text())
bundle['dbRestoreProofSha256']=hashlib.sha256((out/'db.json').read_bytes()).hexdigest()
(out/'bundle.json').write_text(json.dumps(bundle,separators=(',',':'))+'\n')
PY
chmod 600 "$restore_mismatch"/*.json
if run_accept "$restore_mismatch/bundle.json" "${accept_args[@]:1:9}" \
  "$restore_mismatch/db.json" "${accept_args[@]:11}"; then
  fail 'database restore proof count mismatch was accepted'
fi
pass 'database restore proof v3 reconciles all exact completion counts'

git -C "$accept_repo" status --porcelain >/dev/null
python3 - "$acceptance" "$TMP/accept-evidence" <<'PY'
import hashlib, json, pathlib, sys
bundle_path, evidence = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
base_bundle=json.load(open(bundle_path,encoding='utf-8'))
base_runtime=json.load(open(evidence/'runtime.json',encoding='utf-8'))
base_tool=json.load(open(evidence/'tool.json',encoding='utf-8'))
def write_case(name, runtime=None, tool=None, service_account=None):
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
    if service_account is not None:
        sa_path=case/'service-account.json'; sa_path.write_text(json.dumps(service_account,separators=(',',':'))+'\n')
        bundle['serviceAccountEvidenceSha256']=hashlib.sha256(sa_path.read_bytes()).hexdigest()
    else: sa_path=evidence/'service-account.json'
    bundle_out=case/'bundle.json'; bundle_out.write_text(json.dumps(bundle,separators=(',',':'))+'\n')
    return
runtime=dict(base_runtime); runtime['command']=['sh','-c','drifted-command']; write_case('changed-command',runtime=runtime)
runtime=dict(base_runtime); runtime['mounts']=list(runtime['mounts'])+[{'Destination':'/unexpected','Source':'/host','RW':True}]; write_case('extra-mount',runtime=runtime)
runtime=dict(base_runtime); runtime['mounts']=[dict(item) for item in runtime['mounts']]; runtime['mounts'][4]['RW']=True; runtime['credentialMounts']={'/run/diis-secrets/rclone.conf':[runtime['mounts'][3]],'/run/diis-secrets/google-service-account.json':[runtime['mounts'][4]]}; write_case('writable-credential-mount',runtime=runtime)
runtime=dict(base_runtime); runtime['mounts']=list(runtime['mounts'][:4]); runtime['credentialMounts']={'/run/diis-secrets/rclone.conf':[runtime['mounts'][3]]}; write_case('missing-credential-mount',runtime=runtime)
runtime=dict(base_runtime); runtime['environmentValuesSha256']='1'*64; write_case('changed-env',runtime=runtime)
runtime=dict(base_runtime); runtime['environmentNames']=list(runtime['environmentNames'])+['OAUTH_TOKEN']; write_case('forbidden-auth-env',runtime=runtime)
runtime=dict(base_runtime); runtime['recoveryBindings']=dict(runtime['recoveryBindings']); runtime['recoveryBindings']['OFFSITE_EXPECTED_PRINCIPAL_SHA256']='0'*64; write_case('changed-recovery-binding',runtime=runtime)
runtime=dict(base_runtime); runtime['recoveryBindings']=dict(runtime['recoveryBindings']); del runtime['recoveryBindings']['OFFSITE_EXPECTED_PROVIDER']; write_case('missing-provider',runtime=runtime)
runtime=dict(base_runtime); runtime['recoveryBindings']=dict(runtime['recoveryBindings']); runtime['recoveryBindings']['OFFSITE_EXPECTED_PROVIDER']='dropbox'; write_case('wrong-provider',runtime=runtime)
runtime=dict(base_runtime); runtime['recoveryBindings']=dict(runtime['recoveryBindings']); del runtime['recoveryBindings']['OFFSITE_EXPECTED_ORIGIN']; write_case('missing-origin',runtime=runtime)
runtime=dict(base_runtime); runtime['recoveryBindings']=dict(runtime['recoveryBindings']); runtime['recoveryBindings']['OFFSITE_EXPECTED_ORIGIN']='oauth-user'; write_case('wrong-origin',runtime=runtime)
runtime=dict(base_runtime); runtime['identityLabels']=dict(runtime['identityLabels']); runtime['identityLabels']['com.diis.w10d.attempt']='w10d-20260903t120000z-deadbeef'; write_case('changed-label',runtime=runtime)
tool=dict(base_tool); tool['mcSha256']='2'*64; write_case('changed-tool',tool=tool)
tool=dict(base_tool); tool['rcloneVersion']='v9.99.9'; write_case('changed-version',tool=tool)
tool=dict(base_tool); tool['rcloneSha256']='3'*64; write_case('changed-executable-provenance',tool=tool)
base_sa=json.load(open(evidence/'service-account.json',encoding='utf-8'))
for name,key in [('wrong-principal','principalSha256'),('wrong-project','projectSha256'),('rotated-key','keyIdentitySha256'),('changed-artifact','credentialArtifactSha256')]:
    sa=dict(base_sa); sa[key]='a'*64; write_case(name,service_account=sa)
PY
for case in changed-command extra-mount writable-credential-mount missing-credential-mount changed-env forbidden-auth-env changed-recovery-binding missing-provider wrong-provider missing-origin wrong-origin changed-label; do
  chmod 700 "$TMP/accept-evidence/$case"
  chmod 600 "$TMP/accept-evidence/$case"/*.json
  if run_accept \
    "$TMP/accept-evidence/$case/bundle.json" "${accept_args[1]}" "${accept_args[2]}" \
    "${accept_args[3]}" "${accept_args[4]}" "$TMP/accept-evidence/$case/runtime.json" \
    "${accept_args[@]:6:6}" "$TMP/accept-evidence/tool.json" "${accept_args[13]}"; then
    fail "runtime drift case $case was accepted"
  fi
done
for case in wrong-principal wrong-project rotated-key changed-artifact; do
  chmod 700 "$TMP/accept-evidence/$case"
  chmod 600 "$TMP/accept-evidence/$case"/*.json
  if run_accept \
    "$TMP/accept-evidence/$case/bundle.json" "${accept_args[@]:1:12}" \
    "$TMP/accept-evidence/$case/service-account.json"; then
    fail "$case Service Account drift was accepted"
  fi
done
for case in changed-tool changed-version changed-executable-provenance; do
  chmod 700 "$TMP/accept-evidence/$case"
  chmod 600 "$TMP/accept-evidence/$case"/*.json
  if run_accept \
    "$TMP/accept-evidence/$case/bundle.json" "${accept_args[@]:1:5}" \
    "${accept_args[@]:6:6}" "$TMP/accept-evidence/$case/tool.json" "${accept_args[13]}"; then
    fail "$case drift was accepted"
  fi
done
pass 'candidate acceptance binds runtime credential identity and pinned archive provenance and rejects all modeled drift'

compose_cli=(docker)
compose_base=$COMPOSE
compose_candidate=$CANDIDATE_COMPOSE
if ! docker compose version >/dev/null 2>&1; then
  command -v docker.exe >/dev/null 2>&1 && command -v wslpath >/dev/null 2>&1 \
    || fail 'Docker Compose CLI unavailable for config render'
  compose_cli=(docker.exe)
  compose_base=$(wslpath -w "$COMPOSE")
  compose_candidate=$(wslpath -w "$CANDIDATE_COMPOSE")
  export WSLENV="${WSLENV:+$WSLENV:}PG_BACKUP_IMAGE:CANDIDATE_BACKUP_BIN_VOLUME_NAME:CANDIDATE_MINIO_DATA_VOLUME_NAME:W10D_ATTEMPT_ID:EXPECTED_OFFSITE_CONFIG_FINGERPRINT:EXPECTED_OFFSITE_PROVIDER:EXPECTED_OFFSITE_ORIGIN:EXPECTED_TEAM_DRIVE_SHA256:EXPECTED_ROOT_FOLDER_SHA256:EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256:EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256:EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256:EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256"
fi

if env -u CANDIDATE_BACKUP_BIN_VOLUME_NAME -u CANDIDATE_MINIO_DATA_VOLUME_NAME \
  -u W10D_ATTEMPT_ID "${compose_cli[@]}" compose -f "$compose_base" -f "$compose_candidate" \
  config --quiet >"$TMP/compose-unbound.out" 2>"$TMP/compose-unbound.err"; then
  fail 'candidate compose rendered without explicit volume bindings'
fi
assert_grep 'required variable.*is missing a value' "$TMP/compose-unbound.err" \
  'candidate compose did not fail on a missing required binding'
env CANDIDATE_BACKUP_BIN_VOLUME_NAME=diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 \
  PG_BACKUP_IMAGE='registry.invalid/diis-pg-backup:test@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  CANDIDATE_MINIO_DATA_VOLUME_NAME=docker_minio_data \
  W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 \
  EXPECTED_OFFSITE_CONFIG_FINGERPRINT=$(printf f | sha256sum | awk '{print $1}') \
  EXPECTED_OFFSITE_PROVIDER=google EXPECTED_OFFSITE_ORIGIN=provider-default \
  EXPECTED_TEAM_DRIVE_SHA256=$(printf d | sha256sum | awk '{print $1}') \
  EXPECTED_ROOT_FOLDER_SHA256=$(printf r | sha256sum | awk '{print $1}') \
  EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256=$(printf p | sha256sum | awk '{print $1}') \
  EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256=$(printf j | sha256sum | awk '{print $1}') \
  EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256=$(printf k | sha256sum | awk '{print $1}') \
  EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256=$(printf a | sha256sum | awk '{print $1}') \
  "${compose_cli[@]}" compose -f "$compose_base" -f "$compose_candidate" \
  config >"$TMP/candidate-compose.yml" 2>/dev/null \
  || fail 'candidate compose rejected explicit isolated bindings'
assert_grep 'name: diis-backup-bin-w10d-20260903t120000z-a1b2c3d4' "$TMP/candidate-compose.yml" \
  'candidate compose did not render exact isolated tool volume'
assert_grep 'source: /etc/diis/google-service-account.json' "$TMP/candidate-compose.yml" \
  'candidate compose did not render exact Service Account source'
assert_grep 'target: /run/diis-secrets/google-service-account.json' "$TMP/candidate-compose.yml" \
  'candidate compose did not render exact Service Account destination'
assert_grep 'BACKUP_LOCK_BOOTSTRAP_REQUIRED: "1"' "$CANDIDATE_COMPOSE" \
  'candidate compose does not require approved lock bootstrap'
assert_not_grep 'google-service-account.json' "$COMPOSE" \
  'base compose would alter the current legacy container before candidate gate'
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
cp "$ROOT/scripts/google-service-account-binding.py" "$launcher_repo/scripts-google-service-account-binding.py"
mkdir -p "$launcher_repo/scripts"
mv "$launcher_repo/scripts-google-service-account-binding.py" "$launcher_repo/scripts/google-service-account-binding.py"
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
      *Config.Image*) echo "${LAUNCHER_ACTUAL_IMAGE_REFERENCE:-$PG_BACKUP_IMAGE}" ;;
      *'.Image'*) echo "${LAUNCHER_ACTUAL_IMAGE_ID:-$EXPECTED_CANDIDATE_IMAGE_ID}" ;;
      *com.diis.w10d.attempt*) echo w10d-20260903t120000z-a1b2c3d4 ;;
      *'/opt/backup-bin'*) echo diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 ;;
      *'/var/lib/diis-minio-target'*) echo docker_minio_data ;;
      *'/var/lock/diis-backup'*) echo "${LAUNCHER_ACTUAL_LOCK_SOURCE:-$(dirname "$BACKUP_WRITER_LOCK")}" ;;
      *'/run/diis-secrets/google-service-account.json'*Source*) echo "$SERVICE_ACCOUNT_HOST_FILE" ;;
      *'/run/diis-secrets/google-service-account.json'*RW*) echo false ;;
      *Config.Env*) printf '%s\n' BACKUP_SCHEDULE_ENABLED=0 BACKUP_BUCKET_CREATION_ALLOWED=0 OFFSITE_RETENTION_APPLY=0 BACKUP_LOCK_BOOTSTRAP_REQUIRED=1 \
        BACKUP_LOCK_DIR=/var/lock/diis-backup/backup.lock \
        "OFFSITE_CONFIG_FINGERPRINT=$EXPECTED_OFFSITE_CONFIG_FINGERPRINT" \
        "OFFSITE_EXPECTED_PROVIDER=${LAUNCHER_ACTUAL_PROVIDER:-$EXPECTED_OFFSITE_PROVIDER}" \
        "OFFSITE_EXPECTED_ORIGIN=${LAUNCHER_ACTUAL_ORIGIN:-$EXPECTED_OFFSITE_ORIGIN}" \
        "OFFSITE_EXPECTED_TEAM_DRIVE_SHA256=$EXPECTED_TEAM_DRIVE_SHA256" \
        "OFFSITE_EXPECTED_ROOT_FOLDER_SHA256=$EXPECTED_ROOT_FOLDER_SHA256" \
        OFFSITE_EXPECTED_AUTH_MODE=service-account-file \
        "OFFSITE_EXPECTED_PRINCIPAL_SHA256=$EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256" \
        "OFFSITE_EXPECTED_PROJECT_SHA256=$EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256" \
        "OFFSITE_EXPECTED_KEY_IDENTITY_SHA256=$EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256" \
        "OFFSITE_EXPECTED_CREDENTIAL_ARTIFACT_SHA256=$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256" ;;
      *) echo '[{}]' ;;
    esac
    ;;
  'image inspect')
    [ "${3:-}" = --format ] || exit 7
    case "$4" in
      *'.Id'*) echo "${LAUNCHER_LOCAL_IMAGE_ID:-$EXPECTED_CANDIDATE_IMAGE_ID}" ;;
      *) exit 8 ;;
    esac
    ;;
  'exec smk-pg-backup-candidate')
    printf '%s  %s\n' "$EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256" /run/diis-secrets/google-service-account.json
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
cat >"$launcher_bin/rm" <<'SH'
#!/bin/sh
case "${LAUNCHER_EVIDENCE_RM_FAIL:-0}:$*" in
  1:*service-account.json.candidate.*) exit 79 ;;
esac
exec /usr/bin/rm "$@"
SH
chmod +x "$launcher_bin"/*
printf 'POSTGRES_PASSWORD=test-only-placeholder\n' >"$launcher_state/env"
chmod 600 "$launcher_state/env"
mkdir -m 700 "$launcher_state/evidence"
mkdir -m 750 "$launcher_state/writer"
printf '%s\n' '{"type":"service_account","client_email":"synthetic@example.invalid","project_id":"synthetic-project","private_key_id":"synthetic-key","private_key":"synthetic-unusable"}' >"$launcher_state/credential.json"
chmod 600 "$launcher_state/credential.json"
launcher_principal=$(printf '%s' 'synthetic@example.invalid' | sha256sum | awk '{print $1}')
launcher_project=$(printf '%s' 'synthetic-project' | sha256sum | awk '{print $1}')
launcher_key=$(printf '%s' 'synthetic-key' | sha256sum | awk '{print $1}')
launcher_artifact=$(sha256sum "$launcher_state/credential.json" | awk '{print $1}')
launcher_fingerprint=$(printf '%s' 'synthetic-offsite-binding' | sha256sum | awk '{print $1}')
launcher_team=$(printf '%s' 'synthetic-shared-drive' | sha256sum | awk '{print $1}')
launcher_root=$(printf '%s' 'synthetic-shared-drive-root' | sha256sum | awk '{print $1}')
env PATH="$launcher_bin:$PATH" DIIS_W10D_TEST_ROOT="$TMP" LAUNCHER_STATE="$launcher_state" REPO_DIR="$launcher_repo" \
  HOST_LOCK="$launcher_state/deploy.lock" ALLOW_TEST_HOST_LOCK=1 BACKUP_WRITER_LOCK="$launcher_state/writer/backup.lock" \
  ALLOW_TEST_BACKUP_LOCK_PATH=1 TEST_BACKUP_LOCK_HOST_PATH="$launcher_state/writer" \
  TEST_BACKUP_WRITER_LOCK="$launcher_state/writer/backup.lock" \
  EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 EXPECTED_MINIO_VOLUME=docker_minio_data \
  EXPECTED_CANDIDATE_IMAGE="$PG_BACKUP_IMAGE" EXPECTED_CANDIDATE_IMAGE_ID="$PG_BACKUP_IMAGE_ID" \
  SERVICE_ACCOUNT_HOST_FILE="$launcher_state/credential.json" ALLOW_TEST_CREDENTIAL_PATH=1 \
  SERVICE_ACCOUNT_EVIDENCE_OUTPUT="$launcher_state/evidence/service-account.json" \
  EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256="$launcher_principal" \
  EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256="$launcher_project" \
  EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256="$launcher_key" \
  EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256="$launcher_artifact" \
  EXPECTED_OFFSITE_CONFIG_FINGERPRINT="$launcher_fingerprint" \
  EXPECTED_OFFSITE_PROVIDER=google EXPECTED_OFFSITE_ORIGIN=provider-default \
  EXPECTED_TEAM_DRIVE_SHA256="$launcher_team" EXPECTED_ROOT_FOLDER_SHA256="$launcher_root" \
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
  mkdir -m 700 "$state/evidence"
  mkdir -m 750 "$state/writer"
  cp "$launcher_state/credential.json" "$state/credential.json"
  chmod 600 "$state/credential.json"
  env PATH="$launcher_bin:$PATH" DIIS_W10D_TEST_ROOT="$TMP" LAUNCHER_STATE="$state" REPO_DIR="$launcher_repo" \
    HOST_LOCK="$state/deploy.lock" ALLOW_TEST_HOST_LOCK=1 BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    ALLOW_TEST_BACKUP_LOCK_PATH=1 TEST_BACKUP_LOCK_HOST_PATH="$state/writer" \
    TEST_BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    W10D_ATTEMPT_ID=w10d-20260903t120000z-a1b2c3d4 EXPECTED_MINIO_VOLUME=docker_minio_data \
    EXPECTED_CANDIDATE_IMAGE="${LAUNCHER_EXPECTED_IMAGE:-$PG_BACKUP_IMAGE}" \
    EXPECTED_CANDIDATE_IMAGE_ID="${LAUNCHER_EXPECTED_IMAGE_ID:-$PG_BACKUP_IMAGE_ID}" \
    SERVICE_ACCOUNT_HOST_FILE="${LAUNCHER_CREDENTIAL_FILE:-$state/credential.json}" ALLOW_TEST_CREDENTIAL_PATH=1 \
    SERVICE_ACCOUNT_EVIDENCE_OUTPUT="$state/evidence/service-account.json" \
    EXPECTED_SERVICE_ACCOUNT_PRINCIPAL_SHA256="${LAUNCHER_EXPECTED_PRINCIPAL:-$launcher_principal}" \
    EXPECTED_SERVICE_ACCOUNT_PROJECT_SHA256="${LAUNCHER_EXPECTED_PROJECT:-$launcher_project}" \
    EXPECTED_SERVICE_ACCOUNT_KEY_IDENTITY_SHA256="${LAUNCHER_EXPECTED_KEY:-$launcher_key}" \
    EXPECTED_SERVICE_ACCOUNT_ARTIFACT_SHA256="${LAUNCHER_EXPECTED_ARTIFACT:-$launcher_artifact}" \
    EXPECTED_OFFSITE_CONFIG_FINGERPRINT="$launcher_fingerprint" \
    EXPECTED_OFFSITE_PROVIDER="${LAUNCHER_EXPECTED_PROVIDER:-google}" \
    EXPECTED_OFFSITE_ORIGIN="${LAUNCHER_EXPECTED_ORIGIN:-provider-default}" \
    EXPECTED_TEAM_DRIVE_SHA256="$launcher_team" EXPECTED_ROOT_FOLDER_SHA256="$launcher_root" \
    ENV_FILE="$state/env" CANDIDATE_CONFIRMATION=CREATE_ONE_ISOLATED_W10D_BACKUP_CANDIDATE \
    LAUNCHER_PRIMARY_FAIL="${LAUNCHER_PRIMARY_FAIL:-0}" \
    LAUNCHER_CONTAINER_RM_FAIL="${LAUNCHER_CONTAINER_RM_FAIL:-0}" \
    LAUNCHER_VOLUME_RM_FAIL="${LAUNCHER_VOLUME_RM_FAIL:-0}" \
    LAUNCHER_CONTAINER_OBSERVE_FAIL="${LAUNCHER_CONTAINER_OBSERVE_FAIL:-0}" \
    LAUNCHER_VOLUME_OBSERVE_FAIL="${LAUNCHER_VOLUME_OBSERVE_FAIL:-0}" \
    LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL="${LAUNCHER_CONTAINER_PRECREATE_OBSERVE_FAIL:-0}" \
    LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL="${LAUNCHER_VOLUME_PRECREATE_OBSERVE_FAIL:-0}" \
    LAUNCHER_ACTUAL_PROVIDER="${LAUNCHER_ACTUAL_PROVIDER:-}" \
    LAUNCHER_ACTUAL_ORIGIN="${LAUNCHER_ACTUAL_ORIGIN:-}" \
    LAUNCHER_ACTUAL_LOCK_SOURCE="${LAUNCHER_ACTUAL_LOCK_SOURCE:-}" \
    LAUNCHER_ACTUAL_IMAGE_REFERENCE="${LAUNCHER_ACTUAL_IMAGE_REFERENCE:-}" \
    LAUNCHER_ACTUAL_IMAGE_ID="${LAUNCHER_ACTUAL_IMAGE_ID:-}" \
    LAUNCHER_LOCAL_IMAGE_ID="${LAUNCHER_LOCAL_IMAGE_ID:-}" \
    LAUNCHER_EVIDENCE_RM_FAIL="${LAUNCHER_EVIDENCE_RM_FAIL:-0}" \
    LAUNCHER_SIGNAL="${LAUNCHER_SIGNAL:-}" bash "$CANDIDATE_CREATE" \
    >"$state/out" 2>"$state/err"
}
outside_credential=$(mktemp)
cp "$launcher_state/credential.json" "$outside_credential"
chmod 600 "$outside_credential"
state="$TMP/launcher-unconfined-credential"
if LAUNCHER_CREDENTIAL_FILE="$outside_credential" run_launcher_failure "$state"; then
  fail 'candidate accepted credential path outside canonical private test root'
fi
[ ! -e "$state/candidate-was-created" ] && [ ! -e "$state/volume-was-created" ] \
  || fail 'unconfined candidate test path reached runtime mutation'
rm -f "$outside_credential"
pass 'candidate test credential and lock overrides are confined to one private test root'
for identity_case in principal project key artifact; do
  state="$TMP/launcher-wrong-$identity_case"
  wrong=$(printf '%064d' 0)
  case "$identity_case" in
    principal) LAUNCHER_EXPECTED_PRINCIPAL="$wrong" run_launcher_failure "$state" && rc=0 || rc=$? ;;
    project) LAUNCHER_EXPECTED_PROJECT="$wrong" run_launcher_failure "$state" && rc=0 || rc=$? ;;
    key) LAUNCHER_EXPECTED_KEY="$wrong" run_launcher_failure "$state" && rc=0 || rc=$? ;;
    artifact) LAUNCHER_EXPECTED_ARTIFACT="$wrong" run_launcher_failure "$state" && rc=0 || rc=$? ;;
  esac
  [ "$rc" -ne 0 ] || fail "$identity_case credential drift passed candidate preflight"
  [ ! -e "$state/docker.log" ] || ! grep -q 'compose --project-name' "$state/docker.log" \
    || fail "$identity_case credential drift reached Compose mutation"
done
pass 'candidate preflight rejects principal project key and artifact drift before mutation'
state="$TMP/launcher-wrong-local-image-id"
if LAUNCHER_LOCAL_IMAGE_ID="sha256:$(printf '%064d' 0)" run_launcher_failure "$state"; then
  fail 'candidate accepted a local image ID outside the reviewed image binding'
fi
! grep -q 'compose --project-name' "$state/docker.log" \
  || fail 'local image ID drift reached candidate creation'
state="$TMP/launcher-mutable-image-reference"
if LAUNCHER_EXPECTED_IMAGE='registry.invalid/diis-pg-backup:test' run_launcher_failure "$state"; then
  fail 'candidate accepted a mutable tag-only image reference'
fi
[ ! -e "$state/docker.log" ] || fail 'mutable image reference reached Docker observation or mutation'
state="$TMP/launcher-invalid-image-id"
if LAUNCHER_EXPECTED_IMAGE_ID='sha256:not-a-digest' run_launcher_failure "$state"; then
  fail 'candidate accepted a malformed image ID'
fi
[ ! -e "$state/docker.log" ] || fail 'malformed image ID reached Docker observation or mutation'
state="$TMP/launcher-obsolete-base-image"
if LAUNCHER_ACTUAL_IMAGE_REFERENCE='postgres:16.4-alpine3.20@sha256:5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c' \
  run_launcher_failure "$state"; then
  fail 'candidate accepted the obsolete PostgreSQL base image reference'
fi
[ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
  || fail 'obsolete image rejection did not clean candidate resources'
state="$TMP/launcher-wrong-container-image-id"
if LAUNCHER_ACTUAL_IMAGE_ID="sha256:$(printf '%064d' 1)" run_launcher_failure "$state"; then
  fail 'candidate accepted a container image ID outside the reviewed image binding'
fi
[ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
  || fail 'container image ID rejection did not clean candidate resources'
pass 'candidate creation binds one reviewed custom image reference and ID and rejects the obsolete base'
for binding_case in provider origin; do
  state="$TMP/launcher-wrong-$binding_case"
  if [ "$binding_case" = provider ]; then
    LAUNCHER_ACTUAL_PROVIDER=dropbox run_launcher_failure "$state" && rc=0 || rc=$?
  else
    LAUNCHER_ACTUAL_ORIGIN=oauth-user run_launcher_failure "$state" && rc=0 || rc=$?
  fi
  [ "$rc" -ne 0 ] || fail "$binding_case runtime drift passed candidate direct validation"
  [ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
    || fail "$binding_case runtime drift cleanup did not prove absence"
done
pass 'candidate direct validation rejects actual provider or origin drift and cleans partial resources'
state="$TMP/launcher-wrong-lock-source"
if LAUNCHER_ACTUAL_LOCK_SOURCE="$state/wrong-writer" run_launcher_failure "$state"; then
  fail 'candidate wrong lock mount source passed direct validation'
fi
[ ! -e "$state/candidate-created" ] && [ ! -e "$state/volume-created" ] \
  || fail 'candidate wrong lock source cleanup did not prove absence'
pass 'candidate creation binds Compose and actual mount to the canonical writer lock source'
state="$TMP/launcher-evidence-cleanup-fail"
if LAUNCHER_EXPECTED_PRINCIPAL="$(printf '%064d' 0)" LAUNCHER_EVIDENCE_RM_FAIL=1 \
  run_launcher_failure "$state"; then
  fail 'candidate evidence removal failure unexpectedly succeeded'
fi
[ "$(grep -c 'CANDIDATE_CLEANUP_AMBIGUOUS.*retry=prohibited' "$state/err")" = 1 ] \
  || fail 'candidate evidence cleanup failure lacked one ambiguous marker'
find "$state/evidence" -maxdepth 1 -name 'service-account.json.candidate.*' -type f | grep -q . \
  || fail 'candidate evidence removal fault did not retain observable residue'
/usr/bin/rm -f "$state/evidence"/service-account.json.candidate.*
pass 'candidate evidence cleanup proves absence or returns one explicit ambiguous no-retry result'
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
assert_grep "'BACKUP_LOCK_BOOTSTRAP_REQUIRED=1'" "$HANDOFF" 'candidate lock bootstrap binding check is missing'
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
cp "$ROOT/scripts/google-service-account-binding.py" "$handoff_repo/scripts/"
cp "$ROOT/scripts/w10d_completion_validation.py" "$handoff_repo/scripts/"
cat >"$handoff_repo/scripts/docker-container-redacted-manifest.py" <<'PY'
import json
print(json.dumps({'schemaVersion':'test-redacted'}))
PY
cat >"$handoff_repo/scripts/validate-w10d-candidate-acceptance.py" <<'PY'
import pathlib, sys
args=sys.argv[1:]
snapshot=pathlib.Path(args[args.index('--snapshot-dir')+1])
(snapshot/'accepted.json').write_text('{}\n',encoding='utf-8')
(snapshot/'accepted.json').chmod(0o600)
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
      *'/var/lock/diis-backup'*)
        if [ "$name" = smk-pg-backup ] && [ -n "${HANDOFF_LEGACY_LOCK_SOURCE:-}" ]; then
          echo "$HANDOFF_LEGACY_LOCK_SOURCE"
        else
          echo "$HANDOFF_LOCK_PARENT"
        fi
        ;;
      *'/run/diis-secrets/google-service-account.json'*Source*) echo "$SERVICE_ACCOUNT_HOST_FILE" ;;
      *'/run/diis-secrets/google-service-account.json'*RW*) echo false ;;
      *Config.Env*) printf '%s\n' OFFSITE_RETENTION_APPLY=0 BACKUP_BUCKET_CREATION_ALLOWED=0 BACKUP_SCHEDULE_ENABLED=0 BACKUP_LOCK_BOOTSTRAP_REQUIRED=1 \
        "BACKUP_LOCK_DIR=${HANDOFF_LOCK_ENV:-/var/lock/diis-backup/backup.lock}" \
        "OFFSITE_EXPECTED_PROVIDER=${HANDOFF_PROVIDER-google}" \
        "OFFSITE_EXPECTED_ORIGIN=${HANDOFF_ORIGIN-provider-default}" ;;
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
      *'sha256sum /run/diis-secrets/google-service-account.json'*)
        printf '%s  %s\n' "$HANDOFF_CREDENTIAL_SHA" /run/diis-secrets/google-service-account.json ;;
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
  mkdir -m 700 "$state/rollback" "$state/evidence"
  mkdir -m 750 "$state/writer"
  for name in acceptance root manual provenance db object tool; do
    printf '{}\n' >"$state/evidence/$name.json"
    chmod 600 "$state/evidence/$name.json"
  done
  printf '%s\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  20260903T000000Z-7000.dump' \
    >"$state/evidence/manual.sha256"
  chmod 600 "$state/evidence/manual.sha256"
  printf '%s\n' '{"schemaVersion":"diis-backup-tool-evidence-v3","toolVolume":"diis-backup-bin-w10d-20260903t120000z-a1b2c3d4","mcSha256":"01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891","rcloneZipSha256":"7d69057e69385f6514a9684c7eaa424d972096b130284bb34dd967c4ed4f9dad","rcloneArchiveEntry":"rclone-v1.70.3-linux-amd64/rclone","rcloneArchiveEntrySha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","rcloneSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","mcVersion":"RELEASE.2025-08-13T08-35-41Z","rcloneVersion":"v1.70.3"}' \
    >"$state/evidence/tool.json"
  printf '%s\n' '{"type":"service_account","client_email":"synthetic@example.invalid","project_id":"synthetic-project","private_key_id":"synthetic-key","private_key":"synthetic-unusable"}' >"$state/credential.json"
  chmod 600 "$state/credential.json"
  python3 "$ROOT/scripts/google-service-account-binding.py" "$state/credential.json" \
    --expected-path "$state/credential.json" --expected-owner-uid "$(id -u)" \
    >"$state/evidence/service-account.json"
  chmod 600 "$state/evidence/service-account.json"
}
run_handoff() {
  local state=$1 fail_at=${2:-0} hold_at=${3:-0}
  local acceptance_sha
  acceptance_sha=$(sha256sum "$state/evidence/acceptance.json" | awk '{print $1}')
  env PATH="$handoff_bin:$PATH" DIIS_W10D_TEST_ROOT="$TMP" HANDOFF_STATE="$state" HANDOFF_FAIL_AT="$fail_at" \
    HANDOFF_HOLD_AT="$hold_at" HANDOFF_SIGNAL="${HANDOFF_SIGNAL:-}" \
    HANDOFF_RCLONE_SHA="${HANDOFF_RCLONE_SHA:-}" \
    HANDOFF_RCLONE_VERSION="${HANDOFF_RCLONE_VERSION:-}" \
    HANDOFF_PROVIDER="${HANDOFF_PROVIDER-google}" HANDOFF_ORIGIN="${HANDOFF_ORIGIN-provider-default}" \
    HANDOFF_LEGACY_LOCK_SOURCE="${HANDOFF_LEGACY_LOCK_SOURCE:-}" \
    HANDOFF_LOCK_ENV="${HANDOFF_LOCK_ENV:-}" \
    HANDOFF_CREDENTIAL_SHA="$(sha256sum "$state/credential.json" | awk '{print $1}')" \
    HANDOFF_LOCK_PARENT="$state/writer" REPO_DIR="$handoff_repo" \
    HOST_LOCK="$state/deploy.lock" ALLOW_TEST_HOST_LOCK=1 BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    ALLOW_TEST_BACKUP_LOCK_PATH=1 TEST_BACKUP_LOCK_HOST_PATH="$state/writer" \
    TEST_BACKUP_WRITER_LOCK="$state/writer/backup.lock" \
    LEGACY_HOLD_NAME=smk-pg-backup-legacy-hold ROLLBACK_DIR="$state/rollback" \
    HANDOFF_CONFIRMATION=HANDOFF_EXACT_W10D_BACKUP_SCHEDULER_ONCE \
    EXPECTED_CANDIDATE_IMAGE='postgres:16@sha256:8888888888888888888888888888888888888888888888888888888888888888' \
    EXPECTED_CANDIDATE_IMAGE_ID='sha256:9999999999999999999999999999999999999999999999999999999999999999' \
    EXPECTED_CANDIDATE_TOOL_VOLUME=diis-backup-bin-w10d-20260903t120000z-a1b2c3d4 \
    EXPECTED_MINIO_VOLUME=docker_minio_data EXPECTED_BACKUP_LOCK_HOST_PATH="$state/writer" \
    EXPECTED_OFFSITE_PROVIDER=google EXPECTED_OFFSITE_ORIGIN=provider-default \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    ACCEPTANCE_BUNDLE="$state/evidence/acceptance.json" \
    EXPECTED_ACCEPTANCE_BUNDLE_SHA256="$acceptance_sha" ROOT_CRON_EVIDENCE="$state/evidence/root.json" \
    MANUAL_BACKUP_MANIFEST="$state/evidence/manual.json" MANUAL_BACKUP_SIDECAR="$state/evidence/manual.sha256" \
    OFFSITE_PROVENANCE="$state/evidence/provenance.json" \
    DB_RESTORE_PROOF="$state/evidence/db.json" OBJECT_RESTORE_PROOF="$state/evidence/object.json" \
    TOOL_EVIDENCE="$state/evidence/tool.json" SERVICE_ACCOUNT_EVIDENCE="$state/evidence/service-account.json" \
    SERVICE_ACCOUNT_HOST_FILE="$state/credential.json" ALLOW_TEST_CREDENTIAL_PATH=1 bash "$HANDOFF"
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
state="$TMP/handoff-inherited-test-control"; init_handoff_state "$state"
if DIIS_ACCEPTANCE_TEST_MODE=1 DIIS_ACCEPTANCE_TEST_PAUSE_MARKER=/tmp/arbitrary-marker \
  run_handoff "$state" >"$state/out" 2>"$state/err"; then
  fail 'handoff accepted inherited acceptance test controls'
fi
[ "$(cat "$state/count")" = 0 ] || fail 'inherited handoff test control reached mutation'
assert_rollback_state "$state"
pass 'handoff rejects inherited acceptance test controls before mutation'
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

for binding_case in provider origin; do
  for binding_value in '' wrong; do
    state="$TMP/handoff-$binding_case-${binding_value:-missing}"; init_handoff_state "$state"
    if [ "$binding_case" = provider ]; then
      HANDOFF_PROVIDER="$binding_value" run_handoff "$state" >"$state/out" 2>"$state/err" && rc=0 || rc=$?
    else
      HANDOFF_ORIGIN="$binding_value" run_handoff "$state" >"$state/out" 2>"$state/err" && rc=0 || rc=$?
    fi
    [ "$rc" -ne 0 ] || fail "$binding_case $binding_value runtime drift passed handoff"
    [ "$(cat "$state/count")" = 0 ] || fail "$binding_case $binding_value reached handoff mutation"
    assert_rollback_state "$state"
  done
done
pass 'handoff rejects missing or wrong provider and origin runtime bindings before mutation'

for lock_case in legacy-source environment; do
  state="$TMP/handoff-lock-$lock_case"; init_handoff_state "$state"
  if [ "$lock_case" = legacy-source ]; then
    HANDOFF_LEGACY_LOCK_SOURCE="$state/wrong-writer" run_handoff "$state" >"$state/out" 2>"$state/err" && rc=0 || rc=$?
  else
    HANDOFF_LOCK_ENV=/wrong/backup.lock run_handoff "$state" >"$state/out" 2>"$state/err" && rc=0 || rc=$?
  fi
  [ "$rc" -ne 0 ] || fail "$lock_case canonical lock drift passed handoff"
  [ "$(cat "$state/count")" = 0 ] || fail "$lock_case canonical lock drift reached mutation"
  assert_rollback_state "$state"
done
pass 'handoff binds legacy and candidate mount and environment to one canonical writer lock identity'

assert_grep '/home/appuser/.local/state/diis-deploy/deploy.lock' "$HOST_LOCK_WRAPPER" \
  'manual build wrapper does not share the deploy lock'
assert_grep 'w10d_bind_host_lock' "$CLEANUP" 'cleanup does not bind the canonical host lock'
assert_grep 'w10d_bind_host_lock' "$CANDIDATE_CREATE" 'candidate does not bind the canonical host lock'
assert_grep 'w10d_bind_host_lock' "$HANDOFF" 'handoff does not bind the canonical host lock'
host_lock_attack="$TMP/arbitrary-host-lock"
if HOST_LOCK="$host_lock_attack" HOST_LOCK_CONFIRMATION=RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK \
  bash "$HOST_LOCK_WRAPPER" true >/dev/null 2>"$TMP/host-lock-attack.err"; then
  fail 'production host-lock wrapper accepted an environment override'
fi
[ ! -e "$host_lock_attack" ] || fail 'rejected host-lock override created arbitrary lock'
test_host_lock="$TMP/test-host-lock"
DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_HOST_LOCK=1 HOST_LOCK="$test_host_lock" \
  HOST_LOCK_CONFIRMATION=RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK \
  bash "$HOST_LOCK_WRAPPER" true >/dev/null \
  || fail 'confined test host-lock override was rejected'
outside_host_lock="$TMP/../outside-host-lock"
if DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_HOST_LOCK=1 HOST_LOCK="$outside_host_lock" \
  HOST_LOCK_CONFIRMATION=RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK \
  bash "$HOST_LOCK_WRAPPER" true >/dev/null 2>"$TMP/outside-host-lock.err"; then
  fail 'test host-lock override escaped the private root'
fi
symlink_target="$TMP/symlink-lock-target"
symlink_parent="$TMP/symlink-lock-parent"
mkdir -m 700 "$symlink_target"
ln -s "$symlink_target" "$symlink_parent"
if DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_HOST_LOCK=1 HOST_LOCK="$symlink_parent/lock" \
  HOST_LOCK_CONFIRMATION=RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK \
  bash "$HOST_LOCK_WRAPPER" true >/dev/null 2>"$TMP/symlink-host-lock.err"; then
  fail 'test host-lock override followed a symlink parent'
fi
if ALLOW_TEST_HOST_LOCK=1 \
  HOST_LOCK_CONFIRMATION=RUN_EXACT_APPROVED_COMMAND_WITH_DIIS_HOST_LOCK \
  bash "$HOST_LOCK_WRAPPER" true >/dev/null 2>"$TMP/inherited-host-lock.err"; then
  fail 'inherited test host-lock control was accepted in production mode'
fi
pass 'production host lock is canonical and test override is private and explicit'

repo="$TMP/repo"
fake="$TMP/bin"
mkdir -p "$repo/scripts" "$repo/infrastructure/docker/scripts" "$fake"
cp "$ROOT/scripts/docker-no-touch-digest.py" "$repo/scripts/"
cp "$ROOT/scripts/production-recovery-readonly-summary.sh" "$repo/scripts/"
cp "$ROOT/scripts/parse-minio-du-observation.py" "$repo/scripts/"
cp "$ROOT/scripts/validate-production-completion-observation.py" "$repo/scripts/"
cp "$ROOT/scripts/bounded-command-capture.py" "$repo/scripts/"
cp "$ROOT/scripts/w10d_completion_validation.py" "$repo/scripts/"
cp "$ROOT/scripts/w10d-test-boundary.sh" "$repo/scripts/"
cp "$ROOT/scripts/parse-buildkit-eligibility.py" "$repo/scripts/"
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
count=$(cat "$CLEANUP_STATE/df-count"); count=$((count + 1)); echo "$count" >"$CLEANUP_STATE/df-count"
echo 'Filesystem 1-blocks Used Available Use% Mounted on'
if [ "${CLEANUP_FAULT:-}" = noop ]; then
  echo 'mock 80000000000 50000000000 30000000000 63% /var/lib/docker'
elif [ "${CLEANUP_FAULT:-}" = locked-noop ] && [ "$count" -gt 1 ]; then
  echo 'mock 80000000000 50000000000 30000000000 63% /var/lib/docker'
elif [ -f "$CLEANUP_STATE/pruned" ]; then
  case "${CLEANUP_FAULT:-}" in
    target-miss) echo 'mock 80000000000 55000000000 25000000000 69% /var/lib/docker' ;;
    percent-miss) echo 'mock 120000000000 94000000000 26000000000 78% /var/lib/docker' ;;
    *) echo 'mock 80000000000 50000000000 30000000000 63% /var/lib/docker' ;;
  esac
else
  echo 'mock 80000000000 66000000000 14000000000 83% /var/lib/docker'
fi
SH
cat >"$fake/docker" <<'SH'
#!/bin/sh
set -eu
case "$1 $2" in
  'ps -aq') echo c1 ;;
  'ps -q') echo c1 ;;
  'ps --filter') : ;;
  'image ls') echo i1 ;;
  'volume ls')
    echo v1
    [ "${CLEANUP_FAULT:-}" = no-touch-drift ] && [ -f "$CLEANUP_STATE/pruned" ] && echo v2
    :
    ;;
  'network ls') echo n1 ;;
  'container inspect')
    printf '%s\n' '[{"Id":"c1","Name":"/app","Image":"i1","Config":{"Env":[],"Labels":{}},"HostConfig":{},"State":{"Status":"running","Running":true},"NetworkSettings":{"Networks":{}},"Mounts":[]}]'
    ;;
  'image inspect') printf '%s\n' '[{"Id":"i1","RepoTags":[],"RepoDigests":[],"Size":1}]' ;;
  'volume inspect')
    if [ "${CLEANUP_FAULT:-}" = no-touch-drift ] && [ -f "$CLEANUP_STATE/pruned" ]; then
      printf '%s\n' '[{"Name":"v1","Driver":"local","Scope":"local"},{"Name":"v2","Driver":"local","Scope":"local"}]'
    else
      printf '[{"Name":"%s","Driver":"local","Scope":"local"}]\n' "$3"
    fi
    ;;
  'network inspect') printf '%s\n' '[{"Name":"n1","Id":"n1","Driver":"bridge","Containers":{}}]' ;;
  'buildx prune')
    count=$(cat "$CLEANUP_STATE/prune-count"); echo $((count + 1)) >"$CLEANUP_STATE/prune-count"
    [ "${CLEANUP_FAULT:-}" != hold ] || sleep 3
    [ "${CLEANUP_FAULT:-}" != fail ] || exit 91
    if [ -n "${CLEANUP_SIGNAL:-}" ]; then kill -s "$CLEANUP_SIGNAL" "$PPID"; sleep 1; fi
    touch "$CLEANUP_STATE/pruned"
    ;;
  'buildx du')
    count=$(cat "$CLEANUP_STATE/du-count"); count=$((count + 1)); echo "$count" >"$CLEANUP_STATE/du-count"
    [ "${CLEANUP_FAULT:-}" != du-fail ] || exit 88
    if [ "${CLEANUP_FAULT:-}" = du-malformed ]; then echo '{'; exit 0; fi
    size=30000000000; id=record-a; shared=false
    [ "${CLEANUP_FAULT:-}" != insufficient ] || size=22507222015
    [ "${CLEANUP_FAULT:-}" != boundary ] || size=22507222016
    [ "${CLEANUP_FAULT:-}" != shared-only ] || shared=true
    if [ "${CLEANUP_FAULT:-}" = du-drift ] && [ "$count" -gt 1 ]; then id=record-b; fi
    if [ "${CLEANUP_FAULT:-}" = mixed-shared-private ]; then
      printf '%s\n' \
        '{"CreatedAt":"2026-09-01T00:00:00Z","Description":"synthetic-private","ID":"record-private","LastUsedAt":"2026-09-01T00:00:00Z","Mutable":false,"Parents":[],"Reclaimable":true,"Shared":false,"Size":"5000000000","Type":"regular","UsageCount":0}' \
        '{"CreatedAt":"2026-09-01T00:00:00Z","Description":"synthetic-shared","ID":"record-shared","LastUsedAt":"2026-09-01T00:00:00Z","Mutable":false,"Parents":[],"Reclaimable":true,"Shared":true,"Size":"30000000000","Type":"regular","UsageCount":0}'
    elif [ "${CLEANUP_FAULT:-}" = duplicate-key ]; then
      printf '{"CreatedAt":"2026-09-01T00:00:00Z","Description":"synthetic","ID":"%s","LastUsedAt":"2026-09-01T00:00:00Z","Mutable":false,"Parents":[],"Reclaimable":true,"Shared":false,"Size":"1","Size":"%s","Type":"regular","UsageCount":0}\n' "$id" "$size"
    else
      printf '{"CreatedAt":"2026-09-01T00:00:00Z","Description":"synthetic","ID":"%s","LastUsedAt":"2026-09-01T00:00:00Z","Mutable":false,"Parents":[],"Reclaimable":true,"Shared":%s,"Size":"%s","Type":"regular","UsageCount":0}\n' "$id" "$shared" "$size"
    fi
    ;;
  'exec smk-postgres')
    case "$*" in *pg_isready*) : ;; *) echo 46 ;; esac
    ;;
  'exec smk-pg-backup')
    [ "${CLEANUP_FAULT:-}" != summary-fail ] || [ ! -f "$CLEANUP_STATE/pruned" ] || exit 87
    if printf '%s' "$*" | grep -q 'du --json'; then
      echo '{"prefix":"synthetic","size":100000,"objects":7,"status":"success","isVersions":false}'
    elif printf '%s' "$*" | grep -q 'exec "$MC" cat "$1"'; then
      last=; for argument in "$@"; do last=$argument; done
      if printf '%s' "$last" | grep -q '\.sha256$'; then
        echo 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  20260903T000000Z-7000.dump'
      else
        users=40
        [ "${CLEANUP_FAULT:-}" != summary-content-drift ] || [ ! -f "$CLEANUP_STATE/pruned" ] || users=41
        printf '%s\n' '{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"20260903T000000Z-7000","class":"daily","protectionState":"none","createdAt":"2026-09-03T00:00:00Z","createdEpoch":1788393600,"dailyKey":"2026-09-03","weeklyKey":"2026-W36","monthlyKey":"2026-09","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","objectStatus":"verified","objectManifestSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","objectCount":1,"tableCount":46,"userCount":USER_VALUE,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}' \
          | sed "s/USER_VALUE/$users/"
      fi
    elif printf '%s' "$*" | grep -q '\*.complete.json'; then
      if [ "${CLEANUP_FAULT:-}" = summary-content-drift ]; then
        echo 'myminio/diis-backup/postgres/20260903T000000Z-7000.complete.json'
      elif [ "${CLEANUP_FAULT:-}" = summary-drift ] && [ -f "$CLEANUP_STATE/pruned" ]; then
        echo 'myminio/diis-backup/postgres/20260903T000000Z-7000.complete.json'
      fi
    else
      if [ "${CLEANUP_FAULT:-}" != summary-drift ] || [ ! -f "$CLEANUP_STATE/pruned" ]; then
        i=1; while [ "$i" -le 7 ]; do echo "myminio/diis-backup/postgres/legacy-$i.sql.gz"; i=$((i+1)); done
      fi
    fi
    ;;
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
if [ "$*" = '-u +%s' ]; then
  count=$(cat "$CLEANUP_STATE/time-count"); count=$((count + 1)); echo "$count" >"$CLEANUP_STATE/time-count"
  case "${CLEANUP_FAULT:-}" in
    window-expired) [ "$count" -eq 1 ] && echo 1788426000 || echo 1788429001 ;;
    schedule-boundary) [ "$count" -eq 1 ] && echo 1788433200 || echo 1788434400 ;;
    *) echo 1788426000 ;;
  esac
else
  exec /usr/bin/date "$@"
fi
SH
cat >"$fake/timeout" <<'SH'
#!/bin/sh
case "${CLEANUP_FAULT:-}:$*" in slow:*'buildx prune'*) exit 124 ;; esac
if [ "${CLEANUP_FAULT:-}" = locked-summary-timeout ] \
  && printf '%s' "$*" | grep -q 'production-recovery-readonly-summary.sh'; then
  count=$(cat "$CLEANUP_STATE/summary-count")
  count=$((count + 1)); echo "$count" >"$CLEANUP_STATE/summary-count"
  [ "$count" -le 1 ] || exit 124
fi
while [ "${1#--}" != "$1" ]; do shift; done
shift
exec "$@"
SH
cat >"$fake/rmdir" <<'SH'
#!/bin/sh
case "${CLEANUP_FAULT:-}:$*" in lock-release:*backup-writer.lock*) exit 1 ;; esac
exec /usr/bin/rmdir "$@"
SH
chmod +x "$fake/date" "$fake/timeout" "$fake/rmdir"

run_cleanup() {
  mkdir -p "$TMP/cleanup-state"
  rm -rf "$TMP/backup-writer.lock"
  rm -f "$TMP/cleanup-state/pruned"
  echo 0 >"$TMP/cleanup-state/prune-count"
  echo 0 >"$TMP/cleanup-state/du-count"
  echo 0 >"$TMP/cleanup-state/time-count"
  echo 0 >"$TMP/cleanup-state/df-count"
  echo 0 >"$TMP/cleanup-state/summary-count"
  if [ "${CLEANUP_FAULT:-}" = schedule-boundary ]; then
    window_start=1788433190; window_end=1788436790
  else
    window_start=1788425990; window_end=1788429000
  fi
  env PATH="$fake:$PATH" DIIS_W10D_TEST_ROOT="$TMP" CLEANUP_STATE="$TMP/cleanup-state" REPO_DIR="$repo" HOST_LOCK="$TMP/deploy.lock" ALLOW_TEST_HOST_LOCK=1 \
    EXPECTED_MAIN_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    EXPECTED_MAIN_TREE=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    CLEANUP_CONFIRMATION=PRUNE_EXACT_BUILDKIT_CACHE_WITH_SHARED_HOST_LOCK \
    BACKUP_WRITER_LOCK="$TMP/backup-writer.lock" CLEANUP_FAULT="${CLEANUP_FAULT:-}" \
    ALLOW_TEST_BACKUP_LOCK_PATH=1 TEST_BACKUP_WRITER_LOCK="$TMP/backup-writer.lock" \
    CLEANUP_SIGNAL="${CLEANUP_SIGNAL:-}" \
    APPROVED_WINDOW_START_EPOCH="$window_start" \
    APPROVED_WINDOW_END_EPOCH="$window_end" \
    bash "$CLEANUP"
}

run_cleanup >"$TMP/cleanup-success.out" 2>"$TMP/cleanup-success.err" \
  || { cat "$TMP/cleanup-success.err" >&2; fail 'bounded cleanup success path failed'; }
assert_grep 'CLEANUP_OK' "$TMP/cleanup-success.out" 'cleanup success marker missing'
pass 'cleanup holds shared lock and preserves no-touch digests on success'

CLEANUP_FAULT=noop run_cleanup >"$TMP/cleanup-noop.out" 2>"$TMP/cleanup-noop.err" \
  || fail 'already-at-target no-op failed'
assert_grep 'CLEANUP_NOOP.*targetAlreadyMet=1' "$TMP/cleanup-noop.out" 'cleanup no-op proof missing'
[ "$(cat "$TMP/cleanup-state/prune-count")" = 0 ] || fail 'no-op invoked prune'
CLEANUP_FAULT=locked-noop run_cleanup >"$TMP/cleanup-locked-noop.out" 2>"$TMP/cleanup-locked-noop.err" \
  || fail 'locked second no-op failed'
assert_grep 'CLEANUP_NOOP.*targetAlreadyMet=1.*lockedRecheck=1' "$TMP/cleanup-locked-noop.out" \
  'locked second no-op proof missing'
[ "$(cat "$TMP/cleanup-state/prune-count")" = 0 ] || fail 'locked second no-op invoked prune'
[ "$(cat "$TMP/cleanup-state/du-count")" = 1 ] || fail 'locked second no-op captured locked eligibility'
for case_name in insufficient shared-only mixed-shared-private duplicate-key du-fail du-malformed du-drift \
  window-expired schedule-boundary locked-summary-timeout; do
  if CLEANUP_FAULT="$case_name" run_cleanup >"$TMP/cleanup-$case_name.out" 2>"$TMP/cleanup-$case_name.err"; then
    fail "$case_name pre-prune failure unexpectedly succeeded"
  fi
  [ "$(cat "$TMP/cleanup-state/prune-count")" = 0 ] || fail "$case_name reached prune"
  ! grep -q PARTIAL_IRREVERSIBLE "$TMP/cleanup-$case_name.err" || fail "$case_name falsely classified irreversible"
  [ ! -d "$TMP/backup-writer.lock" ] || fail "$case_name leaked backup writer lock"
done
CLEANUP_FAULT=boundary run_cleanup >"$TMP/cleanup-boundary.out" 2>"$TMP/cleanup-boundary.err" \
  || fail 'exact eligibility margin boundary failed'
pass 'cleanup no-op eligibility threshold parser failure and locked drift fail before prune'

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

for pair in 'fail:prune-failed' 'target-miss:target-not-reached' 'percent-miss:percent-not-reached' \
  'summary-fail:observability-failed' 'summary-drift:no-touch-drift' \
  'summary-content-drift:no-touch-drift' 'no-touch-drift:no-touch-drift' \
  'lock-release:lock-release-failed'; do
  fault=${pair%%:*}; reason=${pair#*:}
  if CLEANUP_FAULT="$fault" run_cleanup >"$TMP/cleanup-$fault.out" 2>"$TMP/cleanup-$fault.err"; then
    fail "$fault post-prune failure unexpectedly succeeded"
  fi
  [ "$(grep -c "PARTIAL_IRREVERSIBLE reason=$reason no_retry=1" "$TMP/cleanup-$fault.err")" = 1 ] \
    || fail "$fault did not emit exactly one stable irreversible marker"
  ! grep -q CLEANUP_OK "$TMP/cleanup-$fault.out" || fail "$fault emitted success marker"
done
for signal_name in HUP INT TERM; do
  if CLEANUP_SIGNAL="$signal_name" run_cleanup >"$TMP/cleanup-signal-$signal_name.out" 2>"$TMP/cleanup-signal-$signal_name.err"; then
    fail "$signal_name cleanup unexpectedly succeeded"
  fi
  [ "$(grep -c 'PARTIAL_IRREVERSIBLE reason=signal no_retry=1' "$TMP/cleanup-signal-$signal_name.err")" = 1 ] \
    || fail "$signal_name did not emit exact signal classification"
done
pass 'every modeled post-prune failure and signal is partial irreversible with no retry'

assert_grep 'docker buildx prune' "$CLEANUP" 'exact buildx prune command missing'
assert_grep 'timeout --signal=TERM --kill-after=30s' "$CLEANUP" 'external wall-clock bound missing'
assert_grep '--timeout 2m' "$CLEANUP" 'builder-status timeout missing'
assert_grep '^BUILDKIT_FILTER_AGE=until=1h$' "$CLEANUP" 'age filter binding missing'
assert_grep '^BUILDKIT_FILTER_INUSE=inuse=false$' "$CLEANUP" 'in-use filter binding missing'
assert_grep '^BUILDKIT_FILTER_PRIVATE=private=true$' "$CLEANUP" 'private-only filter binding missing'
assert_grep '--filter "\$BUILDKIT_FILTER_AGE"' "$CLEANUP" 'age filter invocation missing'
assert_grep '--filter "\$BUILDKIT_FILTER_INUSE"' "$CLEANUP" 'in-use filter invocation missing'
assert_grep '--filter "\$BUILDKIT_FILTER_PRIVATE"' "$CLEANUP" 'private-only filter invocation missing'
assert_grep '--min-free-space' "$CLEANUP" 'free-space target missing'
assert_grep '--reserved-space' "$CLEANUP" 'cache reserve missing'
if grep -Eq 'docker (system|image|volume|network|container) prune|buildx prune.*(--all|-a)' "$CLEANUP"; then
  fail 'broad cleanup command found'
fi
pass 'cleanup command remains build-cache-only and explicitly bounded'

printf '1..%s\n' "$PASSED"

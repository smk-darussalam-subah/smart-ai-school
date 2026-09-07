#!/usr/bin/env bash

set -Eeuo pipefail
export PYTHONDONTWRITEBYTECODE=1
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
BUILDKIT="$ROOT/scripts/parse-buildkit-eligibility.py"
GOOGLE="$ROOT/scripts/google-service-account-binding.py"
SUMMARY="$ROOT/scripts/production-recovery-readonly-summary.sh"
CAPTURE="$ROOT/scripts/bounded-command-capture.py"
INSTALLER="$ROOT/infrastructure/deploy/install-w10d-backup-lock-bootstrap.sh"
RULE="$ROOT/infrastructure/systemd/diis-backup-lock.conf"
LIB="$ROOT/infrastructure/docker/scripts/backup-lib.sh"
COMPOSE="$ROOT/infrastructure/docker/docker-compose.yml"
PG_BACKUP_DOCKERFILE="$ROOT/infrastructure/docker/pg-backup.Dockerfile"
CANDIDATE_CREATE="$ROOT/infrastructure/deploy/create-w10d-backup-candidate.sh"
OBJECT_RESTORE="$ROOT/infrastructure/docker/scripts/restore-objects.sh"
OBJECT_TARGET_PREPARE="$ROOT/scripts/prepare-object-restore-target.sh"
OBJECT_TARGET_CLEANUP="$ROOT/scripts/cleanup-object-restore-target.sh"
REDACT="$ROOT/scripts/docker-container-redacted-manifest.py"
TMP=$(mktemp -d)
chmod 700 "$TMP"
PASSED=0
trap 'rm -rf "$TMP"' EXIT HUP INT TERM
pass() { PASSED=$((PASSED + 1)); printf 'ok %d - %s\n' "$PASSED" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
must_reject() { local name=$1; shift; if "$@" >"$TMP/$name.out" 2>"$TMP/$name.err"; then fail "$name accepted"; fi; }

valid_record() {
  printf '%s\n' '{"CreatedAt":"2026-09-01T00:00:00Z","Description":"synthetic","ID":"record-a","LastUsedAt":"2026-09-01T00:00:00Z","Mutable":false,"Parents":[],"Reclaimable":true,"Shared":false,"Size":"4096","Type":"regular","UsageCount":0}'
}
valid_record >"$TMP/du.json"
python3 "$BUILDKIT" "$TMP/du.json" --reserved-bytes 1024 >"$TMP/du-proof.json" \
  || fail 'valid BuildKit input rejected'
python3 - "$TMP/du-proof.json" <<'PY' || fail 'BuildKit proof invalid'
import json,sys
v=json.load(open(sys.argv[1])); assert v['eligibleRecordCount']==1
assert v['eligiblePrivateBytes']==4096 and v['reservedBytes']==1024
assert v['deletableBytesLowerBound']==3072
assert v['builder']=='default' and v['filters']==['until=1h','inuse=false','private=true']
PY
pass 'BuildKit parser emits exact filtered aggregate only'

for case_name in malformed unknown duplicate-record nonreclaimable shared negative overflow blank; do
  case "$case_name" in
    malformed) printf '{' >"$TMP/$case_name" ;;
    unknown) valid_record | sed 's/}$/,"Unexpected":1}/' >"$TMP/$case_name" ;;
    duplicate-record) { valid_record; valid_record; } >"$TMP/$case_name" ;;
    nonreclaimable) valid_record | sed 's/"Reclaimable":true/"Reclaimable":false/' >"$TMP/$case_name" ;;
    shared) valid_record | sed 's/"Shared":false/"Shared":true/' >"$TMP/$case_name" ;;
    negative) valid_record | sed 's/"Size":"4096"/"Size":"-1"/' >"$TMP/$case_name" ;;
    overflow) valid_record | sed 's/"Size":"4096"/"Size":"9223372036854775808"/' >"$TMP/$case_name" ;;
    blank) : >"$TMP/$case_name" ;;
  esac
  must_reject "du-$case_name" python3 "$BUILDKIT" "$TMP/$case_name" --reserved-bytes 1024
done
for critical in ID Size Reclaimable Shared UsageCount; do
  python3 - "$TMP/du.json" "$TMP/duplicate-$critical" "$critical" <<'PY'
import pathlib,sys
source,target,key=pathlib.Path(sys.argv[1]),pathlib.Path(sys.argv[2]),sys.argv[3]
raw=source.read_text()
first={'ID':'"other"','Size':'"1"','Reclaimable':'false','Shared':'true','UsageCount':'99'}[key]
target.write_text(raw.replace(f'"{key}":',f'"{key}":{first},"{key}":',1))
PY
  must_reject "du-duplicate-$critical" python3 "$BUILDKIT" "$TMP/duplicate-$critical" \
    --reserved-bytes 1024
done
pass 'BuildKit parser rejects malformed unknown duplicate shared noneligible and unsafe records'

credential="$TMP/service-account.json"
write_credential() {
  if (( $# == 0 )); then
    printf '%s\n' '{"type":"service_account","client_email":"synthetic@example.invalid","project_id":"synthetic-project","private_key_id":"synthetic-key","private_key":"synthetic-unusable"}' >"$credential"
  else
    printf '%s\n' "$1" >"$credential"
  fi
  chmod 600 "$credential"
}
write_credential
python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)" \
  >"$TMP/sa-proof.json" || fail 'valid synthetic Service Account rejected'
if grep -Eq 'synthetic@example|synthetic-project|synthetic-key|synthetic-unusable' "$TMP/sa-proof.json"; then
  fail 'Service Account proof exposed raw identity or key material'
fi
pass 'Service Account parser emits only auth mode and identity/artifact hashes'

write_credential '{"type":"authorized_user","client_email":"x","project_id":"x","private_key_id":"x","private_key":"x"}'
must_reject sa-wrong-type python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
write_credential '{"type":"service_account","client_email":"x","project_id":"x","private_key":"x"}'
must_reject sa-missing python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
write_credential '{"type":"service_account","client_email":"x","client_email":"y","project_id":"x","private_key_id":"x","private_key":"x"}'
must_reject sa-duplicate python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
write_credential '{"type":"service_account","client_email":"x","project_id":"x","private_key_id":"x","private_key":"x","client_secret":"forbidden"}'
must_reject sa-forbidden python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
printf '{' >"$credential"; chmod 600 "$credential"
must_reject sa-malformed python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
pass 'Service Account parser rejects wrong type missing duplicate malformed and forbidden auth fields'

write_credential
cp "$credential" "$TMP/credential-target"; chmod 600 "$TMP/credential-target"
ln -s "$TMP/credential-target" "$TMP/credential-link"
must_reject sa-symlink python3 "$GOOGLE" "$TMP/credential-link" --expected-path "$TMP/credential-link" --expected-owner-uid "$(id -u)"
chmod 640 "$credential"
must_reject sa-mode python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)"
chmod 600 "$credential"
must_reject sa-path python3 "$GOOGLE" "$credential" --expected-path "$TMP/wrong-path" --expected-owner-uid "$(id -u)"
cp "$credential" "$TMP/wrong-owner"; chmod 600 "$TMP/wrong-owner"; chown 65534:65534 "$TMP/wrong-owner"
must_reject sa-owner python3 "$GOOGLE" "$TMP/wrong-owner" --expected-path "$TMP/wrong-owner" --expected-owner-uid "$(id -u)"
if grep -R -E 'synthetic-unusable|"private_key"|client_secret.*forbidden' "$TMP"/sa-*.out "$TMP"/sa-*.err >/dev/null 2>&1; then
  fail 'Service Account rejection exposed credential material'
fi
pass 'Service Account parser rejects symlink unsafe mode wrong path or owner without secret output'

write_credential
python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)" >"$TMP/key-a"
write_credential '{"type":"service_account","client_email":"synthetic@example.invalid","project_id":"synthetic-project","private_key_id":"rotated-key","private_key":"synthetic-unusable-rotated"}'
python3 "$GOOGLE" "$credential" --expected-path "$credential" --expected-owner-uid "$(id -u)" >"$TMP/key-b"
cmp -s "$TMP/key-a" "$TMP/key-b" && fail 'key rotation did not change binding proof'
pass 'Service Account key rotation changes reviewed fingerprint evidence'

assert_grep() { grep -Eq -- "$1" "$2" || fail "$3"; }
assert_not_grep() { ! grep -Eq -- "$1" "$2" || fail "$3"; }
assert_grep 'PG_BACKUP_IMAGE:\?reviewed digest-pinned pg-backup image is required' "$COMPOSE" \
  'pg-backup image is not required as an exact digest-bound input'
assert_grep 'bounded-command-capture.py:/scripts/bounded-command-capture.py:ro' "$COMPOSE" \
  'bounded observation helper is not mounted read-only'
assert_grep 'parse-minio-du-observation.py:/scripts/parse-minio-du-observation.py:ro' "$COMPOSE" \
  'strict MinIO aggregate parser is not mounted read-only'
assert_grep 'FROM python:3\.12\.14-alpine3\.24@sha256:78e98729f8fc4099e53cffb3fe59fd15b18dfa4ace8c914dee0cefa5320068eb' \
  "$PG_BACKUP_DOCKERFILE" 'pinned Python runtime base missing'
assert_grep 'FROM postgres:16\.15-alpine3\.24@sha256:075f7ba66bc9b3ce7d6b8b635208ff61cd7cf1a67d71ec530eec5d7ae0cbe571' \
  "$PG_BACKUP_DOCKERFILE" 'pinned PostgreSQL client base missing'
assert_grep 'python3 /scripts/w10d_completion_validation.py --help' "$PG_BACKUP_DOCKERFILE" \
  'build-time validator integration assertion missing'
for postgres_client in pg_dump pg_restore psql pg_isready; do
  assert_grep "${postgres_client} --version" "$PG_BACKUP_DOCKERFILE" \
    "build-time ${postgres_client} executable assertion missing"
done
assert_grep '^W10D_COMPLETION_VALIDATOR_PATH=/scripts/w10d_completion_validation.py$' "$LIB" \
  'library validator path is not canonical'
assert_not_grep 'W10D_COMPLETION_VALIDATOR_PATH=\$\{' "$LIB" \
  'validator path still accepts an environment default'
for helper_binding in \
  "W10D_COMPLETION_VALIDATOR_SHA256:$ROOT/scripts/w10d_completion_validation.py" \
  "W10D_CAPTURE_HELPER_SHA256:$ROOT/scripts/bounded-command-capture.py" \
  "W10D_DU_PARSER_SHA256:$ROOT/scripts/parse-minio-du-observation.py"; do
  helper_name=${helper_binding%%:*}
  helper_path=${helper_binding#*:}
  helper_sha=$(sha256sum "$helper_path" | awk '{print $1}')
  assert_grep "^${helper_name}=${helper_sha}$" "$LIB" \
    "runtime helper digest binding missing for ${helper_name}"
done
validator_manifest="$TMP/validator-manifest.json"
validator_sidecar="$TMP/validator-sidecar.sha256"
printf '{}\n' >"$validator_manifest"
printf 'a %s\n' synthetic.dump >"$validator_sidecar"
chmod 600 "$validator_manifest" "$validator_sidecar"
printf '#!/bin/sh\nexit 0\n' >"$TMP/weak-validator"
chmod 700 "$TMP/weak-validator"
env W10D_COMPLETION_VALIDATOR_PATH="$TMP/weak-validator" sh -c \
  '. "$1"; [ "$W10D_COMPLETION_VALIDATOR_PATH" = /scripts/w10d_completion_validation.py ]' \
  _ "$LIB" || fail 'library accepted an environment-selected validator path'
if env W10D_COMPLETION_VALIDATOR="$TMP/weak-validator" \
  sh -c '. "$1"; validate_completion_manifest "$2" "$3" synthetic.complete.json' _ \
    "$LIB" "$validator_manifest" "$validator_sidecar"; then
  fail 'arbitrary completion validator override was accepted'
fi
if sh -c '. "$1"; W10D_COMPLETION_VALIDATOR_PATH=$4; validate_completion_manifest "$2" "$3" synthetic.complete.json' \
  _ "$LIB" "$validator_manifest" "$validator_sidecar" "$TMP/weak-validator"; then
  fail 'validator byte drift at an internally selected path was accepted'
fi
if env W10D_COMPLETION_VALIDATOR_PATH="$TMP/weak-validator" \
  sh "$ROOT/infrastructure/docker/scripts/backup.sh" \
  >"$TMP/validator-path.out" 2>"$TMP/validator-path.err"; then
  fail 'backup operator accepted an environment-selected validator path'
fi
grep -q '^W10D_RUNTIME_SELECTOR_REJECTED$' "$TMP/validator-path.err" \
  || fail 'backup operator did not reject validator selector before preflight'
pass 'pg-backup runtime, bounded observations, and validator selector are exact-bound'

assert_not_grep '^# syntax=' "$PG_BACKUP_DOCKERFILE" \
  'Dockerfile frontend remains selected by mutable external tag'
assert_grep 'EXPECTED_CANDIDATE_IMAGE=.*required' "$CANDIDATE_CREATE" \
  'candidate launcher does not require the reviewed custom image reference'
assert_grep 'EXPECTED_CANDIDATE_IMAGE_ID=.*required' "$CANDIDATE_CREATE" \
  'candidate launcher does not require the reviewed custom image ID'
assert_grep "container inspect --format '\{\{\.Config.Image\}\}'.*EXPECTED_CANDIDATE_IMAGE" \
  "$CANDIDATE_CREATE" 'candidate launcher does not bind actual image reference'
assert_grep "container inspect --format '\{\{\.Image\}\}'.*EXPECTED_CANDIDATE_IMAGE_ID" \
  "$CANDIDATE_CREATE" 'candidate launcher does not bind actual image ID'
assert_not_grep "EXPECTED_IMAGE='postgres:16\.4-alpine3\.20" "$CANDIDATE_CREATE" \
  'candidate launcher remains hard-coded to obsolete PostgreSQL base image'
for bounded_source in \
  "$ROOT/infrastructure/docker/scripts/restore-objects.sh" \
  "$ROOT/scripts/prepare-object-restore-target.sh" \
  "$ROOT/scripts/cleanup-object-restore-target.sh" \
  "$ROOT/infrastructure/docker/scripts/offsite-replication.sh" \
  "$ROOT/infrastructure/docker/scripts/backup.sh"; do
  assert_not_grep '=[[:space:]]*\$\(rclone lsf|=[[:space:]]*\$\([^)]*RCLONE[^)]* lsf|if[[:space:]]+(rclone|\$RCLONE)[[:space:]]+cat|=[[:space:]]*\$\(rclone cat' \
    "$bounded_source" "active unbounded rclone observation remains in $bounded_source"
done
pass 'candidate image and every active restore-target or release-marker observation are immutable and bounded'

for authority_consumer in "$OBJECT_TARGET_PREPARE" "$OBJECT_RESTORE" "$OBJECT_TARGET_CLEANUP"; do
  assert_grep 'validate_object_target_authority' "$authority_consumer" \
    "canonical object target authority missing from $authority_consumer"
  assert_grep 'SOURCE_CRYPT_CONFIG_FILE' "$authority_consumer" \
    "bounded source crypt observation missing from $authority_consumer"
  assert_grep 'SOURCE_BACKING_CONFIG_FILE' "$authority_consumer" \
    "bounded source backing observation missing from $authority_consumer"
done
assert_grep 'diis-disposable-object-target-v3' "$LIB" 'strict target authority marker v3 missing'
assert_grep 'schemaVersion=diis-object-target-authority-v2' "$LIB" \
  'effective source-backed target authority v2 missing'
assert_grep 'validate_object_source_authority' "$LIB" \
  'effective source config observation is not shared by target authority'
assert_grep 'remote=\$\{effective_crypt_backing\}' "$LIB" \
  'commissioned source fingerprint does not bind the observed crypt backing'
for marker_field in sourceRemote sourceProvider sourceOrigin sourceConfigFingerprint \
  sourceBackingSha256 targetParent target targetRemote targetProvider targetOrigin \
  targetConfigFingerprint authoritySha256; do
  assert_grep "\"$marker_field\"" "$LIB" "target marker does not bind $marker_field"
done
assert_grep 'OBJECT_RESTORE_PROOF_OUTPUT legacy dilarang' "$OBJECT_RESTORE" \
  'arbitrary legacy object proof path remains accepted'
assert_grep 'validate_private_owned_directory.*OBJECT_RESTORE_PROOF_DIR' "$OBJECT_RESTORE" \
  'object proof directory is not canonical private and caller-owned'
assert_grep 'os\.O_EXCL.*os\.O_NOFOLLOW|os\.O_NOFOLLOW.*os\.O_EXCL' "$OBJECT_RESTORE" \
  'object proof candidate is not created exclusive and no-follow'
assert_grep 'ln "\$PROOF_TMP" "\$PROOF_OUTPUT"' "$OBJECT_RESTORE" \
  'object proof final publication is not atomic no-replace'
assert_grep 'phase=pre-publication-evidence retry=prohibited' "$OBJECT_RESTORE" \
  'object proof can be published before private evidence cleanup is proven'
assert_grep 'phase=purge retry=prohibited' "$OBJECT_TARGET_CLEANUP" \
  'standalone purge failure lacks ambiguous no-retry classification'
assert_grep 'phase=purge-boundary retry=prohibited' "$OBJECT_TARGET_CLEANUP" \
  'standalone cleanup signal or late exit after purge can lose no-retry classification'
assert_grep 'phase=absence-proof retry=prohibited' "$OBJECT_TARGET_CLEANUP" \
  'standalone residual target lacks ambiguous no-retry classification'
for success_consumer in "$OBJECT_TARGET_PREPARE" "$OBJECT_TARGET_CLEANUP"; do
  assert_grep 'SUCCESS_PENDING=1' "$success_consumer" \
    "final success is not deferred until local evidence cleanup in $success_consumer"
  assert_grep 'phase=local-evidence retry=prohibited' "$success_consumer" \
    "local evidence cleanup failure is not an explicit no-retry state in $success_consumer"
done
pass 'object target authority proof containment and standalone cleanup ambiguity are source-enforced'

fake="$TMP/summary-bin"; mkdir "$fake"
cat >"$fake/docker" <<'SH'
#!/bin/sh
valid_manifest='{"schemaVersion":"diis-backup-v1","status":"complete","backupId":"20260903T000000Z-7000","class":"daily","protectionState":"none","createdAt":"2026-09-03T00:00:00Z","createdEpoch":1788393600,"dailyKey":"2026-09-03","weeklyKey":"2026-W36","monthlyKey":"2026-09","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bytes":2048,"archiveValidated":true,"offsiteStatus":"complete","offsiteConfigFingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","objectStatus":"verified","objectManifestSha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","objectCount":1,"tableCount":46,"userCount":40,"studentCount":20,"targetTotalBytes":20000000000,"targetFreeBytes":10000000000}'
case "$1 $2" in
  'ps -q') echo c1 ;;
  'ps --filter') : ;;
  'exec smk-postgres')
    [ "${SUMMARY_CASE:-}" != docker-hang ] || { sleep 3; exit 0; }
    case "$*" in *pg_isready*) : ;; *) echo 46 ;; esac
    ;;
  'exec smk-pg-backup')
    if printf '%s' "$*" | grep -q 'du --json'; then
      [ "${SUMMARY_CASE:-legacy}" != failure ] || exit 70
      [ "${SUMMARY_CASE:-legacy}" != malformed-du ] \
        || { echo '{"prefix":"synthetic","size":8000,"objects":7,"status":"success","isVersions":false,"extra":1}'; exit 0; }
      if [ "${SUMMARY_CASE:-legacy}" = zero-du ]; then size=0; else size=8000; fi
      printf '{"prefix":"synthetic","size":%s,"objects":7,"status":"success","isVersions":false}\n' "$size"
    elif printf '%s' "$*" | grep -q 'exec "$MC" cat "$1"'; then
      last=; for argument in "$@"; do last=$argument; done
      if printf '%s' "$last" | grep -q '\.sha256$'; then
        case "${SUMMARY_CASE:-legacy}" in
          read-failure) exit 71 ;;
          partial-valid-sidecar) printf '%s  %s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 20260903T000000Z-7000.dump; exit 71 ;;
          sidecar-timeout) sleep 2 ;;
          checksum-mismatch) printf '%s  %s\n' dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd 20260903T000000Z-7000.dump ;;
          *) printf '%s  %s\n' aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 20260903T000000Z-7000.dump ;;
        esac
      else
        case "${SUMMARY_CASE:-legacy}" in
          read-failure) exit 71 ;;
          oversized-marker) awk 'BEGIN { for (i=0; i<140000; i++) printf "x" }' ;;
          empty-marker) : ;;
          malformed-marker) printf '{' ;;
          missing-field) printf '%s\n' "$valid_manifest" | sed 's/,"studentCount":20//' ;;
          duplicate-field) printf '%s\n' "$valid_manifest" | sed 's/"status":"complete"/"status":"failed","status":"complete"/' ;;
          unknown-field) printf '%s\n' "$valid_manifest" | sed 's/}$/,"unknown":1}/' ;;
          checksum-bad) printf '%s\n' "$valid_manifest" | sed 's/"sha256":"[a-f0-9]*"/"sha256":"bad"/' ;;
          *) printf '%s\n' "$valid_manifest" ;;
        esac
      fi
    elif printf '%s' "$*" | grep -q '\*.complete.json'; then
      case "${SUMMARY_CASE:-legacy}" in
        target|transition|empty-marker|oversized-marker|malformed-marker|missing-field|duplicate-field|unknown-field|checksum-bad|checksum-mismatch|read-failure|partial-valid-sidecar|sidecar-timeout|zero-du)
          echo 'myminio/diis-backup/postgres/20260903T000000Z-7000.complete.json' ;;
        malformed) printf '%s\n' duplicate duplicate ;;
        oversized-inventory) awk 'BEGIN { for (i=0; i<1050000; i++) printf "x"; printf "\n" }' ;;
        failure) exit 70 ;;
      esac
    else
      case "${SUMMARY_CASE:-legacy}" in
        legacy|malformed-du) i=1; while [ "$i" -le 7 ]; do echo "myminio/diis-backup/postgres/legacy-$i.sql.gz"; i=$((i+1)); done ;;
        transition) i=1; while [ "$i" -le 7 ]; do echo "myminio/diis-backup/postgres/legacy-$i.sql.gz"; i=$((i+1)); done ;;
        failure) exit 70 ;;
      esac
    fi ;;
  *) exit 90 ;;
esac
SH
cat >"$fake/curl" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$fake"/*
summary_temp_root="$TMP/summary-temp"
mkdir -m 700 "$summary_temp_root"
for state in legacy target transition; do
  PATH="$fake:$PATH" SUMMARY_CASE="$state" SUMMARY_TEMP_ROOT="$summary_temp_root" \
    ALLOW_TEST_SUMMARY_TEMP_ROOT=1 DIIS_W10D_TEST_ROOT="$TMP" bash "$SUMMARY" >"$TMP/summary-$state" \
    || fail "$state summary rejected"
  [ -z "$(find "$summary_temp_root" -mindepth 1 -print -quit)" ] || fail "$state summary temp residue"
done
grep -q '"backupState":"legacy-observed".*"targetCompletionCount":0.*"legacyDumpCount":7.*"legacyTargetValidity":false' "$TMP/summary-legacy" \
  || fail '7/0 legacy state not represented safely'
for state in empty malformed malformed-du failure empty-marker oversized-marker malformed-marker missing-field \
  duplicate-field unknown-field checksum-bad checksum-mismatch read-failure partial-valid-sidecar \
  sidecar-timeout oversized-inventory zero-du; do
  if PATH="$fake:$PATH" SUMMARY_CASE="$state" SUMMARY_TEMP_ROOT="$summary_temp_root" \
    SUMMARY_CAPTURE_TIMEOUT_SECONDS=1 ALLOW_TEST_SUMMARY_TEMP_ROOT=1 DIIS_W10D_TEST_ROOT="$TMP" \
    bash "$SUMMARY" >"$TMP/summary-$state.out" \
    2>"$TMP/summary-$state.err"; then
    fail "$state summary falsely succeeded"
  fi
  [ ! -s "$TMP/summary-$state.out" ] || fail "$state emitted success JSON before final validation"
  [ -z "$(find "$summary_temp_root" -mindepth 1 -print -quit)" ] || fail "$state summary temp residue"
done
pass 'readonly summary preserves producer status bounds every capture and cleans private temporary state'

descendant_output="$TMP/descendant.out"
descendant_residue="$TMP/descendant-residue"
if DESCENDANT_RESIDUE="$descendant_residue" python3 "$CAPTURE" \
  --output "$descendant_output" --max-bytes 4096 --timeout-seconds 1 -- \
  python3 -c 'import os,subprocess; os.write(1,b"EARLY"); subprocess.Popen(["sh","-c","sleep 2; printf LATE; : >\"$1\"","_",os.environ["DESCENDANT_RESIDUE"]])' \
  ; then
  fail 'capture accepted direct exit before descendant stdout EOF'
fi
[ ! -e "$descendant_output" ] && [ ! -e "$descendant_residue" ] \
  || fail 'failed descendant capture left output or process residue'
if PATH="$fake:$PATH" SUMMARY_CASE=docker-hang SUMMARY_TEMP_ROOT="$summary_temp_root" \
  SUMMARY_CAPTURE_TIMEOUT_SECONDS=1 ALLOW_TEST_SUMMARY_TEMP_ROOT=1 DIIS_W10D_TEST_ROOT="$TMP" \
  bash "$SUMMARY" >"$TMP/summary-docker-hang.out" 2>"$TMP/summary-docker-hang.err"; then
  fail 'Docker health hang escaped summary timeout'
fi
[ ! -s "$TMP/summary-docker-hang.out" ] \
  && [ -z "$(find "$summary_temp_root" -mindepth 1 -print -quit)" ] \
  || fail 'Docker health timeout emitted success or left temporary residue'
pass 'bounded capture waits for EOF and summary bounds Docker health and migration calls'

installer_sha=$(sha256sum "$INSTALLER" | awk '{print $1}')
test_rule="$TMP/diis-backup-lock.conf"
cp "$RULE" "$test_rule"
rule_sha=$(sha256sum "$test_rule" | awk '{print $1}')
owner=$(id -un)
run_installer() {
  env DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX="$1" \
    LOCK_OWNER_NAME="$owner" LOCK_GROUP_NAME="$owner" \
    RULE_SOURCE="$test_rule" EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
    LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP \
    DIIS_TEST_FAULT="${DIIS_TEST_FAULT:-}" \
    DIIS_TEST_HOLD_AFTER_GUARD_SECONDS="${DIIS_TEST_HOLD_AFTER_GUARD_SECONDS:-}" \
    DIIS_TEST_SIGNAL_AFTER_RULE="${DIIS_TEST_SIGNAL_AFTER_RULE:-}" \
    DIIS_TEST_SIGNAL_AFTER_DIRECTORY="${DIIS_TEST_SIGNAL_AFTER_DIRECTORY:-}" bash "$INSTALLER"
}
bootstrap="$TMP/bootstrap"; mkdir -p "$bootstrap/var" "$bootstrap/run/lock"; ln -s ../run/lock "$bootstrap/var/lock"
run_installer "$bootstrap" >/dev/null || fail 'first lock bootstrap failed'
run_installer "$bootstrap" >/dev/null || fail 'idempotent lock bootstrap failed'
rm -rf "$bootstrap/run/lock/diis-backup"
read -r rule_type rule_path rule_mode rule_owner rule_group rule_age rule_argument <"$RULE"
[ "$rule_type:$rule_path:$rule_mode:$rule_owner:$rule_group:$rule_age:$rule_argument" \
  = 'd:/var/lock/diis-backup:0750:appuser:appuser:-:-' ] || fail 'tmpfiles rule contract drifted'
mkdir -m "$rule_mode" "$bootstrap$rule_path"
run_installer "$bootstrap" >/dev/null || fail 'simulated tmpfiles reboot recreation failed verification'
pass 'lock bootstrap is first-install idempotent and reboot-recreatable'

must_reject lock-root-slash env DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX=/ \
  LOCK_OWNER_NAME="$owner" LOCK_GROUP_NAME="$owner" RULE_SOURCE="$test_rule" \
  EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP bash "$INSTALLER"
outside_test_root=$(mktemp -d); chmod 700 "$outside_test_root"
must_reject lock-non-direct-tmp env DIIS_W10D_TEST_ROOT="$outside_test_root/nested" \
  ALLOW_TEST_ROOT=1 ROOT_PREFIX="$bootstrap" LOCK_OWNER_NAME="$owner" LOCK_GROUP_NAME="$owner" \
  RULE_SOURCE="$test_rule" EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP bash "$INSTALLER"
rmdir "$outside_test_root"
must_reject lock-inherited-fault env DIIS_TEST_FAULT=after-rule RULE_SOURCE="$RULE" \
  EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$(sha256sum "$RULE" | awk '{print $1}')" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP bash "$INSTALLER"
pass 'production installer rejects unconfined root and inherited test controls before mutation'

attack="$TMP/attack"; mkdir -p "$attack/var" "$attack/run/lock" "$attack/outside"; ln -s ../run/lock "$attack/var/lock"
ln -s "$attack/outside" "$attack/run/lock/diis-backup"
must_reject lock-symlink run_installer "$attack"
[ ! -e "$attack/outside/touched" ] || fail 'symlink attack touched outside sentinel'
fault="$TMP/fault"; mkdir -p "$fault/var" "$fault/run/lock"; ln -s ../run/lock "$fault/var/lock"
if DIIS_TEST_FAULT=after-directory run_installer "$fault" >"$TMP/lock-fault.out" 2>"$TMP/lock-fault.err"; then
  fail 'partial bootstrap fault accepted'
fi
[ ! -e "$fault/etc/tmpfiles.d/diis-backup-lock.conf" ] && [ ! -e "$fault/run/lock/diis-backup" ] \
  || fail 'lock bootstrap partial failure did not roll back'
for signal_name in HUP INT TERM; do
  signal_root="$TMP/signal-rule-$signal_name"; mkdir -p "$signal_root/var" "$signal_root/run/lock"
  ln -s ../run/lock "$signal_root/var/lock"
  if DIIS_TEST_SIGNAL_AFTER_RULE="$signal_name" run_installer "$signal_root" >/dev/null 2>&1; then
    fail "lock bootstrap accepted $signal_name after rule install"
  fi
  [ ! -e "$signal_root/etc/tmpfiles.d/diis-backup-lock.conf" ] \
    && [ ! -e "$signal_root/run/lock/diis-backup" ] \
    || fail "lock bootstrap $signal_name after rule did not roll back"
done
pass 'lock bootstrap rejects symlink and rolls back partial and signalled install'

drift="$TMP/drift"; mkdir -p "$drift/var" "$drift/run/lock"; ln -s ../run/lock "$drift/var/lock"
must_reject lock-rule-hash env DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX="$drift" LOCK_OWNER_NAME="$owner" \
  LOCK_GROUP_NAME="$owner" RULE_SOURCE="$test_rule" EXPECTED_INSTALLER_SHA256="$installer_sha" \
  EXPECTED_RULE_SHA256="$(printf '%064d' 0)" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP bash "$INSTALLER"
cp "$test_rule" "$TMP/changed-rule"; printf '# drift\n' >>"$TMP/changed-rule"
must_reject lock-changed-source env DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX="$drift" LOCK_OWNER_NAME="$owner" \
  LOCK_GROUP_NAME="$owner" RULE_SOURCE="$TMP/changed-rule" EXPECTED_INSTALLER_SHA256="$installer_sha" \
  EXPECTED_RULE_SHA256="$rule_sha" LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP \
  bash "$INSTALLER"

fake_id="$TMP/fake-id"; mkdir "$fake_id"
cat >"$fake_id/id" <<'SH'
#!/bin/sh
if [ "$1" = -u ] && [ "$#" = 1 ]; then echo 65534; exit 0; fi
exec /usr/bin/id "$@"
SH
chmod +x "$fake_id/id"
must_reject lock-unauthorized env PATH="$fake_id:$PATH" RULE_SOURCE="$RULE" \
  EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP bash "$INSTALLER"

mode_root="$TMP/mode"; mkdir -p "$mode_root/var" "$mode_root/run/lock"; ln -s ../run/lock "$mode_root/var/lock"
run_installer "$mode_root" >/dev/null; chmod 755 "$mode_root/run/lock/diis-backup"
must_reject lock-wrong-mode run_installer "$mode_root"
owner_root="$TMP/owner"; mkdir -p "$owner_root/var" "$owner_root/run/lock"; ln -s ../run/lock "$owner_root/var/lock"
run_installer "$owner_root" >/dev/null
chown 65534:65534 "$owner_root/run/lock/diis-backup"
owner_before=$(stat -c '%a:%u:%g' "$owner_root/run/lock/diis-backup")
must_reject lock-wrong-owner run_installer "$owner_root"
[ "$(stat -c '%a:%u:%g' "$owner_root/run/lock/diis-backup")" = "$owner_before" ] \
  || fail 'existing wrong-owner target was mutated before rejection'

mount_root="$TMP/mount"; mkdir -p "$mount_root/var" "$mount_root/run/lock"; ln -s ../run/lock "$mount_root/var/lock"
run_installer "$mount_root" >/dev/null
mount_before=$(stat -c '%a:%u:%g:%d' "$mount_root/run/lock/diis-backup")
mount_bin="$TMP/mount-bin"; mkdir "$mount_bin"
printf '%s\n' '#!/bin/sh' 'exit 0' >"$mount_bin/mountpoint"; chmod +x "$mount_bin/mountpoint"
must_reject lock-mountpoint env PATH="$mount_bin:$PATH" DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX="$mount_root" \
  LOCK_OWNER_NAME="$owner" LOCK_GROUP_NAME="$owner" RULE_SOURCE="$test_rule" \
  EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
  LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP \
  DIIS_TEST_CHECK_MOUNTPOINT=1 bash "$INSTALLER"
[ "$(stat -c '%a:%u:%g:%d' "$mount_root/run/lock/diis-backup")" = "$mount_before" ] \
  || fail 'existing mountpoint target was mutated before rejection'

race_root="$TMP/race"; mkdir -p "$race_root/var" "$race_root/run/lock"; ln -s ../run/lock "$race_root/var/lock"
DIIS_TEST_HOLD_AFTER_GUARD_SECONDS=2 run_installer "$race_root" >"$TMP/race-first.out" 2>"$TMP/race-first.err" &
race_pid=$!
for _ in $(seq 1 50); do [ -d "$race_root/run/lock/.diis-backup-bootstrap.guard" ] && break; sleep 0.02; done
[ -d "$race_root/run/lock/.diis-backup-bootstrap.guard" ] || fail 'installer guard was not acquired'
must_reject lock-concurrent run_installer "$race_root"
wait "$race_pid" || fail 'guard owner installer failed'
pass 'lock bootstrap rejects drift without mutation and serializes concurrent creators'

dependency_bin="$TMP/dependency-bin"; mkdir "$dependency_bin"
dependency_commands='sha256sum stat readlink install mv rm rmdir mkdir id getent cat awk chown mountpoint dirname sleep'
make_dependency_wrapper() {
  local name=$1 real
  real=$(command -v "$name") || fail "test host lacks dependency $name"
  printf '#!/bin/sh\nexec "%s" "$@"\n' "$real" >"$dependency_bin/$name"
  chmod +x "$dependency_bin/$name"
}
for dependency in $dependency_commands; do make_dependency_wrapper "$dependency"; done
bash_real=$(command -v bash)
for missing_dependency in cat awk chown mountpoint; do
  rm -f "$dependency_bin/$missing_dependency"
  missing_root="$TMP/missing-$missing_dependency"; mkdir -p "$missing_root/var" "$missing_root/run/lock"
  if env PATH="$dependency_bin" DIIS_W10D_TEST_ROOT="$TMP" ALLOW_TEST_ROOT=1 ROOT_PREFIX="$missing_root" \
    LOCK_OWNER_NAME="$owner" LOCK_GROUP_NAME="$owner" RULE_SOURCE="$test_rule" \
    EXPECTED_INSTALLER_SHA256="$installer_sha" EXPECTED_RULE_SHA256="$rule_sha" \
    LOCK_BOOTSTRAP_CONFIRMATION=INSTALL_EXACT_W10D_BACKUP_LOCK_BOOTSTRAP \
    "$bash_real" "$INSTALLER" >"$TMP/missing-$missing_dependency.out" \
    2>"$TMP/missing-$missing_dependency.err"; then
    fail "bootstrap accepted missing dependency $missing_dependency"
  fi
  grep -q 'command-unavailable' "$TMP/missing-$missing_dependency.err" \
    || fail "missing $missing_dependency did not fail in preflight"
  [ ! -e "$missing_root/etc/tmpfiles.d/diis-backup-lock.conf" ] \
    && [ ! -e "$missing_root/run/lock/diis-backup" ] \
    || fail "missing $missing_dependency reached bootstrap mutation"
  make_dependency_wrapper "$missing_dependency"
done
pass 'lock bootstrap preflights every external dependency before first mutation'

required_parent="$TMP/required-parent"
must_reject lock-required-parent env BACKUP_LOCK_BOOTSTRAP_REQUIRED=1 \
  sh -c '. "$1"; acquire_directory_lock "$2/backup.lock"' _ "$LIB" "$required_parent"
[ ! -e "$required_parent" ] || fail 'target lock path was auto-created before H2 bootstrap'
pass 'candidate lock contract refuses to create an unapproved parent'

lock_race="$TMP/lock-race"; mkdir -m 700 "$lock_race"
DIIS_W10D_TEST_ROOT="$TMP" BACKUP_LOCK_TEST_MODE=1 BACKUP_LOCK_TEST_DELAY_AFTER_MKDIR=2 \
  BACKUP_LOCK_TEST_READY_FILE="$lock_race/ready" sh -c \
  '. "$1"; acquire_directory_lock "$2"; release_directory_lock "$2"' _ "$LIB" "$lock_race/backup.lock" \
  >"$TMP/lock-race-first.out" 2>"$TMP/lock-race-first.err" &
lock_race_pid=$!
for _ in $(seq 1 100); do [ -f "$lock_race/ready" ] && break; sleep 0.02; done
[ -f "$lock_race/ready" ] || fail 'delayed lock creator did not reach ownerless boundary'
must_reject lock-ownerless-contender sh -c \
  '. "$1"; acquire_directory_lock "$2"' _ "$LIB" "$lock_race/backup.lock"
wait "$lock_race_pid" || fail 'delayed lock creator lost ownership'
[ ! -e "$lock_race/backup.lock" ] || fail 'delayed lock creator leaked lock'
pass 'directory lock rejects an ownerless contender while the creator publishes ownership'

redact_bin="$TMP/redact-bin"; mkdir "$redact_bin"
cat >"$redact_bin/docker" <<'SH'
#!/bin/sh
if [ "${REDACT_DUPLICATE:-0}" = 1 ]; then
  env='["BACKUP_SCHEDULE_ENABLED=0","BACKUP_SCHEDULE_ENABLED=SYNTHETIC-DO-NOT-EXPOSE"]'
else
  env='["BACKUP_SCHEDULE_ENABLED=0","OFFSITE_EXPECTED_AUTH_MODE=service-account-file","OFFSITE_EXPECTED_PROVIDER=google","OFFSITE_EXPECTED_ORIGIN=provider-default"]'
fi
printf '[{"Id":"%064d","Name":"/synthetic","Image":"sha256:%064d","Config":{"Image":"synthetic@sha256:%064d","Env":%s,"Labels":{}},"HostConfig":{"RestartPolicy":{},"NetworkMode":"none"},"NetworkSettings":{"Networks":{}},"Mounts":[]}]\n' 1 2 3 "$env"
SH
chmod +x "$redact_bin/docker"
PATH="$redact_bin:$PATH" python3 "$REDACT" synthetic >"$TMP/redacted.json" \
  || fail 'valid redacted runtime manifest failed'
grep -q '"schemaVersion":"diis-container-rollback-redacted-v5"' "$TMP/redacted.json" \
  || fail 'redacted runtime schema v5 missing'
grep -q '"BACKUP_SCHEDULE_ENABLED":"0"' "$TMP/redacted.json" \
  || fail 'safe recovery binding was not captured'
grep -q '"OFFSITE_EXPECTED_PROVIDER":"google".*"OFFSITE_EXPECTED_ORIGIN":"provider-default"\|"OFFSITE_EXPECTED_ORIGIN":"provider-default".*"OFFSITE_EXPECTED_PROVIDER":"google"' "$TMP/redacted.json" \
  || fail 'provider and origin recovery bindings were not captured'
if REDACT_DUPLICATE=1 PATH="$redact_bin:$PATH" python3 "$REDACT" synthetic \
  >"$TMP/redacted-duplicate.out" 2>"$TMP/redacted-duplicate.err"; then
  fail 'duplicate runtime environment name was accepted'
fi
if grep -R -q 'SYNTHETIC-DO-NOT-EXPOSE' "$TMP/redacted-duplicate.out" "$TMP/redacted-duplicate.err"; then
  fail 'redacted manifest rejection exposed environment value'
fi
pass 'runtime manifest exposes only safe bindings and rejects duplicate environment names'

printf '1..%s\n' "$PASSED"

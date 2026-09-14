#!/bin/sh

set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "${W10D_COMPLETION_VALIDATOR+x}" ] \
  || [ -n "${W10D_COMPLETION_VALIDATOR_PATH+x}" ] \
  || [ -n "${W10D_CAPTURE_HELPER_PATH+x}" ] \
  || [ -n "${W10D_DU_PARSER_PATH+x}" ]; then
  printf '%s\n' 'W10D_RUNTIME_SELECTOR_REJECTED' >&2
  exit 64
fi
. "${SCRIPT_DIR}/backup-lib.sh"
W10D_COMPLETION_VALIDATOR_PATH="${SCRIPT_DIR}/../../../scripts/w10d_completion_validation.py"
W10D_CAPTURE_HELPER_PATH="${SCRIPT_DIR}/../../../scripts/bounded-command-capture.py"
W10D_DU_PARSER_PATH="${SCRIPT_DIR}/../../../scripts/parse-minio-du-observation.py"

[ "$#" -eq 4 ] || backup_die "usage: restore-objects.sh PROVENANCE COMPLETION_MANIFEST COMPLETION_SIDECAR OBJECT_MANIFEST"
PROVENANCE=$1
COMPLETION_MANIFEST=$2
COMPLETION_SIDECAR=$3
OBJECT_MANIFEST=$4
require_command rclone
require_command base64
require_command mktemp
require_command python3
require_command ln
require_command stat
require_command id
[ -z "${W10D_COMPLETION_VALIDATOR+x}" ] \
  || backup_die "override validator completion dilarang"
require_value OFFSITE_CRYPT_REMOTE
require_value OFFSITE_CONFIG_FINGERPRINT
require_value OFFSITE_EXPECTED_PROVIDER
require_value OFFSITE_EXPECTED_ORIGIN
require_value OBJECT_RESTORE_TARGET
require_value OBJECT_RESTORE_TARGET_PARENT
require_value OBJECT_RESTORE_ATTEMPT_ID
require_value OBJECT_RESTORE_PROOF_DIR
[ -z "${OBJECT_RESTORE_PROOF_OUTPUT+x}" ] \
  || backup_die "OBJECT_RESTORE_PROOF_OUTPUT legacy dilarang; output wajib diturunkan dari backupId"
[ "${OBJECT_RESTORE_CONFIRMATION:-}" = RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET ] \
  || backup_die "konfirmasi restore object disposable tidak cocok"
validate_private_owned_directory "$OBJECT_RESTORE_PROOF_DIR" \
  || backup_die "direktori proof object restore wajib canonical, private 0700, dan dimiliki caller"

VERIFY_DIR=''
VERIFY_FILE=''
TARGET_CONFIG_FILE=''
SOURCE_CRYPT_CONFIG_FILE=''
SOURCE_BACKING_CONFIG_FILE=''
TARGET_MARKER_FILE=''
PROOF_DIR=$OBJECT_RESTORE_PROOF_DIR
PROOF_OUTPUT=''
PROOF_TMP=''
PROOF_TMP_REGISTERED=0
PROOF_TMP_EXPECTED_SHA=''
PROOF_PUBLISH_STARTED=0
PROOF_PUBLISHED=0
TARGET_BEFORE_RAW=''
TARGET_BEFORE_LIST=''
TARGET_AFTER_RAW=''
TARGET_AFTER_LIST=''
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if [ "$code" -ne 0 ] && [ "$PROOF_PUBLISH_STARTED" -eq 1 ] \
    && [ "$PROOF_PUBLISHED" -eq 0 ] && [ -n "$PROOF_OUTPUT" ] \
    && [ -f "$PROOF_OUTPUT" ] && [ ! -L "$PROOF_OUTPUT" ]; then
    proof_final_owned=0
    if [ -n "$PROOF_TMP" ] && [ -f "$PROOF_TMP" ] && [ ! -L "$PROOF_TMP" ] \
      && [ "$PROOF_OUTPUT" -ef "$PROOF_TMP" ]; then
      proof_final_owned=1
    elif [ -n "$PROOF_TMP_EXPECTED_SHA" ] \
      && [ "$(sha256_file "$PROOF_OUTPUT" 2>/dev/null)" = "$PROOF_TMP_EXPECTED_SHA" ]; then
      proof_final_owned=1
    fi
    if [ "$proof_final_owned" -eq 1 ]; then
      rm -f -- "$PROOF_OUTPUT" >/dev/null 2>&1 || cleanup_failed=1
      [ ! -e "$PROOF_OUTPUT" ] && [ ! -L "$PROOF_OUTPUT" ] || cleanup_failed=1
    else
      cleanup_failed=1
    fi
  fi
  if [ "$PROOF_TMP_REGISTERED" -eq 1 ] && [ -n "$PROOF_TMP" ] \
    && { [ -e "$PROOF_TMP" ] || [ -L "$PROOF_TMP" ]; }; then
    if [ -f "$PROOF_TMP" ] && [ ! -L "$PROOF_TMP" ] \
      && [ "$(sha256_file "$PROOF_TMP" 2>/dev/null)" = "$PROOF_TMP_EXPECTED_SHA" ]; then
      rm -f -- "$PROOF_TMP" >/dev/null 2>&1 || cleanup_failed=1
      [ ! -e "$PROOF_TMP" ] && [ ! -L "$PROOF_TMP" ] || cleanup_failed=1
    else
      cleanup_failed=1
    fi
  fi
  for path in "$VERIFY_FILE" "$TARGET_CONFIG_FILE" "$SOURCE_CRYPT_CONFIG_FILE" \
    "$SOURCE_BACKING_CONFIG_FILE" "$TARGET_MARKER_FILE" \
    "$TARGET_BEFORE_RAW" "$TARGET_BEFORE_LIST" "$TARGET_AFTER_RAW" "$TARGET_AFTER_LIST"; do
    [ -n "$path" ] || continue
    rm -f -- "$path" >/dev/null 2>&1 || cleanup_failed=1
    [ ! -e "$path" ] || cleanup_failed=1
  done
  for list_path in "$TARGET_BEFORE_LIST" "$TARGET_AFTER_LIST"; do
    [ -n "$list_path" ] || continue
    for path in "${list_path}.sorted" "${list_path}.unique"; do
      rm -f -- "$path" >/dev/null 2>&1 || cleanup_failed=1
      [ ! -e "$path" ] || cleanup_failed=1
    done
  done
  if [ -n "$VERIFY_DIR" ]; then
    rmdir "$VERIFY_DIR" >/dev/null 2>&1 || cleanup_failed=1
    [ ! -e "$VERIFY_DIR" ] || cleanup_failed=1
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    printf 'OBJECT_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS retry=prohibited\n' >&2
    code=74
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

validate_offsite_object_inputs "$PROVENANCE" "$COMPLETION_MANIFEST" "$OBJECT_MANIFEST" "$COMPLETION_SIDECAR"

expected_manifest_sha=$(json_value objectManifestSha256 "$COMPLETION_MANIFEST")
verify_sha256 "$OBJECT_MANIFEST" "$expected_manifest_sha"
backup_id=$(json_value backupId "$COMPLETION_MANIFEST")
[ "$(json_value offsiteConfigFingerprint "$PROVENANCE")" = "$OFFSITE_CONFIG_FINGERPRINT" ] \
  || backup_die "fingerprint source restore tidak cocok dengan authority approved"
IFS='|' read -r schema manifest_backup_id semantics <"$OBJECT_MANIFEST"
[ "$schema" = diis-object-manifest-v1 ] && [ "$manifest_backup_id" = "$backup_id" ] \
  && [ "$semantics" = exact ] || backup_die "header manifest object tidak cocok"

PROOF_OUTPUT="$PROOF_DIR/${backup_id}.object-restore-proof.json"
PROOF_TMP="$PROOF_DIR/.${backup_id}.object-restore-proof.candidate"
for proof_path in "$PROOF_OUTPUT" "$PROOF_TMP"; do
  [ ! -e "$proof_path" ] && [ ! -L "$proof_path" ] \
    || backup_die "path proof object restore harus belum ada"
done
proof_owner_token=$(python3 -c 'import secrets; print(secrets.token_hex(32))') \
  || backup_die "token ownership candidate proof gagal dibuat"
proof_registration="ownership=${proof_owner_token}"
PROOF_TMP_EXPECTED_SHA=$(printf '%s\n' "$proof_registration" | sha256sum | awk '{print $1}')
PROOF_TMP_REGISTERED=1
python3 - "$PROOF_TMP" "$proof_registration" <<'PY' \
  || backup_die "candidate proof eksklusif gagal dibuat"
import os
import sys


path, registration = sys.argv[1:]
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW
descriptor = os.open(path, flags, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
    stream.write(registration + "\n")
    stream.flush()
    os.fsync(stream.fileno())
PY
[ "$(stat -c '%a:%u' "$PROOF_TMP" 2>/dev/null)" = "600:$(id -u)" ] \
  || backup_die "ownership atau mode candidate proof tidak aman"
[ "$(sha256_file "$PROOF_TMP")" = "$PROOF_TMP_EXPECTED_SHA" ] \
  || backup_die "candidate proof berubah setelah registrasi"

marker=.diis-disposable-restore-target-v3
VERIFY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/diis-object-restore.XXXXXXXX")
chmod 700 "$VERIFY_DIR"
TARGET_CONFIG_FILE="$VERIFY_DIR/target-config.raw"
SOURCE_CRYPT_CONFIG_FILE="$VERIFY_DIR/source-crypt-config.raw"
SOURCE_BACKING_CONFIG_FILE="$VERIFY_DIR/source-backing-config.raw"
TARGET_MARKER_FILE="$VERIFY_DIR/target-marker.json"
validate_object_target_authority "$OBJECT_RESTORE_ATTEMPT_ID" \
  "$OBJECT_RESTORE_TARGET_PARENT" "$OBJECT_RESTORE_TARGET" "$TARGET_CONFIG_FILE" \
  "$SOURCE_CRYPT_CONFIG_FILE" "$SOURCE_BACKING_CONFIG_FILE"
OBJECT_RESTORE_TARGET=$OBJECT_TARGET_CANONICAL_TARGET
TARGET_BEFORE_RAW="$VERIFY_DIR/target-before.raw"
TARGET_BEFORE_LIST="$VERIFY_DIR/target-before.canonical"
w10d_capture_command "$TARGET_BEFORE_RAW" 1048576 rclone lsf "$OBJECT_RESTORE_TARGET" \
  --recursive --files-only \
  || backup_die "target restore object tidak dapat diobservasi"
w10d_canonicalize_inventory "$TARGET_BEFORE_RAW" "$TARGET_BEFORE_LIST"
[ "$(wc -l <"$TARGET_BEFORE_LIST" | tr -d '[:space:]')" = 1 ] \
  && grep -Fqx "$marker" "$TARGET_BEFORE_LIST" \
  || backup_die "target restore object wajib kosong selain marker disposable"
w10d_capture_command "$TARGET_MARKER_FILE" 4096 \
  rclone cat "${OBJECT_RESTORE_TARGET%/}/${marker}" \
  || backup_die "marker authority target restore tidak dapat dibaca"
validate_disposable_target_marker "$TARGET_MARKER_FILE" "$OBJECT_RESTORE_ATTEMPT_ID" \
  || backup_die "marker target restore tidak cocok dengan authority approved"
rm -f -- "$TARGET_BEFORE_RAW" "$TARGET_BEFORE_LIST" \
  || backup_die "inventory awal target restore gagal dibersihkan"
TARGET_BEFORE_RAW=''
TARGET_BEFORE_LIST=''

restored_count=0
line_number=0
while IFS='|' read -r object_sha object_bytes encoded_path; do
  line_number=$((line_number + 1))
  [ "$line_number" -eq 1 ] && continue
  echo "$object_sha" | grep -Eq '^[a-f0-9]{64}$' || backup_die "hash object tidak valid"
  require_uint object_bytes "$object_bytes"
  object_path=$(printf '%s' "$encoded_path" | base64 -d) \
    || backup_die "path object tidak dapat didekode"
  case "$object_path" in ''|/*|*'//'*) backup_die "path object restore tidak aman" ;; esac
  printf '%s' "$object_path" | grep -Eq '(^|/)\.\.?(/|$)' \
    && backup_die "path object restore mengandung dot segment"
  rclone copyto "${OFFSITE_CRYPT_REMOTE%/}/objects/blobs/${object_sha}" \
    "${OBJECT_RESTORE_TARGET%/}/${object_path}" --immutable --no-traverse
  VERIFY_FILE="$VERIFY_DIR/object-${line_number}"
  rclone copyto "${OBJECT_RESTORE_TARGET%/}/${object_path}" "$VERIFY_FILE"
  verify_sha256 "$VERIFY_FILE" "$object_sha"
  [ "$(wc -c <"$VERIFY_FILE" | tr -d '[:space:]')" = "$object_bytes" ] \
    || backup_die "ukuran object hasil restore tidak cocok"
  rm -f -- "$VERIFY_FILE"
  [ ! -e "$VERIFY_FILE" ] || backup_die "plaintext verifikasi object gagal dihapus"
  VERIFY_FILE=''
  restored_count=$((restored_count + 1))
done <"$OBJECT_MANIFEST"

[ "$restored_count" = "$(json_uint objectCount "$COMPLETION_MANIFEST")" ] \
  || backup_die "jumlah object hasil restore tidak cocok"
TARGET_AFTER_RAW="$VERIFY_DIR/target-after.raw"
TARGET_AFTER_LIST="$VERIFY_DIR/target-after.canonical"
if ! w10d_capture_command "$TARGET_AFTER_RAW" 8388608 rclone lsf "$OBJECT_RESTORE_TARGET" \
  --recursive --files-only; then
  printf 'OBJECT_RESTORE_TARGET_OBSERVATION_AMBIGUOUS backupId=%s phase=post-restore retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
if ! (w10d_canonicalize_inventory "$TARGET_AFTER_RAW" "$TARGET_AFTER_LIST"); then
  printf 'OBJECT_RESTORE_TARGET_OBSERVATION_AMBIGUOUS backupId=%s phase=post-parse retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
actual_count=$(awk -v marker="$marker" 'NF && $0 != marker {n++} END {print n+0}' \
  "$TARGET_AFTER_LIST")
[ "$actual_count" = "$restored_count" ] || backup_die "target restore memiliki object tambahan"
rm -f -- "$TARGET_AFTER_RAW" "$TARGET_AFTER_LIST" \
  || backup_die "inventory final target restore gagal dibersihkan"
TARGET_AFTER_RAW=''
TARGET_AFTER_LIST=''

# No success proof may exist while private plaintext/config observations remain.
# Complete and prove local evidence cleanup before entering the publication phase.
if ! rm -f -- "$TARGET_CONFIG_FILE" "$SOURCE_CRYPT_CONFIG_FILE" \
  "$SOURCE_BACKING_CONFIG_FILE" "$TARGET_MARKER_FILE" \
  || [ -e "$TARGET_CONFIG_FILE" ] || [ -e "$SOURCE_CRYPT_CONFIG_FILE" ] \
  || [ -e "$SOURCE_BACKING_CONFIG_FILE" ] || [ -e "$TARGET_MARKER_FILE" ] \
  || ! rmdir "$VERIFY_DIR" || [ -e "$VERIFY_DIR" ]; then
  printf 'OBJECT_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS backupId=%s phase=pre-publication-evidence retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
TARGET_CONFIG_FILE=''
SOURCE_CRYPT_CONFIG_FILE=''
SOURCE_BACKING_CONFIG_FILE=''
TARGET_MARKER_FILE=''
VERIFY_DIR=''

proof_created_epoch=$(date -u +%s) \
  || {
    printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=timestamp retry=prohibited\n' \
      "$backup_id" >&2
    exit 74
  }
if ! python3 - "$PROOF_TMP" "$OFFSITE_PROVENANCE_BACKUP_ID" \
  "$OFFSITE_PROVENANCE_SHA256" "$expected_manifest_sha" "$restored_count" \
  "$proof_created_epoch" <<'PY'
import json
import os
import stat
import sys


path, backup_id, provenance_sha, manifest_sha, object_count, created_epoch = sys.argv[1:]
flags = os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW
descriptor = os.open(path, flags)
metadata = os.fstat(descriptor)
if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid():
    os.close(descriptor)
    raise SystemExit(1)
value = {
    "schemaVersion": "diis-object-restore-proof-v1",
    "status": "success",
    "backupId": backup_id,
    "source": "independent-crypt",
    "sourceProvenanceSha256": provenance_sha,
    "objectManifestSha256": manifest_sha,
    "objectCount": int(object_count),
    "createdEpoch": int(created_epoch),
}
with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
    json.dump(value, stream, separators=(",", ":"))
    stream.write("\n")
    stream.flush()
    os.fsync(stream.fileno())
PY
then
  printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=candidate-write retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
PROOF_TMP_EXPECTED_SHA=$(sha256_file "$PROOF_TMP")
[ "$(stat -c '%a:%u' "$PROOF_TMP" 2>/dev/null)" = "600:$(id -u)" ] \
  || {
    printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=candidate-mode retry=prohibited\n' \
      "$backup_id" >&2
    exit 74
  }
PROOF_PUBLISH_STARTED=1
if ! ln "$PROOF_TMP" "$PROOF_OUTPUT"; then
  printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=exclusive-publish retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
if [ ! -f "$PROOF_OUTPUT" ] || [ -L "$PROOF_OUTPUT" ] \
  || [ "$(stat -c '%a:%u' "$PROOF_OUTPUT" 2>/dev/null)" != "600:$(id -u)" ] \
  || [ "$(sha256_file "$PROOF_OUTPUT" 2>/dev/null)" != "$PROOF_TMP_EXPECTED_SHA" ]; then
  printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=final-verification retry=prohibited\n' \
    "$backup_id" >&2
  exit 74
fi
rm -f -- "$PROOF_TMP" \
  || {
    printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=candidate-cleanup retry=prohibited\n' \
      "$backup_id" >&2
    exit 74
  }
[ ! -e "$PROOF_TMP" ] && [ ! -L "$PROOF_TMP" ] \
  || {
    printf 'OBJECT_RESTORE_PROOF_PUBLICATION_AMBIGUOUS backupId=%s phase=candidate-absence retry=prohibited\n' \
      "$backup_id" >&2
    exit 74
  }
PROOF_PUBLISHED=1
PROOF_TMP_REGISTERED=0
PROOF_TMP=''
printf 'OBJECT_RESTORE_COMPLETE count=%s proofSha256=%s\n' \
  "$restored_count" "$PROOF_TMP_EXPECTED_SHA"

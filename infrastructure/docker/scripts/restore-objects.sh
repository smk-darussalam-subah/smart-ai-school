#!/bin/sh

set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${SCRIPT_DIR}/backup-lib.sh"

[ "$#" -eq 3 ] || backup_die "usage: restore-objects.sh PROVENANCE COMPLETION_MANIFEST OBJECT_MANIFEST"
PROVENANCE=$1
COMPLETION_MANIFEST=$2
OBJECT_MANIFEST=$3
require_command rclone
require_command base64
require_command mktemp
require_value OFFSITE_CRYPT_REMOTE
require_value OBJECT_RESTORE_TARGET
require_value OBJECT_RESTORE_PROOF_OUTPUT
[ "${OBJECT_RESTORE_CONFIRMATION:-}" = RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET ] \
  || backup_die "konfirmasi restore object disposable tidak cocok"
safe_remote_base "$OFFSITE_CRYPT_REMOTE"
safe_remote_base "$OBJECT_RESTORE_TARGET"
[ "$OBJECT_RESTORE_TARGET" != "$OFFSITE_CRYPT_REMOTE" ] \
  || backup_die "target restore tidak boleh remote off-site sumber"
[ -d "$(dirname "$OBJECT_RESTORE_PROOF_OUTPUT")" ] \
  || backup_die "direktori proof object restore tidak tersedia"

VERIFY_DIR=''
VERIFY_FILE=''
PROOF_TMP=''
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  for path in "$VERIFY_FILE" "$PROOF_TMP"; do
    [ -n "$path" ] || continue
    rm -f -- "$path" >/dev/null 2>&1 || cleanup_failed=1
    [ ! -e "$path" ] || cleanup_failed=1
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

validate_offsite_object_inputs "$PROVENANCE" "$COMPLETION_MANIFEST" "$OBJECT_MANIFEST"

validate_completion_manifest "$COMPLETION_MANIFEST" \
  || backup_die "completion manifest restore tidak valid"
expected_manifest_sha=$(json_value objectManifestSha256 "$COMPLETION_MANIFEST")
verify_sha256 "$OBJECT_MANIFEST" "$expected_manifest_sha"
backup_id=$(json_value backupId "$COMPLETION_MANIFEST")
IFS='|' read -r schema manifest_backup_id semantics <"$OBJECT_MANIFEST"
[ "$schema" = diis-object-manifest-v1 ] && [ "$manifest_backup_id" = "$backup_id" ] \
  && [ "$semantics" = exact ] || backup_die "header manifest object tidak cocok"

marker=.diis-disposable-restore-target-v1
target_entries=$(rclone lsf "$OBJECT_RESTORE_TARGET" --recursive --files-only 2>/dev/null) \
  || backup_die "target restore object tidak dapat diobservasi"
[ "$target_entries" = "$marker" ] \
  || backup_die "target restore object wajib kosong selain marker disposable"

VERIFY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/diis-object-restore.XXXXXXXX")
chmod 700 "$VERIFY_DIR"

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
actual_entries=$(rclone lsf "$OBJECT_RESTORE_TARGET" --recursive --files-only) \
  || backup_die "target restore object tidak dapat diobservasi setelah restore"
actual_count=$(printf '%s\n' "$actual_entries" \
  | awk -v marker="$marker" 'NF && $0 != marker {n++} END {print n+0}')
[ "$actual_count" = "$restored_count" ] || backup_die "target restore memiliki object tambahan"

PROOF_TMP="${OBJECT_RESTORE_PROOF_OUTPUT}.candidate.$$"
printf '{"schemaVersion":"diis-object-restore-proof-v1","status":"success","backupId":"%s","source":"independent-crypt","sourceProvenanceSha256":"%s","objectManifestSha256":"%s","objectCount":%s,"createdEpoch":%s}\n' \
  "$OFFSITE_PROVENANCE_BACKUP_ID" "$OFFSITE_PROVENANCE_SHA256" "$expected_manifest_sha" \
  "$restored_count" "$(date -u +%s)" >"$PROOF_TMP"
chmod 600 "$PROOF_TMP"
mv "$PROOF_TMP" "$OBJECT_RESTORE_PROOF_OUTPUT"
PROOF_TMP=''
printf 'OBJECT_RESTORE_COMPLETE count=%s\n' "$restored_count"

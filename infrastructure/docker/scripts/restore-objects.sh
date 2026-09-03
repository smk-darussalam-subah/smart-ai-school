#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${SCRIPT_DIR}/backup-lib.sh"

[ "$#" -eq 2 ] || backup_die "usage: restore-objects.sh COMPLETION_MANIFEST OBJECT_MANIFEST"
COMPLETION_MANIFEST=$1
OBJECT_MANIFEST=$2
require_command rclone
require_command base64
require_value OFFSITE_CRYPT_REMOTE
require_value OBJECT_RESTORE_TARGET
[ "${OBJECT_RESTORE_CONFIRMATION:-}" = RESTORE_EXACT_OBJECT_SET_TO_DISPOSABLE_TARGET ] \
  || backup_die "konfirmasi restore object disposable tidak cocok"
safe_remote_base "$OFFSITE_CRYPT_REMOTE"
safe_remote_base "$OBJECT_RESTORE_TARGET"
[ "$OBJECT_RESTORE_TARGET" != "$OFFSITE_CRYPT_REMOTE" ] \
  || backup_die "target restore tidak boleh remote off-site sumber"

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
  verify_file="${TMPDIR:-/tmp}/diis-object-restore-$$-${line_number}"
  rclone copyto "${OBJECT_RESTORE_TARGET%/}/${object_path}" "$verify_file"
  verify_sha256 "$verify_file" "$object_sha"
  [ "$(wc -c <"$verify_file" | tr -d '[:space:]')" = "$object_bytes" ] \
    || backup_die "ukuran object hasil restore tidak cocok"
  rm -f "$verify_file"
  restored_count=$((restored_count + 1))
done <"$OBJECT_MANIFEST"

[ "$restored_count" = "$(json_uint objectCount "$COMPLETION_MANIFEST")" ] \
  || backup_die "jumlah object hasil restore tidak cocok"
actual_count=$(rclone lsf "$OBJECT_RESTORE_TARGET" --recursive --files-only \
  | grep -Fvx "$marker" | awk 'NF {n++} END {print n+0}')
[ "$actual_count" = "$restored_count" ] || backup_die "target restore memiliki object tambahan"

printf 'OBJECT_RESTORE_COMPLETE count=%s\n' "$restored_count"

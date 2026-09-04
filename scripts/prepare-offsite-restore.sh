#!/bin/sh

set -eu
umask 077

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT/infrastructure/docker/scripts/backup-lib.sh"

[ "$#" -eq 2 ] || backup_die "usage: prepare-offsite-restore.sh BACKUP_ID PRIVATE_EMPTY_DIR"
BACKUP_ID=$1
DEST_DIR=$2

echo "$BACKUP_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9]+$' \
  || backup_die "backupId off-site tidak valid"
case "$DEST_DIR" in /*) ;; *) backup_die "direktori restore wajib absolute" ;; esac
[ -d "$DEST_DIR" ] || backup_die "direktori private restore tidak tersedia"
[ "$(stat -c '%a' "$DEST_DIR")" = 700 ] || backup_die "mode direktori private restore wajib 0700"
[ -z "$(find "$DEST_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ] \
  || backup_die "direktori private restore wajib kosong"

require_command rclone
require_command stat
require_command find
require_command sha256sum
require_command cmp
validate_offsite_config

LOCK_DIR="${DEST_DIR}.lock"
LOCK_ACQUIRED=0
COMMITTED=0
manifest="$DEST_DIR/${BACKUP_ID}.complete.json.candidate"
dump="$DEST_DIR/${BACKUP_ID}.dump.candidate"
sidecar="$DEST_DIR/${BACKUP_ID}.sha256.candidate"
objects="$DEST_DIR/${BACKUP_ID}.objects.tsv.candidate"
final_dump="$DEST_DIR/${BACKUP_ID}.dump"
final_sidecar="$DEST_DIR/${BACKUP_ID}.sha256"
final_manifest="$DEST_DIR/${BACKUP_ID}.complete.json"
final_objects="$DEST_DIR/${BACKUP_ID}.objects.tsv"
provenance="$DEST_DIR/${BACKUP_ID}.offsite-provenance.json"
cleanup() {
  code=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if [ "$COMMITTED" -ne 1 ]; then
    for path in "$dump" "$sidecar" "$manifest" "$objects" "$final_dump" \
      "$final_sidecar" "$final_manifest" "$final_objects" "$provenance"; do
      rm -f -- "$path" >/dev/null 2>&1 || cleanup_failed=1
      [ ! -e "$path" ] || cleanup_failed=1
    done
  fi
  if [ "$LOCK_ACQUIRED" -eq 1 ]; then
    release_directory_lock "$LOCK_DIR" 2>/dev/null || cleanup_failed=1
    [ ! -e "$LOCK_DIR" ] || cleanup_failed=1
  fi
  if [ "$cleanup_failed" -ne 0 ]; then
    printf 'OFFSITE_RESTORE_PLAINTEXT_CLEANUP_AMBIGUOUS backupId=%s retry=prohibited\n' \
      "$BACKUP_ID" >&2
    code=74
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

acquire_directory_lock "$LOCK_DIR"
LOCK_ACQUIRED=1

base=${OFFSITE_CRYPT_REMOTE%/}

rclone copyto "$base/database/manifests/${BACKUP_ID}.complete.json" "$manifest" \
  --immutable --no-traverse
validate_completion_manifest "$manifest" || backup_die "completion off-site tidak valid"
[ "$(json_value backupId "$manifest")" = "$BACKUP_ID" ] \
  || backup_die "backupId completion off-site tidak cocok"
[ "$(json_value offsiteConfigFingerprint "$manifest")" = "$OFFSITE_EFFECTIVE_FINGERPRINT" ] \
  || backup_die "completion berasal dari konfigurasi off-site yang berbeda"

expected_dump_sha=$(json_value sha256 "$manifest")
expected_dump_bytes=$(json_uint bytes "$manifest")
expected_object_sha=$(json_value objectManifestSha256 "$manifest")
expected_object_count=$(json_uint objectCount "$manifest")
require_uint bytes "$expected_dump_bytes"
require_uint objectCount "$expected_object_count"

rclone copyto "$base/database/current/${BACKUP_ID}.dump" "$dump" --immutable --no-traverse
rclone copyto "$base/database/current/${BACKUP_ID}.sha256" "$sidecar" --immutable --no-traverse
rclone copyto "$base/objects/manifests/${BACKUP_ID}.objects.tsv" "$objects" \
  --immutable --no-traverse

verify_sha256 "$dump" "$expected_dump_sha"
[ "$(wc -c <"$dump" | tr -d '[:space:]')" = "$expected_dump_bytes" ] \
  || backup_die "ukuran dump off-site tidak cocok"
[ "$(awk 'NF == 2 {print $1; exit}' "$sidecar")" = "$expected_dump_sha" ] \
  || backup_die "checksum sidecar off-site tidak cocok"
[ "$(awk 'NF == 2 {print $2; exit}' "$sidecar")" = "${BACKUP_ID}.dump" ] \
  || backup_die "nama file sidecar off-site tidak cocok"
verify_sha256 "$objects" "$expected_object_sha"
IFS='|' read -r schema object_backup_id semantics <"$objects"
[ "$schema:$object_backup_id:$semantics" = "diis-object-manifest-v1:${BACKUP_ID}:exact" ] \
  || backup_die "header object manifest off-site tidak cocok"
[ "$(( $(wc -l <"$objects") - 1 ))" = "$expected_object_count" ] \
  || backup_die "jumlah object manifest off-site tidak cocok"

mv "$dump" "$final_dump"
mv "$sidecar" "$final_sidecar"
mv "$manifest" "$final_manifest"
mv "$objects" "$final_objects"
created_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '{"schemaVersion":"diis-offsite-restore-input-v1","backupId":"%s","source":"independent-crypt","offsiteConfigFingerprint":"%s","dumpSha256":"%s","dumpBytes":%s,"objectManifestSha256":"%s","objectCount":%s,"dumpFile":"%s.dump","sidecarFile":"%s.sha256","completionFile":"%s.complete.json","objectManifestFile":"%s.objects.tsv","createdAt":"%s"}\n' \
  "$BACKUP_ID" "$OFFSITE_EFFECTIVE_FINGERPRINT" "$expected_dump_sha" "$expected_dump_bytes" \
  "$expected_object_sha" "$expected_object_count" "$BACKUP_ID" "$BACKUP_ID" "$BACKUP_ID" \
  "$BACKUP_ID" "$created_at" \
  >"$provenance"
chmod 600 "$final_dump" "$final_sidecar" "$final_manifest" "$final_objects" "$provenance"
COMMITTED=1

printf 'OFFSITE_RESTORE_INPUT_READY backupId=%s bytes=%s objects=%s fingerprint=%s\n' \
  "$BACKUP_ID" "$expected_dump_bytes" "$expected_object_count" "$OFFSITE_EFFECTIVE_FINGERPRINT"

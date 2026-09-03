#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${SCRIPT_DIR}/backup-lib.sh"

[ "$#" -eq 2 ] || backup_die "usage: release-prechange-backup.sh BACKUP_ID RECONCILIATION_REF"
BACKUP_ID=$1
RECONCILIATION_REF=$2
echo "$BACKUP_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9]+$' \
  || backup_die "backupId release tidak valid"
echo "$RECONCILIATION_REF" | grep -Eq '^[A-Z0-9][A-Z0-9._/-]{5,79}$' \
  || backup_die "referensi rekonsiliasi tidak valid"
[ "${PRECHANGE_RELEASE_CONFIRMATION:-}" = RELEASE_PROTECTED_PRECHANGE_AFTER_RECONCILIATION ] \
  || backup_die "konfirmasi release protected point tidak cocok"
require_command rclone
require_command cmp
require_value OFFSITE_CRYPT_REMOTE
safe_remote_base "$OFFSITE_CRYPT_REMOTE"

temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/diis-prechange-release.XXXXXX")
cleanup() { rm -rf "$temp_dir"; }
trap cleanup EXIT HUP INT TERM
manifest="$temp_dir/manifest.json"
rclone copyto \
  "${OFFSITE_CRYPT_REMOTE%/}/database/manifests/${BACKUP_ID}.complete.json" "$manifest"
validate_completion_manifest "$manifest" || backup_die "protected completion manifest tidak valid"
[ "$(json_value class "$manifest")" = pre-change ] \
  && [ "$(json_value protectionState "$manifest")" = protected ] \
  || backup_die "backup bukan protected pre-change point"

release="$temp_dir/${BACKUP_ID}.release.json"
released_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
printf '{"schemaVersion":"diis-prechange-release-v1","backupId":"%s","reconciliationRef":"%s","reconciliationStatus":"complete","releasedAt":"%s"}\n' \
  "$BACKUP_ID" "$RECONCILIATION_REF" "$released_at" >"$release"
rclone copyto "$release" \
  "${OFFSITE_CRYPT_REMOTE%/}/database/releases/${BACKUP_ID}.release.json" \
  --immutable --no-traverse
release_copy="$temp_dir/${BACKUP_ID}.release.copy.json"
rclone copyto \
  "${OFFSITE_CRYPT_REMOTE%/}/database/releases/${BACKUP_ID}.release.json" "$release_copy"
cmp -s "$release" "$release_copy" || backup_die "release marker copy-back tidak cocok"
validate_prechange_release "$release_copy" "$BACKUP_ID" \
  || backup_die "release marker hasil upload tidak valid"
printf 'PRECHANGE_RELEASE_RECORDED backupId=%s\n' "$BACKUP_ID"

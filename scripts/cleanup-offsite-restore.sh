#!/bin/sh

set -eu

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[ "$#" -eq 2 ] || die "usage: cleanup-offsite-restore.sh BACKUP_ID PRIVATE_DIR"
BACKUP_ID=$1
DEST_DIR=$2
[ "${OFFSITE_RESTORE_CLEANUP_CONFIRMATION:-}" = DELETE_EXACT_DISPOSABLE_OFFSITE_RESTORE_INPUT ] \
  || die "konfirmasi cleanup exact restore input tidak cocok"
echo "$BACKUP_ID" | grep -Eq '^[0-9]{8}T[0-9]{6}Z-[0-9]+$' || die "backupId tidak valid"
case "$DEST_DIR" in /*) ;; *) die "direktori cleanup wajib absolute" ;; esac
[ -d "$DEST_DIR" ] || die "direktori cleanup tidak tersedia"
[ "$(stat -c '%a' "$DEST_DIR")" = 700 ] || die "mode direktori cleanup wajib 0700"

provenance="$DEST_DIR/${BACKUP_ID}.offsite-provenance.json"
[ -f "$provenance" ] || die "provenance off-site tidak tersedia"
grep -Fq '"schemaVersion":"diis-offsite-restore-input-v1"' "$provenance" \
  || die "schema provenance tidak valid"
grep -Fq "\"backupId\":\"${BACKUP_ID}\"" "$provenance" || die "backupId provenance tidak cocok"
grep -Fq '"source":"independent-crypt"' "$provenance" || die "source provenance tidak cocok"

allowed="${BACKUP_ID}.dump ${BACKUP_ID}.sha256 ${BACKUP_ID}.complete.json ${BACKUP_ID}.objects.tsv ${BACKUP_ID}.offsite-provenance.json"
for path in "$DEST_DIR"/* "$DEST_DIR"/.[!.]* "$DEST_DIR"/..?*; do
  [ -e "$path" ] || continue
  name=$(basename "$path")
  case " $allowed " in *" $name "*) ;; *) die "direktori memiliki entry di luar manifest exact" ;; esac
  [ -f "$path" ] && [ ! -L "$path" ] || die "entry cleanup wajib regular file"
done

rm -f \
  "$DEST_DIR/${BACKUP_ID}.dump" \
  "$DEST_DIR/${BACKUP_ID}.sha256" \
  "$DEST_DIR/${BACKUP_ID}.complete.json" \
  "$DEST_DIR/${BACKUP_ID}.objects.tsv" \
  "$provenance"
rmdir "$DEST_DIR"
[ ! -e "$DEST_DIR" ] || die "absence proof direktori restore gagal"
printf 'OFFSITE_RESTORE_INPUT_REMOVED backupId=%s\n' "$BACKUP_ID"

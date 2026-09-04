#!/usr/bin/env bash

set -Eeuo pipefail

CONTAINER="${PG_BACKUP_CONTAINER:-}"
PROOF_FILE="${RESTORE_PROOF_FILE:-}"
CONFIRMATION="${RESTORE_PROOF_PUBLISH_CONFIRMATION:-}"

die() { echo "[restore-proof] ERROR: $*" >&2; exit 1; }
[[ "$CONFIRMATION" == PUBLISH_PII_SAFE_MONTHLY_RESTORE_PROOF ]] \
  || die 'konfirmasi publish restore proof tidak cocok'
[[ -n "$CONTAINER" ]] || die 'PG_BACKUP_CONTAINER wajib ditentukan eksplisit'
[[ "$CONTAINER" == smk-pg-backup ]] || die 'container backup authoritative tidak cocok'
[[ -n "$PROOF_FILE" && -f "$PROOF_FILE" ]] || die 'RESTORE_PROOF_FILE wajib dan harus ada'
[[ ! -L "$PROOF_FILE" ]] || die 'RESTORE_PROOF_FILE symlink dilarang'
command -v python3 >/dev/null 2>&1 || die 'python3 tidak tersedia'
python3 - "$PROOF_FILE" <<'PY' || die 'restore proof tidak valid atau tidak PII-safe'
import json, re, sys

with open(sys.argv[1], encoding="utf-8") as stream:
    value = json.load(stream)
required = {
    "schemaVersion", "status", "backupId", "source", "sourceProvenanceSha256",
    "dumpSha256", "objectManifestSha256", "createdEpoch",
}
assert isinstance(value, dict) and set(value) == required
assert value["schemaVersion"] == "diis-restore-proof-v2"
assert value["status"] in ("success", "failed")
assert isinstance(value["createdEpoch"], int) and value["createdEpoch"] >= 0
backup_id = str(value["backupId"])
assert backup_id == "unavailable" or re.fullmatch(r"[0-9]{8}T[0-9]{6}Z-[0-9]+", backup_id)
if value["status"] == "success":
    assert value["source"] == "independent-crypt"
    for key in ("sourceProvenanceSha256", "dumpSha256", "objectManifestSha256"):
        assert re.fullmatch(r"[a-f0-9]{64}", str(value[key]))
else:
    assert value["source"] in ("independent-crypt", "unavailable")
    for key in ("sourceProvenanceSha256", "dumpSha256", "objectManifestSha256"):
        assert value[key] == "unavailable" or re.fullmatch(r"[a-f0-9]{64}", str(value[key]))
PY

candidate="/tmp/diis-restore-proof-$$.json"
cleanup() { docker exec "$CONTAINER" rm -f "$candidate" "${candidate}.verify" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker cp "$PROOF_FILE" "${CONTAINER}:${candidate}" >/dev/null
docker exec "$CONTAINER" sh -c \
  '/opt/backup-bin/mc cp --quiet "$1" "myminio/${BACKUP_BUCKET}/postgres/monitor/restore-latest.json" && /opt/backup-bin/mc cp --quiet "myminio/${BACKUP_BUCKET}/postgres/monitor/restore-latest.json" "$2" && cmp -s "$1" "$2"' \
  sh "$candidate" "${candidate}.verify"
echo 'RESTORE_PROOF_PUBLISHED status=verified'

#!/usr/bin/env bash
# =============================================================================
# backup-db.sh — pg_dump -Fc dari container smk-postgres ke host lokal
#
# Target  : /opt/diis-backups/smk_db_YYYYMMDD_HHMM.dump
# Retensi : 14 hari (hapus dump lebih lama otomatis)
# Log     : /opt/diis-backups/backup.log (ukuran + checksum setiap run)
# Rclone  : opsional — set env BACKUP_RCLONE_REMOTE=<remote> untuk sinkronisasi
#            ke remote cloud setelah backup berhasil.
#
# Cron (appuser, WIB = UTC+7):
#   2  19  * * *  /home/appuser/smart-ai-school/scripts/backup-db.sh >> /opt/diis-backups/backup.log 2>&1
#   (19:00 UTC = 02:00 WIB)
#
# CATATAN: JANGAN jalankan sebagai root. Hanya appuser yang boleh menjalankan.
# =============================================================================

set -euo pipefail

# ── Konfigurasi ───────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/opt/diis-backups}"
CONTAINER="${POSTGRES_CONTAINER:-smk-postgres}"
DB_NAME="${POSTGRES_DB:-smk_db}"
DB_USER="${POSTGRES_USER:-smk_admin}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +"%Y%m%d_%H%M")
DUMP_FILE="${BACKUP_DIR}/smk_db_${TIMESTAMP}.dump"
LOG_PREFIX="[backup-db $(date '+%Y-%m-%d %H:%M:%S')]"

# ── Pre-flight check ──────────────────────────────────────────────────────────

mkdir -p "${BACKUP_DIR}"

if ! docker ps --filter "name=^${CONTAINER}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "${LOG_PREFIX} ERROR: Container '${CONTAINER}' tidak berjalan — batalkan backup" >&2
  exit 1
fi

# ── Jalankan pg_dump ─────────────────────────────────────────────────────────

echo "${LOG_PREFIX} Mulai backup ${DB_NAME} → ${DUMP_FILE}"

docker exec "${CONTAINER}" \
  pg_dump \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --no-password \
  --verbose \
  > "${DUMP_FILE}"

# ── Validasi dump tidak kosong ────────────────────────────────────────────────

DUMP_SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")

if [ "${DUMP_SIZE}" -lt 1024 ]; then
  echo "${LOG_PREFIX} ERROR: Dump terlalu kecil (${DUMP_SIZE} bytes) — kemungkinan gagal" >&2
  rm -f "${DUMP_FILE}"
  exit 2
fi

# ── Checksum (SHA-256) ────────────────────────────────────────────────────────

CHECKSUM=$(sha256sum "${DUMP_FILE}" | awk '{print $1}')
HUMAN_SIZE=$(du -sh "${DUMP_FILE}" | awk '{print $1}')

echo "${LOG_PREFIX} OK — file: $(basename ${DUMP_FILE}), ukuran: ${HUMAN_SIZE}, sha256: ${CHECKSUM}"

# ── Retensi lokal — hapus dump lebih lama dari RETENTION_DAYS ────────────────

DELETED=$(find "${BACKUP_DIR}" -maxdepth 1 -name "smk_db_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
if [ "${DELETED}" -gt 0 ]; then
  echo "${LOG_PREFIX} Hapus ${DELETED} dump lama (>${RETENTION_DAYS} hari)"
fi

# ── Rclone ke remote (opsional) ───────────────────────────────────────────────
# Set env BACKUP_RCLONE_REMOTE=diis-backup: untuk mengaktifkan.
# Konfigurasi rclone adalah langkah manual Director (lihat runbook).

if [ -n "${BACKUP_RCLONE_REMOTE:-}" ]; then
  if command -v rclone &>/dev/null; then
    echo "${LOG_PREFIX} Rclone: sinkronisasi ${DUMP_FILE} → ${BACKUP_RCLONE_REMOTE}"
    rclone copy "${DUMP_FILE}" "${BACKUP_RCLONE_REMOTE}" --log-level INFO
    echo "${LOG_PREFIX} Rclone selesai"
  else
    echo "${LOG_PREFIX} WARN: BACKUP_RCLONE_REMOTE di-set tapi rclone tidak ditemukan di PATH — skip"
  fi
else
  echo "${LOG_PREFIX} BACKUP_RCLONE_REMOTE tidak di-set — skip rclone (hanya backup lokal)"
fi

echo "${LOG_PREFIX} Backup selesai"

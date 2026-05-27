#!/bin/sh
# =============================================================================
# Backup PostgreSQL → MinIO Object Storage
# Dipanggil dari cron di service pg-backup
# Schedule: 02:00 WIB (UTC+7) = 19:00 UTC → cron: 0 19 * * *
#
# Dependencies (tersedia di postgres:16-alpine + mc di /opt/backup-bin/mc):
#   - pg_dump    → dump database ke stdout
#   - gzip       → compress ke .sql.gz
#   - mc         → upload ke MinIO + retention cleanup
# =============================================================================

set -e

MC="/opt/backup-bin/mc"
DATE=$(date +%Y-%m-%d_%H-%M)
BACKUP_FILE="/tmp/diis_db_${DATE}.sql.gz"
MINIO_PATH="myminio/${BACKUP_BUCKET:-diis-backup}/postgres/${DATE}.sql.gz"

# Helper untuk log dengan timestamp
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S WIB')] $*"
}

log "=============================================="
log "Backup dimulai"
log "Database : ${POSTGRES_DB:-diis_db} @ ${POSTGRES_HOST:-postgres}"
log "Tujuan   : ${MINIO_PATH}"
log "=============================================="

# --- Langkah 1: Dump database dan compress ---
log "Menjalankan pg_dump..."
pg_dump \
  --host="${POSTGRES_HOST:-postgres}" \
  --username="${POSTGRES_USER:-diis_admin}" \
  --no-password \
  --format=plain \
  --no-acl \
  --no-owner \
  "${POSTGRES_DB:-diis_db}" \
  | gzip > "${BACKUP_FILE}"

SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
log "Dump selesai — ukuran terkompresi: ${SIZE}"

# --- Langkah 2: Upload ke MinIO ---
log "Mengupload ke MinIO..."
${MC} cp --quiet "${BACKUP_FILE}" "${MINIO_PATH}"
log "Upload sukses: ${MINIO_PATH}"

# --- Langkah 3: Hapus file lokal sementara ---
rm -f "${BACKUP_FILE}"
log "File sementara lokal dihapus"

# --- Langkah 4: Retention cleanup ---
RETENTION="${BACKUP_RETENTION_DAYS:-7}"
RETENTION_HOURS=$((RETENTION * 24))
log "Menjalankan retention cleanup (simpan ${RETENTION} hari = ${RETENTION_HOURS}h terakhir)..."

OLD_FILES=$(${MC} find "myminio/${BACKUP_BUCKET:-diis-backup}/postgres/" \
  --older-than "${RETENTION_HOURS}h" \
  --name "*.sql.gz" 2>/dev/null || true)

if [ -n "$OLD_FILES" ]; then
  COUNT=0
  echo "$OLD_FILES" | while read -r obj; do
    if [ -n "$obj" ]; then
      ${MC} rm --quiet "$obj"
      log "Dihapus (retention): $obj"
      COUNT=$((COUNT + 1))
    fi
  done
  log "Retention cleanup selesai"
else
  log "Tidak ada backup lama untuk dihapus"
fi

log "=============================================="
log "Backup selesai OK — $(date '+%Y-%m-%d %H:%M:%S')"
log "=============================================="

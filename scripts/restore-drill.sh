#!/usr/bin/env bash
# =============================================================================
# restore-drill.sh — Drill restore dump terbaru ke DB sementara
#
# Alur:
#   1. Temukan dump terbaru di BACKUP_DIR
#   2. Buat database sementara smk_restore_test
#   3. Restore dump ke database tersebut
#   4. Hitung jumlah tabel per schema + SELECT count(*) 3 tabel kunci
#   5. Cetak laporan
#   6. DROP database uji
#
# Penggunaan:
#   bash scripts/restore-drill.sh
#   # atau dengan dump spesifik:
#   DUMP_FILE=/opt/diis-backups/smk_db_20260613_0230.dump bash scripts/restore-drill.sh
#
# KEBIJAKAN: Drill wajib tiap bulan. Catat hasilnya di logbook atau tiket.
# =============================================================================

set -euo pipefail

# ── Konfigurasi ───────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/opt/diis-backups}"
CONTAINER="${POSTGRES_CONTAINER:-smk-postgres}"
DB_USER="${POSTGRES_USER:-smk_admin}"
RESTORE_DB="smk_restore_test"
LOG_PREFIX="[restore-drill $(date '+%Y-%m-%d %H:%M:%S')]"

# ── Temukan dump terbaru ──────────────────────────────────────────────────────

if [ -n "${DUMP_FILE:-}" ]; then
  if [ ! -f "${DUMP_FILE}" ]; then
    echo "${LOG_PREFIX} ERROR: DUMP_FILE='${DUMP_FILE}' tidak ditemukan" >&2
    exit 1
  fi
  echo "${LOG_PREFIX} Menggunakan dump eksplisit: ${DUMP_FILE}"
else
  DUMP_FILE=$(find "${BACKUP_DIR}" -maxdepth 1 -name "smk_db_*.dump" | sort | tail -1)
  if [ -z "${DUMP_FILE}" ]; then
    echo "${LOG_PREFIX} ERROR: Tidak ada dump ditemukan di ${BACKUP_DIR}" >&2
    exit 1
  fi
  echo "${LOG_PREFIX} Dump terbaru: ${DUMP_FILE}"
fi

DUMP_SIZE=$(du -sh "${DUMP_FILE}" | awk '{print $1}')
CHECKSUM=$(sha256sum "${DUMP_FILE}" | awk '{print $1}')
echo "${LOG_PREFIX} Ukuran: ${DUMP_SIZE}, SHA-256: ${CHECKSUM}"

# ── Pre-flight: cek container ─────────────────────────────────────────────────

if ! docker ps --filter "name=^${CONTAINER}$" --filter "status=running" --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "${LOG_PREFIX} ERROR: Container '${CONTAINER}' tidak berjalan" >&2
  exit 1
fi

# ── Bersihkan sisa drill sebelumnya ──────────────────────────────────────────

docker exec "${CONTAINER}" \
  psql --username="${DB_USER}" --dbname=postgres \
  --command="DROP DATABASE IF EXISTS ${RESTORE_DB};" 2>/dev/null || true

# ── Buat database sementara ───────────────────────────────────────────────────

echo "${LOG_PREFIX} Membuat database sementara: ${RESTORE_DB}"
docker exec "${CONTAINER}" \
  psql --username="${DB_USER}" --dbname=postgres \
  --command="CREATE DATABASE ${RESTORE_DB};"

# ── Restore dump ──────────────────────────────────────────────────────────────

echo "${LOG_PREFIX} Restore dump → ${RESTORE_DB} (mungkin butuh beberapa menit)..."

docker exec -i "${CONTAINER}" \
  pg_restore \
  --username="${DB_USER}" \
  --dbname="${RESTORE_DB}" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  < "${DUMP_FILE}"

echo "${LOG_PREFIX} Restore selesai"

# ── Laporan: jumlah tabel per schema ─────────────────────────────────────────

echo ""
echo "============================================================"
echo "  LAPORAN DRILL RESTORE — $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Dump: $(basename ${DUMP_FILE}) (${DUMP_SIZE})"
echo "============================================================"
echo ""
echo "--- Jumlah Tabel per Schema ---"

docker exec "${CONTAINER}" \
  psql --username="${DB_USER}" --dbname="${RESTORE_DB}" \
  --command="
    SELECT table_schema, count(*) AS jumlah_tabel
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog','information_schema')
    GROUP BY table_schema
    ORDER BY table_schema;
  " \
  --tuples-only --no-align --field-separator='|'

echo ""
echo "--- Row Count Tabel Kunci ---"

docker exec "${CONTAINER}" \
  psql --username="${DB_USER}" --dbname="${RESTORE_DB}" \
  --command="
    SELECT 'auth.users'       AS tabel, count(*) AS jumlah FROM auth.users
    UNION ALL
    SELECT 'student.students' AS tabel, count(*) AS jumlah FROM student.students
    UNION ALL
    SELECT 'audit.audit_log'  AS tabel, count(*) AS jumlah FROM audit.audit_log;
  " \
  --tuples-only --no-align --field-separator='|'

echo ""
echo "============================================================"
echo "  DRILL SELESAI — database sementara akan di-DROP"
echo "============================================================"
echo ""

# ── DROP database uji ─────────────────────────────────────────────────────────

docker exec "${CONTAINER}" \
  psql --username="${DB_USER}" --dbname=postgres \
  --command="DROP DATABASE IF EXISTS ${RESTORE_DB};"

echo "${LOG_PREFIX} Database '${RESTORE_DB}' berhasil di-DROP"
echo "${LOG_PREFIX} Drill sukses"

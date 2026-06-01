#!/bin/sh
# =============================================================================
# Startup script — NestJS API
# Jalankan migration, lalu start server.
# =============================================================================
set -e

echo "🔄 Running database migrations..."
cd /app/packages/database
PRISMA=/app/node_modules/.bin/prisma

# PENTING: Jika migrate deploy gagal → FAIL HARD. JANGAN auto-baseline.
# Auto-baseline (migrate resolve --applied) menyebabkan SQL tidak pernah
# dieksekusi → seluruh skema DIIS tidak terbentuk di DB bersama.
# Lihat insiden: .tasks/INCIDENT-N14-prod-schema-missing.md
if ! $PRISMA migrate deploy; then
  echo ""
  echo "❌ migrate deploy GAGAL — JANGAN auto-baseline (lihat .tasks/INCIDENT-N14-prod-schema-missing.md)."
  echo "   Periksa manual: P3005 (DB bersama)? Riwayat _prisma_migrations?"
  echo "   Jalankan pemulihan terkontrol, bukan baseline membabi buta."
  exit 1
fi

# TODO (N-15 hardening): smoke-test keberadaan tabel domain pasca-deploy
# Contoh: psql "$DATABASE_URL" -c "SELECT 1 FROM auth.users LIMIT 1"
# Jika gagal → exit 1. Tunda: psql mungkin tidak tersedia di image Alpine.

echo "✅ Database migrations OK"
echo "🚀 Starting API server..."
exec node /app/apps/api/dist/main.js

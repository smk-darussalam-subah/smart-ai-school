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

# Smoke-test: verifikasi tabel domain terbentuk pasca migrate deploy.
# Gunakan prisma db execute — psql tidak tersedia di image Alpine.
echo "  Smoke-testing schema domain (auth.users)..."
if ! echo "SELECT 1 FROM auth.users LIMIT 1;" | $PRISMA db execute --stdin --schema=prisma/schema.prisma > /dev/null 2>&1; then
  echo ""
  echo "❌ SMOKE-TEST GAGAL — auth.users tidak ada di database."
  echo "   Skema DIIS tidak terbentuk meskipun migrate deploy sukses."
  echo "   Kemungkinan: migration dibaseline tanpa SQL dieksekusi (shared-DB)."
  echo "   Rujuk insiden + runbook: .tasks/INCIDENT-N14-prod-schema-missing.md"
  echo "   Pemulihan manual: prisma db push --skip-generate --accept-data-loss"
  exit 1
fi

echo "✅ Database migrations + schema OK"
echo "🚀 Starting API server..."
exec node /app/apps/api/dist/main.js

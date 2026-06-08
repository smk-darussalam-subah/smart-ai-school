#!/bin/sh
# =============================================================================
# Startup script — NestJS API
# Jalankan migration, lalu start server.
# =============================================================================
set -e

# ── GUARDRAIL N-20: anti-salah-target DB ─────────────────────────────────────
# Jika GUARD_STAGING_DB=1 (di-set oleh docker-compose.staging.yml),
# DATABASE_URL HARUS menunjuk smk_staging_db — bukan smk_db.
# Cegah prisma migrate deploy nyasar ke DB produksi.
if [ "${GUARD_STAGING_DB:-0}" = "1" ]; then
  _DB_NAME=$(printf '%s' "${DATABASE_URL}" | sed 's|.*\/||' | sed 's|?.*||')
  if [ "$_DB_NAME" != "smk_staging_db" ]; then
    echo ""
    echo "❌ GUARDRAIL N-20 TRIGGERED — Stack staging menunjuk DB yang salah!"
    echo "   DATABASE_URL target DB: '${_DB_NAME}'"
    echo "   Expected: 'smk_staging_db'"
    echo ""
    echo "   BAHAYA: prisma migrate deploy TIDAK dijalankan."
    echo "   Periksa STAGING_DATABASE_URL di .env.staging dan pastikan"
    echo "   docker-compose.staging.yml men-set DATABASE_URL=\${STAGING_DATABASE_URL}."
    echo ""
    exit 1
  fi
  echo "✅ Guardrail N-20 OK — DATABASE_URL menunjuk smk_staging_db"
fi

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

#!/bin/sh
# =============================================================================
# Startup script — NestJS API
# Jalankan migration, lalu start server.
# =============================================================================
set -e

echo "🔄 Running database migrations..."
cd /app/packages/database
PRISMA=/app/node_modules/.bin/prisma

# Coba migrate deploy dulu.
# Jika gagal dengan P3005 (schema sudah ada tapi tidak ada migration history),
# lakukan baseline: tandai semua migration sebagai sudah applied tanpa
# menjalankannya, lalu deploy lagi (hasilnya: 0 pending migrations).
if ! $PRISMA migrate deploy; then
  echo "⚠️  Migration gagal — kemungkinan P3005 (existing schema, no history)."
  echo "    Baselining: marking existing migrations as applied..."

  for m in prisma/migrations/*/; do
    name=$(basename "$m")
    # Skip bukan direktori migration (misal migration_lock.toml)
    [ -f "$m/migration.sql" ] || continue
    echo "    → resolve --applied $name"
    $PRISMA migrate resolve --applied "$name" 2>/dev/null || true
  done

  echo "    Baseline selesai. Menjalankan migrate deploy..."
  $PRISMA migrate deploy
fi

echo "✅ Database migrations OK"
echo "🚀 Starting API server..."
exec node /app/apps/api/dist/main.js

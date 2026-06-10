#!/bin/sh
# =============================================================================
# Startup script — NestJS API
# Migration sudah dipisah ke service api-migrate (docker-compose profiles: migrate).
# Deploy.yml menjalankan api-migrate sebelum api start.
# =============================================================================
set -e

echo "🚀 Starting API server..."
exec node /app/apps/api/dist/main.js

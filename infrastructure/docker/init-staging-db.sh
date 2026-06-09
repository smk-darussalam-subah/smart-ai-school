#!/bin/bash
# =============================================================================
# Init Staging Database — N-20
# Membuat smk_staging_db beserta extensions dan schemas.
# Script ini di-mount ke /docker-entrypoint-initdb.d/02-init-staging-db.sh
# dan HANYA berjalan saat PostgreSQL data directory pertama kali dibuat.
#
# Untuk deployment di VPS yang sudah ada (postgres data sudah ada),
# gunakan service db-init-staging di docker-compose.staging.yml.
# =============================================================================
set -e

echo "[init-staging-db] Membuat smk_staging_db..."

# Buat database staging (idempoten)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE smk_staging_db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smk_staging_db')
    \gexec
EOSQL

# Buat extensions dan schemas di smk_staging_db (idempoten)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "smk_staging_db" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS academic;
    CREATE SCHEMA IF NOT EXISTS student;
    CREATE SCHEMA IF NOT EXISTS teacher;
    CREATE SCHEMA IF NOT EXISTS ppdb;
    CREATE SCHEMA IF NOT EXISTS finance;
    CREATE SCHEMA IF NOT EXISTS media;
    CREATE SCHEMA IF NOT EXISTS notification;
    CREATE SCHEMA IF NOT EXISTS ai_knowledge;
    CREATE SCHEMA IF NOT EXISTS school;
    CREATE SCHEMA IF NOT EXISTS alumni;

    DO \$\$
    BEGIN
      RAISE NOTICE 'smk_staging_db diinisialisasi — extensions + schemas DIIS siap';
    END \$\$;
EOSQL

echo "[init-staging-db] smk_staging_db siap ✓"

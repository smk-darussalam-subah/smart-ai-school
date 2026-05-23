-- =============================================================================
-- Init Database — Smart AI School (SMK Darussalam Subah)
-- Dijalankan otomatis saat PostgreSQL container pertama kali dibuat
-- =============================================================================

-- Aktifkan pgvector extension untuk AI/RAG
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- Untuk full-text search

-- Buat schema terpisah per domain
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS academic;
CREATE SCHEMA IF NOT EXISTS student;
CREATE SCHEMA IF NOT EXISTS teacher;
CREATE SCHEMA IF NOT EXISTS ppdb;
CREATE SCHEMA IF NOT EXISTS finance;
CREATE SCHEMA IF NOT EXISTS media;
CREATE SCHEMA IF NOT EXISTS notification;
CREATE SCHEMA IF NOT EXISTS ai_knowledge;
CREATE SCHEMA IF NOT EXISTS industry;
CREATE SCHEMA IF NOT EXISTS alumni;
CREATE SCHEMA IF NOT EXISTS keycloak;
CREATE SCHEMA IF NOT EXISTS n8n;
CREATE SCHEMA IF NOT EXISTS metabase;

-- Konfirmasi
DO $$
BEGIN
  RAISE NOTICE 'Database SMK Darussalam Subah berhasil diinisialisasi';
  RAISE NOTICE 'Schemas: auth, academic, student, teacher, ppdb, finance, media, notification, ai_knowledge, industry, alumni';
  RAISE NOTICE 'Extensions: vector, uuid-ossp, pg_trgm';
END $$;

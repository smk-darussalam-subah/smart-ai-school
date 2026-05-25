-- =============================================================================
-- Migration: 20260525000001_setup_pgvector
-- Description: Initial schema setup with pgvector extension and all tables
-- =============================================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ─── Schemas ──────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS "auth";
CREATE SCHEMA IF NOT EXISTS "academic";
CREATE SCHEMA IF NOT EXISTS "student";
CREATE SCHEMA IF NOT EXISTS "teacher";
CREATE SCHEMA IF NOT EXISTS "ppdb";
CREATE SCHEMA IF NOT EXISTS "finance";
CREATE SCHEMA IF NOT EXISTS "notification";
CREATE SCHEMA IF NOT EXISTS "ai_knowledge";

-- ─── AUTH SCHEMA ──────────────────────────────────────────────────────────────

-- Enums
CREATE TYPE "auth"."UserRole" AS ENUM (
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'GURU',
  'SISWA',
  'ORANG_TUA',
  'INDUSTRI'
);

-- Users table
CREATE TABLE "auth"."users" (
  "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
  "keycloak_id" UUID        NOT NULL,
  "email"       VARCHAR(255) NOT NULL,
  "full_name"   VARCHAR(255) NOT NULL,
  "phone"       VARCHAR(20),
  "role"        "auth"."UserRole" NOT NULL,
  "is_active"   BOOLEAN     NOT NULL DEFAULT true,
  "avatar_url"  TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "deleted_at"  TIMESTAMP(3),

  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_keycloak_id_key" ON "auth"."users"("keycloak_id");
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- ─── ACADEMIC SCHEMA ──────────────────────────────────────────────────────────

CREATE TABLE "academic"."classes" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"          VARCHAR(50)  NOT NULL,
  "major_code"    VARCHAR(10)  NOT NULL,
  "grade"         INTEGER      NOT NULL,
  "academic_year" VARCHAR(9)   NOT NULL,
  "capacity"      INTEGER      NOT NULL DEFAULT 36,
  "teacher_id"    UUID,
  "is_active"     BOOLEAN      NOT NULL DEFAULT true,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "classes_name_academic_year_key" ON "academic"."classes"("name", "academic_year");

-- ─── TEACHER SCHEMA ───────────────────────────────────────────────────────────

CREATE TABLE "teacher"."teachers" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID         NOT NULL,
  "nip"           VARCHAR(20),
  "is_wali_kelas" BOOLEAN      NOT NULL DEFAULT false,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  "deleted_at"    TIMESTAMP(3),

  CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teachers_user_id_key" ON "teacher"."teachers"("user_id");
CREATE UNIQUE INDEX "teachers_nip_key" ON "teacher"."teachers"("nip");

-- ─── STUDENT SCHEMA ───────────────────────────────────────────────────────────

CREATE TYPE "student"."StudentStatus" AS ENUM (
  'active',
  'inactive',
  'graduated',
  'dropped'
);

CREATE TABLE "student"."students" (
  "id"         UUID                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID                     NOT NULL,
  "nis"        VARCHAR(20)              NOT NULL,
  "class_id"   UUID,
  "parent_id"  UUID,
  "status"     "student"."StudentStatus" NOT NULL DEFAULT 'active',
  "joined_at"  DATE                     NOT NULL,
  "created_at" TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3)             NOT NULL,
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "students_user_id_key" ON "student"."students"("user_id");
CREATE UNIQUE INDEX "students_nis_key" ON "student"."students"("nis");

-- ─── PPDB SCHEMA ──────────────────────────────────────────────────────────────

CREATE TYPE "ppdb"."LeadStatus" AS ENUM (
  'new',
  'contacted',
  'interested',
  'registered',
  'paid',
  'accepted',
  'rejected',
  'cold'
);

CREATE TYPE "ppdb"."LeadSource" AS ENUM (
  'chatbot_wa',
  'website',
  'referral',
  'instagram',
  'tiktok',
  'event',
  'walk_in',
  'other'
);

CREATE TABLE "ppdb"."leads" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "full_name"       VARCHAR(255) NOT NULL,
  "phone"           VARCHAR(20)  NOT NULL,
  "school_origin"   VARCHAR(255),
  "interest_major"  VARCHAR(100),
  "source"          "ppdb"."LeadSource"  NOT NULL DEFAULT 'other',
  "status"          "ppdb"."LeadStatus"  NOT NULL DEFAULT 'new',
  "notes"           TEXT,
  "assigned_to"     UUID,
  "follow_up_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_status_created_at_idx" ON "ppdb"."leads"("status", "created_at");
CREATE INDEX "leads_phone_idx" ON "ppdb"."leads"("phone");

-- ─── AI KNOWLEDGE SCHEMA ──────────────────────────────────────────────────────

CREATE TABLE "ai_knowledge"."documents" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "title"      VARCHAR(500) NOT NULL,
  "content"    TEXT         NOT NULL,
  "source"     VARCHAR(255) NOT NULL,
  "category"   VARCHAR(100) NOT NULL,
  "is_active"  BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "documents_category_idx" ON "ai_knowledge"."documents"("category");

CREATE TABLE "ai_knowledge"."ai_documents" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "content"    TEXT         NOT NULL,
  "embedding"  vector(1536),
  "source"     VARCHAR(255) NOT NULL,
  "metadata"   JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_documents_pkey" PRIMARY KEY ("id")
);

-- HNSW index for fast cosine similarity search (RAG)
CREATE INDEX ON "ai_knowledge"."ai_documents"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

ALTER TABLE "academic"."classes"
  ADD CONSTRAINT "classes_teacher_id_fkey"
  FOREIGN KEY ("teacher_id")
  REFERENCES "teacher"."teachers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher"."teachers"
  ADD CONSTRAINT "teachers_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "auth"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student"."students"
  ADD CONSTRAINT "students_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "auth"."users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student"."students"
  ADD CONSTRAINT "students_class_id_fkey"
  FOREIGN KEY ("class_id")
  REFERENCES "academic"."classes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "student"."students"
  ADD CONSTRAINT "students_parent_id_fkey"
  FOREIGN KEY ("parent_id")
  REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ppdb"."leads"
  ADD CONSTRAINT "leads_assigned_to_fkey"
  FOREIGN KEY ("assigned_to")
  REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

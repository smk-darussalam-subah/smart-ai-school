-- =============================================================================
-- Migration: 20260531000001_sprint1_foundation
-- Description: Sprint 1 Foundation schema — SMA-31
--   N-2: Konsolidasi KnowledgeDocument + AiDocument → RagChunk (vector 768d)
--   T-12: Tambah TeachingAssignment, Grade, Attendance di academic schema
--   N-1: Tambah model minimal di finance (SppPayment) dan notification (NotificationLog)
-- =============================================================================

-- ─── N-2: Drop tabel RAG lama (data dev/seed — aman di-drop) ─────────────────
-- Drop index HNSW otomatis ikut terdrop bersama tabelnya di PostgreSQL
DROP TABLE IF EXISTS "ai_knowledge"."ai_documents";
DROP TABLE IF EXISTS "ai_knowledge"."documents";

-- ─── New enums ─────────────────────────────────────────────────────────────────

-- T-12: Academic schema enums
CREATE TYPE "academic"."GradeType" AS ENUM (
  'uts',
  'uh',
  'uas',
  'praktik',
  'sikap'
);

CREATE TYPE "academic"."AttendanceStatus" AS ENUM (
  'hadir',
  'izin',
  'sakit',
  'alpha'
);

-- N-1: Finance enum
CREATE TYPE "finance"."PaymentStatus" AS ENUM (
  'unpaid',
  'paid',
  'late',
  'waived'
);

-- N-1: Notification enums
CREATE TYPE "notification"."NotifChannel" AS ENUM (
  'whatsapp',
  'email',
  'push'
);

CREATE TYPE "notification"."NotifStatus" AS ENUM (
  'pending',
  'sent',
  'failed'
);

-- ─── T-12: academic.teaching_assignments ──────────────────────────────────────
-- Boundary: identitas guru (teacher schema) ↔ operasional mengajar (academic schema)

CREATE TABLE "academic"."teaching_assignments" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "teacher_id"     UUID         NOT NULL,
  "class_id"       UUID         NOT NULL,
  "subject"        VARCHAR(100) NOT NULL,
  "hours_per_week" INTEGER      NOT NULL DEFAULT 2,
  "academic_year"  VARCHAR(9)   NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teaching_assignments_teacher_id_class_id_subject_academic_year_key"
  ON "academic"."teaching_assignments"("teacher_id", "class_id", "subject", "academic_year");

-- ─── T-12: academic.grades ────────────────────────────────────────────────────

CREATE TABLE "academic"."grades" (
  "id"            UUID                   NOT NULL DEFAULT gen_random_uuid(),
  "student_id"    UUID                   NOT NULL,
  "assignment_id" UUID                   NOT NULL,
  "semester"      INTEGER                NOT NULL,
  "academic_year" VARCHAR(9)             NOT NULL,
  "score"         DECIMAL(5, 2)          NOT NULL,
  "type"          "academic"."GradeType" NOT NULL,
  "notes"         TEXT,
  "submitted_by"  UUID                   NOT NULL, -- userId pelaku (auth.users, audit)
  "created_at"    TIMESTAMP(3)           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3)           NOT NULL,

  CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grades_student_id_academic_year_semester_idx"
  ON "academic"."grades"("student_id", "academic_year", "semester");

-- ─── T-12: academic.attendance ────────────────────────────────────────────────

CREATE TABLE "academic"."attendance" (
  "id"          UUID                          NOT NULL DEFAULT gen_random_uuid(),
  "student_id"  UUID                          NOT NULL,
  "class_id"    UUID                          NOT NULL,
  "date"        DATE                          NOT NULL,
  "status"      "academic"."AttendanceStatus" NOT NULL,
  "notes"       TEXT,
  "recorded_by" UUID                          NOT NULL, -- userId pelaku (auth.users, audit)
  "created_at"  TIMESTAMP(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attendance_student_id_class_id_date_key"
  ON "academic"."attendance"("student_id", "class_id", "date");

CREATE INDEX "attendance_class_id_date_idx"
  ON "academic"."attendance"("class_id", "date");

-- ─── N-1: finance.spp_payments ────────────────────────────────────────────────

CREATE TABLE "finance"."spp_payments" (
  "id"          UUID                    NOT NULL DEFAULT gen_random_uuid(),
  "student_id"  UUID                    NOT NULL,
  "month"       INTEGER                 NOT NULL,
  "year"        INTEGER                 NOT NULL,
  "amount"      DECIMAL(12, 2)          NOT NULL,
  "status"      "finance"."PaymentStatus" NOT NULL DEFAULT 'unpaid',
  "paid_at"     TIMESTAMP(3),
  "receipt_no"  VARCHAR(50),
  "recorded_by" UUID, -- userId pelaku (auth.users, audit)
  "created_at"  TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3)            NOT NULL,

  CONSTRAINT "spp_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spp_payments_receipt_no_key"
  ON "finance"."spp_payments"("receipt_no");

CREATE UNIQUE INDEX "spp_payments_student_id_month_year_key"
  ON "finance"."spp_payments"("student_id", "month", "year");

CREATE INDEX "spp_payments_status_year_month_idx"
  ON "finance"."spp_payments"("status", "year", "month");

-- ─── N-1: notification.notification_logs ─────────────────────────────────────

CREATE TABLE "notification"."notification_logs" (
  "id"        UUID                            NOT NULL DEFAULT gen_random_uuid(),
  "recipient" VARCHAR(100)                    NOT NULL,
  "channel"   "notification"."NotifChannel"   NOT NULL,
  "subject"   VARCHAR(255),
  "body"      TEXT                            NOT NULL,
  "status"    "notification"."NotifStatus"    NOT NULL DEFAULT 'pending',
  "sent_at"   TIMESTAMP(3),
  "error"     TEXT,
  "ref_type"  TEXT,
  "ref_id"    UUID,
  "created_at" TIMESTAMP(3)                  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_logs_recipient_created_at_idx"
  ON "notification"."notification_logs"("recipient", "created_at");

CREATE INDEX "notification_logs_status_idx"
  ON "notification"."notification_logs"("status");

-- ─── N-2: ai_knowledge.rag_chunks ────────────────────────────────────────────
-- Menggantikan documents + ai_documents
-- Embedding: nomic-embed-text (Ollama) → 768 dimensi — KONSISTEN dengan schema.prisma

CREATE TABLE "ai_knowledge"."rag_chunks" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "title"      VARCHAR(500) NOT NULL,
  "content"    TEXT         NOT NULL,
  "embedding"  vector(768),
  "source"     VARCHAR(255) NOT NULL,
  "category"   VARCHAR(100) NOT NULL,
  "metadata"   JSONB,
  "is_active"  BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rag_chunks_category_idx" ON "ai_knowledge"."rag_chunks"("category");
CREATE INDEX "rag_chunks_is_active_idx" ON "ai_knowledge"."rag_chunks"("is_active");

-- HNSW index untuk fast cosine similarity search (RAG)
CREATE INDEX ON "ai_knowledge"."rag_chunks"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────────

ALTER TABLE "academic"."teaching_assignments"
  ADD CONSTRAINT "teaching_assignments_teacher_id_fkey"
  FOREIGN KEY ("teacher_id")
  REFERENCES "teacher"."teachers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."teaching_assignments"
  ADD CONSTRAINT "teaching_assignments_class_id_fkey"
  FOREIGN KEY ("class_id")
  REFERENCES "academic"."classes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."grades"
  ADD CONSTRAINT "grades_student_id_fkey"
  FOREIGN KEY ("student_id")
  REFERENCES "student"."students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."grades"
  ADD CONSTRAINT "grades_assignment_id_fkey"
  FOREIGN KEY ("assignment_id")
  REFERENCES "academic"."teaching_assignments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."attendance"
  ADD CONSTRAINT "attendance_student_id_fkey"
  FOREIGN KEY ("student_id")
  REFERENCES "student"."students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "academic"."attendance"
  ADD CONSTRAINT "attendance_class_id_fkey"
  FOREIGN KEY ("class_id")
  REFERENCES "academic"."classes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."spp_payments"
  ADD CONSTRAINT "spp_payments_student_id_fkey"
  FOREIGN KEY ("student_id")
  REFERENCES "student"."students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

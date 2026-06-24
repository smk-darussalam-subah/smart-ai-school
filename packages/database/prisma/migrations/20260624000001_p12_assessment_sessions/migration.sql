-- P12: Assessment Sessions — sesi asesmen + respons siswa. ADDITIVE & IDEMPOTEN (prod-safe).
-- Tabel/enum/index/FK baru di schema "academic"; tak mengubah tabel lain.

-- CreateEnum (idempotent)
DO $$ BEGIN
  CREATE TYPE "academic"."AssessmentType" AS ENUM ('diagnostik', 'formatif', 'sumatif');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "academic"."AssessmentSessionStatus" AS ENUM ('draft', 'active', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "academic"."assessment_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "type" "academic"."AssessmentType" NOT NULL,
    "status" "academic"."AssessmentSessionStatus" NOT NULL DEFAULT 'draft',
    "questions" JSONB NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "academic"."assessment_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "answers" JSONB,
    "score" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "assessment_sessions_module_id_status_idx" ON "academic"."assessment_sessions"("module_id", "status");
CREATE INDEX IF NOT EXISTS "assessment_sessions_teacher_id_academic_year_semester_idx" ON "academic"."assessment_sessions"("teacher_id", "academic_year", "semester");
CREATE INDEX IF NOT EXISTS "assessment_sessions_class_id_status_idx" ON "academic"."assessment_sessions"("class_id", "status");
CREATE INDEX IF NOT EXISTS "assessment_responses_student_id_idx" ON "academic"."assessment_responses"("student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "assessment_responses_session_id_student_id_key" ON "academic"."assessment_responses"("session_id", "student_id");

-- AddForeignKey (idempotent)
DO $$ BEGIN
  ALTER TABLE "academic"."assessment_sessions" ADD CONSTRAINT "assessment_sessions_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "academic"."lms_modules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."assessment_sessions" ADD CONSTRAINT "assessment_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."assessment_sessions" ADD CONSTRAINT "assessment_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."assessment_responses" ADD CONSTRAINT "assessment_responses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic"."assessment_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."assessment_responses" ADD CONSTRAINT "assessment_responses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

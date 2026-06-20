-- 2P-1: LMS — modul belajar + progres siswa. ADDITIVE & IDEMPOTEN (prod-safe).
-- Tabel/enum/index/FK baru di schema "academic"; tak mengubah tabel lain.

-- CreateEnum (idempoten)
DO $$ BEGIN
  CREATE TYPE "academic"."LmsModuleStatus" AS ENUM ('draft', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "academic"."LmsProgressStatus" AS ENUM ('locked', 'active', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "academic"."lms_modules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "rpp_id" UUID,
    "class_id" UUID,
    "subject" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "tp" VARCHAR(50),
    "jp_allocation" INTEGER,
    "kktp" INTEGER NOT NULL DEFAULT 75,
    "content" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "status" "academic"."LmsModuleStatus" NOT NULL DEFAULT 'draft',
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "academic"."lms_module_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "module_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" "academic"."LmsProgressStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lms_module_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lms_modules_teacher_id_subject_idx" ON "academic"."lms_modules"("teacher_id", "subject");
CREATE INDEX IF NOT EXISTS "lms_modules_class_id_status_idx" ON "academic"."lms_modules"("class_id", "status");
CREATE INDEX IF NOT EXISTS "lms_module_progress_student_id_idx" ON "academic"."lms_module_progress"("student_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lms_module_progress_module_id_student_id_key" ON "academic"."lms_module_progress"("module_id", "student_id");

-- AddForeignKey (idempoten)
DO $$ BEGIN
  ALTER TABLE "academic"."lms_modules" ADD CONSTRAINT "lms_modules_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."lms_modules" ADD CONSTRAINT "lms_modules_rpp_id_fkey" FOREIGN KEY ("rpp_id") REFERENCES "academic"."rpp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."lms_modules" ADD CONSTRAINT "lms_modules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."lms_module_progress" ADD CONSTRAINT "lms_module_progress_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "academic"."lms_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "academic"."lms_module_progress" ADD CONSTRAINT "lms_module_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

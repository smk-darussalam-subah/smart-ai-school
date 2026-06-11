-- 2F-3: RPP review pipeline (KamilEdu M11) — additive CREATE-only.

CREATE TYPE "academic"."RppStatus" AS ENUM ('draft', 'submitted', 'approved', 'revision');

CREATE TABLE "academic"."rpp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "class_id" UUID,
    "subject" VARCHAR(100) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT,
    "file_url" TEXT,
    "status" "academic"."RppStatus" NOT NULL DEFAULT 'draft',
    "reviewer_id" VARCHAR(64),
    "reviewer_name" VARCHAR(100),
    "review_note" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rpp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rpp_status_submitted_at_idx" ON "academic"."rpp"("status", "submitted_at");
CREATE INDEX "rpp_teacher_id_academic_year_semester_idx" ON "academic"."rpp"("teacher_id", "academic_year", "semester");

ALTER TABLE "academic"."rpp" ADD CONSTRAINT "rpp_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic"."rpp" ADD CONSTRAINT "rpp_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

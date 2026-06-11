-- 2H: Rapor (M12) + Kegiatan Kelas (M9) — additive CREATE-only.

CREATE TYPE "academic"."ReportStatus" AS ENUM ('draft', 'checked', 'published', 'distributed');
CREATE TYPE "academic"."ActivityCategory" AS ENUM ('pembelajaran', 'ulangan', 'praktikum', 'kegiatan', 'lainnya');

CREATE TABLE "academic"."report_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_year" VARCHAR(9) NOT NULL,
    "semester" INTEGER NOT NULL,
    "status" "academic"."ReportStatus" NOT NULL DEFAULT 'draft',
    "grades" JSONB NOT NULL,
    "attendance" JSONB,
    "notes" TEXT,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "distributed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_cards_student_id_academic_year_semester_key" ON "academic"."report_cards"("student_id", "academic_year", "semester");
CREATE INDEX "report_cards_class_id_academic_year_semester_idx" ON "academic"."report_cards"("class_id", "academic_year", "semester");
CREATE INDEX "report_cards_status_idx" ON "academic"."report_cards"("status");
ALTER TABLE "academic"."report_cards" ADD CONSTRAINT "report_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"."students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic"."report_cards" ADD CONSTRAINT "report_cards_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "academic"."class_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" "academic"."ActivityCategory" NOT NULL DEFAULT 'pembelajaran',
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "class_activities_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "class_activities_class_id_date_idx" ON "academic"."class_activities"("class_id", "date");
CREATE INDEX "class_activities_teacher_id_idx" ON "academic"."class_activities"("teacher_id");
ALTER TABLE "academic"."class_activities" ADD CONSTRAINT "class_activities_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "academic"."classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic"."class_activities" ADD CONSTRAINT "class_activities_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"."teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

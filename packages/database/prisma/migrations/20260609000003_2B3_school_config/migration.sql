-- 2B-3: School Config — additive CREATE-only
-- Schema: school (profil, jurusan, tahun ajaran, semester, kalender akademik)
-- Tidak ada DROP/ALTER destruktif.

CREATE SCHEMA IF NOT EXISTS "school";

-- CreateEnum
CREATE TYPE "school"."CalendarType" AS ENUM ('holiday', 'exam', 'event', 'break');

-- SchoolProfile
CREATE TABLE "school"."school_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "npsn" VARCHAR(20),
    "address" TEXT,
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "website" VARCHAR(255),
    "headmaster_name" VARCHAR(255),
    "headmaster_nip" VARCHAR(30),
    "logo_url" TEXT,
    "accreditation" VARCHAR(5),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_profile_pkey" PRIMARY KEY ("id")
);

-- Major
CREATE TABLE "school"."majors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "majors_code_key" ON "school"."majors"("code");

-- AcademicYear
CREATE TABLE "school"."academic_years" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(9) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academic_years_code_key" ON "school"."academic_years"("code");

-- Semester
CREATE TABLE "school"."semesters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "semesters_academic_year_id_number_key" ON "school"."semesters"("academic_year_id", "number");

-- AcademicCalendar
CREATE TABLE "school"."academic_calendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "type" "school"."CalendarType" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_calendar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "academic_calendar_academic_year_id_idx" ON "school"."academic_calendar"("academic_year_id");
CREATE INDEX "academic_calendar_type_idx" ON "school"."academic_calendar"("type");

-- FK: Semester → AcademicYear
ALTER TABLE "school"."semesters" ADD CONSTRAINT "semesters_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "school"."academic_years"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- FK: AcademicCalendar → AcademicYear
ALTER TABLE "school"."academic_calendar" ADD CONSTRAINT "academic_calendar_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "school"."academic_years"("id") ON UPDATE CASCADE ON DELETE CASCADE;

-- =============================================================================
-- Migration: 20260601000001_sprint2_schedule
-- Description: Sprint 2 — SMA-39 Schedule model (additive / non-destruktif)
--   Tambah tabel `academic.schedules` sebagai TEMPLATE jadwal mingguan rekuren.
--   JP (jam pelajaran) dipakai, bukan jam dinding — pemetaan JP→jam dinding
--   adalah config sekolah, bukan urusan schema ini.
--   Forward-compat KBM Tahap 2: tabel ini menjadi sumber TimetableEntry.
-- =============================================================================

CREATE TABLE "academic"."schedules" (
    "id"                     UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_id"               UUID NOT NULL,
    "teaching_assignment_id" UUID NOT NULL,
    "day_of_week"            INTEGER NOT NULL,
    "jp_start"               INTEGER NOT NULL,
    "jp_end"                 INTEGER NOT NULL,
    "room"                   VARCHAR(50),
    "academic_year"          VARCHAR(9) NOT NULL,
    "semester"               INTEGER NOT NULL,
    "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: satu kelas tidak bisa punya dua jadwal di slot JP yang sama
CREATE UNIQUE INDEX "schedules_class_id_day_of_week_jp_start_academic_year_semester_key"
    ON "academic"."schedules"("class_id", "day_of_week", "jp_start", "academic_year", "semester");

-- Index untuk query by teachingAssignmentId (ownership lookup guru)
CREATE INDEX "schedules_teaching_assignment_id_idx"
    ON "academic"."schedules"("teaching_assignment_id");

-- FK ke academic.classes
ALTER TABLE "academic"."schedules"
    ADD CONSTRAINT "schedules_class_id_fkey"
    FOREIGN KEY ("class_id")
    REFERENCES "academic"."classes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK ke academic.teaching_assignments
ALTER TABLE "academic"."schedules"
    ADD CONSTRAINT "schedules_teaching_assignment_id_fkey"
    FOREIGN KEY ("teaching_assignment_id")
    REFERENCES "academic"."teaching_assignments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

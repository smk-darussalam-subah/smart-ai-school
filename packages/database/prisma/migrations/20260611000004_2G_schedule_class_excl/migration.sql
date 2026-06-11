-- 2G-2: Exclusion constraint rentang JP per kelas (lapisan DB, melengkapi cek app-level).
-- Mencegah dua jadwal kelas yang sama OVERLAP rentang (unique lama hanya jaga jp_start).
-- CATATAN: bila ada data lama yang sudah overlap, ALTER ini GAGAL — bersihkan dulu:
--   SELECT a.id, b.id FROM academic.schedules a JOIN academic.schedules b
--     ON a.id < b.id AND a.class_id = b.class_id AND a.day_of_week = b.day_of_week
--    AND a.academic_year = b.academic_year AND a.semester = b.semester
--    AND int4range(a.jp_start, a.jp_end, '[]') && int4range(b.jp_start, b.jp_end, '[]');

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "academic"."schedules"
  ADD CONSTRAINT "schedules_class_jp_range_excl"
  EXCLUDE USING gist (
    "class_id"       WITH =,
    "day_of_week"    WITH =,
    "academic_year"  WITH =,
    "semester"       WITH =,
    int4range("jp_start", "jp_end", '[]') WITH &&
  );

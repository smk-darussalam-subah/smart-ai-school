-- Tata Usaha operates teaching assignments and timetable administration.
-- Appointment-based WAKA permissions already come from position_permissions.
INSERT INTO auth.permissions (code, description, module)
VALUES
  ('academic.teaching.read', 'Melihat teaching assignment', 'academic'),
  ('academic.teaching.manage', 'Mengelola teaching assignment', 'academic'),
  ('academic.schedule.read', 'Melihat jadwal', 'academic'),
  ('academic.schedule.manage', 'Mengelola jadwal', 'academic'),
  ('academic.grade.read', 'Melihat nilai', 'academic'),
  ('academic.attendance.read', 'Melihat absensi', 'academic'),
  ('student.read', 'Melihat data siswa', 'student'),
  ('activity.read', 'Melihat kegiatan kelas', 'academic'),
  ('activity.manage', 'Mengelola kegiatan kelas', 'academic'),
  ('rpp.read', 'Melihat RPP', 'academic'),
  ('rpp.review', 'Mereview RPP', 'academic'),
  ('lms.read', 'Melihat modul LMS', 'academic'),
  ('report.read', 'Melihat rapor', 'academic'),
  ('report.review', 'Periksa, kembalikan, dan terbitkan rapor', 'academic'),
  ('report.wali.manage', 'Menyiapkan draft rapor kelas wali', 'academic')
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'TATA_USAHA'::auth."UserRole", p.id
FROM auth.permissions p
WHERE p.code IN (
  'academic.teaching.read',
  'academic.teaching.manage',
  'academic.schedule.read',
  'academic.schedule.manage'
)
ON CONFLICT (role, permission_id) DO NOTHING;

INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'GURU'::auth."UserRole", p.id
FROM auth.permissions p
WHERE p.code = 'report.wali.manage'
ON CONFLICT (role, permission_id) DO NOTHING;

-- Appointment is the source of positional authority. Give the principal the
-- read/review capabilities required by the existing academic workspace, and
-- make the curriculum deputy's report review contract explicit.
INSERT INTO school.position_permissions (position_id, permission_id)
SELECT pos.id, perm.id
FROM (VALUES
  ('KEPALA_SEKOLAH', 'student.read'),
  ('KEPALA_SEKOLAH', 'academic.grade.read'),
  ('KEPALA_SEKOLAH', 'academic.attendance.read'),
  ('KEPALA_SEKOLAH', 'academic.teaching.read'),
  ('KEPALA_SEKOLAH', 'academic.schedule.read'),
  ('KEPALA_SEKOLAH', 'activity.read'),
  ('KEPALA_SEKOLAH', 'rpp.read'),
  ('KEPALA_SEKOLAH', 'rpp.review'),
  ('KEPALA_SEKOLAH', 'lms.read'),
  ('KEPALA_SEKOLAH', 'report.read'),
  ('KEPALA_SEKOLAH', 'report.review'),
  ('WAKA_KURIKULUM', 'academic.teaching.read'),
  ('WAKA_KURIKULUM', 'academic.teaching.manage'),
  ('WAKA_KURIKULUM', 'academic.schedule.read'),
  ('WAKA_KURIKULUM', 'academic.schedule.manage'),
  ('WAKA_KURIKULUM', 'academic.grade.read'),
  ('WAKA_KURIKULUM', 'rpp.read'),
  ('WAKA_KURIKULUM', 'rpp.review'),
  ('WAKA_KURIKULUM', 'report.read'),
  ('WAKA_KURIKULUM', 'report.review'),
  ('WAKA_KURIKULUM', 'lms.read'),
  ('WAKA_KESISWAAN', 'student.read'),
  ('WAKA_KESISWAAN', 'academic.attendance.read'),
  ('WAKA_KESISWAAN', 'activity.read'),
  ('WAKA_KESISWAAN', 'activity.manage')
) AS requested(position_code, permission_code)
JOIN school.positions pos ON pos.code::text = requested.position_code
JOIN auth.permissions perm ON perm.code = requested.permission_code
ON CONFLICT (position_id, permission_id) DO NOTHING;

-- UTS/UAS are single term examinations. The service returns a friendly 409,
-- while this partial index closes the concurrent check-then-insert race.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM academic.grades
    WHERE type IN ('uts'::academic."GradeType", 'uas'::academic."GradeType")
    GROUP BY student_id, assignment_id, semester, type
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate UTS/UAS grades must be reconciled before academic operational migration';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS grades_single_term_exam_unique
ON academic.grades (student_id, assignment_id, semester, type)
WHERE type IN ('uts'::academic."GradeType", 'uas'::academic."GradeType");

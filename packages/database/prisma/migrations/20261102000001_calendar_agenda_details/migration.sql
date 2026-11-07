-- All legacy events remain all-day: no invented times or locations.
ALTER TABLE school.academic_calendar
  ADD COLUMN start_at TIMESTAMPTZ(3),
  ADD COLUMN end_at TIMESTAMPTZ(3),
  ADD COLUMN location VARCHAR(255),
  ADD CONSTRAINT academic_calendar_time_range CHECK (
    (start_at IS NULL AND end_at IS NULL) OR
    (start_at IS NOT NULL AND end_at IS NOT NULL AND end_at > start_at
      AND (start_at AT TIME ZONE 'Asia/Jakarta')::date = start_date
      AND (end_at AT TIME ZONE 'Asia/Jakarta')::date = end_date)
  ),
  ADD CONSTRAINT academic_calendar_all_day_break CHECK (type NOT IN ('holiday', 'break') OR start_at IS NULL);

INSERT INTO auth.permissions (id, code, description, module)
VALUES (gen_random_uuid(), 'school.calendar.manage', 'Mengelola agenda, ujian dan hari libur sekolah', 'school')
ON CONFLICT (code) DO NOTHING;
INSERT INTO auth.role_permissions (role, permission_id)
SELECT 'TATA_USAHA'::auth."UserRole", id FROM auth.permissions WHERE code = 'school.calendar.manage'
ON CONFLICT DO NOTHING;
INSERT INTO school.position_permissions (position_id, permission_id)
SELECT pos.id, perm.id FROM school.positions pos CROSS JOIN auth.permissions perm
WHERE pos.code IN ('KEPALA_SEKOLAH', 'WAKA_HUMAS') AND perm.code = 'school.calendar.manage'
ON CONFLICT DO NOTHING;
-- Manual overrides, historical appointments and other permissions are untouched.

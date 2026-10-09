ALTER TABLE school.staff_attendance DROP CONSTRAINT staff_arrival_basis_valid;
ALTER TABLE school.staff_attendance ADD CONSTRAINT staff_arrival_basis_valid CHECK (
  arrival_basis IS NULL OR arrival_basis IN ('TEACHING','WORKDAY','NONE','UNAVAILABLE','EXEMPT')
);
-- Kepala sekolah is an active, period-bound appointment, never a trusted JWT role.
INSERT INTO school.position_permissions (position_id, permission_id)
  SELECT position.id, permission.id FROM school.positions position CROSS JOIN auth.permissions permission
  WHERE position.code = 'KEPALA_SEKOLAH' AND permission.code IN ('staff.attendance.checkin','staff.attendance.read')
  ON CONFLICT DO NOTHING;

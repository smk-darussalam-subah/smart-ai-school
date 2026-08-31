-- Wave 9 Checkpoint B: Kepala Sekolah executive dashboard authority.
-- Appointment permissions remain dynamic; this migration only adds the
-- authoritative position-to-permission mapping required by the existing
-- finance.read backend boundary.

INSERT INTO auth.permissions (code, description, module)
VALUES ('finance.read', 'Melihat data keuangan', 'finance')
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM school.positions
    WHERE code::text = 'KEPALA_SEKOLAH'
  ) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one KEPALA_SEKOLAH position before Wave 9 authority migration';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM auth.permissions
    WHERE code = 'finance.read'
  ) <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one finance.read permission before Wave 9 authority migration';
  END IF;
END $$;

INSERT INTO school.position_permissions (position_id, permission_id)
SELECT position.id, permission.id
FROM school.positions AS position
CROSS JOIN auth.permissions AS permission
WHERE position.code::text = 'KEPALA_SEKOLAH'
  AND permission.code = 'finance.read'
ON CONFLICT (position_id, permission_id) DO NOTHING;

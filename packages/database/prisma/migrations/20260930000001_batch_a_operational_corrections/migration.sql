-- Batch Operasional: dedicated assisted password reset authority and Guru BK capacity correction.
-- This migration is additive/data-corrective and intentionally leaves historical migrations untouched.

INSERT INTO auth.permissions (code, description, module)
VALUES ('user.password.reset', 'Menerbitkan kata sandi sementara satu kali untuk pengguna yang diizinkan', 'user')
ON CONFLICT (code) DO UPDATE
SET description = EXCLUDED.description,
    module = EXCLUDED.module;

INSERT INTO auth.role_permissions (role, permission_id)
SELECT role_name::auth."UserRole", permission.id
FROM (VALUES ('SUPER_ADMIN'), ('TATA_USAHA')) AS roles(role_name)
CROSS JOIN auth.permissions AS permission
WHERE permission.code = 'user.password.reset'
ON CONFLICT (role, permission_id) DO NOTHING;

DO $$
DECLARE
  affected_rows integer;
BEGIN
  UPDATE school.positions
  SET max_active_holders = 2,
      updated_at = now()
  WHERE code::text = 'GURU_BK'
    AND max_active_holders = 1;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one GURU_BK position with capacity 1, updated % row(s)', affected_rows;
  END IF;
END $$;

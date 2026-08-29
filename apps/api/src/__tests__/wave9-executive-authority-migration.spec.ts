import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const migration = readFileSync(
  path.join(
    root,
    'packages/database/prisma/migrations/20260829000001_wave9_executive_authority_permission/migration.sql',
  ),
  'utf8',
);

describe('Wave 9 executive authority permission migration', () => {
  it('fails closed when the authoritative position or permission is missing', () => {
    expect(migration).toContain('INSERT INTO auth.permissions');
    expect(migration).toContain("VALUES ('finance.read', 'Melihat data keuangan', 'finance')");
    expect(migration).toContain('ON CONFLICT (code) DO NOTHING');
    expect(migration).toContain("code::text = 'KEPALA_SEKOLAH'");
    expect(migration).toContain("code = 'finance.read'");
    expect(migration).toContain('Expected exactly one KEPALA_SEKOLAH position');
    expect(migration).toContain('Expected exactly one finance.read permission');
  });

  it('adds only the Kepala Sekolah finance.read mapping idempotently', () => {
    expect(migration).toContain('INSERT INTO school.position_permissions');
    expect(migration).toContain("position.code::text = 'KEPALA_SEKOLAH'");
    expect(migration).toContain("permission.code = 'finance.read'");
    expect(migration).toContain('ON CONFLICT (position_id, permission_id) DO NOTHING');
    expect(migration).not.toMatch(/ALTER\s+TABLE/i);
    expect(migration).not.toMatch(/CREATE\s+TABLE/i);
    expect(migration).not.toMatch(/DELETE\s+FROM/i);
    expect(migration).not.toMatch(/UPDATE\s+/i);
  });
});

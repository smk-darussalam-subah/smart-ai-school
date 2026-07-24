import { existsSync, readFileSync } from 'fs';
import path from 'path';

function readMigration(): string {
  const candidates = [
    path.resolve(process.cwd(), '../../packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql'),
    path.resolve(process.cwd(), 'packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql'),
    path.resolve(__dirname, '../../../../packages/database/prisma/migrations/20260722000001_tf2_p1_1_zombie_permissions/migration.sql'),
  ];
  const target = candidates.find((candidate) => existsSync(candidate));
  if (!target) {
    throw new Error('TF2-P1-1 migration.sql not found');
  }
  return readFileSync(target, 'utf8');
}

describe('TF2-P1-1 migration SQL', () => {
  const sql = readMigration();

  it('adds status/source fields required for quarantine fail-closed', () => {
    expect(sql).toContain('"auth"."PermissionOverrideSource"');
    expect(sql).toContain('"auth"."PermissionOverrideStatus"');
    expect(sql).toContain('"source" "auth"."PermissionOverrideSource" NOT NULL DEFAULT');
    expect(sql).toContain('"status" "auth"."PermissionOverrideStatus" NOT NULL DEFAULT');
  });

  it('quarantines historical grant=true rows instead of inferring provenance from matches', () => {
    expect(sql).toContain('matching_position_count');
    expect(sql).toContain('QUARANTINED_HISTORICAL_GRANT');
    expect(sql).toContain('"source" = \'MIGRATION_QUARANTINE\'');
    expect(sql).toContain('"status" = \'QUARANTINED\'');
    expect(sql).toContain('Historical grant lacks provenance; review required before activation');
    expect(sql).not.toContain('POSITION_DERIVED_ACTIVE');
    expect(sql).not.toContain('matched_academic_year_id');
    expect(sql).not.toContain('matched_staff_position_id');
  });

  it('recreates current position grants from active StaffPosition rows', () => {
    expect(sql).toContain('_tf2_p1_1_recreated_position_grants');
    expect(sql).toContain('FROM "school"."staff_positions" sp');
    expect(sql).toContain('WHERE sp."is_active" = TRUE');
    expect(sql).toContain('Recreated from active staff position during TF2-P1-1 migration');
    expect(sql).toContain('\'POSITION_ASSIGNMENT\'');
    expect(sql).toContain('\'ACTIVE\'');
  });

  it('uses active-only indexes so quarantined globals cannot grant access', () => {
    expect(sql).toContain('user_permission_overrides_global_active_uniq');
    expect(sql).toContain('WHERE "academic_year_id" IS NULL AND "status" = \'ACTIVE\'');
    expect(sql).toContain('user_permission_overrides_user_perm_year_key');
  });

  it('emits only aggregate inventory counts, not PII columns', () => {
    expect(sql).toContain('RAISE NOTICE');
    expect(sql).toContain('total=%, recreated_position_scoped=%, quarantined_historical_grants=%, global_revokes=%, single_match_candidates=%');
    expect(sql).not.toMatch(/full_name|email|phone|nisn|guardian/i);
  });
});

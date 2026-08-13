import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../../../..');
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

describe('academic governance migration contract', () => {
  const migration = read(
    'packages/database/prisma/migrations/20260812000002_academic_review_governance/migration.sql',
  );
  const schema = read('packages/database/prisma/schema.prisma');
  const compose = read('infrastructure/docker/docker-compose.yml');
  const deploy = read('.github/workflows/deploy.yml');

  it('persists the two-stage Modul Ajar and auditable report pipeline', () => {
    expect(migration).toContain("ADD VALUE IF NOT EXISTS 'curriculum_reviewed'");
    expect(migration).toContain('curriculum_reviewer_id VARCHAR(64)');
    expect(migration).toContain('final_reviewer_id VARCHAR(64)');
    expect(migration).toContain('checked_by_name VARCHAR(100)');
    expect(migration).toContain('distributed_by_name VARCHAR(100)');
    expect(migration).toContain('student_name_snapshot VARCHAR(255)');
    expect(migration).toContain('homeroom_teacher_name_snapshot VARCHAR(255)');
    expect(migration).toContain('UPDATE academic.report_cards rc');
    expect(migration).toContain('incident_reference VARCHAR(100)');
    expect(schema).toContain('curriculum_reviewed');
    expect(schema).toContain('@map("published_by_name")');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS academic.report_card_status_events');
    expect(schema).toContain('model ReportCardStatusEvent');
  });

  it('replaces broad legacy grants with explicit stage permissions', () => {
    expect(migration).toContain("'rpp.curriculum.review'");
    expect(migration).toContain("'rpp.final.approve'");
    expect(migration).toContain("'report.publish'");
    expect(migration).toContain("'report.distribute'");
    expect(migration).toContain("'report.recover'");
    expect(migration).toContain('DELETE FROM school.position_permissions');
    expect(migration).toContain("perm.code IN ('report.manage', 'rpp.review')");
    expect(migration).toContain("perm.code IN ('report.manage', 'report.review', 'rpp.review')");
    expect(migration).not.toContain("('KEPALA_SEKOLAH', 'report.review')");
  });

  it('binds private class-activity storage through environment references', () => {
    expect(compose).toContain('CLASS_ACTIVITY_MEDIA_ENDPOINT: ${CLASS_ACTIVITY_MEDIA_ENDPOINT:-http://minio:9000}');
    expect(compose).toContain('CLASS_ACTIVITY_MEDIA_ACCESS_KEY: ${CLASS_ACTIVITY_MEDIA_ACCESS_KEY}');
    expect(compose).toContain('CLASS_ACTIVITY_MEDIA_SECRET_KEY: ${CLASS_ACTIVITY_MEDIA_SECRET_KEY}');
    expect(compose).not.toMatch(/CLASS_ACTIVITY_MEDIA_SECRET_KEY:\s+["']?[A-Za-z0-9/+]{20,}/);
  });

  it('provisions isolated least-privilege media storage for staging and production', () => {
    expect(deploy).toContain('_MEDIA_BUCKET="diis-class-activities-staging"');
    expect(deploy).toContain('_MEDIA_BUCKET="diis-class-activities"');
    expect(deploy).toContain('_MEDIA_ACCESS="diis-staging-media"');
    expect(deploy).toContain('_MEDIA_ACCESS="diis-production-media"');
    expect(deploy).toContain('CLASS_ACTIVITY_MEDIA_ACCESS_KEY "$_MEDIA_ACCESS"');
    expect(deploy).toContain('CLASS_ACTIVITY_MEDIA_SECRET_KEY "$_MEDIA_SECRET"');
    expect(deploy).toContain('diis-staging-class-activity');
    expect(deploy).toContain('diis-production-class-activity');
    expect(deploy).toContain('s3:GetObject');
    expect(deploy).toContain('s3:PutObject');
    expect(deploy).toContain('s3:DeleteObject');
    expect(deploy).toContain('anonymous set none');
    expect(deploy).not.toMatch(/echo[^\n]*_MEDIA_SECRET/);
  });

  it('closes assignment mutation races at the database boundary', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION academic.assert_teaching_assignment_context()');
    expect(migration).toContain('FOR KEY SHARE');
    expect(migration).toContain('CREATE TRIGGER rpp_assignment_context_guard');
    expect(migration).toContain('CREATE TRIGGER lms_assignment_context_guard');
    expect(migration).toContain('CREATE TRIGGER assessment_assignment_context_guard');
  });
});

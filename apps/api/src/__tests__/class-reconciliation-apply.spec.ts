import {
  ClassReconciliationApplyManifestSchema,
  parseClassReconciliationApplyManifest,
} from '../classes/class-reconciliation-apply';
import { databaseTargetFromUrl } from '../classes/class-reconciliation-plan';

const studentId = '85000000-0000-4000-8000-000000000001';
const teacherId = '85000000-0000-4000-8000-000000000002';
const classId = '85000000-0000-4000-8000-000000000003';
const target = databaseTargetFromUrl(
  'postgresql://operator:secret@db.internal:5432/smk_staging_db?schema=public',
);
const manifest = {
  schemaVersion: 2 as const,
  target,
  reviewedDryRunSha256: '1'.repeat(64),
  studentRelations: [{ studentId, classId }],
  homeroomRelations: [{ teacherId, classId }],
  expectedStudentRelations: 1,
  expectedHomeroomRelations: 1,
};

describe('class reconciliation apply manifest', () => {
  it('accepts exact relation pairs and rejects the dry-run schema', () => {
    expect(parseClassReconciliationApplyManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(() =>
      parseClassReconciliationApplyManifest(
        JSON.stringify({
          schemaVersion: 1,
          target,
          studentIds: [studentId],
          teacherIds: [teacherId],
          expectedStudentRelations: 1,
          expectedHomeroomRelations: 1,
        }),
      ),
    ).toThrow('Manifest apply tidak valid');
  });

  it.each([
    [
      'duplicate student',
      {
        ...manifest,
        studentRelations: [
          { studentId, classId },
          { studentId, classId: '85000000-0000-4000-8000-000000000004' },
        ],
        expectedStudentRelations: 2,
      },
    ],
    [
      'duplicate homeroom class',
      {
        ...manifest,
        homeroomRelations: [
          { teacherId, classId },
          { teacherId: '85000000-0000-4000-8000-000000000005', classId },
        ],
        expectedHomeroomRelations: 2,
      },
    ],
    ['count mismatch', { ...manifest, expectedStudentRelations: 2 }],
  ])('rejects %s', (_label, candidate) => {
    expect(ClassReconciliationApplyManifestSchema.safeParse(candidate).success).toBe(false);
  });

  it('rejects unknown fields so approval bytes cannot widen silently', () => {
    expect(() =>
      parseClassReconciliationApplyManifest(JSON.stringify({ ...manifest, applyAll: true })),
    ).toThrow('Manifest apply tidak valid');
  });

  it('rejects a no-op manifest', () => {
    expect(() =>
      parseClassReconciliationApplyManifest(
        JSON.stringify({
          ...manifest,
          studentRelations: [],
          homeroomRelations: [],
          expectedStudentRelations: 0,
          expectedHomeroomRelations: 0,
        }),
      ),
    ).toThrow('setidaknya satu relasi');
  });
});

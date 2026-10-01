import {
  assertClassReconciliationBinding,
  buildClassReconciliationPlan,
  databaseTargetFromUrl,
  parseClassReconciliationManifest,
  sha256,
} from '../classes/class-reconciliation-plan';

const archivedAt = new Date('2026-09-01T00:00:00.000Z');
const student1 = '81000000-0000-4000-8000-000000000001';
const student2 = '81000000-0000-4000-8000-000000000002';
const teacher1 = '82000000-0000-4000-8000-000000000001';
const target = databaseTargetFromUrl(
  'postgresql://operator:secret@db.internal:5432/smk_staging_db?schema=academic',
);

const manifest = {
  schemaVersion: 1 as const,
  target,
  studentIds: [student2, student1],
  teacherIds: [teacher1],
  expectedStudentRelations: 2,
  expectedHomeroomRelations: 1,
};

describe('class reconciliation dry-run planner', () => {
  it('returns a deterministic read-only plan for exact archived IDs', () => {
    const plan = buildClassReconciliationPlan(
      manifest,
      [
        {
          id: student1,
          classId: 'class-1',
          status: 'inactive',
          deletedAt: archivedAt,
          user: { isActive: false, deletedAt: archivedAt },
        },
        {
          id: student2,
          classId: 'class-2',
          status: 'active',
          deletedAt: archivedAt,
          user: { isActive: false, deletedAt: archivedAt },
        },
      ],
      [
        {
          id: teacher1,
          deletedAt: archivedAt,
          user: { isActive: false, deletedAt: archivedAt },
          walikelas: [{ id: 'class-1', isActive: true }],
        },
      ],
    );

    expect(plan).toMatchObject({
      mode: 'dry-run',
      studentRelationsToClear: [student1, student2],
      homeroomClassRelationsToClear: ['class-1'],
      operationalStudentsAffected: 0,
    });
  });

  it('fails closed when an operational student is included', () => {
    expect(() =>
      buildClassReconciliationPlan(
        {
          schemaVersion: 1,
          target,
          studentIds: [student1],
          teacherIds: [],
          expectedStudentRelations: 1,
          expectedHomeroomRelations: 0,
        },
        [
          {
            id: student1,
            classId: 'class-1',
            status: 'active',
            deletedAt: null,
            user: { isActive: true, deletedAt: null },
          },
        ],
        [],
      ),
    ).toThrow('Manifest memuat siswa operasional');
  });

  it('fails closed when database IDs or expected relation counts drift', () => {
    expect(() =>
      buildClassReconciliationPlan(
        {
          schemaVersion: 1,
          target,
          studentIds: [student1],
          teacherIds: [],
          expectedStudentRelations: 1,
          expectedHomeroomRelations: 0,
        },
        [],
        [],
      ),
    ).toThrow('database tidak cocok');
  });

  it.each([
    ['JSON terpotong', '{"schemaVersion":1'],
    ['field asing', JSON.stringify({ ...manifest, unexpected: true })],
    ['ID duplikat', JSON.stringify({ ...manifest, studentIds: [student1, student1] })],
  ])('menolak manifest %s', (_label, raw) => {
    expect(() => parseClassReconciliationManifest(raw)).toThrow('Manifest rekonsiliasi');
  });

  it('menghapus kredensial dari identitas target dan mengikat digest serta database aktual', () => {
    const alternateCredentials = databaseTargetFromUrl(
      'postgresql://other:password@db.internal:5432/smk_staging_db?schema=academic',
    );
    expect(alternateCredentials).toEqual(target);

    const bytes = JSON.stringify(manifest);
    expect(() =>
      assertClassReconciliationBinding({
        manifest,
        manifestSha256: sha256(bytes),
        expectedManifestSha256: sha256(bytes),
        configuredTarget: target,
        expectedTargetSha256: target.targetSha256,
        observedDatabaseName: 'smk_staging_db',
        observedSchemaName: 'academic',
      }),
    ).not.toThrow();
  });

  it('menolak digest manifest, digest target, dan database aktual yang berbeda', () => {
    const bytes = JSON.stringify(manifest);
    const baseline = {
      manifest,
      manifestSha256: sha256(bytes),
      expectedManifestSha256: sha256(bytes),
      configuredTarget: target,
      expectedTargetSha256: target.targetSha256,
      observedDatabaseName: 'smk_staging_db',
      observedSchemaName: 'academic',
    };

    expect(() =>
      assertClassReconciliationBinding({
        ...baseline,
        expectedManifestSha256: '0'.repeat(64),
      }),
    ).toThrow('Digest manifest');
    expect(() =>
      assertClassReconciliationBinding({ ...baseline, expectedTargetSha256: '0'.repeat(64) }),
    ).toThrow('Digest target');
    expect(() =>
      assertClassReconciliationBinding({ ...baseline, observedDatabaseName: 'postgres' }),
    ).toThrow('Identitas database');
  });
});

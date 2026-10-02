import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  applyClassReconciliation,
  ClassReconciliationApplyManifest,
} from '../classes/class-reconciliation-apply';
import { databaseTargetFromUrl, sha256 } from '../classes/class-reconciliation-plan';

const databaseUrl = process.env['CLASS_HOMEROOM_DATABASE_URL'];
const describePostgres = databaseUrl ? describe : describe.skip;
const dryRunSha256 = '4'.repeat(64);

describePostgres('class reconciliation apply PostgreSQL proof', () => {
  let prisma: PrismaClient;
  const userIds = [
    '86000000-0000-4000-8000-000000000001',
    '86000000-0000-4000-8000-000000000002',
    '86000000-0000-4000-8000-000000000003',
    '86000000-0000-4000-8000-000000000004',
  ];
  const studentIds = [
    '86100000-0000-4000-8000-000000000001',
    '86100000-0000-4000-8000-000000000002',
    '86100000-0000-4000-8000-000000000003',
  ];
  const teacherId = '86200000-0000-4000-8000-000000000001';
  const classIds = [
    '86300000-0000-4000-8000-000000000001',
    '86300000-0000-4000-8000-000000000002',
    '86300000-0000-4000-8000-000000000003',
  ];

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();
    await prisma.user.createMany({
      data: userIds.map((id, index) => ({
        id,
        keycloakId: `86400000-0000-4000-8000-00000000000${index + 1}`,
        email: `reconciliation-${index + 1}@example.invalid`,
        fullName: `Reconciliation Proof ${index + 1}`,
        role: index === 3 ? 'GURU' : 'SISWA',
        isActive: false,
      })),
    });
    await prisma.teacher.create({
      data: { id: teacherId, userId: userIds[3]!, isWaliKelas: true },
    });
    await prisma.class.createMany({
      data: classIds.map((id, index) => ({
        id,
        name: `RECONCILIATION PROOF ${index + 1}`,
        majorCode: 'RCP',
        grade: 10 + index,
        academicYear: '2026/2027',
        capacity: 36,
        ...(index === 0 ? { teacherId } : {}),
      })),
    });
    await prisma.student.createMany({
      data: studentIds.map((id, index) => ({
        id,
        userId: userIds[index]!,
        nis: `RECONCILIATION-${index + 1}`,
        classId: index < 2 ? classIds[1] : classIds[2],
        status: 'active',
        joinedAt: new Date('2026-07-01T00:00:00.000Z'),
      })),
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS reconciliation_rollback_proof ON student.students',
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS student.reconciliation_rollback_proof()',
    );
    await prisma.auditLog.deleteMany({ where: { action: 'class.reconciliation.apply' } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
    await prisma.class.deleteMany({ where: { id: { in: classIds } } });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  function manifest(input: {
    studentRelations: Array<{ studentId: string; classId: string }>;
    homeroomRelations?: Array<{ teacherId: string; classId: string }>;
  }): ClassReconciliationApplyManifest {
    const homeroomRelations = input.homeroomRelations ?? [];
    return {
      schemaVersion: 2,
      target: databaseTargetFromUrl(databaseUrl!),
      reviewedDryRunSha256: dryRunSha256,
      studentRelations: input.studentRelations,
      homeroomRelations,
      expectedStudentRelations: input.studentRelations.length,
      expectedHomeroomRelations: homeroomRelations.length,
    };
  }

  function apply(candidate: ClassReconciliationApplyManifest) {
    const bytes = JSON.stringify(candidate);
    return applyClassReconciliation(prisma, {
      manifest: candidate,
      manifestSha256: sha256(bytes),
      expectedManifestSha256: sha256(bytes),
      expectedDryRunSha256: dryRunSha256,
      expectedTargetSha256: candidate.target.targetSha256,
      configuredTarget: databaseTargetFromUrl(databaseUrl!),
    });
  }

  it('serializes concurrent operators, commits exact counts, and emits a PII-safe receipt', async () => {
    const candidate = manifest({
      studentRelations: [{ studentId: studentIds[0]!, classId: classIds[1]! }],
      homeroomRelations: [{ teacherId, classId: classIds[0]! }],
    });
    const results = await Promise.allSettled([apply(candidate), apply(candidate)]);
    const successes = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof apply>>> =>
        result.status === 'fulfilled',
    );
    const failures = results.filter((result) => result.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const failure = (failures[0] as PromiseRejectedResult).reason as {
      code?: string;
      message?: string;
    };
    if (
      failure.code !== 'P2034' &&
      !(failure.code === 'P2010' && failure.message?.includes('could not serialize access')) &&
      !failure.message?.includes('sudah pernah berhasil dijalankan') &&
      !failure.message?.includes('sedang diproses') &&
      !failure.message?.includes('sedang berjalan')
    ) {
      throw new Error(`unexpected concurrent rejection: ${failure.code ?? '-'} ${failure.message}`);
    }

    const receipt = successes[0]!.value;
    expect(receipt.changes).toEqual({
      studentRelationsCleared: 1,
      homeroomRelationsCleared: 1,
      teacherFlagsNormalized: 1,
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(studentIds[0]);
    expect(serialized).not.toContain(teacherId);
    expect(serialized).not.toContain(classIds[0]);

    await expect(
      prisma.student.findUnique({ where: { id: studentIds[0] } }),
    ).resolves.toMatchObject({
      classId: null,
    });
    await expect(prisma.class.findUnique({ where: { id: classIds[0] } })).resolves.toMatchObject({
      teacherId: null,
    });
    await expect(prisma.teacher.findUnique({ where: { id: teacherId } })).resolves.toMatchObject({
      isWaliKelas: false,
    });
    const audit = await prisma.auditLog.findUnique({ where: { id: receipt.auditLogId } });
    expect(JSON.stringify(audit?.metadata)).not.toContain(studentIds[0]);
  });

  it('fails closed on relation drift before changing data', async () => {
    const candidate = manifest({
      studentRelations: [{ studentId: studentIds[1]!, classId: classIds[2]! }],
    });
    await expect(apply(candidate)).rejects.toThrow('Relasi siswa berubah');
    await expect(
      prisma.student.findUnique({ where: { id: studentIds[1] } }),
    ).resolves.toMatchObject({
      classId: classIds[1],
    });
  });

  it('rejects a mismatched reviewed dry-run digest before changing data', async () => {
    const candidate = manifest({
      studentRelations: [{ studentId: studentIds[1]!, classId: classIds[1]! }],
    });
    const bytes = JSON.stringify(candidate);
    await expect(
      applyClassReconciliation(prisma, {
        manifest: candidate,
        manifestSha256: sha256(bytes),
        expectedManifestSha256: sha256(bytes),
        expectedDryRunSha256: '5'.repeat(64),
        expectedTargetSha256: candidate.target.targetSha256,
        configuredTarget: databaseTargetFromUrl(databaseUrl!),
      }),
    ).rejects.toThrow('Digest dry-run');
    await expect(
      prisma.student.findUnique({ where: { id: studentIds[1] } }),
    ).resolves.toMatchObject({
      classId: classIds[1],
    });
  });

  it('rolls back earlier changes when a later exact update fails', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION student.reconciliation_rollback_proof()
      RETURNS trigger AS $$
      BEGIN
        IF OLD.id = '${studentIds[2]}'::uuid AND NEW.class_id IS NULL THEN
          RAISE EXCEPTION 'rollback proof';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER reconciliation_rollback_proof
      BEFORE UPDATE OF class_id ON student.students
      FOR EACH ROW EXECUTE FUNCTION student.reconciliation_rollback_proof()
    `);
    try {
      const candidate = manifest({
        studentRelations: [
          { studentId: studentIds[1]!, classId: classIds[1]! },
          { studentId: studentIds[2]!, classId: classIds[2]! },
        ],
      });
      await expect(apply(candidate)).rejects.toThrow();
      const rows = await prisma.student.findMany({
        where: { id: { in: [studentIds[1]!, studentIds[2]!] } },
        orderBy: { id: 'asc' },
        select: { classId: true },
      });
      expect(rows).toEqual([{ classId: classIds[1] }, { classId: classIds[2] }]);
      expect(
        await prisma.auditLog.count({
          where: { action: 'class.reconciliation.apply' },
        }),
      ).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS reconciliation_rollback_proof ON student.students',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS student.reconciliation_rollback_proof()',
      );
    }
  });

  it('runs the exact CLI contract and emits only a PII-safe committed receipt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'diis-class-reconciliation-apply-'));
    try {
      const candidate = manifest({
        studentRelations: [{ studentId: studentIds[2]!, classId: classIds[2]! }],
      });
      const bytes = JSON.stringify(candidate);
      const manifestPath = join(directory, 'apply-manifest.json');
      await writeFile(manifestPath, bytes, 'utf8');
      const repositoryRoot = resolve(__dirname, '../../../..');
      const tsNode = require.resolve('ts-node/dist/bin.js');
      const result = spawnSync(
        process.execPath,
        [
          tsNode,
          '--project',
          'apps/api/tsconfig.json',
          'scripts/apply-class-reconciliation.ts',
          '--apply',
          '--manifest',
          manifestPath,
          '--expected-manifest-sha256',
          sha256(bytes),
          '--expected-dry-run-sha256',
          dryRunSha256,
          '--expected-target-sha256',
          candidate.target.targetSha256,
        ],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          env: { ...process.env, DATABASE_URL: databaseUrl },
        },
      );
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      const receipt = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(receipt).toMatchObject({
        verified: true,
        committed: true,
        mode: 'apply',
        changes: { studentRelationsCleared: 1, homeroomRelationsCleared: 0 },
      });
      expect(result.stdout).not.toContain(studentIds[2]);
      expect(result.stdout).not.toContain(classIds[2]);
      await expect(
        prisma.student.findUnique({ where: { id: studentIds[2] } }),
      ).resolves.toMatchObject({ classId: null });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

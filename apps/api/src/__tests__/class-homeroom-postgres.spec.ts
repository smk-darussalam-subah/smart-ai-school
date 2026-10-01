import { ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { databaseTargetFromUrl, sha256 } from '../classes/class-reconciliation-plan';
import { ClassesService } from '../classes/classes.service';
import { PrismaService } from '../prisma/prisma.service';

const databaseUrl = process.env['CLASS_HOMEROOM_DATABASE_URL'];
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('class occupancy and homeroom PostgreSQL proof', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const service = new ClassesService(prisma as PrismaService);
  const suffix = 'class-proof-20261001';
  const classId = '71000000-0000-4000-8000-000000000001';
  const archivedClassId = '71000000-0000-4000-8000-000000000002';
  const teacherClassId = '71000000-0000-4000-8000-000000000003';
  const userIds = [
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000005',
  ];
  const teacherId = '73000000-0000-4000-8000-000000000001';
  let archivedStudentId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        {
          id: userIds[0]!,
          keycloakId: '74000000-0000-4000-8000-000000000001',
          email: `student-1-${suffix}@example.invalid`,
          fullName: 'Siswa Proof 1',
          role: 'SISWA',
        },
        {
          id: userIds[1]!,
          keycloakId: '74000000-0000-4000-8000-000000000002',
          email: `student-2-${suffix}@example.invalid`,
          fullName: 'Siswa Proof 2',
          role: 'SISWA',
        },
        {
          id: userIds[2]!,
          keycloakId: '74000000-0000-4000-8000-000000000003',
          email: `archived-${suffix}@example.invalid`,
          fullName: 'Siswa Arsip Proof',
          role: 'SISWA',
          isActive: false,
          deletedAt: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          id: userIds[3]!,
          keycloakId: '74000000-0000-4000-8000-000000000004',
          email: `teacher-${suffix}@example.invalid`,
          fullName: 'Guru Proof',
          role: 'GURU',
        },
        {
          id: userIds[4]!,
          keycloakId: '74000000-0000-4000-8000-000000000005',
          email: `inactive-student-${suffix}@example.invalid`,
          fullName: 'Siswa Nonaktif Proof',
          role: 'SISWA',
          isActive: false,
        },
      ],
    });
    await prisma.teacher.create({ data: { id: teacherId, userId: userIds[3]! } });
    await prisma.class.createMany({
      data: [
        {
          id: classId,
          name: 'X PROOF 1',
          majorCode: 'PRF',
          grade: 10,
          academicYear: '2026/2027',
          capacity: 1,
        },
        {
          id: archivedClassId,
          name: 'XI PROOF 1',
          majorCode: 'PRF',
          grade: 11,
          academicYear: '2026/2027',
          capacity: 36,
        },
        {
          id: teacherClassId,
          name: 'XII PROOF 1',
          majorCode: 'PRF',
          grade: 12,
          academicYear: '2026/2027',
          capacity: 36,
          teacherId,
        },
      ],
    });
    const archivedStudent = await prisma.student.create({
      data: {
        userId: userIds[2]!,
        nis: 'PROOF-ARCHIVED-1',
        classId: archivedClassId,
        status: 'active',
        joinedAt: new Date('2026-07-01T00:00:00.000Z'),
        deletedAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    archivedStudentId = archivedStudent.id;
    await prisma.student.create({
      data: {
        userId: userIds[4]!,
        nis: 'PROOF-INACTIVE-1',
        classId,
        status: 'active',
        joinedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await prisma.student.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.class.deleteMany({
      where: { id: { in: [classId, archivedClassId, teacherClassId] } },
    });
    await prisma.teacher.deleteMany({ where: { id: teacherId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('allows exactly one of two concurrent inserts into a one-seat class', async () => {
    const attempt = (userId: string, nis: string) =>
      prisma.$transaction(async (tx) => {
        await service.assertOperationalSeatAvailable(tx, classId);
        await tx.$executeRaw`SELECT pg_sleep(0.15)`;
        return tx.student.create({
          data: {
            userId,
            nis,
            classId,
            status: 'active',
            joinedAt: new Date('2026-07-01T00:00:00.000Z'),
          },
        });
      });

    const results = await Promise.allSettled([
      attempt(userIds[0]!, 'PROOF-ACTIVE-1'),
      attempt(userIds[1]!, 'PROOF-ACTIVE-2'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.student.count({
        where: {
          classId,
          deletedAt: null,
          status: 'active',
          user: { is: { isActive: true, deletedAt: null } },
        },
      }),
    ).toBe(1);
  });

  it('rejects account activation when its historical class has no operational seat', async () => {
    await expect(
      prisma.$transaction((tx) => service.assertOperationalSeatForUserActivation(tx, userIds[4]!)),
    ).rejects.toThrow('sudah penuh');
  });

  it('shows archived relations as zero occupancy while hard-delete remains fail-closed', async () => {
    const result = await service.findAll({
      academicYear: '2026/2027',
      includeInactive: true,
      page: 1,
      limit: 50,
    });
    const archivedClass = result.data.find((kelas) => kelas.id === archivedClassId);
    expect(archivedClass?.studentCount).toBe(0);
    await expect(service.remove(archivedClassId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns Teacher.id candidates and rejects User.id as a homeroom foreign key', async () => {
    const candidates = await service.findHomeroomCandidates();
    expect(candidates).toContainEqual({ id: teacherId, fullName: 'Guru Proof' });
    expect(candidates.find((candidate) => candidate.id === teacherId)).not.toHaveProperty('userId');
    expect(candidates.find((candidate) => candidate.id === teacherId)).not.toHaveProperty('email');

    await expect(service.update(teacherClassId, { teacherId: userIds[3] })).rejects.toThrow(
      'Guru wali kelas tidak valid',
    );
    await expect(service.update(teacherClassId, { teacherId })).resolves.toMatchObject({
      teacherId,
    });
  });

  it('runs the typed CLI only when manifest and authoritative database bindings match', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'diis-class-reconciliation-'));
    try {
      const target = databaseTargetFromUrl(databaseUrl!);
      const manifest = {
        schemaVersion: 1,
        target,
        studentIds: [archivedStudentId],
        teacherIds: [],
        expectedStudentRelations: 1,
        expectedHomeroomRelations: 0,
      };
      const bytes = JSON.stringify(manifest);
      const manifestPath = join(directory, 'manifest.json');
      await writeFile(manifestPath, bytes, 'utf8');

      const repositoryRoot = resolve(__dirname, '../../../..');
      const tsNode = require.resolve('ts-node/dist/bin.js');
      const baseArgs = [
        tsNode,
        '--project',
        'apps/api/tsconfig.json',
        'scripts/plan-class-reconciliation.ts',
        '--manifest',
        manifestPath,
        '--expected-manifest-sha256',
        sha256(bytes),
        '--expected-target-sha256',
      ];
      const success = spawnSync(process.execPath, [...baseArgs, target.targetSha256], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      expect(success.stderr).toBe('');
      expect(success.status).toBe(0);
      expect(JSON.parse(success.stdout)).toMatchObject({
        verified: true,
        binding: {
          manifestSha256: sha256(bytes),
          targetSha256: target.targetSha256,
          databaseName: target.databaseName,
          schemaName: target.schemaName,
        },
        studentRelationsToClear: [archivedStudentId],
      });

      const wrongTarget = spawnSync(process.execPath, [...baseArgs, '0'.repeat(64)], {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      });
      expect(wrongTarget.status).toBe(1);
      expect(wrongTarget.stderr).toContain('Digest target database');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

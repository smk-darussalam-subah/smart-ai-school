import { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  assertClassReconciliationBinding,
  buildClassReconciliationPlan,
  DatabaseTargetIdentity,
  sha256,
} from './class-reconciliation-plan';
import { acquireUserMutationLocks } from '../users/user-mutation-coordination';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'SHA-256 harus 64 karakter hex kecil');
const StudentRelationSchema = z
  .object({ studentId: z.string().uuid(), classId: z.string().uuid() })
  .strict();
const HomeroomRelationSchema = z
  .object({ teacherId: z.string().uuid(), classId: z.string().uuid() })
  .strict();

function uniqueBy<T>(values: T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

export const ClassReconciliationApplyManifestSchema = z
  .object({
    schemaVersion: z.literal(2),
    target: z
      .object({
        databaseName: z.string().trim().min(1).max(63),
        schemaName: z.string().trim().min(1).max(63),
        targetSha256: Sha256Schema,
      })
      .strict(),
    reviewedDryRunSha256: Sha256Schema,
    studentRelations: z.array(StudentRelationSchema).max(500),
    homeroomRelations: z.array(HomeroomRelationSchema).max(500),
    expectedStudentRelations: z.number().int().nonnegative(),
    expectedHomeroomRelations: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.studentRelations.length + manifest.homeroomRelations.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['studentRelations'],
        message: 'Manifest apply wajib memuat setidaknya satu relasi',
      });
    }
    if (!uniqueBy(manifest.studentRelations, (relation) => relation.studentId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['studentRelations'],
        message: 'Setiap siswa hanya boleh muncul sekali',
      });
    }
    if (!uniqueBy(manifest.homeroomRelations, (relation) => relation.classId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['homeroomRelations'],
        message: 'Setiap kelas wali hanya boleh muncul sekali',
      });
    }
    if (manifest.expectedStudentRelations !== manifest.studentRelations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedStudentRelations'],
        message: 'Jumlah relasi siswa harus sama dengan daftar exact relation',
      });
    }
    if (manifest.expectedHomeroomRelations !== manifest.homeroomRelations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedHomeroomRelations'],
        message: 'Jumlah relasi wali harus sama dengan daftar exact relation',
      });
    }
  });

export type ClassReconciliationApplyManifest = z.infer<
  typeof ClassReconciliationApplyManifestSchema
>;

export interface ClassReconciliationApplyReceipt {
  verified: true;
  committed: true;
  mode: 'apply';
  operationId: string;
  auditLogId: string;
  committedAt: string;
  binding: {
    manifestSha256: string;
    reviewedDryRunSha256: string;
    targetSha256: string;
    databaseName: string;
    schemaName: string;
  };
  changes: {
    studentRelationsCleared: number;
    homeroomRelationsCleared: number;
    teacherFlagsNormalized: number;
  };
  proof: {
    studentRelationsSha256: string;
    homeroomRelationsSha256: string;
    beforeStateSha256: string;
    afterStateSha256: string;
  };
}

interface ApplyInput {
  manifest: ClassReconciliationApplyManifest;
  manifestSha256: string;
  expectedManifestSha256: string;
  expectedDryRunSha256: string;
  expectedTargetSha256: string;
  configuredTarget: DatabaseTargetIdentity;
}

interface LockedStudent {
  id: string;
  userId: string;
  classId: string | null;
  status: 'active' | 'inactive' | 'graduated' | 'dropped';
  deletedAt: Date | null;
  user: { isActive: boolean; deletedAt: Date | null };
}

interface LockedTeacher {
  id: string;
  userId: string;
  isWaliKelas: boolean;
  deletedAt: Date | null;
  user: { isActive: boolean; deletedAt: Date | null };
  walikelas: Array<{ id: string; isActive: boolean }>;
}

function parseManifest(raw: string): ClassReconciliationApplyManifest {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Manifest apply bukan JSON lengkap yang valid');
  }
  const parsed = ClassReconciliationApplyManifestSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'manifest'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Manifest apply tidak valid: ${details}`);
  }
  return parsed.data;
}

export { parseManifest as parseClassReconciliationApplyManifest };

function sortedStudentRelations(manifest: ClassReconciliationApplyManifest) {
  return [...manifest.studentRelations].sort((left, right) =>
    left.studentId.localeCompare(right.studentId),
  );
}

function sortedHomeroomRelations(manifest: ClassReconciliationApplyManifest) {
  return [...manifest.homeroomRelations].sort(
    (left, right) =>
      left.classId.localeCompare(right.classId) || left.teacherId.localeCompare(right.teacherId),
  );
}

function relationDigests(manifest: ClassReconciliationApplyManifest) {
  return {
    studentRelationsSha256: sha256(JSON.stringify(sortedStudentRelations(manifest))),
    homeroomRelationsSha256: sha256(JSON.stringify(sortedHomeroomRelations(manifest))),
  };
}

function assertExactRelationSnapshot(
  manifest: ClassReconciliationApplyManifest,
  students: LockedStudent[],
  teachers: LockedTeacher[],
): void {
  const actualStudentRelations = students
    .filter((student): student is LockedStudent & { classId: string } => student.classId !== null)
    .map((student) => ({ studentId: student.id, classId: student.classId }))
    .sort((left, right) => left.studentId.localeCompare(right.studentId));
  const actualHomeroomRelations = teachers
    .flatMap((teacher) =>
      teacher.walikelas.map((kelas) => ({ teacherId: teacher.id, classId: kelas.id })),
    )
    .sort(
      (left, right) =>
        left.classId.localeCompare(right.classId) || left.teacherId.localeCompare(right.teacherId),
    );

  if (JSON.stringify(actualStudentRelations) !== JSON.stringify(sortedStudentRelations(manifest))) {
    throw new Error('Relasi siswa berubah sejak manifest apply ditinjau');
  }
  if (
    JSON.stringify(actualHomeroomRelations) !== JSON.stringify(sortedHomeroomRelations(manifest))
  ) {
    throw new Error('Relasi wali kelas berubah sejak manifest apply ditinjau');
  }
}

function stateSha256(students: LockedStudent[], teachers: LockedTeacher[]): string {
  return sha256(
    JSON.stringify({
      students: students
        .map((student) => ({
          id: student.id,
          classId: student.classId,
          status: student.status,
          deletedAt: student.deletedAt?.toISOString() ?? null,
          userActive: student.user.isActive,
          userDeletedAt: student.user.deletedAt?.toISOString() ?? null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      teachers: teachers
        .map((teacher) => ({
          id: teacher.id,
          isWaliKelas: teacher.isWaliKelas,
          deletedAt: teacher.deletedAt?.toISOString() ?? null,
          userActive: teacher.user.isActive,
          userDeletedAt: teacher.user.deletedAt?.toISOString() ?? null,
          classIds: teacher.walikelas.map((kelas) => kelas.id).sort(),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    }),
  );
}

async function lockRows(
  tx: Prisma.TransactionClient,
  table: 'academic.classes' | 'student.students' | 'teacher.teachers' | 'auth.users',
  ids: string[],
): Promise<void> {
  const sortedIds = [...new Set(ids)].sort();
  if (sortedIds.length === 0) return;
  const values = Prisma.join(sortedIds.map((id) => Prisma.sql`${id}::uuid`));
  let rows: Array<{ id: string }>;
  if (table === 'academic.classes') {
    rows = await tx.$queryRaw(
      Prisma.sql`SELECT id FROM academic.classes WHERE id IN (${values}) ORDER BY id FOR UPDATE`,
    );
  } else if (table === 'student.students') {
    rows = await tx.$queryRaw(
      Prisma.sql`SELECT id FROM student.students WHERE id IN (${values}) ORDER BY id FOR UPDATE`,
    );
  } else if (table === 'teacher.teachers') {
    rows = await tx.$queryRaw(
      Prisma.sql`SELECT id FROM teacher.teachers WHERE id IN (${values}) ORDER BY id FOR UPDATE`,
    );
  } else {
    rows = await tx.$queryRaw(
      Prisma.sql`SELECT id FROM auth.users WHERE id IN (${values}) ORDER BY id FOR UPDATE`,
    );
  }
  if (rows.length !== sortedIds.length) {
    throw new Error('Baris database exact-ID tidak lengkap; apply dibatalkan');
  }
}

async function readLockedState(
  tx: Prisma.TransactionClient,
  manifest: ClassReconciliationApplyManifest,
): Promise<{ students: LockedStudent[]; teachers: LockedTeacher[] }> {
  const studentIds = manifest.studentRelations.map((relation) => relation.studentId);
  const teacherIds = [...new Set(manifest.homeroomRelations.map((relation) => relation.teacherId))];
  const [students, teachers] = await Promise.all([
    tx.student.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true,
        userId: true,
        classId: true,
        status: true,
        deletedAt: true,
        user: { select: { isActive: true, deletedAt: true } },
      },
    }),
    tx.teacher.findMany({
      where: { id: { in: teacherIds } },
      select: {
        id: true,
        userId: true,
        isWaliKelas: true,
        deletedAt: true,
        user: { select: { isActive: true, deletedAt: true } },
        walikelas: { select: { id: true, isActive: true } },
      },
    }),
  ]);
  return { students, teachers };
}

async function assertBindingInsideTransaction(
  tx: Prisma.TransactionClient,
  input: ApplyInput,
): Promise<void> {
  const identityRows = await tx.$queryRaw<Array<{ databaseName: string; schemaName: string }>>(
    Prisma.sql`SELECT current_database() AS "databaseName", current_schema() AS "schemaName"`,
  );
  const identity = identityRows[0];
  if (!identity) throw new Error('Database tidak mengembalikan identitas target');
  assertClassReconciliationBinding({
    manifest: {
      schemaVersion: 1,
      target: input.manifest.target,
      studentIds: input.manifest.studentRelations.map((relation) => relation.studentId),
      teacherIds: [
        ...new Set(input.manifest.homeroomRelations.map((relation) => relation.teacherId)),
      ],
      expectedStudentRelations: input.manifest.expectedStudentRelations,
      expectedHomeroomRelations: input.manifest.expectedHomeroomRelations,
    },
    manifestSha256: input.manifestSha256,
    expectedManifestSha256: input.expectedManifestSha256,
    configuredTarget: input.configuredTarget,
    expectedTargetSha256: input.expectedTargetSha256,
    observedDatabaseName: identity.databaseName,
    observedSchemaName: identity.schemaName,
  });
  if (input.manifest.reviewedDryRunSha256 !== input.expectedDryRunSha256) {
    throw new Error('Digest dry-run yang ditinjau tidak cocok dengan approval apply');
  }
}

export async function applyClassReconciliation(
  prisma: PrismaClient,
  input: ApplyInput,
): Promise<ClassReconciliationApplyReceipt> {
  const operationId = sha256(
    `class-reconciliation-apply-v2:${input.manifestSha256}:${input.expectedTargetSha256}`,
  );
  const relations = relationDigests(input.manifest);

  return prisma.$transaction(
    async (tx) => {
      const [globalLock] = await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended('diis:class-reconciliation:apply', 0)) AS acquired`,
      );
      if (!globalLock?.acquired) {
        throw new Error('Operator rekonsiliasi lain sedang berjalan; apply dibatalkan');
      }
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '25s'");
      await assertBindingInsideTransaction(tx, input);

      const existing = await tx.auditLog.findFirst({
        where: {
          action: 'class.reconciliation.apply',
          resourceType: 'class_reconciliation',
          resourceId: operationId,
          outcome: 'success',
        },
        select: { id: true },
      });
      if (existing) throw new Error('Manifest apply ini sudah pernah berhasil dijalankan');

      const preLockState = await readLockedState(tx, input.manifest);
      await acquireUserMutationLocks(tx, [
        ...preLockState.students.map((student) => student.userId),
        ...preLockState.teachers.map((teacher) => teacher.userId),
      ]);

      const classIds = [
        ...input.manifest.studentRelations.map((relation) => relation.classId),
        ...input.manifest.homeroomRelations.map((relation) => relation.classId),
      ];
      const studentIds = input.manifest.studentRelations.map((relation) => relation.studentId);
      const teacherIds = [
        ...new Set(input.manifest.homeroomRelations.map((relation) => relation.teacherId)),
      ];
      await lockRows(tx, 'academic.classes', classIds);
      await lockRows(tx, 'student.students', studentIds);
      await lockRows(tx, 'teacher.teachers', teacherIds);

      await lockRows(tx, 'auth.users', [
        ...preLockState.students.map((student) => student.userId),
        ...preLockState.teachers.map((teacher) => teacher.userId),
      ]);
      const before = await readLockedState(tx, input.manifest);
      const preLockUserBindings = [
        ...preLockState.students.map((student) => `${student.id}:${student.userId}`),
        ...preLockState.teachers.map((teacher) => `${teacher.id}:${teacher.userId}`),
      ].sort();
      const lockedUserBindings = [
        ...before.students.map((student) => `${student.id}:${student.userId}`),
        ...before.teachers.map((teacher) => `${teacher.id}:${teacher.userId}`),
      ].sort();
      if (JSON.stringify(preLockUserBindings) !== JSON.stringify(lockedUserBindings)) {
        throw new Error('Relasi identitas pengguna berubah saat lock diperoleh');
      }

      buildClassReconciliationPlan(
        {
          schemaVersion: 1,
          target: input.manifest.target,
          studentIds,
          teacherIds,
          expectedStudentRelations: input.manifest.expectedStudentRelations,
          expectedHomeroomRelations: input.manifest.expectedHomeroomRelations,
        },
        before.students,
        before.teachers,
      );
      assertExactRelationSnapshot(input.manifest, before.students, before.teachers);
      const beforeStateSha256 = stateSha256(before.students, before.teachers);

      let studentRelationsCleared = 0;
      for (const relation of sortedStudentRelations(input.manifest)) {
        const result = await tx.student.updateMany({
          where: { id: relation.studentId, classId: relation.classId },
          data: { classId: null },
        });
        if (result.count !== 1) throw new Error('Jumlah perubahan relasi siswa tidak exact');
        studentRelationsCleared += result.count;
      }

      let homeroomRelationsCleared = 0;
      for (const relation of sortedHomeroomRelations(input.manifest)) {
        const result = await tx.class.updateMany({
          where: { id: relation.classId, teacherId: relation.teacherId },
          data: { teacherId: null },
        });
        if (result.count !== 1) throw new Error('Jumlah perubahan relasi wali tidak exact');
        homeroomRelationsCleared += result.count;
      }

      const teacherFlags = await tx.teacher.updateMany({
        where: { id: { in: teacherIds } },
        data: { isWaliKelas: false },
      });
      if (teacherFlags.count !== teacherIds.length) {
        throw new Error('Jumlah normalisasi penanda wali tidak exact');
      }

      if (
        studentRelationsCleared !== input.manifest.expectedStudentRelations ||
        homeroomRelationsCleared !== input.manifest.expectedHomeroomRelations
      ) {
        throw new Error('Jumlah perubahan akhir tidak cocok dengan manifest');
      }

      const after = await readLockedState(tx, input.manifest);
      if (after.students.some((student) => student.classId !== null)) {
        throw new Error('Verifikasi pascamutasi menemukan relasi siswa tersisa');
      }
      if (after.teachers.some((teacher) => teacher.walikelas.length !== 0 || teacher.isWaliKelas)) {
        throw new Error('Verifikasi pascamutasi menemukan relasi wali tersisa');
      }
      const afterStateSha256 = stateSha256(after.students, after.teachers);

      const audit = await tx.auditLog.create({
        data: {
          actorId: null,
          actorUsername: 'controlled-reconciliation-operator',
          actorRoles: ['SYSTEM'],
          action: 'class.reconciliation.apply',
          resourceType: 'class_reconciliation',
          resourceId: operationId,
          method: 'CLI',
          path: 'scripts/apply-class-reconciliation.ts',
          statusCode: 200,
          outcome: 'success',
          ip: null,
          userAgent: null,
          metadata: {
            schemaVersion: 2,
            manifestSha256: input.manifestSha256,
            reviewedDryRunSha256: input.expectedDryRunSha256,
            targetSha256: input.expectedTargetSha256,
            studentRelationsCleared,
            homeroomRelationsCleared,
            teacherFlagsNormalized: teacherFlags.count,
            ...relations,
            beforeStateSha256,
            afterStateSha256,
          },
        },
        select: { id: true, createdAt: true },
      });

      return {
        verified: true,
        committed: true,
        mode: 'apply',
        operationId,
        auditLogId: audit.id,
        committedAt: audit.createdAt.toISOString(),
        binding: {
          manifestSha256: input.manifestSha256,
          reviewedDryRunSha256: input.expectedDryRunSha256,
          targetSha256: input.expectedTargetSha256,
          databaseName: input.configuredTarget.databaseName,
          schemaName: input.configuredTarget.schemaName,
        },
        changes: {
          studentRelationsCleared,
          homeroomRelationsCleared,
          teacherFlagsNormalized: teacherFlags.count,
        },
        proof: { ...relations, beforeStateSha256, afterStateSha256 },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}

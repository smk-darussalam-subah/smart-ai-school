import { Prisma, PrismaClient, UserRole } from '@prisma/client';

const definitions = [
  ['lms.read', 'Melihat pembelajaran sesuai kewenangan', 'academic'],
  ['lms.own.manage', 'Mengelola LMS dan asesmen milik sendiri', 'academic'],
  ['lms.progress.manage', 'Menyimpan pengerjaan pembelajaran sendiri', 'academic'],
  ['academic.grade.manage', 'Mengelola konfigurasi KKTP', 'academic'],
  ['academic.schedule.draft.read', 'Melihat draft penjadwalan', 'academic'],
  ['academic.schedule.edit', 'Mengelola draft penjadwalan', 'academic'],
  ['user.read', 'Melihat daftar pengguna sesuai kewenangan', 'users'],
  ['user.manage', 'Mengelola akun sesuai kewenangan', 'users'],
] as const;

const roleGrants: ReadonlyArray<readonly [UserRole, string]> = [
  ['SUPER_ADMIN', 'lms.read'],
  ['GURU', 'lms.read'],
  ['SISWA', 'lms.read'],
  ['ORANG_TUA', 'lms.read'],
  ['KEPALA_SEKOLAH', 'lms.read'],
  ['GURU', 'lms.own.manage'],
  ['SISWA', 'lms.progress.manage'],
  ['SUPER_ADMIN', 'academic.grade.manage'],
  ['KEPALA_SEKOLAH', 'academic.grade.manage'],
  ['SUPER_ADMIN', 'academic.schedule.draft.read'],
  ['SUPER_ADMIN', 'academic.schedule.edit'],
  ['SUPER_ADMIN', 'user.read'],
  ['TATA_USAHA', 'user.read'],
  ['SUPER_ADMIN', 'user.manage'],
  ['TATA_USAHA', 'user.manage'],
];
const positionGrants = [['KEPALA_SEKOLAH', 'academic.grade.manage']] as const;

/** Additive, idempotent, no user overrides/deletions. Caller owns operational authorization. */
export async function reconcileRuntimePermissions(prisma: PrismaClient, apply = false) {
  return prisma.$transaction(
    async (tx) => {
      if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const existing = await tx.permission.findMany({
        where: { code: { in: definitions.map(([code]) => code) } },
        include: { rolePermissions: true },
      });
      const positions = await tx.position.findMany({ where: { code: 'KEPALA_SEKOLAH' } });
      const positionPermissions = await tx.positionPermission.findMany({
        where: { positionId: { in: positions.map((p) => p.id) } },
      });
      const byCode = new Map(existing.map((p) => [p.code, p]));
      const missingDefinitions = definitions
        .filter(([code]) => !byCode.has(code))
        .map(([code]) => code);
      const missingRoles = roleGrants.filter(
        ([role, code]) => !byCode.get(code)?.rolePermissions.some((grant) => grant.role === role),
      );
      const missingPositions = positionGrants.filter(([position, code]) => {
        const id = positions.find((p) => p.code === position)?.id;
        return (
          id &&
          !positionPermissions.some(
            (grant) => grant.positionId === id && grant.permissionId === byCode.get(code)?.id,
          )
        );
      });
      if (apply) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('diis:runtime-permissions:reconcile:v1'))`;
        for (const [code, description, module] of definitions) {
          await tx.permission.upsert({
            where: { code },
            update: {},
            create: { code, description, module },
          });
        }
        const records = await tx.permission.findMany({
          where: { code: { in: definitions.map(([c]) => c) } },
        });
        const ids = new Map(records.map((p) => [p.code, p.id]));
        for (const [role, code] of roleGrants) {
          const permissionId = ids.get(code)!;
          await tx.rolePermission.upsert({
            where: { role_permissionId: { role, permissionId } },
            update: {},
            create: { role, permissionId },
          });
        }
        for (const [position, code] of positionGrants) {
          const positionId = positions.find((p) => p.code === position)?.id;
          if (!positionId) continue;
          const permissionId = ids.get(code)!;
          await tx.positionPermission.upsert({
            where: { positionId_permissionId: { positionId, permissionId } },
            update: {},
            create: { positionId, permissionId },
          });
        }
      }
      return {
        apply,
        missingDefinitions,
        missingRoles,
        missingPositions,
        overridesModified: false,
        grantsRemoved: false,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
  const expected = process.argv[process.argv.indexOf('--database') + 1];
  if (apply && (!process.argv.includes('--database') || expected !== database))
    throw new Error(
      'Apply memerlukan --database yang cocok dengan target; runtime gate tetap wajib.',
    );
  const prisma = new PrismaClient();
  reconcileRuntimePermissions(prisma, apply)
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      console.error('Rekonsiliasi gagal; transaksi dibatalkan.');
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

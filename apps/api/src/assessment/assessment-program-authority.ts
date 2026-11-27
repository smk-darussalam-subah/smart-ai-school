import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthUser } from '@smk/auth';
import { acquireIdentityMutationLock } from '../common/helpers/identity-mutation-lock';
import type { PermissionsService } from '../permissions/permissions.service';

export const ASSESSMENT_STAFF_ROLES = ['GURU', 'TATA_USAHA', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'] as const;
export const programStaffRoles = [...ASSESSMENT_STAFF_ROLES, 'WAKA_KURIKULUM'] as const;

export async function requireProgramStaff(db: Prisma.TransactionClient, user: AuthUser, write = false) {
  if (write) await acquireIdentityMutationLock(db);
  const actor = await db.user.findFirst({
    where: { keycloakId: user.keycloakId, isActive: true, deletedAt: null, role: { in: [...ASSESSMENT_STAFF_ROLES] } },
    select: { id: true, role: true },
  });
  if (!actor) throw new ForbiddenException('Akun petugas sekolah tidak aktif.');
  return actor;
}

export async function programAuthority(db: Prisma.TransactionClient, permissions: PermissionsService, user: AuthUser,
  actor: Awaited<ReturnType<typeof requireProgramStaff>>) {
  const positions = await permissions.getActivePositionCodes(user.keycloakId, undefined, db);
  const manager = (actor.role === 'SUPER_ADMIN' || positions.has('WAKA_KURIKULUM')) &&
    await permissions.hasFreshPermission(user.keycloakId, 'academic.schedule.edit', db);
  return {
    manager,
    canReadSchool: actor.role === 'SUPER_ADMIN' || positions.has('KEPALA_SEKOLAH') || positions.has('WAKA_KURIKULUM'),
    counselor: actor.role === 'SUPER_ADMIN' || positions.has('GURU_BK'),
  };
}

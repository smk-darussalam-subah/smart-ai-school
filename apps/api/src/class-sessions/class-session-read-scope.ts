import { ForbiddenException } from '@nestjs/common';
import { isPositionCode, type AuthUser } from '@smk/auth';
import type { Prisma } from '@prisma/client';
import type { PermissionsService } from '../permissions/permissions.service';
import { resolveOwnTeachingRead } from '../common/helpers/own-teaching-read';
import {
  isKaprogScopedReader,
  kaprogClassWhere,
  resolveActiveKaprogMajorScope,
} from '../common/helpers/appointment-scope.helper';

type ReadQuery = { scope?: 'own'; teacherId?: string; classId?: string };
const ACADEMIC_OPERATIONS_ROLES = new Set([
  'SUPER_ADMIN',
  'TATA_USAHA',
  'KEPALA_SEKOLAH',
  'WAKA_KURIKULUM',
]);

/** Domain-local authority, usable on a transaction client: no pool checkout or list presenter. */
export async function resolveClassSessionReadScope(
  db: Prisma.TransactionClient,
  permissions: PermissionsService,
  caller: AuthUser,
  query: ReadQuery,
): Promise<{ where: Prisma.ClassSessionWhereInput; user: AuthUser }> {
  const actor = await db.user.findFirst({
    where: { keycloakId: caller.keycloakId, isActive: true, deletedAt: null },
    select: { role: true },
  });
  if (
    !actor ||
    !['SUPER_ADMIN', 'TATA_USAHA', 'GURU', 'KEPALA_SEKOLAH'].includes(actor.role) ||
    !(await permissions.hasFreshPermission(caller.keycloakId, 'academic.class-session.read', db))
  )
    throw new ForbiddenException('Anda tidak memiliki akses ke sesi pembelajaran ini');
  const positions = await permissions.getActivePositionCodes(caller.keycloakId, undefined, db);
  const user: AuthUser = {
    ...caller,
    roles: [actor.role, ...[...positions].filter(isPositionCode)],
  };
  const where: Prisma.ClassSessionWhereInput = query.classId ? { classId: query.classId } : {};
  if (query.scope === 'own') {
    where.assignedTeacherId = (await resolveOwnTeachingRead(db, user, 'own', query.teacherId))!;
  } else if (user.roles.some((role) => ACADEMIC_OPERATIONS_ROLES.has(role))) {
    if (query.teacherId) where.assignedTeacherId = query.teacherId;
  } else if (isKaprogScopedReader(user)) {
    const scope = await resolveActiveKaprogMajorScope(db, user);
    where.academicYearId = scope.academicYearId;
    where.class = kaprogClassWhere(scope);
    if (query.teacherId) where.assignedTeacherId = query.teacherId;
  } else if (user.roles.includes('GURU')) {
    const teacherId = (await resolveOwnTeachingRead(db, user, 'own'))!;
    where.assignedTeacherId = teacherId;
    if (query.teacherId && query.teacherId !== teacherId) where.id = { in: [] };
  } else throw new ForbiddenException('Lingkup pembacaan sesi belum dapat diverifikasi');
  return { where, user };
}

import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from '@smk/auth';
import type { Prisma } from '@prisma/client';
import { OPERATIONAL_TEACHER_WHERE } from './operational-teacher';

/** Explicit personal read scope. Never replaces appointment scope on default reads or mutations. */
export async function resolveOwnTeachingRead(
  prisma: Prisma.TransactionClient,
  user: AuthUser,
  scope?: 'own',
  requestedTeacherId?: string,
): Promise<string | null> {
  if (scope !== 'own') return null;
  if (!user.roles.includes('GURU'))
    throw new ForbiddenException('Ruang pengajaran pribadi hanya untuk guru aktif');
  const teacher = await prisma.teacher.findFirst({
    where: {
      ...OPERATIONAL_TEACHER_WHERE,
      user: { ...OPERATIONAL_TEACHER_WHERE.user, keycloakId: user.keycloakId },
    },
    select: { id: true },
  });
  if (!teacher || (requestedTeacherId && requestedTeacherId !== teacher.id))
    throw new ForbiddenException('Pengajaran pribadi hanya dapat menampilkan data milik sendiri');
  return teacher.id;
}

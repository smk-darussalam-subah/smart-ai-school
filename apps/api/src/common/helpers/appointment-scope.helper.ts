import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getSchoolDate } from './school-date.helper';

export type ActiveKaprogMajorScope = {
  academicYearId: string;
  academicYearCode: string;
  majorIds: string[];
  majorCodes: string[];
};

const GLOBAL_ACADEMIC_READ_ROLES = new Set([
  'SUPER_ADMIN',
  'KEPALA_SEKOLAH',
  'TATA_USAHA',
  'WAKA_KURIKULUM',
]);

export function isKaprogScopedReader(user: AuthUser): boolean {
  return user.roles.includes('KAPROG') &&
    !user.roles.some((role) => GLOBAL_ACADEMIC_READ_ROLES.has(role));
}

export async function resolveActiveKaprogMajorScope(
  prisma: PrismaService,
  user: AuthUser,
  schoolDate: Date = getSchoolDate(),
): Promise<ActiveKaprogMajorScope> {
  const authUser = await prisma.user.findUnique({
    where: { keycloakId: user.keycloakId },
    select: { id: true, isActive: true, deletedAt: true },
  });
  if (!authUser?.isActive || authUser.deletedAt) {
    throw new ForbiddenException('Akun KAPROG tidak aktif atau tidak ditemukan');
  }

  const activeYears = await prisma.academicYear.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
    orderBy: { startDate: 'desc' },
    take: 2,
  });
  if (activeYears.length !== 1) {
    throw new ForbiddenException('Konfigurasi tahun ajaran aktif tidak valid');
  }

  const activeYear = activeYears[0]!;
  const appointments = await prisma.appointment.findMany({
    where: {
      status: 'ACTIVE',
      staff: { userId: authUser.id, deletedAt: null },
      position: { code: 'KAPROG', scopeType: 'MAJOR', isActive: true },
      academicYearId: activeYear.id,
      majorId: { not: null },
      major: { isActive: true },
      effectiveFrom: { lte: schoolDate },
      OR: [
        { effectiveUntil: null },
        { effectiveUntil: { gte: schoolDate } },
      ],
    },
    select: {
      majorId: true,
      major: { select: { id: true, code: true } },
    },
  });

  const majorScopes = new Map<string, string>();
  for (const appointment of appointments) {
    if (appointment.majorId && appointment.major?.id === appointment.majorId) {
      majorScopes.set(appointment.majorId, appointment.major.code);
    }
  }
  if (majorScopes.size === 0) {
    throw new ForbiddenException('Appointment KAPROG aktif tidak memiliki scope jurusan yang valid');
  }

  return {
    academicYearId: activeYear.id,
    academicYearCode: activeYear.code,
    majorIds: [...majorScopes.keys()],
    majorCodes: [...majorScopes.values()],
  };
}

export function kaprogClassWhere(scope: ActiveKaprogMajorScope): Prisma.ClassWhereInput {
  return {
    isActive: true,
    academicYear: scope.academicYearCode,
    majorCode: { in: scope.majorCodes },
  };
}

export async function assertClassInKaprogScope(
  prisma: PrismaService,
  classId: string,
  scope: ActiveKaprogMajorScope,
): Promise<void> {
  const allowedClass = await prisma.class.findFirst({
    where: { id: classId, ...kaprogClassWhere(scope) },
    select: { id: true },
  });
  if (!allowedClass) {
    throw new ForbiddenException('Kelas berada di luar scope jurusan KAPROG aktif');
  }
}

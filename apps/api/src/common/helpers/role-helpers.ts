// =============================================================================
// Shared Role Helpers — ekstrak dari 4+ service yang menduplikasi code ini.
// AttendanceService, GradeService, FinanceService, ScheduleService,
// TeachingAssignmentService semuanya punya copy-paste yang identik.
// =============================================================================

import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '@smk/auth';
import { PrismaService } from '../../prisma/prisma.service';

export const ELEVATED_ROLES = ['SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA'] as const;

export function isElevated(user: AuthUser): boolean {
  return user.roles.some((r) => (ELEVATED_ROLES as readonly string[]).includes(r));
}

export function isGuruOnly(user: AuthUser): boolean {
  return user.roles.includes('GURU') && !isElevated(user);
}

export function isSiswaOnly(user: AuthUser): boolean {
  return (
    user.roles.includes('SISWA') &&
    !isElevated(user) &&
    !user.roles.includes('GURU')
  );
}

export function isOrangTuaOnly(user: AuthUser): boolean {
  return (
    user.roles.includes('ORANG_TUA') &&
    !isElevated(user) &&
    !user.roles.includes('GURU') &&
    !user.roles.includes('SISWA')
  );
}

/** keycloakId → auth.users.id */
export async function resolveUserId(prisma: PrismaService, keycloakId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { keycloakId },
    select: { id: true },
  });
  if (!user) throw new ForbiddenException('User tidak ditemukan');
  return user.id;
}

/** keycloakId → teacher.id */
export async function resolveTeacherId(prisma: PrismaService, keycloakId: string): Promise<string> {
  const userId = await resolveUserId(prisma, keycloakId);
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!teacher) throw new ForbiddenException('Profil guru tidak ditemukan untuk akun ini');
  return teacher.id;
}

/** keycloakId → student.id */
export async function resolveSiswaId(prisma: PrismaService, keycloakId: string): Promise<string> {
  const userId = await resolveUserId(prisma, keycloakId);
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw new ForbiddenException('Profil siswa tidak ditemukan untuk akun ini');
  return student.id;
}

/** keycloakId → semua classId yang diajar guru */
export async function resolveGuruClassIds(prisma: PrismaService, keycloakId: string): Promise<string[]> {
  const teacherId = await resolveTeacherId(prisma, keycloakId);
  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId },
    select: { classId: true },
    distinct: ['classId'],
  });
  return assignments.map((a) => a.classId);
}

/** keycloakId → classId siswa (untuk SISWA role) */
export async function resolveSiswaClassId(prisma: PrismaService, keycloakId: string): Promise<string | null> {
  const userId = await resolveUserId(prisma, keycloakId);
  const student = await prisma.student.findUnique({
    where: { userId },
    select: { classId: true },
  });
  return student?.classId ?? null;
}

import { Prisma } from '@prisma/client';

/** A retained Teacher row is history, not proof of current teaching authority. */
export const OPERATIONAL_TEACHER_WHERE = {
  deletedAt: null,
  user: {
    isActive: true,
    deletedAt: null,
    role: 'GURU',
    staff: { is: { deletedAt: null } },
  },
} satisfies Prisma.TeacherWhereInput;

export const OPERATIONAL_TEACHER_SELECT = {
  deletedAt: true,
  user: {
    select: {
      id: true,
      keycloakId: true,
      fullName: true,
      isActive: true,
      deletedAt: true,
      role: true,
      staff: { select: { deletedAt: true } },
    },
  },
} satisfies Prisma.TeacherSelect;

type SelectedTeacher = Prisma.TeacherGetPayload<{ select: typeof OPERATIONAL_TEACHER_SELECT }>;
type TeacherIdentity = Pick<SelectedTeacher, 'deletedAt'> & {
  user: Pick<SelectedTeacher['user'], 'isActive' | 'deletedAt' | 'role' | 'staff'>;
};

export function isOperationalTeacher(teacher: TeacherIdentity | null | undefined): boolean {
  return Boolean(
    teacher &&
    teacher.deletedAt === null &&
    teacher.user.isActive &&
    teacher.user.deletedAt === null &&
    teacher.user.role === 'GURU' &&
    teacher.user.staff?.deletedAt === null,
  );
}

/** Call only after domain and identity-mutation locks; retain eligibility until commit. */
export async function lockOperationalTeachers(
  tx: Prisma.TransactionClient,
  teacherIds: readonly string[],
) {
  const ids = [...new Set(teacherIds)].sort();
  if (!ids.length) return new Set<string>();
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT t.id FROM teacher.teachers t
    JOIN auth.users u ON u.id = t.user_id
    JOIN school.staff s ON s.user_id = u.id
    WHERE t.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      AND t.deleted_at IS NULL AND u.deleted_at IS NULL AND u.is_active = true
      AND u.role = 'GURU' AND s.deleted_at IS NULL
    ORDER BY t.id FOR SHARE OF t, u, s`);
  return new Set(rows.map((row) => row.id));
}

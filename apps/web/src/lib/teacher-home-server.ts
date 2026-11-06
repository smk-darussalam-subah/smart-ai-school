import { z } from 'zod';
import { apiFetchResult } from './api';
import { academicPagesResult } from './academic-pages-server';
import {
  HomeSessionsSchema,
  HomeJournalSchema,
  HomeAssessmentsSchema,
  homeAttendance,
  homeJournalPending,
  type HomeRead,
  type TeacherHomeData,
} from './teacher-home';

export async function loadTeacherHome(
  token: string,
  date: string,
  period: { academicYear: string; semester: number } | null,
  can: (permission: string) => boolean,
): Promise<TeacherHomeData> {
  const unavailable = { state: 'error', message: 'Data belum tersedia. Coba muat ulang.' } as const;
  const denied = { state: 'denied', message: 'Akses ini belum tersedia untuk akun Anda.' } as const;
  const read = async <T extends { id: string }>(
    path: string,
    schema: z.ZodType<T[]>,
    allowed: boolean,
  ): Promise<HomeRead<T[]>> => {
    if (!allowed) return denied;
    const result = await academicPagesResult<T>(path, token);
    if (result.status !== 'success') return result.status === 'forbidden' ? denied : unavailable;
    const parsed = schema.safeParse(result.data.data);
    return parsed.success ? { state: 'ready', data: parsed.data } : unavailable;
  };
  if (!period)
    return {
      sessions: unavailable,
      attendance: unavailable,
      journal: unavailable,
      assessment: unavailable,
    };
  const filter = new URLSearchParams({
    scope: 'own',
    academicYear: period.academicYear,
    semester: String(period.semester),
  });
  const [owner, sessions, journals, assessments, attendance] = await Promise.all([
    apiFetchResult<{ teacherId: string }>('/teaching-assignments/me/context', token),
    read(
      `/class-sessions?${filter}&date=${date}`,
      HomeSessionsSchema,
      can('academic.class-session.read'),
    ),
    read(
      `/class-activities?scope=own&from=${date}&to=${date}`,
      HomeJournalSchema,
      can('activity.read'),
    ),
    read(`/assessment/sessions?${filter}`, HomeAssessmentsSchema, can('lms.read')),
    can('academic.attendance.read') && can('academic.class-session.read')
      ? apiFetchResult<unknown>(
          `/attendance/student-sessions/overview?${filter}&from=${date}&to=${date}`,
          token,
        )
      : Promise.resolve(null),
  ]);
  if (owner.status !== 'success' || !z.string().uuid().safeParse(owner.data.teacherId).success)
    return {
      sessions: owner.status === 'forbidden' ? denied : unavailable,
      attendance: unavailable,
      journal: unavailable,
      assessment: assessments.state === 'denied' ? denied : unavailable,
    };
  const teacherId = owner.data.teacherId;
  const ownSessions =
    sessions.state === 'ready' &&
    sessions.data.every(
      (s) =>
        s.assignedTeacherId === teacherId &&
        s.serviceDate.slice(0, 10) === date &&
        s.academicYear.code === period.academicYear &&
        s.semester.number === period.semester,
    )
      ? sessions
      : sessions.state === 'ready'
        ? unavailable
        : sessions;
  const ownAssessments =
    assessments.state === 'ready' &&
    assessments.data.every(
      (a) =>
        a.teacherId === teacherId &&
        a.academicYear === period.academicYear &&
        a.semester === period.semester,
    );
  return {
    sessions: ownSessions,
    attendance: !attendance
      ? denied
      : attendance.status === 'forbidden'
        ? denied
        : attendance.status !== 'success' || ownSessions.state !== 'ready'
          ? unavailable
          : homeAttendance(ownSessions.data, attendance.data, date),
    journal:
      journals.state !== 'ready'
        ? journals
        : ownSessions.state !== 'ready'
          ? unavailable
          : {
              state: 'ready',
              data: homeJournalPending(ownSessions.data, journals.data, date, teacherId),
            },
    assessment:
      assessments.state !== 'ready'
        ? assessments
        : !ownAssessments
          ? unavailable
          : {
              state: 'ready',
              data: assessments.data.filter((a) => ['draft', 'active'].includes(a.status)).length,
            },
  };
}

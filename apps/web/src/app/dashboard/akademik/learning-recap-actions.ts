'use server';

import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { academicPagesResult } from '@/lib/academic-pages-server';
import { apiFetchResult } from '@/lib/api';
import { SessionRosterSchema } from '@/lib/session-attendance';
import {
  LearningSessionSchema,
  RecapQuerySchema,
  SupportingModuleSchema,
  SupportingJournalSchema,
  SupportingAttendanceSchema,
  SupportingAssessmentSchema,
  type LearningSession,
  type LearningRead,
  type LearningContext,
  type RecapQuery,
  type LearningScope,
} from '@/lib/learning-recap';

/** All reads keep the API's effective permission and row-scope checks; client filters never grant access. */
async function readRows<T extends { id: string }>(
  path: string,
  token: string,
  schema: z.ZodType<T>,
): Promise<LearningRead<T[]>> {
  const result = await academicPagesResult<T>(path, token);
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        result.status === 'forbidden'
          ? 'Anda tidak memiliki akses ke data ini.'
          : 'Data belum dapat dimuat. Coba muat ulang.',
    };
  const parsed = z.array(schema).safeParse(result.data.data);
  return parsed.success
    ? { state: 'ready', data: parsed.data }
    : { state: 'error', message: 'Data belum dapat dibaca dengan lengkap. Coba muat ulang.' };
}

export async function fetchLearningRecap(
  input: RecapQuery,
): Promise<LearningRead<LearningSession[]>> {
  const parsed = RecapQuerySchema.safeParse(input);
  if (!parsed.success)
    return { state: 'error', message: 'Periksa periode dan rentang tanggal (maksimal 31 hari).' };
  const session = await getServerSession(authOptions);
  if (!session?.accessToken)
    return { state: 'denied', message: 'Sesi masuk telah berakhir. Silakan masuk kembali.' };
  const { scope, ...filters } = parsed.data;
  const query = new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)]));
  if (scope === 'own') query.set('scope', 'own');
  const read = await readRows(
    `/class-sessions?${query}`,
    session.accessToken,
    LearningSessionSchema,
  );
  if (
    read.state === 'ready' &&
    read.data.some(
      (x) =>
        x.academicYear.code !== input.academicYear ||
        x.semester.number !== input.semester ||
        x.serviceDate.slice(0, 10) < input.from ||
        x.serviceDate.slice(0, 10) > input.until,
    )
  )
    return { state: 'error', message: 'Data tidak sesuai periode pilihan. Muat ulang.' };
  return read;
}

export async function fetchLearningContext(
  id: string,
  scope: LearningScope,
): Promise<LearningRead<{ session: LearningSession; context: LearningContext }>> {
  if (!z.string().uuid().safeParse(id).success || !['own', 'operations'].includes(scope))
    return { state: 'error', message: 'Sesi tidak valid.' };
  const auth = await getServerSession(authOptions);
  if (!auth?.accessToken) return { state: 'denied', message: 'Silakan masuk kembali.' };
  const own = scope === 'own' ? '&scope=own' : '';
  // Re-authorize the exact session on every request. Never trust class/teacher IDs from the browser.
  const result = await readRows(
    `/class-sessions?id=${id}${own}`,
    auth.accessToken,
    LearningSessionSchema,
  );
  if (result.state !== 'ready') return result;
  const row = result.data.find((x) => x.id === id);
  if (!row)
    return { state: 'denied', message: 'Sesi tidak ditemukan atau tidak dapat Anda akses.' };
  const token = auth.accessToken,
    date = row.serviceDate.slice(0, 10);
  const period = new URLSearchParams({
    classId: row.classId,
    academicYear: row.academicYear.code,
    semester: String(row.semester.number),
  });
  const [modules, journals, attendance, assessments, authority] = await Promise.all([
    readRows(
      `/rpp?${period}&teacherId=${row.assignedTeacherId}${own}`,
      token,
      SupportingModuleSchema,
    ),
    readRows(
      `/class-activities?classId=${row.classId}&from=${date}&to=${date}${own}`,
      token,
      SupportingJournalSchema,
    ),
    readSessionAttendance(row, scope, token),
    readRows(
      `/assessment/sessions?${period}&subject=${encodeURIComponent(row.subjectSnapshot)}${own}`,
      token,
      SupportingAssessmentSchema,
    ),
    apiFetchResult<{ permissions: string[] }>('/auth/me', token),
  ]);
  const filter = <T>(read: LearningRead<T[]>, test: (value: T) => boolean): LearningRead<T[]> =>
    read.state === 'ready' ? { state: 'ready', data: read.data.filter(test) } : read;
  return {
    state: 'ready',
    data: {
      session: row,
      context: {
        capabilities: {
          journal: scope === 'own' && granted('activity.manage'),
          attendance: scope === 'own' && granted('academic.attendance.create'),
          module: scope === 'own' && granted('rpp.own.manage'),
          assessment: scope === 'own' && granted('lms.own.manage'),
        },
        modules: filter(
          modules,
          (x) =>
            x.teacherId === row.assignedTeacherId &&
            x.classId === row.classId &&
            x.subject === row.subjectSnapshot &&
            x.academicYear === row.academicYear.code &&
            x.semester === row.semester.number,
        ),
        journals: filter(
          journals,
          (x) =>
            x.teacherId === row.assignedTeacherId &&
            x.classId === row.classId &&
            x.date.slice(0, 10) === date,
        ),
        attendance,
        assessments: filter(
          assessments,
          (x) =>
            x.teacherId === row.assignedTeacherId &&
            x.classId === row.classId &&
            x.teachingAssignmentId === row.teachingAssignmentId &&
            x.academicYear === row.academicYear.code &&
            x.semester === row.semester.number,
        ),
      },
    },
  };
  function granted(code: string) {
    return (
      authority.status === 'success' &&
      Array.isArray(authority.data.permissions) &&
      (authority.data.permissions.includes('*') || authority.data.permissions.includes(code))
    );
  }
}

async function readSessionAttendance(
  session: LearningSession,
  scope: LearningScope,
  token: string,
): Promise<LearningRead<z.infer<typeof SupportingAttendanceSchema>[]>> {
  const result = await apiFetchResult<unknown>(
    `/attendance/student-sessions/sessions/${session.id}${scope === 'own' ? '?scope=own' : ''}`,
    token,
  );
  if (result.status !== 'success')
    return {
      state: result.status === 'forbidden' ? 'denied' : 'error',
      message:
        result.status === 'forbidden'
          ? 'Anda tidak memiliki akses ke absensi sesi ini.'
          : 'Absensi sesi belum dapat dimuat. Coba lagi.',
    };
  const parsed = SessionRosterSchema.safeParse(result.data);
  if (
    !parsed.success ||
    parsed.data.sessionId !== session.id ||
    parsed.data.classId !== session.classId ||
    parsed.data.date !== session.serviceDate.slice(0, 10) ||
    parsed.data.subject !== session.subjectSnapshot
  )
    return { state: 'error', message: 'Rincian absensi tidak sesuai sesi. Muat ulang.' };
  const roster = parsed.data;
  const records = new Map(
    roster.records.map((record) => [`${record.studentId}:${record.jp}`, record]),
  );
  return {
    state: 'ready',
    data: roster.students.flatMap((student) =>
      roster.slots.map((slot) => {
        const record = records.get(`${student.id}:${slot.jp}`);
        return {
          id: `${session.id}:${student.id}:${slot.jp}`,
          sessionId: session.id,
          classId: session.classId,
          date: session.serviceDate,
          jp: slot.jp,
          startAt: slot.startAt,
          endAt: slot.endAt,
          status: record?.status ?? null,
          notes: record?.notes ?? null,
          student: { id: student.id, user: { fullName: student.name } },
        };
      }),
    ),
  };
}

import { LearningSessionSchema, type LearningSession } from './learning-recap';
import { JpOverviewSchema } from './session-attendance';
import { z } from 'zod';

export type HomeRead<T> =
  | { state: 'ready'; data: T }
  | { state: 'error' | 'denied'; message: string };
export interface TeacherHomeData {
  sessions: HomeRead<LearningSession[]>;
  attendance: HomeRead<{ pending: number; unverified: number }>;
  journal: HomeRead<number>;
  assessment: HomeRead<number>;
}
export const HomeSessionsSchema = z.array(LearningSessionSchema);

/** Mirrors the existing server's ten-minute entry window; the API remains authoritative. */
export function teacherHomeCanStart(session: LearningSession, now: number): boolean {
  return (
    session.canOperate &&
    ['SCHEDULED', 'REASSIGNED'].includes(session.status) &&
    now >= Date.parse(session.scheduledStartAt) - 10 * 60_000 &&
    now < Date.parse(session.scheduledEndAt)
  );
}
export const HomeJournalSchema = z.array(
  z.object({
    id: z.string().uuid(),
    teacherId: z.string().uuid(),
    classId: z.string().uuid(),
    date: z.string().datetime({ offset: true }),
  }),
);
export const HomeAssessmentsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    teacherId: z.string().uuid(),
    academicYear: z.string(),
    semester: z.number(),
    status: z.string(),
    gradingSummary: z.object({ pendingManualCount: z.number().int().nonnegative() }).nullish(),
  }),
);

/** Only sessions already begun need attendance/journals. Unknown JP never means Alpha. */
export function homeAttendance(
  sessions: readonly LearningSession[],
  payload: unknown,
  date: string,
): TeacherHomeData['attendance'] {
  const parsed = JpOverviewSchema.safeParse(payload);
  if (
    !parsed.success ||
    parsed.data.scope !== 'own' ||
    parsed.data.from !== date ||
    parsed.data.to !== date ||
    !parsed.data.sessionCompletion
  )
    return { state: 'error', message: 'Status absensi belum dapat diperiksa.' };
  const due = sessions.filter((s) => ['STARTED', 'COMPLETED'].includes(s.status));
  let pending = 0,
    unverified = 0;
  for (const row of due) {
    const record = parsed.data.sessionCompletion.find(
      (s) => s.sessionId === row.id && s.classId === row.classId,
    );
    if (!record || record.expected === 0) unverified++;
    else if (!record.complete) pending++;
  }
  return { state: 'ready', data: { pending, unverified } };
}

export function homeJournalPending(
  sessions: readonly LearningSession[],
  journals: z.infer<typeof HomeJournalSchema>,
  date: string,
  teacherId: string,
): number {
  const classes = new Set(
    sessions.filter((s) => ['STARTED', 'COMPLETED'].includes(s.status)).map((s) => s.classId),
  );
  return [...classes].filter(
    (id) =>
      !journals.some(
        (j) => j.teacherId === teacherId && j.classId === id && j.date.slice(0, 10) === date,
      ),
  ).length;
}

export function teacherHomeSessionHref(
  session: Pick<LearningSession, 'id' | 'academicYear' | 'semester'>,
): string {
  return (
    '/dashboard/akademik?' +
    new URLSearchParams({
      view: 'learning-recap',
      workspace: 'teaching',
      academicYear: session.academicYear.code,
      semester: String(session.semester.number),
      sessionId: session.id,
    })
  );
}

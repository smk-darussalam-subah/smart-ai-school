import type { TodayClass } from '@/app/dashboard/akademik/_components/guru-types';
import type { JpOverview } from './session-attendance';

export type AttendanceFollowUpClass = Pick<
  TodayClass,
  'classSessionId' | 'scheduleId' | 'classId' | 'subject' | 'jpStart' | 'jpEnd'
>;

export function teacherAttendanceFollowUp(
  classes: AttendanceFollowUpClass[],
  date: string,
  data: JpOverview,
) {
  const rows = data.sessionCompletion;
  const pendingSessions: { sessionId: string; scheduleId: string | null }[] = [];
  let pending = 0,
    unverified = 0;
  for (const c of classes) {
    const matches = rows?.filter((s) =>
      c.classSessionId
        ? s.sessionId === c.classSessionId
        : Boolean(c.scheduleId) && s.scheduleId === c.scheduleId,
    );
    const row = matches?.length === 1 ? matches[0] : undefined;
    if (
      !row ||
      row.classId !== c.classId ||
      row.date !== date ||
      row.subject !== c.subject ||
      row.jpStart !== c.jpStart ||
      row.jpEnd !== c.jpEnd ||
      !row.expected
    )
      unverified++;
    else if (!row.complete) {
      pending++;
      pendingSessions.push({ sessionId: row.sessionId, scheduleId: row.scheduleId });
    }
  }
  return { pending, unverified, pendingSessions };
}

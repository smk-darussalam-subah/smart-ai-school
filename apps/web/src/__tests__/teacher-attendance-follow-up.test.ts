import { teacherAttendanceFollowUp } from '@/lib/teacher-attendance-follow-up';
import { JpOverviewSchema, type JpOverview } from '@/lib/session-attendance';
import type { TodayClass } from '@/app/dashboard/akademik/_components/guru-types';
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-10-30';
const c = (n: number): TodayClass => ({
  classId: id(1),
  className: 'X QA',
  subject: 'Matematika',
  classSessionId: id(n),
  scheduleId: id(n + 10),
  serviceDate: date,
  startLabel: '07:30',
  jpStart: 1,
  jpEnd: 2,
  room: null,
  isNow: false,
});
const row = (n: number, recorded = 4) => ({
  sessionId: id(n),
  scheduleId: id(n + 10),
  classId: id(1),
  subject: 'Matematika',
  date,
  jpStart: 1,
  jpEnd: 2,
  expected: 4,
  recorded,
  unknown: 4 - recorded,
  complete: recorded === 4,
});
const data = (rows: ReturnType<typeof row>[] | undefined): JpOverview => ({
  academicYear: '2026/2027',
  semester: 1,
  from: date,
  to: date,
  observedThrough: date,
  generatedAt: date + 'T05:00:00Z',
  unit: 'student_session_jp',
  rosterBasis: 'current_roster_and_recorded_history',
  scope: 'own',
  filters: { classId: null, teacherId: null, subject: null, majorCode: null },
  totals: {
    expected: 0,
    recorded: 0,
    unknown: 0,
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpha: 0,
    complete: false,
    pct: null,
    tone: 'unknown',
  },
  days: [],
  sessionCompletion: rows,
});
describe('teacher follow-up is per-session saved JP, independent of daily ledger', () => {
  it('complete first session does not clear a partial second session in the same class', () => {
    expect(teacherAttendanceFollowUp([c(2), c(3)], date, data([row(2), row(3, 1)]))).toMatchObject({
      pending: 1,
      unverified: 0,
    });
  });
  it('clears after every student-JP is recorded even without daily records', () => {
    expect(teacherAttendanceFollowUp([c(2), c(3)], date, data([row(2), row(3)]))).toMatchObject({
      pending: 0,
      unverified: 0,
    });
  });
  it('keeps unrecorded and partial JP pending (a daily record is not input)', () => {
    expect(teacherAttendanceFollowUp([c(2)], date, data([row(2, 0)]))).toMatchObject({
      pending: 1,
      unverified: 0,
    });
    expect(teacherAttendanceFollowUp([c(2)], date, data([row(2, 3)]))).toMatchObject({
      pending: 1,
      unverified: 0,
    });
  });
  it('does not certify missing, duplicate, wrong scope, empty roster or changed date/class/subject/JP', () => {
    const good = row(2);
    for (const rows of [
      undefined,
      [],
      [good, good],
      [{ ...good, expected: 0, recorded: 0, complete: false }],
      [{ ...good, date: '2026-10-29' }],
      [{ ...good, classId: id(9) }],
      [{ ...good, subject: 'IPA' }],
      [{ ...good, jpEnd: 3 }],
    ])
      expect(teacherAttendanceFollowUp([c(2)], date, data(rows))).toMatchObject({
        pending: 0,
        unverified: 1,
      });
  });
  it('can resolve an unmaterialized schedule only to a unique matching authorized session', () => {
    expect(
      teacherAttendanceFollowUp([{ ...c(2), classSessionId: undefined }], date, data([row(2)])),
    ).toMatchObject({ pending: 0, unverified: 0 });
  });
  it('validates server metadata and fails closed for inconsistent counts/date or broadened scope', () => {
    expect(JpOverviewSchema.safeParse(data([row(2)])).success).toBe(true);
    for (const wrong of [
      data([{ ...row(2), unknown: 1 }]),
      data([{ ...row(2), date: '2026-10-29' }]),
      { ...data([row(2)]), scope: 'authorized' },
    ])
      expect(JpOverviewSchema.safeParse(wrong).success).toBe(false);
  });
});

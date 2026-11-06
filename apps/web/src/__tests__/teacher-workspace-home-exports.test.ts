import {
  temporaryCredentialsHtml,
  temporaryCredentialSheets,
  uniqueTemporaryCredentials,
} from '@/lib/temporary-credentials';
import {
  homeAttendance,
  homeJournalPending,
  teacherHomeCanStart,
  teacherHomeSessionHref,
} from '@/lib/teacher-home';
import { LearningSessionSchema } from '@/lib/learning-recap';
import type { JpOverview } from '@/lib/session-attendance';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-11-02';
const row = () =>
  LearningSessionSchema.parse({
    id: id(1),
    scheduleId: id(2),
    classId: id(3),
    teachingAssignmentId: id(4),
    assignedTeacherId: id(5),
    assignedTeacherName: 'QA Guru',
    classNameSnapshot: 'X QA',
    subjectSnapshot: 'QA subject',
    roomSnapshot: null,
    serviceDate: date + 'T00:00:00.000Z',
    scheduledStartAt: date + 'T00:30:00.000Z',
    scheduledEndAt: date + 'T01:50:00.000Z',
    status: 'STARTED',
    startedAt: date + 'T00:30:00.000Z',
    completedAt: null,
    missedAt: null,
    cancelledAt: null,
    reassignedAt: null,
    cancellationReason: null,
    reassignmentReason: null,
    canOperate: true,
    operationBlockedReason: null,
    academicYear: { code: '2026/2027' },
    semester: { number: 1 },
    schedule: { jpStart: 1, jpEnd: 2 },
  });
const totals: JpOverview['totals'] = {
  expected: 4,
  recorded: 2,
  unknown: 2,
  hadir: 2,
  izin: 0,
  sakit: 0,
  alpha: 0,
  complete: false,
  pct: null,
  tone: 'unknown',
};
const overview = () => ({
  academicYear: '2026/2027',
  semester: 1,
  from: date,
  to: date,
  observedThrough: date,
  generatedAt: date + 'T02:00:00.000Z',
  unit: 'student_session_jp',
  rosterBasis: 'current_roster_and_recorded_history',
  scope: 'own',
  filters: { classId: null, teacherId: null, subject: null, majorCode: null },
  totals,
  days: [{ date, ...totals }],
  sessionCompletion: [
    {
      sessionId: id(1),
      scheduleId: id(2),
      classId: id(3),
      date,
      subject: 'QA subject',
      jpStart: 1,
      jpEnd: 2,
      expected: 4,
      recorded: 2,
      unknown: 2,
      complete: false,
    },
  ],
});
it('follows actual JP completeness rather than daily attendance', () => {
  expect(homeAttendance([row()], overview(), date)).toEqual({
    state: 'ready',
    data: { pending: 1, unverified: 0 },
  });
  const complete = overview();
  complete.totals = {
    ...totals,
    recorded: 4,
    unknown: 0,
    hadir: 4,
    complete: true,
    pct: 100,
    tone: 'green',
  };
  complete.days = [{ date, ...complete.totals }];
  complete.sessionCompletion[0]!.recorded = 4;
  complete.sessionCompletion[0]!.unknown = 0;
  complete.sessionCompletion[0]!.complete = true;
  expect(homeAttendance([row()], complete, date)).toEqual({
    state: 'ready',
    data: { pending: 0, unverified: 0 },
  });
});
it('shows start only in the existing ten-minute entry window', () => {
  const scheduled = { ...row(), status: 'SCHEDULED' as const };
  const start = Date.parse(scheduled.scheduledStartAt);
  expect(teacherHomeCanStart(scheduled, start - 600001)).toBe(false);
  expect(teacherHomeCanStart(scheduled, start - 600000)).toBe(true);
  expect(teacherHomeCanStart(scheduled, Date.parse(scheduled.scheduledEndAt))).toBe(false);
  expect(teacherHomeCanStart({ ...scheduled, canOperate: false }, start)).toBe(false);
  expect(teacherHomeCanStart(row(), start)).toBe(false);
});
it('future sessions do not become pending attendance and missing roster does not certify completion', () => {
  const future = { ...row(), status: 'SCHEDULED' as const };
  expect(homeAttendance([future], overview(), date)).toMatchObject({
    state: 'ready',
    data: { pending: 0 },
  });
  const missing = overview();
  missing.sessionCompletion = [];
  expect(homeAttendance([row()], missing, date)).toMatchObject({
    state: 'ready',
    data: { unverified: 1 },
  });
});
it.each([{ ...overview(), scope: 'authorized' }, { ...overview(), from: '2026-11-01' }, {}])(
  'rejects wrong scope/period or malformed JP as unavailable',
  (payload) => {
    expect(homeAttendance([row()], payload, date).state).toBe('error');
  },
);
it('counts journal classes once and never attributes another teacher/date to them', () => {
  const rows = [row(), { ...row(), id: id(8) }];
  expect(homeJournalPending(rows, [], date, id(5))).toBe(1);
  expect(
    homeJournalPending(
      rows,
      [{ id: id(9), teacherId: id(99), classId: id(3), date: date + 'T00:00:00.000Z' }],
      date,
      id(5),
    ),
  ).toBe(1);
  expect(
    homeJournalPending(
      rows,
      [{ id: id(9), teacherId: id(5), classId: id(3), date: date + 'T00:00:00.000Z' }],
      date,
      id(5),
    ),
  ).toBe(0);
});
it('session shortcut binds own-teaching workspace, period and exact session', () => {
  const query = new URL(teacherHomeSessionHref(row()), 'https://fixture.invalid').searchParams;
  expect(query.get('workspace')).toBe('teaching');
  expect(query.get('view')).toBe('learning-recap');
  expect(query.get('sessionId')).toBe(id(1));
  expect(query.get('semester')).toBe('1');
});
const credentials = [
  { username: '00123', tempPassword: 'Fixture#123!', role: 'SISWA', fullName: 'QA <Student>' },
  {
    username: '+628123000',
    tempPassword: 'Fixture#456!',
    role: 'ORANG_TUA',
    fullName: 'QA Parent',
  },
];
it('deduplicates a parent reused across children, rejects conflicting issuance, and preserves leading zero', () => {
  expect(uniqueTemporaryCredentials([...credentials, credentials[1]!])).toHaveLength(2);
  expect(() =>
    uniqueTemporaryCredentials([
      credentials[0]!,
      { ...credentials[0]!, tempPassword: 'different' },
    ]),
  ).toThrow(/dua password/);
  expect(uniqueTemporaryCredentials(credentials)[0]!.username).toBe('00123');
});
it('PDF escapes content and has no executable script or credential-bearing URL', () => {
  const html = temporaryCredentialsHtml(
    [
      {
        ...credentials[0]!,
        fullName: '<script>alert(1)</script>',
        tempPassword: '<svg onload=alert(1)>',
      },
    ],
    'https://fixture.invalid',
  );
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<svg ');
  expect(html).toContain('&lt;svg');
  expect(html).toContain('https://fixture.invalid/login');
  expect(html).toContain('Wajib mengganti password');
});
it('XLSX specifies text cells for formula-like values and separate pupil/parent sheets', () => {
  const sheets = temporaryCredentialSheets(
    [...credentials, { username: '=HYPERLINK("evil")', tempPassword: 'Fixture!', role: 'SISWA' }],
    'https://fixture.invalid',
  );
  expect(sheets.map((s) => s.sheet)).toEqual(['Siswa', 'Orang Tua']);
  expect(sheets[0]!.data[1]![2]).toMatchObject({ type: String, value: '00123' });
  expect(sheets[0]!.data[2]![2]).toMatchObject({ type: String, value: '=HYPERLINK("evil")' });
  expect(JSON.stringify(sheets)).not.toContain('formula');
});

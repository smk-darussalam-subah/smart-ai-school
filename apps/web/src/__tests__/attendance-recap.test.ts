jest.mock('@/lib/action-session', () => ({
  getActionSession: jest.fn(async () => ({ accessToken: 'synthetic' })),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/navigation', () => ({
  redirect: () => {
    throw Error('NEXT_REDIRECT');
  },
}));
const mockFetch = jest.fn();
jest.mock('@/lib/api', () => ({ apiFetchResult: (...args: unknown[]) => mockFetch(...args) }));
import {
  RecapSchema,
  RecapQuerySchema,
  attendanceRecapCsv,
  readAttendanceRecap,
} from '@/lib/attendance-recap';
import { fetchAttendanceRecap } from '@/app/dashboard/akademik/attendance-recap-actions';
import {
  academicWorkflowPresentation,
  academicPeriodQuery,
  resolveAcademicWorkflowView,
} from '@/lib/academic-workflow-deep-link';

const id = (n: number) => '31000000-0000-4000-8000-' + String(n).padStart(12, '0');
const metric = (H: number, I: number, S: number, A: number, U = 0, N = 0, C = 0, students = 2) => {
  const recorded = H + I + S + A,
    due = recorded + U;
  return {
    H,
    I,
    S,
    A,
    U,
    N,
    C,
    recorded,
    due,
    attendancePct: recorded ? Math.round((H / recorded) * 10000) / 100 : null,
    coveragePct: due ? Math.round((recorded / due) * 10000) / 100 : null,
    provisional: U > 0,
    students,
  };
};
function sample() {
  const metrics = metric(2, 1, 0, 1);
  return {
    academicYear: '2026/2027',
    semester: 1,
    from: '2026-11-02',
    to: '2026-11-02',
    periodRange: { from: '2026-07-01', to: '2026-12-31' },
    serverDate: '2026-11-03',
    generatedAt: '2026-11-03T00:00:00.000Z',
    context: 'own',
    scopeLabel: 'Sesi yang saya ampu',
    availableContexts: ['own'],
    rosterBasis: 'current_roster_and_recorded_history',
    filters: {
      classId: null,
      teacherId: null,
      subject: null,
      grade: null,
      majorCode: null,
      jp: null,
      jpFrom: null,
      jpTo: null,
    },
    resultFilters: { search: '', status: null, sort: 'name', studentId: null },
    dueBasis: 'jp_end_wib',
    view: 'summary',
    matrixDate: '2026-11-02',
    metrics,
    days: [{ date: '2026-11-02', ...metrics }],
    jps: [
      { jp: 1, ...metric(1, 1, 0, 0) },
      { jp: 2, ...metric(1, 0, 0, 1) },
    ],
    options: {
      classes: [{ id: id(1), name: 'X QA', grade: 10, majorCode: 'QA' }],
      subjects: ['Matematika QA'],
      teachers: [{ id: id(2), name: 'QA Guru' }],
      jps: [1, 2],
    },
    coverage: {
      basis: 'persisted_sessions',
      classesWithoutSessions: 0,
      historicalMembership: 'current_mandate_and_retained_records',
    },
    classes: [{ id: id(1), name: 'X QA', metrics, hasSessions: true }],
    students: [],
    missing: [],
    timeline: [],
    audits: [],
    pagination: { page: 1, pageSize: 20, total: 1 },
  };
}
const query = {
  academicYear: '2026/2027',
  semester: 1,
  from: '2026-11-02',
  to: '2026-11-02',
  context: 'own' as const,
};
describe('JP recap producer -> action -> consumer binding', () => {
  beforeEach(() => mockFetch.mockReset());
  it('accepts a coherent producer payload with both official metrics', () => {
    expect(readAttendanceRecap(sample(), query)?.metrics).toMatchObject({
      attendancePct: 50,
      coveragePct: 100,
    });
  });
  it('accepts incomplete and future units without treating them as Alpha', () => {
    const r = sample(),
      m = metric(2, 1, 0, 1, 2, 2);
    r.metrics = m;
    r.days = [{ date: '2026-11-02', ...m }];
    r.jps = [{ jp: 1, ...m }];
    expect(RecapSchema.parse(r).metrics).toMatchObject({
      attendancePct: 50,
      coveragePct: 66.67,
      A: 1,
      U: 2,
      N: 2,
      provisional: true,
    });
  });
  it.each(['attendancePct', 'coveragePct', 'recorded', 'due', 'H', 'A'] as const)(
    'rejects forged %s',
    (field) => {
      const r = sample();
      r.metrics[field] = 99;
      expect(readAttendanceRecap(r, query)).toBeNull();
    },
  );
  it('rejects a day mismatch instead of displaying partial totals', () => {
    const r = sample();
    r.days[0]!.H++;
    expect(RecapSchema.safeParse(r).success).toBe(false);
  });
  it('rejects a duplicated day', () => {
    const r = sample();
    r.days.push(r.days[0]!);
    expect(RecapSchema.safeParse(r).success).toBe(false);
  });
  it.each([
    { semester: 2 },
    { classId: id(99) },
    { teacherId: id(99) },
    { subject: 'Foreign' },
    { majorCode: 'ZZ' },
    { jp: 10 },
    { jpFrom: 1, jpTo: 2 },
    { page: 2 },
    { search: 'foreign' },
    { status: 'A' as const },
    { context: 'homeroom' as const },
    { matrixDate: '2026-11-01' },
  ])('rejects a response bound to the wrong query %j', (patch) => {
    expect(readAttendanceRecap(sample(), { ...query, ...patch })).toBeNull();
  });
  it('does not allow API failures to appear as empty/zero attendance', async () => {
    mockFetch.mockResolvedValue({ status: 'error', error: 'network' });
    expect(await fetchAttendanceRecap(query)).toMatchObject({ state: 'error' });
  });
  it('preserves denied state', async () => {
    mockFetch.mockResolvedValue({ status: 'forbidden' });
    expect(await fetchAttendanceRecap(query)).toMatchObject({ state: 'denied' });
  });
  it('validates before making any backend request', async () => {
    expect((await fetchAttendanceRecap({ semester: 4 })).state).toBe('error');
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('forwards validated filters and parses actual producer metrics', async () => {
    mockFetch.mockResolvedValue({ status: 'success', data: sample() });
    expect((await fetchAttendanceRecap(query)).state).toBe('ready');
    expect(mockFetch.mock.calls[0]![0]).toContain('context=own');
    expect(mockFetch.mock.calls[0]![0]).toContain('semester=1');
  });
  it('rejects internally contradictory success responses', async () => {
    const r = sample();
    r.metrics.attendancePct = 100;
    mockFetch.mockResolvedValue({ status: 'success', data: r });
    expect((await fetchAttendanceRecap(query)).state).toBe('error');
  });
  it('CSV preserves leading-zero NIS and prevents spreadsheet formula execution', () => {
    const raw = sample();
    const parsed = RecapSchema.parse(raw);
    parsed.timeline = [
      {
        studentId: id(5),
        name: '=2+3',
        nis: '000123',
        classId: id(1),
        className: 'X QA',
        date: '2026-11-02',
        jp: 1,
        startAt: '2026-11-02T00:00:00.000Z',
        endAt: '2026-11-02T00:40:00.000Z',
        status: 'I',
        sessionId: id(3),
        teacherId: id(2),
        teacher: '@QA',
        subject: 'Matematika',
        notes: 'Izin, dengan keterangan\nbaris kedua',
        revision: 1,
        recordedAt: '2026-11-02T00:00:00.000Z',
        sources: [id(3)],
      },
    ];
    const csv = attendanceRecapCsv(parsed);
    expect(csv).toContain('"\'=2+3"');
    expect(csv).toContain('"\'@QA"');
    expect(csv).toContain('"000123"');
    expect(csv).toContain('"Izin, dengan keterangan\nbaris kedua"');
  });
  it('attendance deep link selects the existing attendance screen for teacher and school', () => {
    expect(academicWorkflowPresentation('attendance-recap')).toMatchObject({
      teacherScreen: 'kehadiran',
      leadershipScreen: 'kehadiran',
    });
    expect(resolveAcademicWorkflowView('attendance-recap', 'student')).toBeNull();
    expect(resolveAcademicWorkflowView('attendance-recap', 'parent')).toBeNull();
  });
  it('client query limits remain bounded', () => {
    expect(RecapQuerySchema.safeParse({ pageSize: 500 }).success).toBe(false);
    expect(RecapQuerySchema.safeParse({ from: '2026-01-01', to: '2026-11-02' }).success).toBe(
      false,
    );
  });
});

describe('official period navigation', () => {
  it('keeps the selected menu but clears dates, scope filters and source session from the old period', () => {
    const q = academicPeriodQuery(
      'view=attendance-recap&workspace=operations&attendanceFrom=2026-11-02&attendanceTo=2026-11-02&attendanceClass=old&attendanceJp=8&attendanceContext=homeroom&sessionId=old&unrelated=keep',
      '2026/2027',
      2,
    );
    expect(q.get('view')).toBe('attendance-recap');
    expect(q.get('workspace')).toBe('operations');
    expect(q.get('unrelated')).toBe('keep');
    expect([...q.keys()].some((k) => k.startsWith('attendance') || k === 'sessionId')).toBe(false);
    expect(q.get('semester')).toBe('2');
    expect(q.get('academicYear')).toBe('2026/2027');
  });
});

// Business-contract tests already stub the auth boundary; writable-cookie
// behavior is exercised separately in action-session tests and real Next HTTP.
jest.mock('@/lib/action-session', () => ({
  getActionSession: (...args: unknown[]) => jest.requireMock('next-auth').getServerSession(...args),
}));
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GradeItem } from '@/lib/api';
import RingkasanGuru from '@/app/dashboard/akademik/_components/RingkasanGuru';
import {
  readTeacherThresholds,
  mergeTeacherThresholds,
  teacherGradeRecords,
  teacherTodayState,
  type TeacherSummaryAvailability,
} from '@/lib/teacher-summary';

const mockSession = jest.fn();
const mockApiFetch = jest.fn();
const mockApiFetchResult = jest.fn();
const mockAuthority = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: mockSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/view-as', () => ({ getActiveViewAs: async () => null }));
jest.mock('@/lib/dashboard-authority', () => ({ resolveDashboardAuthority: mockAuthority }));
jest.mock('@/lib/api', () => ({ apiFetch: mockApiFetch, apiFetchResult: mockApiFetchResult }));
jest.mock('@/app/dashboard/akademik/_components/AcademicOperationsWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/AcademicRoleModeSwitcher', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/_components/AcademicDataNotice', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/AkademikWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/KsWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/siswa/SiswaWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/ortu/OrtuWorkspace', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/siswa/SiswaRefreshWrapper', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/ortu/OrtuRefreshWrapper', () => ({
  __esModule: true,
  default: () => null,
}));
import AcademicPage from '@/app/dashboard/akademik/page';

const active = {
  academicYear: { code: '2026/2027' },
  number: 1,
  startDate: '2026-07-01',
  endDate: '2026-12-31',
};
const future = { ...active, number: 2, startDate: '2027-01-04', endDate: '2027-06-30' };
const historical = {
  ...active,
  academicYear: { code: '2025/2026' },
  startDate: '2025-07-01',
  endDate: '2025-12-31',
};
const ready: TeacherSummaryAvailability = {
  grades: 'ready',
  attendance: 'ready',
  journal: 'ready',
  rpp: 'ready',
  assessments: 'ready',
  kktp: 'ready',
  today: 'ready',
};
const threshold = { mapel: 'Matematika', kktp: 80, kktpProvenance: 'config' };
const grade = (id: string, subject = 'Matematika', score = '78'): GradeItem => ({
  id,
  studentId: 'one-student',
  semester: 1,
  academicYear: '2026/2027',
  score,
  type: id === 'g1' ? 'uh' : 'praktik',
  notes: null,
  student: { id: 'one-student', nis: 'synthetic', user: { fullName: 'Siswa sintetis' } },
  assignment: {
    id: 'assignment',
    subject,
    classId: 'class',
    academicYear: '2026/2027',
    class: { id: 'class', name: 'Kelas sintetis' },
  },
});
const todayClass = {
  scheduleId: 'schedule',
  classId: 'class',
  className: 'Kelas sintetis',
  subject: 'Matematika',
  room: null,
  jpStart: 1,
  jpEnd: 2,
  startLabel: '07:00',
  isNow: true,
};
function summary(props: Partial<React.ComponentProps<typeof RingkasanGuru>> = {}) {
  return renderToStaticMarkup(
    React.createElement(RingkasanGuru, {
      grades: [],
      attendances: [],
      activities: [],
      rpp: [],
      todayClasses: [],
      availability: ready,
      thresholds: [threshold],
      todayDate: '2026-10-13',
      onAbsen: jest.fn(),
      onJurnal: jest.fn(),
      onStartSession: jest.fn(),
      onPenilaian: jest.fn(),
      ...props,
    }),
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-13T04:00:00Z'));
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('P2-CD-R01 record units and authoritative KKTP', () => {
  it('does not turn two scores from one student into two students or NA', () => {
    const html = summary({ grades: [grade('g1'), grade('g2')] });
    expect(html).toContain('0 dari 2 record nilai');
    expect(html).toContain('2 record nilai di bawah KKTP');
    expect(html).not.toContain('2 siswa tuntas');
    expect(html).not.toContain('NA ≥ 75');
    expect(html).not.toContain('Perlu remedial');
  });
  it('uses different mapel thresholds, not a global default', () => {
    expect(
      teacherGradeRecords(
        [grade('g1'), grade('g2', 'Bahasa', '78')],
        [threshold, { ...threshold, mapel: 'Bahasa', kktp: 70 }],
      ),
    ).toMatchObject({ records: 2, passed: 1, below: 1, percentage: 50 });
  });
  it.each([null, undefined])(
    'unknown %s metadata produces no tuntas/remedial decision',
    (value) => {
      const html = summary({
        grades: [grade('g1')],
        thresholds: value === null ? [{ ...threshold, kktp: null }] : [],
      });
      expect(html).toContain('KKTP untuk 1 record belum tersedia');
      expect(html).not.toContain('record nilai di bawah KKTP');
      expect(html).not.toContain('siswa di bawah');
    },
  );
  it('supports zero threshold and explicit server system_default, not a UI fallback', () => {
    expect(teacherGradeRecords([grade('g1')], [{ ...threshold, kktp: 0 }]).passed).toBe(1);
    expect(
      readTeacherThresholds({
        mapelProgress: [{ ...threshold, kktp: 75, kktpProvenance: 'system_default' }],
      }),
    ).not.toBeNull();
  });
  it.each([
    { mapelProgress: [{ ...threshold, kktp: 101 }] },
    { mapelProgress: [threshold, threshold] },
    {},
    { mapelProgress: [{ ...threshold, kktp: NaN }] },
  ])('rejects malformed authoritative metadata %#', (payload) =>
    expect(readTeacherThresholds(payload)).toBeNull(),
  );
  it('ignores invalid score values instead of manufacturing an average', () => {
    expect(
      teacherGradeRecords(
        [grade('g1', 'Matematika', ''), grade('g2', 'Matematika', 'Infinity')],
        [threshold],
      ),
    ).toMatchObject({ records: 0, average: null, percentage: null });
  });
  it('cannot last-win contradictory threshold reads from two own classes', () => {
    expect(mergeTeacherThresholds([[threshold], [{ ...threshold, kktp: 90 }]])).toBeNull();
    expect(mergeTeacherThresholds([[threshold], [threshold]])).toEqual([threshold]);
  });
});

describe('P2-CD-R02 independent domain availability', () => {
  it('outage is not no schedule/no actions/zero journal', () => {
    const unavailable: TeacherSummaryAvailability = {
      grades: 'unavailable',
      attendance: 'unavailable',
      journal: 'unavailable',
      rpp: 'unavailable',
      assessments: 'unavailable',
      kktp: 'unavailable',
      today: 'unavailable',
    };
    const html = summary({ availability: unavailable, todayClasses: [todayClass] });
    expect(html).toContain('Jurnal belum dapat dimuat');
    expect(html).toContain('Jadwal hari ini belum dapat dimuat');
    expect(html).toContain('Daftar ini belum lengkap');
    expect(html).not.toContain('Tidak ada jadwal mengajar hari ini');
    expect(html).not.toContain('Tidak ada tindakan tertunda');
    expect(html).not.toMatch(/>Mulai Sesi<\/button>/);
  });
  it.each(['grades', 'attendance', 'rpp', 'assessments', 'kktp'] as const)(
    'one failed %s domain preserves healthy journal but cannot certify no actions',
    (domain) => {
      const html = summary({
        availability: { ...ready, [domain]: 'unavailable' },
        activities: [
          {
            id: 'j1',
            classId: 'class',
            date: '2026-10-13',
            title: 'Jurnal sintetis',
            category: 'learning',
          },
        ],
      });
      expect(html).toContain('record jurnal guru–kelas');
      expect(html).toContain('Daftar ini belum lengkap');
      expect(html).not.toContain('Tidak ada tindakan tertunda');
    },
  );
  it('journal failure preserves grades and describes record journals, not meetings', () => {
    const html = summary({
      availability: { ...ready, journal: 'unavailable' },
      grades: [grade('g1')],
    });
    expect(html).toContain('0 dari 1 record nilai');
    expect(html).toContain('Jurnal belum dapat dimuat');
    expect(html).not.toContain('pertemuan tercatat');
  });
  it('denied is explicit, not an empty success', () => {
    expect(summary({ availability: { ...ready, grades: 'denied', today: 'denied' } })).toContain(
      'Anda tidak memiliki izin melihat',
    );
  });
  it('successful empty datasets remain genuinely empty', () => {
    const html = summary();
    expect(html).toContain('Belum ada record nilai');
    expect(html).toContain('Tidak ada jadwal mengajar hari ini');
    expect(html).toContain('Tidak ada tindakan tertunda');
  });
});

interface SummaryWorkspaceProps {
  schedules: unknown[];
  todayClasses: unknown[];
  summaryAvailability: TeacherSummaryAvailability;
  summaryThresholds: unknown[];
  todayDate: string;
}
async function teacherPage(
  role: string,
  selected = active,
  failedDomain = '',
  denied = false,
  activeAvailable = true,
): Promise<SummaryWorkspaceProps> {
  const roles = role === 'GURU' ? ['GURU'] : ['GURU', role];
  mockSession.mockResolvedValue({ accessToken: 'synthetic', keycloakId: 'kc', roles: ['GURU'] });
  mockAuthority.mockResolvedValue({
    roles,
    hasRole: (...wanted: string[]) => wanted.some((r) => roles.includes(r)),
    can: () => true,
  });
  mockApiFetch.mockImplementation(async (url: string) =>
    url === '/school/semesters/active'
      ? activeAvailable
        ? active
        : null
      : url === '/school/semesters'
        ? [active, future, historical]
        : url === '/teaching-assignments/me/context'
          ? { teacherId: 'own-teacher' }
          : url === '/teaching-assignments/options/active'
            ? {
                teachers: [],
                classes: [],
                subjects: [],
                academicYears: [],
                scope: { type: 'global', labels: [] },
              }
            : null,
  );
  mockApiFetchResult.mockImplementation(async (url: string) => {
    if (failedDomain && url.startsWith(failedDomain))
      return { status: denied ? 'forbidden' : 'unavailable', message: 'synthetic failure' };
    if (url.startsWith('/analytics/cp-progress?'))
      return { status: 'success', httpStatus: 200, data: { mapelProgress: [threshold] } };
    const rows = url.startsWith('/schedules?')
      ? [
          {
            ...todayClass,
            id: 'schedule',
            academicYear: selected.academicYear.code,
            semester: selected.number,
            dayOfWeek: 2,
            class: { id: 'class', name: 'Kelas sintetis' },
            teachingAssignment: { id: 'assignment', subject: 'Matematika' },
          },
        ]
      : url.startsWith('/teaching-assignments?')
        ? [
            {
              id: 'assignment',
              teacherId: 'own-teacher',
              classId: 'class',
              academicYear: selected.academicYear.code,
              subject: 'Matematika',
              class: { id: 'class', name: 'Kelas sintetis' },
            },
          ]
        : [];
    return {
      status: 'success',
      httpStatus: 200,
      data: { data: rows, total: rows.length, page: 1, limit: 100, offset: 0 },
    };
  });
  const result = await AcademicPage({
    searchParams: Promise.resolve({
      academicYear: selected.academicYear.code,
      semester: String(selected.number),
    }),
  });
  return (
    ['WAKA_KURIKULUM', 'KEPALA_SEKOLAH', 'KAPROG'].includes(role)
      ? (result as React.ReactElement<{ teachingWorkspace: React.ReactElement }>).props
          .teachingWorkspace
      : result
  ).props as SummaryWorkspaceProps;
}
describe('P2-CD-R03 and actual SSR availability wiring, both teacher contexts', () => {
  it.each([
    'GURU',
    'WAKA_KESISWAAN',
    'WAKA_HUMAS',
    'WAKA_SARPRAS',
    'KEPALA_TU',
    'KOOR_BKK',
    'KOOR_HUBIN',
    'WAKIL_KOOR_BKK',
    'WAKIL_KOOR_HUBIN',
    'GURU_BK',
    'BENDAHARA',
    'STAF_KEPEGAWAIAN',
    'OPERATOR_DAPODIK',
  ])('%s personal workspace never falls back to appointment-wide teaching lists', async (role) => {
    await teacherPage(role);
    for (const endpoint of [
      '/teaching-assignments?',
      '/schedules?',
      '/rpp?',
      '/class-activities?',
      '/lms/modules?',
      '/assessment/sessions?',
      '/analytics/cp-progress?',
    ]) {
      const calls = mockApiFetchResult.mock.calls.filter(([url]) =>
        String(url).startsWith(endpoint),
      );
      expect(calls.length).toBeGreaterThan(0);
      expect(
        calls.every(
          ([url]) => new URL(String(url), 'http://localhost').searchParams.get('scope') === 'own',
        ),
      ).toBe(true);
    }
  });
  it.each(['KEPALA_SEKOLAH', 'KAPROG'] as const)(
    '%s receives a separate personal workspace with explicit own scope',
    async (role) => {
      const props = await teacherPage(role);
      expect(props.todayDate).toBeDefined();
      for (const endpoint of [
        '/teaching-assignments?',
        '/schedules?',
        '/rpp?',
        '/class-activities?',
        '/lms/modules?',
        '/assessment/sessions?',
      ]) {
        expect(
          mockApiFetchResult.mock.calls.some(
            ([url]) =>
              String(url).startsWith(endpoint) &&
              new URL(String(url), 'http://localhost').searchParams.get('scope') === 'own',
          ),
        ).toBe(true);
      }
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s does not claim missing assessment when module matching failed',
    async (role) => {
      const props = await teacherPage(role, active, '/lms/modules?', true);
      expect(props.summaryAvailability.assessments).toBe('unavailable');
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s permits current configured-period classes',
    async (role) => {
      const props = await teacherPage(role);
      expect(props.todayClasses).toHaveLength(1);
      expect(props.summaryAvailability.today).toBe('ready');
      expect(props.summaryThresholds).toEqual([threshold]);
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s keeps future timetable readable but not actionable today',
    async (role) => {
      const props = await teacherPage(role, future);
      expect(props.schedules).toHaveLength(1);
      expect(props.todayClasses).toHaveLength(0);
      expect(props.summaryAvailability.today).toBe('outside-period');
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s cannot enable actions when active period cannot be read',
    async (role) => {
      const props = await teacherPage(role, active, '', false, false);
      expect(props.todayClasses).toHaveLength(0);
      expect(props.summaryAvailability.today).toBe('unavailable');
      expect(props.schedules).toHaveLength(1);
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s keeps historical timetable readable but not actionable today',
    async (role) => {
      const props = await teacherPage(role, historical);
      expect(props.schedules).toHaveLength(1);
      expect(props.todayClasses).toHaveLength(0);
    },
  );
  it.each(['GURU', 'WAKA_KURIKULUM'] as const)(
    '%s propagates each domain failure rather than empty-certifying it',
    async (role) => {
      for (const [path, domain] of [
        ['/grades?', 'grades'],
        ['/attendance?', 'attendance'],
        ['/class-activities?', 'journal'],
        ['/rpp?', 'rpp'],
        ['/assessment/sessions?', 'assessments'],
        ['/schedules?', 'today'],
      ] as const) {
        const props = await teacherPage(role, active, path, true);
        expect(props.summaryAvailability[domain]).toBe('denied');
      }
    },
  );
  it('missing active period never certifies operational context', () =>
    expect(teacherTodayState(null, active, '2026-10-13')).toBe('unavailable'));
  it('missing/invalid selected period never certifies operational context', () => {
    expect(teacherTodayState(active, null, '2026-10-13')).toBe('unavailable');
    expect(teacherTodayState(active, { ...active, startDate: 'bad' }, '2026-10-13')).toBe(
      'unavailable',
    );
  });
  it('inclusive WIB semester boundaries are respected', () => {
    expect(teacherTodayState(active, active, '2026-07-01')).toBe('ready');
    expect(teacherTodayState(active, active, '2026-12-31')).toBe('ready');
    expect(teacherTodayState(active, active, '2027-01-01')).toBe('outside-period');
  });
  it('SSR date changed after midnight cannot render stale action buttons', () => {
    const html = summary({ todayClasses: [todayClass], todayDate: '2026-10-12' });
    expect(html).not.toMatch(/>Mulai Sesi<\/button>/);
    expect(html).toContain('Jadwal hari ini belum dapat dimuat');
  });
  it('outside-period notice does not pretend there is no timetable', () => {
    const html = summary({
      todayClasses: [todayClass],
      availability: { ...ready, today: 'outside-period' },
    });
    expect(html).toContain('Jadwalnya tetap dapat dilihat');
    expect(html).not.toMatch(/>Mulai Sesi<\/button>/);
    expect(html).not.toContain('Tidak ada jadwal mengajar hari ini');
  });
});

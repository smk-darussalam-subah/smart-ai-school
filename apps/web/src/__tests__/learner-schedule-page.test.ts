import React from 'react';
const mockSession = jest.fn();
const mockApiFetch = jest.fn();
const mockApiFetchResult = jest.fn();
const mockAuthority = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: mockSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/view-as', () => ({ getActiveViewAs: async () => null }));
jest.mock('@/lib/dashboard-authority', () => ({ resolveDashboardAuthority: mockAuthority }));
jest.mock('@/lib/api', () => ({ apiFetch: mockApiFetch, apiFetchResult: mockApiFetchResult }));
// Test the real server page's output contract, not unrelated client workspaces.
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
import AcademicOperationsWorkspace from '@/app/dashboard/akademik/_components/AcademicOperationsWorkspace';
import AcademicRoleModeSwitcher from '@/app/dashboard/akademik/_components/AcademicRoleModeSwitcher';

type WorkspaceProps = {
  children?: unknown[];
  childrenState?: string;
  grades?: unknown[];
  gradeState?: string;
  attendance?: unknown[];
  schedule?: unknown[];
  scheduleState?: string;
  scheduleStates?: Record<string, string>;
};
async function workspaceProps(): Promise<WorkspaceProps> {
  const element = await AcademicPage({ searchParams: Promise.resolve({}) });
  const wrapper = element as React.ReactElement<{ children: React.ReactElement<WorkspaceProps> }>;
  return wrapper.props.children.props;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({
    accessToken: 'synthetic',
    keycloakId: 'keycloak-synthetic',
    roles: ['SISWA'],
  });
  mockAuthority.mockResolvedValue({ roles: ['SISWA'], hasRole: () => false, can: () => false });
  const period = {
    academicYear: { code: '2026/2027' },
    number: 1,
    startDate: '2026-07-01',
    endDate: '2026-12-31',
  };
  mockApiFetch.mockImplementation(async (url: string) =>
    url === '/school/semesters/active' ? period : url === '/school/semesters' ? [period] : null,
  );
  mockApiFetchResult.mockResolvedValue({
    status: 'success',
    httpStatus: 200,
    data: { data: [], total: 0, page: 1, limit: 100, offset: 0 },
  });
});

describe('real SSR page schedule-state wiring', () => {
  it.each([
    ['SUPER_ADMIN', ['SUPER_ADMIN']],
    ['TATA_USAHA', ['TATA_USAHA']],
    ['GURU', ['GURU']],
    ['KEPALA_SEKOLAH', ['GURU', 'KEPALA_SEKOLAH']],
    ['WAKA_KURIKULUM', ['GURU', 'WAKA_KURIKULUM']],
    ['KAPROG', ['GURU', 'KAPROG']],
  ])(
    'binds %s consumers to the configured period without opening a new global scope',
    async (context, roles) => {
      mockSession.mockResolvedValue({
        accessToken: 'synthetic',
        keycloakId: 'kc',
        roles: roles.includes('GURU') ? ['GURU'] : roles,
      });
      mockAuthority.mockResolvedValue({
        roles,
        hasRole: (...expected: string[]) => expected.some((role) => roles.includes(role)),
        can: () => true,
      });
      const active = {
        academicYear: { code: '2026/2027' },
        number: 1,
        startDate: '2026-07-01',
        endDate: '2026-12-31',
      };
      const chosen = { ...active, number: 2, startDate: '2027-01-04', endDate: '2027-06-30' };
      mockApiFetch.mockImplementation(async (url: string) =>
        url === '/school/semesters/active'
          ? active
          : url === '/school/semesters'
            ? [active, chosen]
            : url === '/teaching-assignments/me/context'
              ? { teacherId: 'own-teacher' }
              : url === '/teaching-assignments/options/active'
                ? {
                    teachers: [],
                    classes: [],
                    subjects: [],
                    academicYears: [],
                    scope: { type: context === 'KAPROG' ? 'major' : 'global', labels: [] },
                  }
                : null,
      );
      const element = (await AcademicPage({
        searchParams: Promise.resolve({ academicYear: '2026/2027', semester: '2' }),
      })) as React.ReactElement;
      const calls = mockApiFetchResult.mock.calls.map(([url]) => String(url));
      for (const path of calls.filter((url) =>
        /^\/(grades|schedules|rpp|assessment\/sessions)\?/.test(url),
      )) {
        const query = new URLSearchParams(path.split('?')[1]);
        expect(query.get('academicYear')).toBe('2026/2027');
        expect(query.get('semester')).toBe('2');
      }
      expect(calls.some((url) => url.startsWith('/analytics/monitoring-kbm'))).toBe(false);
      if (context === 'KAPROG') {
        expect(element.type).toBe(AcademicRoleModeSwitcher);
        const mode = element as React.ReactElement<{
          operationsWorkspace: React.ReactElement;
          initialMode: string;
        }>;
        expect(mode.props.operationsWorkspace.type).toBe(AcademicOperationsWorkspace);
        expect(mode.props.initialMode).toBe('operations');
        expect(
          calls
            .filter((url) => url.startsWith('/schedules?'))
            .every((url) => new URLSearchParams(url.split('?')[1]).get('scope') === 'own'),
        ).toBe(true);
        expect(calls.some((url) => url.startsWith('/classes?'))).toBe(false);
      }
      if (context === 'WAKA_KURIKULUM') {
        const own = calls.filter((url) => url.startsWith('/schedules?'));
        expect(own).toHaveLength(1);
        expect(new URLSearchParams(own[0]!.split('?')[1]).get('teacherId')).toBe('own-teacher');
      }
    },
  );
  it('industry identity is redirected without reading academic datasets', async () => {
    mockAuthority.mockResolvedValue({
      roles: ['INDUSTRI'],
      hasRole: () => false,
      can: () => false,
    });
    await expect(AcademicPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mockApiFetchResult).not.toHaveBeenCalled();
  });
  it.each(['success', 'forbidden', 'unavailable', 'requestError'] as const)(
    'preserves student %s at the workspace boundary',
    async (status) => {
      mockApiFetchResult.mockResolvedValue(
        status === 'success'
          ? {
              status,
              httpStatus: 200,
              data: { data: [], total: 0, page: 1, limit: 100, offset: 0 },
            }
          : { status, message: 'synthetic', httpStatus: status === 'forbidden' ? 403 : 429 },
      );
      const props = await workspaceProps();
      expect(props.scheduleState).toBe(
        status === 'success' ? 'ready' : status === 'forbidden' ? 'denied' : 'error',
      );
      expect(props.schedule).toEqual([]);
      const calls = mockApiFetchResult.mock.calls.filter(([url]) =>
        String(url).startsWith('/schedules?'),
      );
      expect(calls).toHaveLength(1);
      const query = new URLSearchParams(String(calls[0][0]).split('?')[1]);
      expect(Object.fromEntries(query)).toEqual({
        academicYear: '2026/2027',
        semester: '1',
        page: '1',
        limit: '100',
      });
      expect(mockApiFetch.mock.calls.some(([url]) => String(url).startsWith('/schedules'))).toBe(
        false,
      );
    },
  );
  it('keeps ready/error/unassigned per child, without fetching schedules for an unassigned child', async () => {
    mockSession.mockResolvedValue({ accessToken: 'synthetic', roles: ['ORANG_TUA'] });
    mockAuthority.mockResolvedValue({
      roles: ['ORANG_TUA'],
      hasRole: () => false,
      can: () => false,
    });
    const children = {
      data: [
        { id: 'child-a', class: { id: 'class-a', name: 'A' }, user: { fullName: 'Anak A' } },
        { id: 'child-b', class: { id: 'class-b', name: 'B' }, user: { fullName: 'Anak B' } },
        { id: 'child-c', class: null, user: { fullName: 'Anak C' } },
      ],
    };
    const schedule = {
      id: 'only-child-a',
      classId: 'class-a',
      class: { id: 'class-a', name: 'A' },
      academicYear: '2026/2027',
      semester: 1,
      dayOfWeek: 1,
      jpStart: 1,
      jpEnd: 2,
      teachingAssignment: { id: 'assignment-a', subject: 'Matematika' },
    };
    mockApiFetchResult.mockImplementation(async (url: string) =>
      url === '/students/my-children'
        ? { status: 'success', httpStatus: 200, data: children }
        : url.startsWith('/schedules?') && url.includes('class-a')
          ? {
              status: 'success',
              httpStatus: 200,
              data: { data: [schedule], total: 1, page: 1, limit: 100 },
            }
          : { status: 'requestError', httpStatus: 429, message: 'synthetic' },
    );
    const props = await workspaceProps();
    expect(props.scheduleStates).toEqual({
      'child-a': 'ready',
      'child-b': 'error',
      'child-c': 'unassigned',
    });
    expect(props.schedule).toEqual([{ ...schedule, studentId: 'child-a' }]);
    expect(props.childrenState).toBe('ready');
    expect(
      mockApiFetchResult.mock.calls.filter(([url]) =>
        /^\/schedules\?|\/students\/my-children$/.test(String(url)),
      ),
    ).toHaveLength(3);
  });
  it.each(['forbidden', 'unavailable', 'requestError', 'notFound'] as const)(
    'keeps %s child-read separate from missing class placement',
    async (status) => {
      mockSession.mockResolvedValue({ accessToken: 'synthetic', roles: ['ORANG_TUA'] });
      mockAuthority.mockResolvedValue({
        roles: ['ORANG_TUA'],
        hasRole: () => false,
        can: () => false,
      });
      mockApiFetchResult.mockResolvedValue({
        status,
        httpStatus: status === 'forbidden' ? 403 : 500,
        message: 'synthetic',
      });
      const props = await workspaceProps();
      expect(props.childrenState).toBe(status === 'forbidden' ? 'denied' : 'error');
      expect(props.children).toEqual([]);
      expect(props.schedule).toEqual([]);
      expect(props.scheduleStates).toEqual({});
      expect(props.grades).toEqual([]);
      expect(props.attendance).toEqual([]);
      expect(mockApiFetchResult).toHaveBeenCalledWith('/students/my-children', 'synthetic');
      expect(
        mockApiFetchResult.mock.calls.some(([url]) => String(url).startsWith('/schedules')),
      ).toBe(false);
      expect(
        mockApiFetch.mock.calls.some(([url]) =>
          /studentId=|my-children|leaderboard|student-dashboard/.test(String(url)),
        ),
      ).toBe(false);
    },
  );
  it('keeps a successful empty child list honest', async () => {
    mockSession.mockResolvedValue({ accessToken: 'synthetic', roles: ['ORANG_TUA'] });
    mockAuthority.mockResolvedValue({
      roles: ['ORANG_TUA'],
      hasRole: () => false,
      can: () => false,
    });
    const props = await workspaceProps();
    expect(props.childrenState).toBe('empty');
    expect(props.children).toEqual([]);
    expect(props.scheduleStates).toEqual({});
  });
  it('never retags sibling grade or attendance records as the selected child', async () => {
    mockSession.mockResolvedValue({ accessToken: 'synthetic', roles: ['ORANG_TUA'] });
    mockAuthority.mockResolvedValue({
      roles: ['ORANG_TUA'],
      hasRole: () => false,
      can: () => false,
    });
    mockApiFetchResult.mockImplementation(async (url: string) =>
      url === '/students/my-children'
        ? {
            status: 'success',
            httpStatus: 200,
            data: {
              data: [
                { id: 'child-a', class: null, user: { fullName: 'A' } },
                { id: 'child-b', class: null, user: { fullName: 'B' } },
              ],
            },
          }
        : url.startsWith('/analytics/grades/student?')
          ? {
              status: 'success',
              httpStatus: 200,
              data: {
                data: ['child-a', 'child-b', 'not-owned'].map((studentId) => ({
                  studentId,
                  subjects: [
                    {
                      subject: 'Matematika',
                      uh: 95,
                      praktik: null,
                      sikap: null,
                      uts: null,
                      uas: null,
                      na: 95,
                      kktp: 80,
                      kktpProvenance: 'config',
                      status: 'tuntas',
                    },
                  ],
                })),
              },
            }
          : {
              status: 'success',
              httpStatus: 200,
              data: {
                data:
                  url.startsWith('/grades?') || url.startsWith('/attendance?')
                    ? [
                        {
                          id: 'record-a',
                          studentId: 'child-a',
                          classId: 'class-a',
                          date: '2026-10-01',
                          status: 'hadir',
                        },
                        {
                          id: 'record-b',
                          studentId: 'child-b',
                          classId: 'class-b',
                          date: '2026-10-01',
                          status: 'alpha',
                        },
                      ]
                    : [],
                total: url.startsWith('/grades?') || url.startsWith('/attendance?') ? 2 : 0,
                page: 1,
                limit: 100,
                offset: 0,
              },
            },
    );
    const props = await workspaceProps();
    expect(props.grades).toEqual(
      ['child-a', 'child-b'].map((studentId) => ({
        studentId,
        mp: 'Matematika',
        na: 95,
        kktp: 80,
        kktpProvenance: 'config',
        status: 'tuntas',
        components: { uh: 95, praktik: null, sikap: null, uts: null, uas: null },
      })),
    );
    expect(props.gradeState).toBe('ready');
    expect(props.attendance).toEqual([
      {
        id: 'record-a',
        studentId: 'child-a',
        classId: 'class-a',
        date: '2026-10-01',
        status: 'hadir',
      },
      {
        id: 'record-b',
        studentId: 'child-b',
        classId: 'class-b',
        date: '2026-10-01',
        status: 'alpha',
      },
    ]);
    expect(
      mockApiFetchResult.mock.calls.filter(([url]) =>
        String(url).startsWith('/analytics/grades/student?'),
      ),
    ).toHaveLength(1);
    expect(
      mockApiFetchResult.mock.calls.some(([url]) => String(url).startsWith('/grades?studentId=')),
    ).toBe(false);
  });
  it.each(['forbidden', 'unavailable', 'requestError'] as const)(
    'learner grade %s read is not silently converted into empty success',
    async (status) => {
      mockApiFetchResult.mockImplementation(async (url: string) =>
        url.startsWith('/analytics/grades/student?')
          ? { status, message: 'Synthetic' }
          : {
              status: 'success',
              httpStatus: 200,
              data: { data: [], total: 0, page: 1, limit: 100, offset: 0 },
            },
      );
      const props = await workspaceProps();
      expect(props.gradeState).toBe(status === 'forbidden' ? 'denied' : 'unavailable');
      expect(props.grades).toEqual([]);
    },
  );
});

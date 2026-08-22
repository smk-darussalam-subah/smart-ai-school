const mockGetServerSession = jest.fn();
const mockResolveDashboardAuthority = jest.fn();
const mockRedirect = jest.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

jest.mock('next-auth', () => ({
  getServerSession: mockGetServerSession,
}));

jest.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}));

jest.mock('@/lib/dashboard-authority', () => ({
  resolveDashboardAuthority: mockResolveDashboardAuthority,
}));

jest.mock('../app/dashboard/penutupan-semester/_components/SemesterClosingClient', () => ({
  __esModule: true,
  default: function MockSemesterClosingClient(props: Record<string, unknown>) {
    return { type: 'SemesterClosingClient', props };
  },
}));

import SemesterClosingPage from '../app/dashboard/penutupan-semester/page';

function authority(roles: string[], permissions: string[] = []) {
  return {
    roles,
    permissions,
    permissionCheckAvailable: true,
    hasRole: (...expected: string[]) => expected.some((role) => roles.includes(role)),
    can: (permission: string) => permissions.includes('*') || permissions.includes(permission),
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('SemesterClosingPage access and load states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'token' });
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders access denied before fetching readiness for unsupported stable roles', async () => {
    mockResolveDashboardAuthority.mockResolvedValue(authority(['TATA_USAHA']));

    const result = await SemesterClosingPage() as { props: Record<string, unknown> };

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.props.initialReadiness).toBeNull();
    expect(result.props.unavailableReason).toBe('access-denied');
    expect(result.props.canReadFinalReport).toBe(false);
    expect(result.props.canCloseSemester).toBe(false);
  });

  it('maps active-period conflicts to a no-period state instead of permission denied', async () => {
    mockResolveDashboardAuthority.mockResolvedValue(authority(['GURU']));
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(409, {
      message: 'Konfigurasi tahun ajaran dan semester aktif harus tepat satu',
    }));

    const result = await SemesterClosingPage() as { props: Record<string, unknown> };

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.props.initialReadiness).toBeNull();
    expect(result.props.unavailableReason).toBe('no-active-period');
  });

  it('loads closures only for final-report readers', async () => {
    mockResolveDashboardAuthority.mockResolvedValue(authority(
      ['GURU', 'KEPALA_SEKOLAH'],
      ['academic.final-report.read', 'academic.semester.close'],
    ));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(200, {
        ready: false,
        closedAt: null,
        period: { academicYear: '2026/2027', semester: 1 },
        nextPeriod: null,
        scope: { kind: 'school' },
        readinessVersion: 'wave7.v1',
        readinessHash: 'a'.repeat(64),
        generatedAt: '2026-08-20T01:00:00.000Z',
        metrics: [],
        blockers: [],
        warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const result = await SemesterClosingPage() as { props: Record<string, unknown> };

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.props.canReadFinalReport).toBe(true);
    expect(result.props.canCloseSemester).toBe(true);
    expect(result.props.initialClosures).toEqual([]);
  });

  it('keeps readiness usable but surfaces closure API failure to the history tab', async () => {
    mockResolveDashboardAuthority.mockResolvedValue(authority(
      ['GURU', 'KEPALA_SEKOLAH'],
      ['academic.final-report.read', 'academic.semester.close'],
    ));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(200, {
        ready: false,
        closedAt: null,
        period: { academicYear: '2026/2027', semester: 1 },
        nextPeriod: null,
        scope: { kind: 'school' },
        readinessVersion: 'wave7.v1',
        readinessHash: 'a'.repeat(64),
        generatedAt: '2026-08-20T01:00:00.000Z',
        metrics: [],
        blockers: [],
        warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'Riwayat gagal dimuat' }));

    const result = await SemesterClosingPage() as { props: Record<string, unknown> };

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.props.initialReadiness).toEqual(expect.objectContaining({ readinessVersion: 'wave7.v1' }));
    expect(result.props.initialClosures).toEqual([]);
    expect(result.props.initialClosuresError).toBe('Riwayat gagal dimuat');
  });

  it('treats an empty closure list as empty only when the API succeeds', async () => {
    mockResolveDashboardAuthority.mockResolvedValue(authority(
      ['GURU', 'KEPALA_SEKOLAH'],
      ['academic.final-report.read', 'academic.semester.close'],
    ));
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse(200, {
        ready: false,
        closedAt: null,
        period: { academicYear: '2026/2027', semester: 1 },
        nextPeriod: null,
        scope: { kind: 'school' },
        readinessVersion: 'wave7.v1',
        readinessHash: 'a'.repeat(64),
        generatedAt: '2026-08-20T01:00:00.000Z',
        metrics: [],
        blockers: [],
        warnings: [],
      }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const result = await SemesterClosingPage() as { props: Record<string, unknown> };

    expect(result.props.initialClosures).toEqual([]);
    expect(result.props.initialClosuresError).toBeNull();
  });
});

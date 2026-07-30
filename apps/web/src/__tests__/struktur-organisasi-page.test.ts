const mockApiFetch = jest.fn();
const mockGetServerSession = jest.fn();
const mockGetEffectiveRoles = jest.fn();
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

jest.mock('@/lib/api', () => ({
  apiFetch: mockApiFetch,
}));

jest.mock('@/lib/view-as', () => ({
  getEffectiveRoles: mockGetEffectiveRoles,
}));

jest.mock('@/components/LoadError', () => function MockLoadError() {
  return null;
});

jest.mock('../app/dashboard/struktur-organisasi/_components/StrukturClient', () => ({
  __esModule: true,
  default: function MockStrukturClient(props: Record<string, unknown>) {
    return { type: 'StrukturClient', props };
  },
}));

import StrukturOrganisasiPage from '../app/dashboard/struktur-organisasi/page';

const emptyRegistry = {
  data: [],
  summary: {
    all: 0,
    draft: 0,
    pendingApproval: 0,
    approved: 0,
    active: 0,
    suspended: 0,
    terminal: 0,
  },
  meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
};

describe('StrukturOrganisasiPage appointment authority gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'token' });
  });

  it('redirects ordinary stable identities before loading the position catalog', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockResolvedValueOnce({
      academicYear: { id: 'ay-active', code: '2026/2027' },
      positions: [],
    });

    await expect(StrukturOrganisasiPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('redirect:/dashboard');

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch).toHaveBeenCalledWith('/positions/my-positions', 'token');
    expect(mockApiFetch).not.toHaveBeenCalledWith('/positions', 'token');
  });

  it('allows an active Kepala Sekolah appointment to load operational support data', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/positions/my-positions') {
        return {
          academicYear: { id: 'ay-active', code: '2026/2027' },
          positions: [{ id: 'appt-ks', position: { code: 'KEPALA_SEKOLAH', name: 'Kepala Sekolah' } }],
        };
      }
      if (url === '/positions') return [];
      if (url === '/school/academic-years') {
        return [{ id: 'ay-active', code: '2026/2027', startDate: '2026-07-01', endDate: '2027-06-30', isActive: true }];
      }
      if (url === '/school/majors?activeOnly=true') return [];
      if (url === '/appointments/position-capabilities') return [];
      if (url === '/appointments') return emptyRegistry;
      return null;
    });

    await expect(StrukturOrganisasiPage({ searchParams: Promise.resolve({}) }))
      .resolves.toBeTruthy();

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/positions/my-positions');
    expect(mockApiFetch.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(['/positions', '/appointments/position-capabilities']),
    );
  });
});

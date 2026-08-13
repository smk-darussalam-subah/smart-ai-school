const mockApiFetch = jest.fn();
const mockGetServerSession = jest.fn();
const mockGetEffectiveRoles = jest.fn();
const mockGetActiveViewAs = jest.fn();
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
  getActiveViewAs: mockGetActiveViewAs,
}));

jest.mock('../app/dashboard/rpp/_components/RppBoard', () => ({
  __esModule: true,
  default: function MockRppBoard(props: Record<string, unknown>) {
    return { type: 'RppBoard', props };
  },
}));

import RppPage from '../app/dashboard/rpp/page';

describe('RppPage appointment-aware reviewer gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ accessToken: 'token' });
    mockGetActiveViewAs.mockResolvedValue(null);
  });

  it('allows active WAKA appointment with stable GURU identity to open reviewer board', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/positions/my-positions') {
        return {
          positions: [{ status: 'ACTIVE', position: { code: 'WAKA_KURIKULUM', name: 'Wakasek Kurikulum' } }],
        };
      }
      if (url === '/auth/me') return { permissions: ['rpp.read', 'rpp.curriculum.review'] };
      if (url === '/rpp?page=1&limit=20') return { data: [], total: 0, page: 1, limit: 20 };
      return null;
    });

    const result = await RppPage({ searchParams: Promise.resolve({}) }) as { props: { canCurriculumReview: boolean } };

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props.canCurriculumReview).toBe(true);
    expect(mockApiFetch.mock.calls.map((call) => call[0])).toEqual([
      '/positions/my-positions',
      '/auth/me',
      '/rpp?page=1&limit=20',
    ]);
  });

  it('redirects ordinary GURU without active reviewer appointment', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/positions/my-positions') return { positions: [] };
      if (url === '/auth/me') return { permissions: ['rpp.read'] };
      return null;
    });

    await expect(RppPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/dashboard/akademik');

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/akademik');
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
  });
});

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
  });

  it('allows active WAKA appointment with stable GURU identity to open reviewer board', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === '/positions/my-positions') {
        return {
          positions: [{ status: 'ACTIVE', position: { code: 'WAKA_KURIKULUM', name: 'Wakasek Kurikulum' } }],
        };
      }
      if (url === '/rpp?limit=100') return { data: [], total: 0 };
      if (url === '/school/semesters/active') {
        return { number: 1, academicYear: { code: '2026/2027' } };
      }
      return null;
    });

    const result = await RppPage() as { props: { isReviewer: boolean; userRole: string } };

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result.props.isReviewer).toBe(true);
    expect(result.props.userRole).toBe('WAKA_KURIKULUM');
    expect(mockApiFetch.mock.calls.map((call) => call[0])).toEqual([
      '/positions/my-positions',
      '/rpp?limit=100',
      '/school/semesters/active',
    ]);
  });

  it('redirects ordinary GURU without active reviewer appointment', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockResolvedValueOnce({ positions: [] });

    await expect(RppPage()).rejects.toThrow('redirect:/dashboard/akademik');

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/akademik');
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

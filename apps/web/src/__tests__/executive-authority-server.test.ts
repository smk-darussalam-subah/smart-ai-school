const mockGetServerSession = jest.fn();
const mockResolveAuthority = jest.fn();
const mockRedirect = jest.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

jest.mock('next-auth', () => ({ getServerSession: mockGetServerSession }));
jest.mock('next/navigation', () => ({ redirect: mockRedirect }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/dashboard-authority', () => ({
  resolveDashboardAuthority: mockResolveAuthority,
}));

import { requireExecutiveDashboardAccess } from '@/app/dashboard/executive/executive-authority.server';

function resolvedAuthority(roles: string[], permissions: string[]) {
  return {
    hasRole: (...expected: string[]) => expected.some((role) => roles.includes(role)),
    can: (permission: string) => permissions.includes('*') || permissions.includes(permission),
  };
}

describe('requireExecutiveDashboardAccess', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects an unauthenticated invocation before resolving authority', async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(requireExecutiveDashboardAccess()).rejects.toThrow('REDIRECT:/login');
    expect(mockResolveAuthority).not.toHaveBeenCalled();
  });

  it('accepts active Kepala Sekolah authority with finance.read', async () => {
    const session = { accessToken: 'synthetic-token', roles: ['GURU'] };
    mockGetServerSession.mockResolvedValue(session);
    mockResolveAuthority.mockResolvedValue(resolvedAuthority(
      ['GURU', 'KEPALA_SEKOLAH'],
      ['finance.read'],
    ));
    await expect(requireExecutiveDashboardAccess()).resolves.toBe(session);
  });

  it.each([
    [['GURU'], ['finance.read']],
    [['GURU', 'WAKA_KURIKULUM'], ['finance.read']],
    [['GURU', 'KEPALA_SEKOLAH'], []],
  ])('redirects a non-authoritative projection', async (roles, permissions) => {
    mockGetServerSession.mockResolvedValue({ accessToken: 'synthetic-token' });
    mockResolveAuthority.mockResolvedValue(resolvedAuthority(roles, permissions));
    await expect(requireExecutiveDashboardAccess()).rejects.toThrow('REDIRECT:/dashboard');
  });
});

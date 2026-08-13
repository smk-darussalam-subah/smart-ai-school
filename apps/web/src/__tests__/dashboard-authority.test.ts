const mockApiFetch = jest.fn();
const mockGetEffectiveRoles = jest.fn();
const mockGetActiveViewAs = jest.fn();

jest.mock('@/lib/api', () => ({ apiFetch: mockApiFetch }));
jest.mock('@/lib/view-as', () => ({
  getEffectiveRoles: mockGetEffectiveRoles,
  getActiveViewAs: mockGetActiveViewAs,
}));

import { resolveDashboardAuthority } from '@/lib/dashboard-authority';

describe('resolveDashboardAuthority', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveViewAs.mockResolvedValue(null);
  });

  it('recognizes the SUPER_ADMIN wildcard permission', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['SUPER_ADMIN']);
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/auth/me' ? { permissions: ['*'] } : { positions: [] });

    const authority = await resolveDashboardAuthority({ accessToken: 'token' } as never);

    expect(authority.can('academic.teaching.manage')).toBe(true);
    expect(authority.can('rpp.review')).toBe(true);
  });

  it('merges active Appointment roles but suppresses them in view-as mode', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['GURU']);
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/auth/me'
        ? { permissions: ['academic.teaching.read'] }
        : { positions: [{ status: 'ACTIVE', position: { code: 'WAKA_KURIKULUM' } }] });

    let authority = await resolveDashboardAuthority({ accessToken: 'token' } as never);
    expect(authority.hasRole('WAKA_KURIKULUM')).toBe(true);

    mockGetActiveViewAs.mockResolvedValue('GURU');
    authority = await resolveDashboardAuthority({ accessToken: 'token' } as never);
    expect(authority.hasRole('WAKA_KURIKULUM')).toBe(false);
  });

  it('fails closed for mutations when /auth/me cannot be loaded', async () => {
    mockGetEffectiveRoles.mockResolvedValue(['SUPER_ADMIN']);
    mockApiFetch.mockImplementation(async (path: string) =>
      path === '/auth/me' ? null : { positions: [] });

    const authority = await resolveDashboardAuthority({ accessToken: 'token' } as never);
    expect(authority.permissionCheckAvailable).toBe(false);
    expect(authority.can('academic.teaching.manage')).toBe(false);
  });
});

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
jest.mock('@/app/dashboard/akademik/_components/AcademicOperationsWorkspace', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/AcademicRoleModeSwitcher', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/_components/AcademicDataNotice', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/AkademikWorkspace', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/KsWorkspace', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/SiswaWorkspace', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/OrtuWorkspace', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/siswa/SiswaRefreshWrapper', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/dashboard/akademik/_components/ortu/OrtuRefreshWrapper', () => ({ __esModule: true, default: () => null }));
import AcademicPage from '@/app/dashboard/akademik/page';

type WorkspaceProps = { schedule?: unknown[]; scheduleState?: string; scheduleStates?: Record<string, string> };
async function workspaceProps(): Promise<WorkspaceProps> {
  const element = await AcademicPage({ searchParams: Promise.resolve({}) });
  const wrapper = element as React.ReactElement<{ children: React.ReactElement<WorkspaceProps> }>;
  return wrapper.props.children.props;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ accessToken: 'synthetic', keycloakId: 'keycloak-synthetic', roles: ['SISWA'] });
  mockAuthority.mockResolvedValue({ roles: ['SISWA'], hasRole: () => false, can: () => false });
  mockApiFetch.mockResolvedValue(null);
  mockApiFetchResult.mockResolvedValue({ status: 'success', httpStatus: 200, data: { data: [] } });
});

describe('real SSR page schedule-state wiring', () => {
  it.each(['success', 'forbidden', 'unavailable', 'requestError'] as const)('preserves student %s at the workspace boundary', async (status) => {
    mockApiFetchResult.mockResolvedValue(status === 'success' ? { status, httpStatus: 200, data: { data: [] } } : { status, message: 'synthetic', httpStatus: status === 'forbidden' ? 403 : 429 });
    const props = await workspaceProps();
    expect(props.scheduleState).toBe(status === 'success' ? 'ready' : status === 'forbidden' ? 'denied' : 'error');
    expect(props.schedule).toEqual([]);
    expect(mockApiFetchResult).toHaveBeenCalledWith('/schedules?limit=100', 'synthetic');
    expect(mockApiFetch.mock.calls.some(([url]) => String(url).startsWith('/schedules'))).toBe(false);
  });
  it('keeps ready/error/unassigned per child, without fetching schedules for an unassigned child', async () => {
    mockSession.mockResolvedValue({ accessToken: 'synthetic', roles: ['ORANG_TUA'] });
    mockAuthority.mockResolvedValue({ roles: ['ORANG_TUA'], hasRole: () => false, can: () => false });
    mockApiFetch.mockImplementation(async (url: string) => url === '/students/my-children' ? { data: [
      { id: 'child-a', class: { id: 'class-a', name: 'A' }, user: { fullName: 'Anak A' } },
      { id: 'child-b', class: { id: 'class-b', name: 'B' }, user: { fullName: 'Anak B' } },
      { id: 'child-c', class: null, user: { fullName: 'Anak C' } },
    ] } : null);
    mockApiFetchResult.mockImplementation(async (url: string) => url.includes('class-a')
      ? { status: 'success', httpStatus: 200, data: { data: [{ id: 'only-child-a' }] } }
      : { status: 'requestError', httpStatus: 429, message: 'synthetic' });
    const props = await workspaceProps();
    expect(props.scheduleStates).toEqual({ 'child-a': 'ready', 'child-b': 'error', 'child-c': 'unassigned' });
    expect(props.schedule).toEqual([{ id: 'only-child-a', studentId: 'child-a' }]);
    expect(mockApiFetchResult).toHaveBeenCalledTimes(2);
  });
});

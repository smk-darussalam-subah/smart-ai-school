import React from 'react';
const mockRead = jest.fn(),
  mockRoles = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: async () => ({ accessToken: 'synthetic', user: { name: 'Synthetic' } }),
}));
jest.mock('next/navigation', () => ({
  redirect: () => {
    throw Error('redirect');
  },
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/view-as', () => ({
  getEffectiveRoles: () => mockRoles(),
  getActiveViewAs: async () => null,
}));
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockRead(...args),
  apiFetchResult: async () => ({ status: 'success', data: [], httpStatus: 200 }),
}));
jest.mock('@/lib/academic-pages-server', () => ({
  academicPagesResult: async () => ({
    status: 'success',
    data: { data: [], total: 0 },
    httpStatus: 200,
  }),
}));
jest.mock('@/app/dashboard/_components/RoleBasedHome', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/app/dashboard/akademik/_components/AttendanceJpSummary', () => ({
  __esModule: true,
  default: () => null,
}));
import DashboardPage from '@/app/dashboard/page';
import RoleBasedHome from '@/app/dashboard/_components/RoleBasedHome';
function setup(role: string, permissions: string[] | null = []) {
  mockRoles.mockResolvedValue([role]);
  mockRead.mockImplementation(
    async (p: string, _token: string, params?: Record<string, string>) => {
      if (p === '/auth/me') return permissions === null ? null : { permissions };
      if (p === '/positions/my-positions') return { positions: [] };
      if (p === '/school/academic-years/active') return { id: 'year', code: '2026/2027' };
      if (p === '/school/semesters/active')
        return {
          id: 'sem',
          number: 1,
          academicYear: { id: 'year', code: '2026/2027' },
          startDate: '2026-07-13',
          endDate: '2026-12-19',
        };
      if (p.startsWith('/classes'))
        return { total: params?.academicYear === '2026/2027' ? 11 : 21 };
      if (p.startsWith('/students')) return { total: 41 };
      return null;
    },
  );
}
function stats(tree: React.ReactElement) {
  const nodes = React.Children.toArray((tree.props as { children: React.ReactNode }).children);
  const home = nodes.find(
    (n) => React.isValidElement(n) && n.type === RoleBasedHome,
  ) as React.ReactElement<{ stats: { totalKelas: number | null; totalSiswa: number | null } }>;
  return home.props.stats;
}
describe('Home class capability and selected-year count', () => {
  beforeEach(() => jest.resetAllMocks());
  it.each([
    'SUPER_ADMIN',
    'KEPALA_SEKOLAH',
    'TATA_USAHA',
    'GURU',
    'WAKA_KURIKULUM',
    'WAKA_KESISWAAN',
  ])('role %s can read class totals without imaginary permission aliases', async (role) => {
    setup(role);
    expect(stats(await DashboardPage()).totalKelas).toBe(11);
    expect(mockRead.mock.calls.find(([p]) => p === '/classes')?.[2]).toEqual({
      academicYear: '2026/2027',
      limit: '1',
    });
  });
  it.each(['KAPROG', 'INDUSTRI'])('does not expand the class read contract to %s', async (role) => {
    setup(role);
    expect(stats(await DashboardPage()).totalKelas).toBeNull();
    expect(mockRead.mock.calls.some(([p]) => p.startsWith('/classes'))).toBe(false);
  });
  it('fails closed if current authority cannot be loaded', async () => {
    setup('GURU', null);
    expect(stats(await DashboardPage()).totalKelas).toBeNull();
  });
  it('reads active enrollment with a distinct label, not account eligibility', async () => {
    setup('SUPER_ADMIN', ['student.read']);
    expect(stats(await DashboardPage()).totalSiswa).toBe(41);
    expect(mockRead.mock.calls.some(([p]) => p === '/students?status=active&limit=1')).toBe(true);
  });
});

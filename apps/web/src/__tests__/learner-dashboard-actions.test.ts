const mockSession = jest.fn();
const mockFetch = jest.fn();
jest.mock('next-auth', () => ({ getServerSession: mockSession }));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/api', () => ({ apiFetchResult: mockFetch }));
import {
  refreshStudentTasks,
  refreshParentSpp,
} from '@/app/dashboard/akademik/learner-dashboard-actions';
import { fetchStudentTasks, fetchParentSpp } from '@/lib/learner-dashboard-server';

const success = (data: unknown) => ({ status: 'success', httpStatus: 200, data });
beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({ accessToken: 'synthetic-only', roles: ['ORANG_TUA'] });
});
it.each([null, { roles: ['GURU'], accessToken: 'synthetic-only' }, { roles: ['ORANG_TUA'] }])(
  'denies missing or wrong-role sessions before any request',
  async (session) => {
    mockSession.mockResolvedValue(session);
    expect(await refreshStudentTasks()).toEqual({ state: 'denied' });
    expect(await refreshParentSpp('child-a')).toEqual({ state: 'denied' });
    expect(mockFetch).not.toHaveBeenCalled();
  },
);
it('own tasks use only the current token and a fixed own-scoped endpoint', async () => {
  mockSession.mockResolvedValue({ accessToken: 'synthetic-only', roles: ['SISWA'] });
  mockFetch.mockResolvedValue(success({ data: [{ studentId: 'self', assignments: [] }] }));
  expect(await refreshStudentTasks()).toEqual({ state: 'ready', data: [] });
  expect(mockFetch.mock.calls).toEqual([['/student-dashboard/assignments', 'synthetic-only']]);
});
it.each([403, 429, 503])(
  'fresh %s discards prior data on both fixed endpoint reads',
  async (httpStatus) => {
    mockFetch.mockResolvedValue({
      status: httpStatus === 403 ? 'forbidden' : 'unavailable',
      httpStatus,
    });
    const state = httpStatus === 403 ? 'denied' : 'unavailable';
    expect(await fetchStudentTasks('synthetic-only')).toEqual({ state });
    expect(await fetchParentSpp('synthetic-only', ['child-a'])).toEqual({ state });
  },
);
it('rechecks live child relationships before reading payments and returns only the selected child', async () => {
  mockFetch.mockImplementation(async (path: string) =>
    success(
      path === '/students/my-children'
        ? { data: [{ id: 'child-a', user: { fullName: 'QA' }, class: null }] }
        : {
            data: [
              { studentId: 'child-a', studentName: 'QA', payments: [] },
              { studentId: 'other-child', studentName: 'PRIVATE', payments: [] },
            ],
          },
    ),
  );
  expect(await refreshParentSpp('child-a')).toEqual({ state: 'ready', data: [] });
  expect(mockFetch.mock.calls.map((call) => call[0])).toEqual([
    '/students/my-children',
    '/student-dashboard/spp',
  ]);
});
it.each([success({ data: [] }), { status: 'forbidden', httpStatus: 403 }])(
  'revoked relationships block the finance read entirely',
  async (children) => {
    mockFetch.mockResolvedValue(children);
    expect(await refreshParentSpp('revoked')).toEqual({ state: 'denied' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  },
);
it('child API failure is unknown, not a fabricated empty SPP', async () => {
  mockFetch.mockResolvedValue({ status: 'unavailable', httpStatus: 503 });
  expect(await refreshParentSpp('child-a')).toEqual({ state: 'unavailable' });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

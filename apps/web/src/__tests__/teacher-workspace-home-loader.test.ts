import { loadTeacherHome } from '@/lib/teacher-home-server';
import { apiFetchResult } from '@/lib/api';
import { academicPagesResult } from '@/lib/academic-pages-server';
jest.mock('@/lib/api', () => ({ apiFetchResult: jest.fn() }));
jest.mock('@/lib/academic-pages-server', () => ({ academicPagesResult: jest.fn() }));
const api = jest.mocked(apiFetchResult),
  pages = jest.mocked(academicPagesResult);
const period = { academicYear: '2026/2027', semester: 1 },
  date = '2026-11-02';
const teacher = '00000000-0000-4000-8000-000000000005';
beforeEach(() => {
  jest.clearAllMocks();
  api.mockImplementation(async (path) =>
    path === '/teaching-assignments/me/context'
      ? { status: 'success', httpStatus: 200, data: { teacherId: teacher } }
      : { status: 'unavailable', message: 'Synthetic outage' },
  );
  pages.mockResolvedValue({
    status: 'success',
    data: { data: [], total: 0, page: 1, limit: 100 },
    httpStatus: 200,
  });
});
it('does not fetch or certify work without an official active period', async () => {
  const result = await loadTeacherHome('synthetic', date, null, () => true);
  expect(Object.values(result).every((r) => r.state === 'error')).toBe(true);
  expect(api).not.toHaveBeenCalled();
  expect(pages).not.toHaveBeenCalled();
});
it('keeps denied data distinct from empty and does not request unauthorized lists', async () => {
  const result = await loadTeacherHome('synthetic', date, period, () => false);
  expect(result.sessions.state).toBe('denied');
  expect(result.attendance.state).toBe('denied');
  expect(result.journal.state).toBe('denied');
  expect(result.assessment.state).toBe('denied');
  expect(pages).not.toHaveBeenCalled();
});
it('keeps a read failure unavailable, rather than zero completed work', async () => {
  pages.mockResolvedValue({ status: 'unavailable', message: 'Synthetic outage' });
  const result = await loadTeacherHome('synthetic', date, period, () => true);
  expect(Object.values(result).every((r) => r.state === 'error')).toBe(true);
});
it('requires a valid own-teacher context even when every list is empty', async () => {
  api.mockResolvedValue({ status: 'success', httpStatus: 200, data: {} });
  const result = await loadTeacherHome('synthetic', date, period, () => true);
  expect(Object.values(result).every((r) => r.state === 'error')).toBe(true);
});

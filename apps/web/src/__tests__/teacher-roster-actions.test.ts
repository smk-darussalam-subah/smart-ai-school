const mockRead = jest.fn();
const mockFetch = jest.fn();
jest.mock('next-auth', () => ({
  getServerSession: async () => ({ accessToken: 'synthetic-only' }),
}));
jest.mock('@/lib/auth', () => ({ authOptions: {} }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('@/lib/api', () => ({
  apiFetchResult: (...args: unknown[]) => mockRead(...args),
  apiErrorMessage: () => 'Permintaan belum dapat diproses.',
}));
import { fetchClassRoster, fetchWaliClasses } from '@/app/dashboard/akademik/actions';
const classId = '10000000-0000-4000-8000-000000000001';
beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
  global.fetch = mockFetch;
});
it('represents only a verified empty roster as success with zero rows', async () => {
  mockRead.mockResolvedValue({
    status: 'success',
    data: { data: [], total: 0, page: 1, limit: 100 },
  });
  await expect(fetchClassRoster(classId)).resolves.toEqual({ success: true, data: [] });
});
it.each(['forbidden', 'unavailable', 'invalidResponse'] as const)(
  '%s does not turn into a successful empty roster',
  async (status) => {
    mockRead.mockResolvedValue({ status, message: 'Pembacaan gagal.' });
    await expect(fetchClassRoster(classId)).resolves.toMatchObject({
      success: false,
      error: 'Pembacaan gagal.',
    });
  },
);
it('discards a partial roster when the next page fails', async () => {
  const data = Array.from({ length: 100 }, (_, index) => ({
    id: 'synthetic-' + index,
    nis: 'SYN',
    user: { fullName: 'Synthetic' },
  }));
  mockRead
    .mockResolvedValueOnce({ status: 'success', data: { data, total: 101, page: 1, limit: 100 } })
    .mockResolvedValueOnce({ status: 'unavailable', message: 'Halaman berikutnya gagal.' });
  await expect(fetchClassRoster(classId)).resolves.toMatchObject({ success: false });
  expect(mockRead).toHaveBeenCalledTimes(2);
});
it('rejects malformed successful rows rather than creating nameless students', async () => {
  mockRead.mockResolvedValue({
    status: 'success',
    data: { data: [{ id: 's', nis: 'SYN', user: null }], total: 1, page: 1, limit: 100 },
  });
  await expect(fetchClassRoster(classId)).resolves.toMatchObject({ success: false });
});
it('invalid class IDs do not reach the server', async () => {
  await expect(fetchClassRoster('wrong')).resolves.toMatchObject({ success: false });
  expect(mockRead).not.toHaveBeenCalled();
});
it('does not certify a malformed homeroom response as non-homeroom', async () => {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  await expect(fetchWaliClasses()).resolves.toMatchObject({ success: false });
});
it('distinguishes verified non-homeroom status from a failed lookup', async () => {
  mockFetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ classes: [], isWaliKelas: false }) })
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
  await expect(fetchWaliClasses()).resolves.toMatchObject({
    success: true,
    data: { classes: [], isWaliKelas: false },
  });
  await expect(fetchWaliClasses()).resolves.toMatchObject({ success: false });
});

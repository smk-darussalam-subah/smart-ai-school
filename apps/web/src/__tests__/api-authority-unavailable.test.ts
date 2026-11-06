import { apiFetch, apiFetchResult } from '../lib/api';
import { redirect } from 'next/navigation';
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw Error('NEXT_REDIRECT');
  }),
}));
const originalFetch = global.fetch;
const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  jest.mocked(redirect).mockClear();
  global.fetch = mockFetch;
});
afterAll(() => {
  global.fetch = originalFetch;
});
const unavailable = () =>
  new Response(
    JSON.stringify({
      code: 'AUTHORITY_UNAVAILABLE',
      message: 'Layanan akun sementara tidak tersedia. Coba lagi sebentar.',
    }),
    { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '2' } },
  );

it('keeps a temporary authority failure retryable, then reads again with the same token without redirect', async () => {
  mockFetch
    .mockResolvedValueOnce(unavailable())
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'synthetic' }), { status: 200 }));
  expect(await apiFetchResult('/auth/me', 'same-valid-token')).toMatchObject({
    status: 'unavailable',
    httpStatus: 503,
  });
  expect(redirect).not.toHaveBeenCalled();
  expect(await apiFetchResult('/auth/me', 'same-valid-token')).toMatchObject({
    status: 'success',
    data: { id: 'synthetic' },
  });
  expect(mockFetch.mock.calls.map((c) => c[1].headers.Authorization)).toEqual([
    'Bearer same-valid-token',
    'Bearer same-valid-token',
  ]);
  expect(redirect).not.toHaveBeenCalled();
});
it('does not redirect legacy GET consumers on 503 either', async () => {
  mockFetch.mockResolvedValueOnce(unavailable());
  expect(await apiFetch('/auth/me', 'valid')).toBeNull();
  expect(redirect).not.toHaveBeenCalled();
});
it('still redirects genuine invalid/revoked sessions', async () => {
  mockFetch.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  await expect(apiFetchResult('/auth/me', 'revoked')).rejects.toThrow('NEXT_REDIRECT');
  expect(redirect).toHaveBeenCalledWith('/login?reason=session');
});

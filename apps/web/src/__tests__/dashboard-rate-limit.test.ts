import { rateLimitMessage } from '@/lib/rate-limit';
import { apiFetchResult } from '@/lib/api';
import { redirect } from 'next/navigation';
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

describe('rate limiting is temporary unavailability, not session expiry', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
    jest.clearAllMocks();
  });
  it.each(['retry-after', 'retry-after-aichat', 'retry-after-preauth'])(
    'reads %s without retrying or redirecting',
    async (header) => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response('{}', { status: 429, headers: { [header]: '35' } }));
      expect(await apiFetchResult('/auth/me', 'synthetic')).toMatchObject({
        status: 'unavailable',
        httpStatus: 429,
        message: expect.stringContaining('35 detik'),
      });
      expect(redirect).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('does not echo arbitrary headers and bounds excessive delay values', () => {
    expect(rateLimitMessage(new Headers({ 'retry-after': 'untrusted text' }))).not.toContain(
      'untrusted',
    );
    expect(rateLimitMessage(new Headers({ 'retry-after': '999999' }))).toContain('3600 detik');
    expect(rateLimitMessage(new Headers({ 'retry-after': '0' }))).toContain('1 detik');
  });
});

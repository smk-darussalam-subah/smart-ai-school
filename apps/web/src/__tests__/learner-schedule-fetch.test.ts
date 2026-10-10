import { apiFetchResult } from '@/lib/api';
import { readLearnerSchedule } from '@/lib/learner-schedule';
jest.mock('next/navigation', () => ({ redirect: (url: string) => {
  const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
} }));

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
describe('real API decoder feeding learner schedule state', () => {
  it.each([[200, 'ready'], [403, 'denied'], [429, 'error'], [500, 'error'], [503, 'error']])(
    'maps HTTP %i to %s, never empty success on error', async (httpStatus, state) => {
      const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: httpStatus }));
      global.fetch = fetchMock;
      const result = await apiFetchResult<{ data: unknown[] }>('/schedules?limit=100', 'synthetic');
      expect(readLearnerSchedule(result).state).toBe(state);
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/schedules?limit=100'), expect.objectContaining({ cache: 'no-store' }));
    });
  it.each(['not-json', '{}', 'null'])('treats malformed success %s as an error', async (body) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(body, { status: 200 }));
    expect(readLearnerSchedule(await apiFetchResult<{ data: unknown[] }>('/schedules?limit=100', 'synthetic')).state).toBe('error');
  });
  it('preserves session redirect instead of disguising HTTP 401 as an empty timetable', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    await expect(apiFetchResult('/schedules?limit=100', 'synthetic')).rejects.toThrow('NEXT_REDIRECT');
  });
  it('treats network failure as error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('synthetic offline'));
    expect(readLearnerSchedule(await apiFetchResult<{ data: unknown[] }>('/schedules?limit=100', 'synthetic')).state).toBe('error');
  });
});

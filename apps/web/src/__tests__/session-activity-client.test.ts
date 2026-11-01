import { postSessionActivity } from '../lib/session-activity-client';

const originalFetch = global.fetch;
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.useRealTimers();
});

describe('router-neutral session bookkeeping', () => {
  it.each(['heartbeat', 'login'] as const)(
    'posts %s to one same-origin HTTP endpoint without a Server Action header',
    async (eventType) => {
      global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
      await postSessionActivity(eventType);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0]!;
      expect(url).toBe('/api/auth/activity');
      expect(init?.credentials).toBe('same-origin');
      expect(init?.mode).toBe('same-origin');
      expect(init?.keepalive).toBe(eventType === 'login');
      expect(JSON.parse(String(init?.body))).toEqual({ eventType });
      expect(new Headers(init?.headers).has('Next-Action')).toBe(false);
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  it('fails softly for a connection error without retries', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Synthetic offline'));
    await expect(postSessionActivity('heartbeat')).resolves.toBeUndefined();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not retry an unavailable service', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 503 }));
    await postSessionActivity('login');
    await jest.advanceTimersByTimeAsync(60000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds a stalled request and clears its timer', async () => {
    global.fetch = jest.fn().mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        }),
    );
    const pending = postSessionActivity('heartbeat');
    await jest.advanceTimersByTimeAsync(10000);
    await expect(pending).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('cancels an in-flight heartbeat when its provider unmounts', async () => {
    const controller = new AbortController();
    global.fetch = jest.fn().mockImplementation(
      (_url, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          });
        }),
    );
    const pending = postSessionActivity('heartbeat', controller.signal);
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('does not start activity for an already unmounted provider', async () => {
    global.fetch = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await postSessionActivity('heartbeat', controller.signal);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

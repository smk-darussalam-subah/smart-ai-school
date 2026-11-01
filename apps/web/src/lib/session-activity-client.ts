'use client';

/** Background bookkeeping must not dispatch a Server Action/RSC navigation. */
export async function postSessionActivity(
  eventType: 'heartbeat' | 'login',
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10_000);
  try {
    await fetch('/api/auth/activity', {
      method: 'POST',
      credentials: 'same-origin',
      mode: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType }),
      signal: controller.signal,
      keepalive: eventType === 'login',
    });
  } catch {
    // Bookkeeping is fail-soft. No navigation, mutation replay or retry loop.
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

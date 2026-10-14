import { NextRequest } from 'next/server';
import { encode, getToken, type JWT } from 'next-auth/jwt';
import { resolveRequestSession, persistSessionCookies } from '../lib/request-session';
import { GET as refreshRoute } from '../app/api/auth/refresh/route';
import { POST as proxyPost } from '../app/api/backend/[...path]/route';

const secret = 'local-session-regression-synthetic-secret-only';
const origin = 'https://staging-fixture.invalid';
const originalFetch = global.fetch;
const originalSecret = process.env.NEXTAUTH_SECRET;
const originalUrl = process.env.NEXTAUTH_URL;
let sequence = 0;
beforeAll(() => {
  process.env.NEXTAUTH_SECRET = secret;
  process.env.NEXTAUTH_URL = origin;
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
  if (originalUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = originalUrl;
});

async function request(path = '/api/auth/refresh', overrides: Partial<JWT> = {}, method = 'GET') {
  sequence += 1;
  const token: JWT = {
    sub: `request-synthetic-${sequence}`,
    keycloakId: `request-synthetic-${sequence}`,
    accessToken: 'synthetic-expired-access',
    refreshToken: `request-synthetic-refresh-${sequence}`,
    roles: ['GURU'],
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    refreshedAt: Math.floor(Date.now() / 1000) - 3600,
    ...overrides,
  };
  const encrypted = await encode({ secret, token });
  return new NextRequest(origin + path, {
    method,
    headers: {
      cookie: `__Secure-next-auth.session-token=${encrypted}`,
      'content-type': 'application/json',
      'idempotency-key': 'synthetic-operation',
    },
    ...(method === 'POST' ? { body: '{"fixtureOnly":true}' } : {}),
  });
}
function success() {
  return new Response(
    JSON.stringify({
      access_token: 'synthetic-refreshed-access',
      refresh_token: 'synthetic-refreshed-refresh',
      expires_in: 3600,
    }),
    { status: 200 },
  );
}
function cookieJar(values: readonly string[]) {
  return values.map((value) => value.split(';')[0]).join('; ');
}
const backendContext = () => ({ params: Promise.resolve({ path: ['scheduling', 'drafts'] }) });

describe('installed NextAuth writable request-session boundary', () => {
  it('persists refreshed cookies even when the subsequent upstream connection fails, without replay', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(success())
      .mockRejectedValueOnce(new Error('Synthetic upstream outage'));
    const response = await proxyPost(
      await request('/api/backend/scheduling/drafts', {}, 'POST'),
      backendContext(),
    );
    expect(response.status).toBe(502);
    expect(global.fetch).toHaveBeenCalledTimes(2); // One refresh, one attempted submission.
    const cookies = (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    const decoded = await getToken({
      req: new NextRequest(origin + '/dashboard', { headers: { cookie: cookieJar(cookies) } }),
      secret,
    });
    expect(decoded?.accessToken).toBe('synthetic-refreshed-access');
    expect(decoded?.refreshToken).toBe('synthetic-refreshed-refresh');
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('binds recovery redirects to the configured external origin, not an internal port or spoofed Host', async () => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const encrypted = await encode({
      secret,
      token: {
        sub: 'synthetic-origin-test',
        accessToken: 'synthetic-access',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        refreshedAt: Math.floor(Date.now() / 1000),
      },
    });
    const input = new NextRequest('https://localhost:3000/api/auth/refresh', {
      headers: {
        cookie: `__Secure-next-auth.session-token=${encrypted}`,
        'x-forwarded-host': 'attacker.invalid',
      },
    });
    const response = await refreshRoute(input);
    expect(response.headers.get('location')).toBe(origin + '/dashboard');
  });
  it('persists updated credentials in an actual encrypted HttpOnly/Secure/Lax cookie', async () => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const input = await request();
    const { session, cookies } = await resolveRequestSession(input);
    expect(session?.accessToken).toBe('synthetic-refreshed-access');
    expect(session).not.toHaveProperty('refreshToken');
    expect(session).not.toHaveProperty('idToken');
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.join(';')).toMatch(/HttpOnly/);
    expect(cookies.join(';')).toMatch(/Secure/);
    expect(cookies.join(';')).toMatch(/SameSite=Lax/i);
    expect(cookies.join(';')).not.toMatch(/Domain=/i);
    const next = new NextRequest(origin + '/api/backend/schedules', {
      headers: { cookie: cookieJar(cookies) },
    });
    const decoded = await getToken({ req: next, secret });
    expect(decoded?.accessToken).toBe('synthetic-refreshed-access');
    expect(decoded?.refreshToken).toBe('synthetic-refreshed-refresh');
    expect(decoded?.refreshedAt).toBeGreaterThan(0);
    const subsequent = await resolveRequestSession(next);
    expect(subsequent.session?.accessToken).toBe('synthetic-refreshed-access');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('retains the refreshed result for a parallel request carrying the previous cookie', async () => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const input = await request();
    const first = await resolveRequestSession(input);
    const second = await resolveRequestSession(input);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first.session?.accessToken).toBe(second.session?.accessToken);
    expect(second.cookies.length).toBeGreaterThan(0);
  });
  it('uses the library chunk serializer and reconstructs a large encrypted session', async () => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const { cookies } = await resolveRequestSession(
      await request('/api/auth/refresh', { idToken: 'synthetic-padding-'.repeat(600) }),
    );
    expect(
      cookies.filter((value) => /^__Secure-next-auth.session-token\.\d+=/.test(value)).length,
    ).toBeGreaterThan(1);
    const response = persistSessionCookies(new Response('{}'), cookies);
    const outputCookies = (
      response.headers as Headers & { getSetCookie(): string[] }
    ).getSetCookie();
    expect(outputCookies).toEqual(cookies);
    const next = new NextRequest(origin + '/api/backend/schedules', {
      headers: { cookie: cookieJar(outputCookies) },
    });
    const decoded = await getToken({ req: next, secret });
    expect(decoded?.accessToken).toBe('synthetic-refreshed-access');
    expect(decoded?.idToken).toHaveLength('synthetic-padding-'.repeat(600).length);
  });
  it.each([
    'https://outside.invalid/',
    '//outside.invalid/',
    '/api/auth/refresh',
    '/login',
    '/dashboard/../api/auth/refresh',
    '/dashboard-evil',
    '/%5c%5coutside.invalid',
  ])('does not accept unsafe/cyclic callback %s', async (callback) => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const response = await refreshRoute(
      await request('/api/auth/refresh?callbackUrl=' + encodeURIComponent(callback)),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(origin + '/dashboard');
  });
  it('retains a valid local destination and query on successful recovery', async () => {
    global.fetch = jest.fn().mockImplementation(async () => success());
    const response = await refreshRoute(
      await request('/api/auth/refresh?callbackUrl=%2Fdashboard%2Fjadwal%3Fsemester%3D2'),
    );
    expect(response.headers.get('location')).toBe(origin + '/dashboard/jadwal?semester=2');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('set-cookie')).toBeTruthy();
  });
  it('sends rejected refreshes to recovery login rather than another dashboard hop', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    const response = await refreshRoute(await request());
    expect(response.headers.get('location')).toBe(
      origin + '/login?reason=session&callbackUrl=%2Fdashboard',
    );
  });
  it('shows a recoverable page on a provider outage, without treating it as revocation', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('synthetic-network-unavailable'));
    const response = await refreshRoute(await request());
    expect(response.headers.get('location')).toBe(
      origin + '/auth/session-unavailable?callbackUrl=%2Fdashboard',
    );
    expect(response.headers.get('set-cookie')).toBeTruthy();
  });
  it('refreshes before a draft mutation, preserves idempotency, and writes the cookie', async () => {
    const calls: Array<{ url: string; authorization: string | null; idempotency: string | null }> =
      [];
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        calls.push({
          url: String(url),
          authorization: headers.get('authorization'),
          idempotency: headers.get('idempotency-key'),
        });
        return String(url).endsWith('/protocol/openid-connect/token')
          ? success()
          : new Response('{"fixtureOnly":true}', { status: 201 });
      });
    const response = await proxyPost(
      await request('/api/backend/scheduling/drafts', {}, 'POST'),
      backendContext(),
    );
    expect(response.status).toBe(201);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      authorization: 'Bearer synthetic-refreshed-access',
      idempotency: 'synthetic-operation',
    });
    expect(response.headers.get('set-cookie')).toBeTruthy();
  });
  it('does not forward a rejected session or replay the mutation', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
    const response = await proxyPost(
      await request('/api/backend/scheduling/drafts', {}, 'POST'),
      backendContext(),
    );
    expect(response.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Refresh only; no draft submission.
  });
  it('keeps expired temporary failures retryable and does not forward stale credentials', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('synthetic-timeout'));
    const response = await proxyPost(
      await request('/api/backend/scheduling/drafts', {}, 'POST'),
      backendContext(),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([401, 403, 429, 500])('never replays a mutation after upstream %i', async (status) => {
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: RequestInfo | URL) =>
        String(url).endsWith('/protocol/openid-connect/token')
          ? success()
          : new Response('{"fixtureOnly":true}', { status }),
      );
    const response = await proxyPost(
      await request('/api/backend/scheduling/drafts', {}, 'POST'),
      backendContext(),
    );
    expect(response.status).toBe(status);
    expect(global.fetch).toHaveBeenCalledTimes(2); // One refresh + one backend request.
  });
});

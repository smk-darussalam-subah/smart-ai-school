import { encode, decode } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { authOptions } from '@/lib/auth';
import { encodeBoundedSession, MAX_SESSION_JWE_BYTES } from '@/lib/session-safety';
import { resolveSessionHeaders } from '@/lib/request-session';
import { matchesSignedOutSession } from '@/lib/session-cookie-state';
import { checkServerSession } from '@/lib/server-session-status';
import { GET as logout } from '@/app/api/auth/federated-logout/route';

const secret = 'teacher-workspace-fixture-only-encryption-secret';
const original = global.fetch;
const origin = 'https://fixture-school.invalid';
const env = { ...process.env };
beforeAll(() =>
  Object.assign(process.env, {
    NEXTAUTH_SECRET: secret,
    NEXTAUTH_URL: origin,
    KEYCLOAK_ISSUER: 'https://fixture-idp.invalid/realms/diis',
    KEYCLOAK_CLIENT_ID: 'fixture-web',
    KEYCLOAK_CLIENT_SECRET: 'fixture-only',
  }),
);
afterEach(() => {
  global.fetch = original;
  jest.restoreAllMocks();
});
afterAll(() => {
  process.env = env;
});
const fresh = () => ({
  sub: 'fixture-teacher',
  browserSessionId: 'browser-session-fixture',
  accessToken: 'synthetic-access',
  refreshToken: 'synthetic-refresh',
  roles: ['GURU'],
  refreshedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
});
async function input() {
  const jwt = await encode({ secret, token: fresh() });
  return new NextRequest(origin + '/api/auth/federated-logout', {
    headers: { cookie: `__Secure-next-auth.session-token=${jwt}`, 'sec-fetch-site': 'same-origin' },
  });
}
it('uses official encrypted cookies while removing redundant legacy ID tokens', async () => {
  const token = await encodeBoundedSession({
    secret,
    token: { ...fresh(), idToken: 'duplicate-'.repeat(2000) },
  });
  expect(Buffer.byteLength(token)).toBeLessThanOrEqual(MAX_SESSION_JWE_BYTES);
  const result = await decode({ secret, token });
  expect(result).not.toHaveProperty('idToken');
  expect(result?.refreshToken).toBe('synthetic-refresh');
});
it('rejects an unbounded JWT rather than growing the Cookie header', async () => {
  const encoded = await encodeBoundedSession({
    secret,
    token: { ...fresh(), accessToken: 'oversize'.repeat(2000) },
  });
  const result = await decode({ secret, token: encoded });
  expect(result?.error).toBe('SessionCookieTooLarge');
  expect(result).not.toHaveProperty('refreshToken');
  expect(Buffer.byteLength(encoded)).toBeLessThanOrEqual(MAX_SESSION_JWE_BYTES);
});
it('suppresses semantically identical read cookies but preserves real refresh and renewal', async () => {
  const value = await encode({ secret, token: fresh() });
  const options = {
    ...authOptions,
    secret,
    callbacks: { ...authOptions.callbacks, session: async () => ({ expires: 'future' }) },
  };
  const read = await resolveSessionHeaders(
    new Headers(),
    [{ name: '__Secure-next-auth.session-token', value }],
    options,
  );
  expect(read.cookies).toEqual([]);
  const changed = {
    ...options,
    callbacks: { ...options.callbacks, jwt: async () => ({ ...fresh(), accessToken: 'rotated' }) },
  };
  expect(
    (
      await resolveSessionHeaders(
        new Headers(),
        [{ name: '__Secure-next-auth.session-token', value }],
        changed,
      )
    ).cookies.length,
  ).toBeGreaterThan(0);
});
it('preserves the existing rolling renewal after ten minutes', async () => {
  const stamp = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(stamp - 11 * 60_000);
  const value = await encode({ secret, token: fresh() });
  jest.spyOn(Date, 'now').mockReturnValue(stamp);
  const options = {
    ...authOptions,
    secret,
    callbacks: { jwt: async () => fresh(), session: async () => ({ expires: 'future' }) },
  };
  const resolved = await resolveSessionHeaders(
    new Headers(),
    [{ name: '__Secure-next-auth.session-token', value }],
    options,
  );
  expect(resolved.cookies.length).toBeGreaterThan(0);
});
it('a signed-out marker stops the request boundary before any refresh or API read', async () => {
  const value = await encode({ secret, token: fresh() });
  global.fetch = jest.fn();
  const result = await resolveSessionHeaders(
    new Headers(),
    [
      { name: '__Secure-next-auth.session-token', value },
      { name: '__Host-diis.signed-out', value: fresh().browserSessionId },
    ],
    { ...authOptions, secret },
  );
  expect(result).toEqual({ session: null, cookies: [] });
  expect(global.fetch).not.toHaveBeenCalled();
});
it.each(['token', undefined])(
  'browser sessions require stable OIDC binding (%s)',
  async (binding) => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ active: true, binding })));
    expect(await checkServerSession('synthetic-access')).toBe('unsupported');
  },
);
it.each([401, 403, 500, 429])('session-status %i never certifies access', async (status) => {
  global.fetch = jest.fn(async () => new Response('{}', { status }));
  expect(await checkServerSession('synthetic-access')).toBe(
    status === 401 || status === 403 ? 'revoked' : 'unavailable',
  );
});
it('session-status requires a valid body and no cache', async () => {
  global.fetch = jest.fn(async () => new Response('{"active":true,"binding":"oidc"}'));
  expect(await checkServerSession('synthetic-access')).toBe('active');
  expect(global.fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ cache: 'no-store' }),
  );
  global.fetch = jest.fn(async () => new Response('{"active":false}'));
  expect(await checkServerSession('synthetic-access')).toBe('unavailable');
});
it('revokes API authority before provider logout and cookie deletion', async () => {
  const calls: string[] = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push(String(url));
    if (String(url).endsWith('/session-status'))
      return new Response('{"active":true,"binding":"oidc"}');
    if (String(url).endsWith('/auth/session/logout')) {
      expect(init?.method).toBe('POST');
      return new Response(null, { status: 204 });
    }
    expect(String(init?.body)).toContain('refresh_token=synthetic-refresh');
    return new Response(null, { status: 204 });
  });
  const response = await logout(await input());
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(origin + '/login?reason=logout');
  expect(calls[1]).toMatch(/auth\/session\/logout$/);
  expect(calls[2]).toMatch(/openid-connect\/logout$/);
  const cookies = response.headers.get('set-cookie') ?? '';
  expect(cookies).toContain('Max-Age=0');
  expect(cookies).toContain('__Host-diis.signed-out=browser-session-fixture');
  expect(cookies).toMatch(/HttpOnly/);
  expect(cookies).not.toContain('synthetic-refresh');
  expect(matchesSignedOutSession(fresh(), 'browser-session-fixture')).toBe(true);
  expect(
    matchesSignedOutSession(
      { ...fresh(), browserSessionId: 'a-new-signin' },
      'browser-session-fixture',
    ),
  ).toBe(false);
});
it('retains retryable logout when revocation cannot be confirmed', async () => {
  global.fetch = jest.fn(
    async (url) =>
      new Response(
        String(url).endsWith('session-status') ? '{"active":true,"binding":"oidc"}' : '{}',
        { status: String(url).endsWith('session-status') ? 200 : 503 },
      ),
  );
  const response = await logout(await input());
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).not.toContain('Max-Age=0');
  expect(await response.text()).toContain('Coba lagi');
});
it('does not mistake a stale provider refresh token for a completed logout', async () => {
  global.fetch = jest.fn(async (url) =>
    String(url).endsWith('session-status')
      ? new Response('{"active":true,"binding":"oidc"}')
      : String(url).endsWith('/auth/session/logout')
        ? new Response(null, { status: 204 })
        : new Response('{"error":"invalid_grant"}', { status: 400 }),
  );
  const response = await logout(await input());
  const target = new URL(response.headers.get('location')!);
  expect(target.origin).toBe('https://fixture-idp.invalid');
  expect(target.searchParams.get('client_id')).toBe('fixture-web');
  expect(target.searchParams.get('post_logout_redirect_uri')).toBe(origin + '/login?reason=logout');
  expect(target.searchParams.has('id_token_hint')).toBe(false);
});
it('rejects cross-site logout without contacting either service', async () => {
  global.fetch = jest.fn();
  const response = await logout(
    new NextRequest(origin + '/api/auth/federated-logout', {
      headers: { 'sec-fetch-site': 'cross-site' },
    }),
  );
  expect(response.status).toBe(403);
  expect(global.fetch).not.toHaveBeenCalled();
});
it.each(['https://evil.invalid/', '//evil.invalid/', '/dashboard?' + 'x'.repeat(1500)])(
  'bounds the official callback cookie for %s',
  async (url) => {
    const callback = authOptions.callbacks!.redirect!;
    expect(await callback({ url, baseUrl: origin })).toBe(origin + '/dashboard');
  },
);

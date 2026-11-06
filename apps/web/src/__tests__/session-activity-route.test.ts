import { NextRequest } from 'next/server';
import { encode, getToken, type JWT } from 'next-auth/jwt';
import { POST } from '../app/api/auth/activity/route';

const origin = 'https://session-fixture.invalid';
const secret = 'local-activity-regression-synthetic-secret-only';
const originalFetch = global.fetch;
const originalSecret = process.env.NEXTAUTH_SECRET;
const originalUrl = process.env.NEXTAUTH_URL;
let sequence = 0;
let mockActivityFetch: jest.Mock;

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = secret;
  process.env.NEXTAUTH_URL = origin;
});
beforeEach(() => {
  mockActivityFetch = jest.fn().mockImplementation(async () => new Response('{}', { status: 200 }));
  global.fetch = jest.fn().mockImplementation(async (url, init) => {
    if (String(url).endsWith('/auth/session-status'))
      return Response.json({ active: true, binding: 'oidc' });
    return mockActivityFetch(url, init);
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
  if (originalUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = originalUrl;
});

async function request(
  options: {
    body?: string;
    origin?: string | null;
    contentType?: string | null;
    token?: Partial<JWT> | null;
    headers?: Record<string, string>;
  } = {},
) {
  sequence++;
  const headers = new Headers({ 'content-type': 'application/json', origin, ...options.headers });
  if (options.origin === null) headers.delete('origin');
  else if (options.origin) headers.set('origin', options.origin);
  if (options.contentType === null) headers.delete('content-type');
  else if (options.contentType) headers.set('content-type', options.contentType);
  if (options.token !== null)
    headers.set(
      'cookie',
      '__Secure-next-auth.session-token=' +
        (await encode({
          secret,
          token: {
            sub: `activity-synthetic-${sequence}`,
            keycloakId: `activity-synthetic-${sequence}`,
            accessToken: 'synthetic-activity-access',
            roles: ['GURU'],
            expiresAt: Math.floor(Date.now() / 1000) + 3600,
            refreshedAt: Math.floor(Date.now() / 1000),
            ...options.token,
          },
        })),
    );
  return new NextRequest(origin + '/api/auth/activity', {
    method: 'POST',
    headers,
    body: options.body ?? '{"eventType":"heartbeat"}',
  });
}
function fetchCalls() {
  return (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls.filter(
    ([url]) => !String(url).endsWith('/auth/session-status'),
  );
}

describe('background session activity — real NextAuth writable HTTP boundary', () => {
  it('sends one authenticated heartbeat and returns JSON-independent 204 without a router redirect', async () => {
    const response = await POST(await request());
    expect(response.status).toBe(204);
    expect(response.headers.has('location')).toBe(false);
    expect(response.headers.has('x-action-redirect')).toBe(false);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(fetchCalls()).toHaveLength(1);
    const [url, init] = fetchCalls()[0]!;
    expect(String(url)).toMatch(/\/api\/v1\/auth\/heartbeat$/);
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Bearer synthetic-activity-access',
    );
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has('cookie')).toBe(false);
    expect(response.headers.has('set-cookie')).toBe(false);
  });
  it('records login metadata from request headers, never caller-provided identity', async () => {
    const response = await POST(
      await request({
        body: '{"eventType":"login"}',
        headers: {
          'x-forwarded-for': '203.0.113.9',
          'user-agent': 'Synthetic browser',
          'x-user-id': 'forged',
        },
      }),
    );
    expect(response.status).toBe(204);
    const [url, init] = fetchCalls()[0]!;
    expect(String(url)).toMatch(/\/auth\/login-events$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      eventType: 'login',
      ipAddress: '203.0.113.9',
      userAgent: 'Synthetic browser',
    });
    expect(new Headers(init?.headers).has('x-user-id')).toBe(false);
  });
  it.each(['SISWA', 'ORANG_TUA', 'KEPALA_SEKOLAH'])(
    'preserves background activity for authenticated %s',
    async (role) => {
      expect((await POST(await request({ token: { roles: [role] } }))).status).toBe(204);
      expect(fetchCalls()).toHaveLength(1);
    },
  );
  it.each([
    { body: '{"eventType":"login","userId":"forged"}' },
    { body: '{"eventType":"logout"}' },
    { body: '{"eventType":"failed"}' },
    { body: '{broken' },
  ])('rejects malformed or expanded input before calling upstream: %j', async (options) => {
    expect((await POST(await request(options))).status).toBe(400);
    expect(fetchCalls()).toHaveLength(0);
  });
  it('bounds actual request bytes even without a Content-Length header', async () => {
    expect((await POST(await request({ body: ' '.repeat(129) }))).status).toBe(413);
    expect(fetchCalls()).toHaveLength(0);
  });
  it.each([null, 'text/plain'])('requires JSON content type: %s', async (contentType) => {
    expect((await POST(await request({ contentType }))).status).toBe(415);
    expect(fetchCalls()).toHaveLength(0);
  });
  it.each([null, 'https://untrusted.invalid'])(
    'rejects absent or foreign Origin: %s',
    async (value) => {
      expect(
        (
          await POST(
            await request({ origin: value, headers: { 'x-forwarded-host': 'untrusted.invalid' } }),
          )
        ).status,
      ).toBe(403);
      expect(fetchCalls()).toHaveLength(0);
    },
  );
  it('does not accept an explicit bearer header in place of the web session', async () => {
    expect(
      (await POST(await request({ token: null, headers: { authorization: 'Bearer forged' } })))
        .status,
    ).toBe(401);
    expect(fetchCalls()).toHaveLength(0);
  });
  it('rejects an ended session without writing activity', async () => {
    expect((await POST(await request({ token: { error: 'AccountAccessError' } }))).status).toBe(
      401,
    );
    expect(fetchCalls()).toHaveLength(0);
  });
  it('keeps a temporary session outage separate from revocation', async () => {
    const response = await POST(
      await request({
        token: {
          accessToken: undefined,
          error: 'RefreshAccessTokenTemporaryError',
          refreshRetryAt: Math.floor(Date.now() / 1000) + 30,
        },
      }),
    );
    expect(response.status).toBe(503);
    expect(fetchCalls()).toHaveLength(0);
  });
  it.each([401, 403, 503])(
    'fails closed for upstream status %s without relaying its body or redirect',
    async (status) => {
      mockActivityFetch = jest.fn().mockResolvedValue(
        new Response('private upstream body', {
          status,
          headers: { Location: 'https://untrusted.invalid', 'Set-Cookie': 'upstream=forged' },
        }),
      );
      const response = await POST(await request());
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('private upstream body');
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.get('set-cookie') ?? '').not.toContain('upstream=forged');
      expect(fetchCalls()).toHaveLength(1);
    },
  );
  it('does not replay when upstream fails and does not renew an unchanged web cookie', async () => {
    mockActivityFetch = jest.fn().mockRejectedValue(new Error('Synthetic offline'));
    const response = await POST(await request());
    expect(response.status).toBe(503);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(fetchCalls()).toHaveLength(1);
  });
  it('rotates expired credentials before exactly one activity request and persists the result', async () => {
    mockActivityFetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'synthetic-rotated-access',
            refresh_token: 'synthetic-rotated-refresh',
            expires_in: 3600,
          }),
        ),
      )
      .mockResolvedValueOnce(new Response('{}'));
    const response = await POST(
      await request({
        token: {
          expiresAt: Math.floor(Date.now() / 1000) - 60,
          refreshToken: 'synthetic-refresh-' + sequence,
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(fetchCalls()).toHaveLength(2);
    expect(new Headers(fetchCalls()[1]![1]?.headers).get('authorization')).toBe(
      'Bearer synthetic-rotated-access',
    );
    const cookies = (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie();
    const decoded = await getToken({
      req: new NextRequest(origin + '/dashboard', {
        headers: { cookie: cookies.map((value) => value.split(';')[0]).join('; ') },
      }),
      secret,
    });
    expect(decoded?.accessToken).toBe('synthetic-rotated-access');
    expect(decoded?.refreshToken).toBe('synthetic-rotated-refresh');
    expect(response.headers.has('x-action-redirect')).toBe(false);
  });
});

it('checks server-bound revocation before writing background activity', async () => {
  global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 401 }));
  const response = await POST(await request());
  expect(response.status).toBe(401);
  expect(fetchCalls()).toHaveLength(0);
});

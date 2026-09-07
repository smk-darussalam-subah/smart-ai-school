import { NextRequest } from 'next/server';
import { encode, getToken } from 'next-auth/jwt';
import { authOptions } from '../lib/auth';
import { middleware } from '../middleware';

// Exercise the installed library, not a getToken mock. No live identity service.
const syntheticSecret = 'w10d-local-synthetic-session-signing-only';
const origin = 'http://localhost:3000';
const originalSecret = process.env.NEXTAUTH_SECRET;
const originalFetch = global.fetch;

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = syntheticSecret;
});
afterEach(() => {
  global.fetch = originalFetch;
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
});

function request(path: string, authorization?: string, cookie?: string) {
  const headers = new Headers();
  if (authorization !== undefined) headers.set('authorization', authorization);
  if (cookie !== undefined) headers.set('cookie', cookie);
  return new NextRequest(new URL(path, origin), { headers });
}

describe('W10-D real NextAuth security boundary', () => {
  it.each(['Bearer %', 'Bearer %E0%A4%A', 'Bearer %GG', 'Bearer abc', 'Basic abc'])(
    'treats invalid %s as no session and denies protected access',
    async (header) => {
      const req = request('/dashboard/keuangan', header);
      await expect(getToken({ req, secret: syntheticSecret })).resolves.toBeNull();
      const result = await middleware(req);
      expect(result.status).toBe(307);
      expect(result.headers.get('location')).toBe(
        `${origin}/login?callbackUrl=%2Fdashboard%2Fkeuangan`,
      );
      expect(result.headers.get('content-security-policy')).toBeTruthy();
      expect(result.headers.get('x-middleware-next')).toBeNull();
    },
  );

  it('denies missing, tampered and expired session cookies', async () => {
    const expired = await encode({
      token: { roles: ['SUPER_ADMIN'] },
      secret: syntheticSecret,
      maxAge: -60,
    });
    for (const cookie of [
      undefined,
      'next-auth.session-token=invalid',
      `next-auth.session-token=${expired}`,
    ]) {
      const result = await middleware(request('/dashboard', undefined, cookie));
      expect(result.headers.get('location')).toBe(`${origin}/login?callbackUrl=%2Fdashboard`);
    }
  });

  it.each(['SISWA', 'ORANG_TUA', 'GURU', 'SUPER_ADMIN', 'TATA_USAHA', 'INDUSTRI'])(
    'preserves valid encrypted %s session and existing landing',
    async (role) => {
      const encoded = await encode({
        token: { sub: 'synthetic-subject', roles: [role] },
        secret: syntheticSecret,
      });
      const req = request('/dashboard', 'Bearer %', `next-auth.session-token=${encoded}`);
      const token = await getToken({ req, secret: syntheticSecret });
      expect(token?.roles).toEqual([role]);
      const result = await middleware(req);
      if (role === 'SISWA' || role === 'ORANG_TUA') {
        expect(result.headers.get('location')).toBe(`${origin}/dashboard/akademik`);
      } else {
        expect(result.headers.get('location')).toBeNull();
        expect(result.headers.get('x-middleware-next')).toBe('1');
      }
    },
  );

  it.each(['/login', '/api/auth/callback/keycloak'])(
    'keeps public authentication path %s available',
    async (path) => {
      const result = await middleware(request(path, 'Bearer %'));
      expect(result.headers.get('location')).toBeNull();
      expect(result.headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('retains Keycloak-only, JWT session strategy and login redirect', async () => {
    expect(authOptions.providers.map((provider) => provider.id)).toEqual(['keycloak']);
    expect(authOptions.session).toEqual({ strategy: 'jwt', maxAge: 8 * 60 * 60 });
    const encoded = await encode({ token: { roles: ['GURU'] }, secret: syntheticSecret });
    const result = await middleware(
      request('/login', undefined, `next-auth.session-token=${encoded}`),
    );
    expect(result.headers.get('location')).toBe(`${origin}/dashboard`);
  });

  it('preserves callback identity/role filtering and never exposes refresh token in session', async () => {
    const jwtCallback = authOptions.callbacks!.jwt!;
    const sessionCallback = authOptions.callbacks!.session!;
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ consentVersion: 'synthetic-v1' }), { status: 200 }),
      );
    const token = await jwtCallback({
      token: {},
      user: { id: 'synthetic-subject' },
      account: {
        provider: 'keycloak',
        type: 'oauth',
        providerAccountId: 'synthetic-subject',
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        id_token: 'synthetic-id',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      profile: { sub: 'synthetic-subject', realm_access: { roles: ['GURU', 'unrecognized-role'] } },
    } as Parameters<typeof jwtCallback>[0]);
    expect(token.roles).toEqual(['GURU']);
    expect(token.keycloakId).toBe('synthetic-subject');
    expect(token.consentVersion).toBe('synthetic-v1');
    const session = await sessionCallback({
      session: { expires: new Date(Date.now() + 3600000).toISOString() },
      token,
    } as Parameters<typeof sessionCallback>[0]);
    expect(session).toMatchObject({ roles: ['GURU'], keycloakId: 'synthetic-subject' });
    expect(session).not.toHaveProperty('refreshToken');
    expect(session).not.toHaveProperty('idToken');
  });

  it('retains controlled refresh failure without inventing a new token', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('synthetic-unavailable'));
    const jwtCallback = authOptions.callbacks!.jwt!;
    const token = await jwtCallback({ token: { expiresAt: 0, roles: ['GURU'] } } as Parameters<
      typeof jwtCallback
    >[0]);
    expect(token.error).toBe('RefreshAccessTokenError');
    expect(token.accessToken).toBeUndefined();
  });
});

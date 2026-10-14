import { NextRequest } from 'next/server';
import { encode, type JWT } from 'next-auth/jwt';
import { middleware } from '../middleware';
import {
  hasUsableAccessToken,
  shouldRefreshSession,
  sessionRecoveryAction,
} from '../lib/auth-session-state';

const secret = 'local-middleware-session-synthetic-secret-only';
const originalSecret = process.env.NEXTAUTH_SECRET;
beforeAll(() => {
  process.env.NEXTAUTH_SECRET = secret;
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
});
function valid(overrides: Partial<JWT> = {}): JWT {
  return {
    sub: 'synthetic-middleware',
    accessToken: 'synthetic-access',
    refreshToken: 'synthetic-refresh',
    roles: ['GURU'],
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    refreshedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}
async function request(path: string, token: JWT) {
  return new NextRequest('http://localhost:3000' + path, {
    headers: { cookie: `next-auth.session-token=${await encode({ secret, token })}` },
  });
}
describe('middleware lifecycle with actual encrypted cookies', () => {
  it.each([{}, true, 7, false])(
    'fails closed for an unexpected non-string error marker %j',
    (error) => {
      expect(hasUsableAccessToken({ ...valid(), error })).toBe(false);
    },
  );
  it('probes a missing client session rather than assuming that a transient request revoked it', () => {
    expect(sessionRecoveryAction('unauthenticated', undefined, false)).toBe('REFRESH');
    expect(sessionRecoveryAction('authenticated', 'RefreshAccessTokenError', false)).toBe('LOGIN');
    expect(
      sessionRecoveryAction('authenticated', 'RefreshAccessTokenTemporaryError', true),
    ).toBeNull();
    expect(sessionRecoveryAction('authenticated', undefined, true)).toBe('REFRESH');
    expect(sessionRecoveryAction('loading', undefined, false)).toBeNull();
  });
  it.each(['/login?reason=session', '/auth?reason=session', '/login?error=AccessDenied'])(
    'keeps recovery %s visible despite valid cookies',
    async (path) => {
      const response = await middleware(await request(path, valid()));
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('x-middleware-next')).toBe('1');
    },
  );
  it.each(['RefreshAccessTokenError', 'AccountAccessError', 'unknown-failure'])(
    'does not admit terminal marker %s',
    async (error) => {
      const response = await middleware(
        await request('/dashboard/presensi-guru', valid({ error })),
      );
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/login?reason=session&callbackUrl=%2Fdashboard%2Fpresensi-guru',
      );
    },
  );
  it('refreshes expired cookies before protected rendering and preserves the query', async () => {
    const response = await middleware(
      await request('/dashboard/jadwal?semester=2', valid({ expiresAt: 0 })),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/api/auth/refresh?callbackUrl=%2Fdashboard%2Fjadwal%3Fsemester%3D2',
    );
  });
  it('does not require cookie deletion to reach login when refresh is impossible', async () => {
    const response = await middleware(
      await request('/dashboard', valid({ accessToken: undefined, refreshToken: undefined })),
    );
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login?reason=session&callbackUrl=%2Fdashboard',
    );
  });
  it('admits still-valid credentials during a temporary provider outage until a retry is due', async () => {
    const response = await middleware(
      await request(
        '/dashboard',
        valid({
          error: 'RefreshAccessTokenTemporaryError',
          refreshedAt: 0,
          refreshRetryAt: Math.floor(Date.now() / 1000) + 30,
        }),
      ),
    );
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
  it('allows the identity-free outage page without a dashboard bounce', async () => {
    const response = await middleware(await request('/auth/session-unavailable', valid()));
    expect(response.headers.get('location')).toBeNull();
  });
  it.each([NaN, Infinity, 0, -1, undefined])('fails closed for invalid expiry %s', (expiry) => {
    expect(hasUsableAccessToken(valid({ expiresAt: expiry }))).toBe(false);
  });
  it('schedules proactive refresh and respects the retry interval', () => {
    expect(shouldRefreshSession(valid())).toBe(false);
    expect(shouldRefreshSession(valid({ refreshedAt: 0 }))).toBe(true);
    expect(
      shouldRefreshSession(
        valid({ refreshedAt: 0, refreshRetryAt: Math.floor(Date.now() / 1000) + 30 }),
      ),
    ).toBe(false);
  });
});

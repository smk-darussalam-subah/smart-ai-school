import { authOptions } from '../lib/auth';
import type { JWT } from 'next-auth/jwt';

const jwtCallback = authOptions.callbacks!.jwt!;
const sessionCallback = authOptions.callbacks!.session!;
const previousFetch = global.fetch;
let sequence = 0;

function token(overrides: Partial<JWT> = {}): JWT {
  sequence += 1;
  return {
    sub: `synthetic-${sequence}`,
    keycloakId: `synthetic-${sequence}`,
    accessToken: 'synthetic-old-access',
    refreshToken: `synthetic-refresh-${sequence}`,
    expiresAt: Math.floor(Date.now() / 1000) - 60,
    roles: ['GURU'],
    ...overrides,
  };
}
async function refresh(value: JWT): Promise<JWT> {
  return await jwtCallback({ token: value } as Parameters<typeof jwtCallback>[0]);
}
afterEach(() => {
  global.fetch = previousFetch;
  jest.restoreAllMocks();
});

describe('session lifecycle — baseline regressions', () => {
  it('withholds rejected credentials from JWT/session rather than exposing stale access', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    const result = await refresh(token());
    const session = await sessionCallback({
      session: { expires: new Date(Date.now() + 3600000).toISOString() },
      token: result,
    } as Parameters<typeof sessionCallback>[0]);
    expect(result.error).toBe('RefreshAccessTokenError');
    expect(result.accessToken).toBeUndefined();
    expect(session).toHaveProperty('accessToken', undefined);
    expect(session).not.toHaveProperty('refreshToken');
  });
  it('coalesces simultaneous refreshes of the same encrypted-session identity', async () => {
    global.fetch = jest.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'synthetic-new-access',
            refresh_token: 'synthetic-new-refresh',
            expires_in: 3600,
          }),
          { status: 200 },
        ),
    );
    const value = token();
    const [first, second] = await Promise.all([refresh({ ...value }), refresh({ ...value })]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(first.accessToken).toBe('synthetic-new-access');
    expect(second.accessToken).toBe(first.accessToken);
  });
  it('refreshes active eight-hour tokens before the 30-minute SSO idle boundary', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'synthetic-new-access', expires_in: 28800 }), {
        status: 200,
      }),
    );
    const value = token({ expiresAt: Math.floor(Date.now() / 1000) + 28000 });
    // Existing legacy cookies have no refreshedAt; fresh sign-in writes it.
    const result = await refresh(value);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('synthetic-new-access');
  });
});

describe('session lifecycle — negative controls', () => {
  it('reads the actual API prefix on fresh sign-in and clears prior recovery markers', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('{"consentVersion":"v1.0"}', { status: 200 }));
    const result = await jwtCallback({
      token: { error: 'RefreshAccessTokenError', refreshRetryAt: 1 },
      user: { id: 'synthetic-profile' },
      account: {
        provider: 'keycloak',
        type: 'oauth',
        providerAccountId: 'synthetic-profile',
        access_token: 'synthetic-profile-access',
        refresh_token: 'synthetic-profile-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      profile: { sub: 'synthetic-profile', realm_access: { roles: ['GURU', 'unrecognized-role'] } },
    } as Parameters<typeof jwtCallback>[0]);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toMatch(/\/api\/v1\/auth\/me$/);
    expect(result.roles).toEqual(['GURU']);
    expect(result.error).toBeUndefined();
    expect(result.refreshRetryAt).toBeUndefined();
    expect(result.consentVersion).toBe('v1.0');
  });
  it.each([401, 403])(
    'does not establish a usable DIIS session after identity lookup %i',
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status }));
      const result = await jwtCallback({
        token: {},
        user: { id: 'synthetic-rejected-profile' },
        account: {
          provider: 'keycloak',
          type: 'oauth',
          providerAccountId: 'synthetic-rejected-profile',
          access_token: 'synthetic-profile-access',
          refresh_token: 'synthetic-profile-refresh',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        profile: { sub: 'synthetic-rejected-profile' },
      } as Parameters<typeof jwtCallback>[0]);
      expect(result.error).toBe('AccountAccessError');
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
    },
  );
  it('never accepts forged identity/permission fields from a client session update', async () => {
    const value = token({
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      refreshedAt: Math.floor(Date.now() / 1000),
    });
    global.fetch = jest.fn();
    const result = await jwtCallback({
      token: value,
      trigger: 'update',
      session: {
        roles: ['SUPER_ADMIN'],
        keycloakId: 'forged-subject',
        accessToken: 'forged-access',
      },
    } as Parameters<typeof jwtCallback>[0]);
    expect(result.roles).toEqual(['GURU']);
    expect(result.keycloakId).toBe(value.keycloakId);
    expect(result.accessToken).toBe(value.accessToken);
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it.each([
    {},
    { access_token: 'synthetic', expires_in: 0 },
    { access_token: 'synthetic', expires_in: 30 },
    { access_token: '', expires_in: 3600 },
    { access_token: 'synthetic', expires_in: '3600' },
    { access_token: 'synthetic', expires_in: 3600, refresh_token: '' },
  ])('does not trust malformed success payload %j', async (body) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    const result = await refresh(token());
    expect(result.error).toBe('RefreshAccessTokenTemporaryError');
    expect(result.accessToken).toBeUndefined();
  });
  it.each([429, 500, 502, 503])(
    'treats provider %i as retryable, not a revoked account',
    async (status) => {
      global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status }));
      const result = await refresh(token());
      expect(result.error).toBe('RefreshAccessTokenTemporaryError');
      expect(result.refreshToken).toBeTruthy();
      expect(result.accessToken).toBeUndefined();
    },
  );
  it('keeps unexpired access usable during a temporary failure but never extends its expiry', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('synthetic-outage'));
    const value = token({ expiresAt: Math.floor(Date.now() / 1000) + 3600 });
    const result = await refresh(value);
    expect(result.error).toBe('RefreshAccessTokenTemporaryError');
    expect(result.accessToken).toBe(value.accessToken);
    expect(result.expiresAt).toBe(value.expiresAt);
    const again = await refresh(result);
    expect(again.error).toBe(result.error);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  it('retries a temporary expired session after the cooldown and clears its error', async () => {
    const now = Date.now();
    const mock = jest
      .fn()
      .mockRejectedValueOnce(new Error('synthetic-outage'))
      .mockImplementationOnce(
        async () =>
          new Response('{"access_token":"synthetic-recovered","expires_in":3600}', { status: 200 }),
      );
    global.fetch = mock;
    const failed = await refresh(token());
    jest.spyOn(Date, 'now').mockReturnValue(now + 31_000);
    const recovered = await refresh(failed);
    expect(recovered.accessToken).toBe('synthetic-recovered');
    expect(recovered.error).toBeUndefined();
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it('does not retry a revoked session or expose its expired access', async () => {
    global.fetch = jest.fn();
    const result = await refresh(token({ error: 'RefreshAccessTokenError' }));
    expect(result.accessToken).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
  it('isolates distinct identities during simultaneous refresh', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(
        async () =>
          new Response('{"access_token":"synthetic-new","expires_in":3600}', { status: 200 }),
      );
    await Promise.all([refresh(token()), refresh(token())]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

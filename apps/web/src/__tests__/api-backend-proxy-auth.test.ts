import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { POST } from '../app/api/backend/[...path]/route';

const syntheticSecret = 'pwa-proxy-local-synthetic-session-signing-only';
const originalSecret = process.env.NEXTAUTH_SECRET;
const originalNextAuthUrl = process.env.NEXTAUTH_URL;
const originalFetch = global.fetch;

function proxyContext() {
  return {
    params: Promise.resolve({
      path: ['assessment', 'sessions', 'synthetic-session', 'runtime-signal'],
    }),
  };
}

async function requestWithToken(
  token?: Record<string, unknown>,
  authorization?: string,
  extraHeaders?: HeadersInit,
): Promise<NextRequest> {
  const headers = new Headers(extraHeaders);
  headers.set('content-type', 'application/json');
  if (token) {
    const encoded = await encode({ token, secret: syntheticSecret });
    headers.set('cookie', `__Secure-next-auth.session-token=${encoded}`);
  }
  if (authorization) headers.set('authorization', authorization);

  return new NextRequest(
    'https://staging.smkdarussalamsubah.sch.id/api/backend/assessment/sessions/synthetic-session/runtime-signal',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ type: 'offline' }),
    },
  );
}

function forwardedHeaders(): Headers {
  const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
  const init = fetchMock.mock.calls[0]?.[1];
  return new Headers(init?.headers);
}

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = syntheticSecret;
  process.env.NEXTAUTH_URL = 'https://staging.smkdarussalamsubah.sch.id';
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
});

afterAll(() => {
  global.fetch = originalFetch;
  if (originalSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = originalSecret;
  if (originalNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = originalNextAuthUrl;
});

describe('API backend proxy authorization', () => {
  it('does not retain a rewrite that bypasses the authenticated route handler', () => {
    const nextConfig = fs.readFileSync(path.resolve(__dirname, '../../next.config.js'), 'utf8');
    expect(nextConfig).not.toMatch(/source:\s*['"]\/api\/backend\/?:path\*/);
  });

  it('derives bearer authorization from the encrypted request-bound session cookie', async () => {
    const request = await requestWithToken({
      sub: 'synthetic-student',
      accessToken: 'synthetic-access-token',
      roles: ['SISWA'],
    });

    const response = await POST(request, proxyContext());

    expect(response.status).toBe(200);
    expect(forwardedHeaders().get('authorization')).toBe('Bearer synthetic-access-token');
    expect(forwardedHeaders().has('cookie')).toBe(false);
  });

  it('does not invent authorization when the cookie is missing or lacks an access token', async () => {
    for (const request of [
      await requestWithToken(),
      await requestWithToken({ sub: 'synthetic-student', roles: ['SISWA'] }),
    ]) {
      (global.fetch as jest.MockedFunction<typeof fetch>).mockClear();
      const response = await POST(request, proxyContext());

      expect(response.status).toBe(200);
      expect(forwardedHeaders().has('authorization')).toBe(false);
    }
  });

  it('fails closed when the encrypted session cookie is malformed', async () => {
    const request = new NextRequest(
      'https://staging.smkdarussalamsubah.sch.id/api/backend/assessment/sessions/synthetic-session/runtime-signal',
      {
        method: 'POST',
        headers: {
          cookie: '__Secure-next-auth.session-token=not-a-valid-session',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'offline' }),
      },
    );

    const response = await POST(request, proxyContext());

    expect(response.status).toBe(200);
    expect(forwardedHeaders().has('authorization')).toBe(false);
    expect(forwardedHeaders().has('cookie')).toBe(false);
  });

  it('preserves an explicit bearer header instead of replacing it from the cookie', async () => {
    const request = await requestWithToken(
      { accessToken: 'cookie-access-token' },
      'Bearer explicit-access-token',
    );

    const response = await POST(request, proxyContext());

    expect(response.status).toBe(200);
    expect(forwardedHeaders().get('authorization')).toBe('Bearer explicit-access-token');
    expect(forwardedHeaders().has('cookie')).toBe(false);
  });

  it('drops caller-supplied proxy identity and arbitrary custom headers', async () => {
    const request = await requestWithToken({ accessToken: 'synthetic-access-token' }, undefined, {
      forwarded: 'for=203.0.113.20;proto=https',
      'x-forwarded-for': '203.0.113.21, 10.0.0.1',
      'x-forwarded-host': 'spoofed.example',
      'x-forwarded-proto': 'http',
      'x-real-ip': '203.0.113.22',
      'cf-connecting-ip': '203.0.113.23',
      'true-client-ip': '203.0.113.24',
      'x-client-ip': '203.0.113.25',
      'x-arbitrary-client-value': 'must-not-cross-boundary',
    });

    const response = await POST(request, proxyContext());
    const headers = forwardedHeaders();

    expect(response.status).toBe(200);
    expect(headers.get('authorization')).toBe('Bearer synthetic-access-token');
    for (const header of [
      'forwarded',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-proto',
      'x-real-ip',
      'cf-connecting-ip',
      'true-client-ip',
      'x-client-ip',
      'x-arbitrary-client-value',
    ]) {
      expect(headers.has(header)).toBe(false);
    }
  });

  it('forwards only the application request headers in the explicit allowlist', async () => {
    const request = await requestWithToken(undefined, 'Bearer explicit-access-token', {
      accept: 'application/json',
      'accept-language': 'id-ID',
      'if-none-match': '"synthetic-etag"',
      range: 'bytes=0-99',
      cookie: 'caller-cookie=must-not-cross-boundary',
      'set-cookie': 'caller-cookie=must-not-cross-boundary',
      'user-agent': 'caller-controlled-agent',
    });

    const response = await POST(request, proxyContext());
    const headers = forwardedHeaders();
    const forwarded: Record<string, string> = {};
    headers.forEach((value, key) => {
      forwarded[key] = value;
    });

    expect(response.status).toBe(200);
    expect(forwarded).toEqual({
      accept: 'application/json',
      'accept-language': 'id-ID',
      authorization: 'Bearer explicit-access-token',
      'content-type': 'application/json',
      'if-none-match': '"synthetic-etag"',
      range: 'bytes=0-99',
    });
  });
});

// =============================================================================
// Middleware CSP nonce tests (N21)
//
// Verifikasi bahwa Content-Security-Policy di-set di requestHeaders
// yang dikirim ke NextResponse.next(), sehingga Next.js 15 dapat
// membaca nonce dan menyetempelnya ke <script> tags saat rendering.
// =============================================================================

// Capture requestHeaders yang dikirim ke NextResponse.next()
let capturedReqHeaders: Headers | undefined;

jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn((opts?: { request?: { headers?: Headers } }) => {
      capturedReqHeaders = opts?.request?.headers;
      const h = new Map<string, string>();
      return {
        headers: {
          set: (k: string, v: string) => h.set(k, v),
          get: (k: string) => h.get(k) ?? null,
        },
      };
    }),
    redirect: jest.fn((_url: unknown) => ({
      headers: { set: jest.fn(), get: jest.fn() },
    })),
  },
}));

jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

import { middleware } from '../middleware';

function makeRequest(pathname: string) {
  return {
    nextUrl: { pathname },
    headers: new Headers(),
    url: `http://localhost:3000${pathname}`,
  } as unknown as import('next/server').NextRequest;
}

describe('middleware — CSP nonce in requestHeaders (N21)', () => {
  beforeEach(() => {
    capturedReqHeaders = undefined;
  });

  it('sets Content-Security-Policy in requestHeaders for /login', async () => {
    await middleware(makeRequest('/login'));

    expect(capturedReqHeaders).toBeDefined();
    const csp = capturedReqHeaders!.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/]+=*/);
  });

  it('sets x-nonce in requestHeaders', async () => {
    await middleware(makeRequest('/login'));

    expect(capturedReqHeaders!.get('x-nonce')).toBeTruthy();
  });

  it('nonce in x-nonce matches nonce in CSP', async () => {
    await middleware(makeRequest('/login'));

    const nonce = capturedReqHeaders!.get('x-nonce')!;
    const csp   = capturedReqHeaders!.get('Content-Security-Policy')!;
    expect(csp).toContain(`nonce-${nonce}`);
  });

  it('CSP contains strict-dynamic for protected dynamic routes', async () => {
    await middleware(makeRequest('/login'));

    const csp = capturedReqHeaders!.get('Content-Security-Policy')!;
    // Non-dev, non-static → strict-dynamic
    expect(csp).toContain('strict-dynamic');
  });

  it('CSP does NOT contain unsafe-eval outside development', async () => {
    await middleware(makeRequest('/login'));

    const csp = capturedReqHeaders!.get('Content-Security-Policy')!;
    expect(csp).not.toContain('unsafe-eval');
  });
});

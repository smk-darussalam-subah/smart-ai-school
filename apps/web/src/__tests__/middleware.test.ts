// =============================================================================
// Middleware CSP tests (N21 + N21a)
//
// N21:  CSP di-set di requestHeaders — Next.js 15 stempel nonce ke <script>.
// N21a: Route statis interaktif ('use client') dapat 'unsafe-inline', bukan
//       nonce + strict-dynamic (karena HTML di-bake saat build, nonce tidak
//       bisa di-inject per-request ke inline bootstrap scripts).
// =============================================================================

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

// ── N21: CSP ada di requestHeaders untuk route dinamis ────────────────────────
// Gunakan /api/auth/callback — public path, dynamic CSP (nonce + strict-dynamic),
// tidak masuk STATIC_INTERACTIVE, token=null → NextResponse.next().

describe('middleware — CSP nonce in requestHeaders (N21)', () => {
  beforeEach(() => { capturedReqHeaders = undefined; });

  it('sets Content-Security-Policy in requestHeaders', async () => {
    await middleware(makeRequest('/api/auth/callback'));

    expect(capturedReqHeaders).toBeDefined();
    const csp = capturedReqHeaders!.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/nonce-[A-Za-z0-9+/]+=*/);
  });

  it('sets x-nonce in requestHeaders', async () => {
    await middleware(makeRequest('/api/auth/callback'));

    expect(capturedReqHeaders!.get('x-nonce')).toBeTruthy();
  });

  it('nonce in x-nonce matches nonce in CSP', async () => {
    await middleware(makeRequest('/api/auth/callback'));

    const nonce = capturedReqHeaders!.get('x-nonce')!;
    const csp   = capturedReqHeaders!.get('Content-Security-Policy')!;
    expect(csp).toContain(`nonce-${nonce}`);
  });

  it('dynamic path CSP contains strict-dynamic', async () => {
    await middleware(makeRequest('/api/auth/callback'));

    expect(capturedReqHeaders!.get('Content-Security-Policy')).toContain('strict-dynamic');
  });

  it('CSP does not contain unsafe-eval outside development', async () => {
    await middleware(makeRequest('/api/auth/callback'));

    expect(capturedReqHeaders!.get('Content-Security-Policy')).not.toContain('unsafe-eval');
  });
});

// ── N21a: Route statis interaktif → unsafe-inline, bukan nonce ───────────────

describe('middleware — static interactive pages get unsafe-inline (N21a)', () => {
  beforeEach(() => { capturedReqHeaders = undefined; });

  function scriptSrc(csp: string): string {
    return csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
  }

  it.each(['/login', '/health', '/', '/jurusan/tkro'])(
    '%s (static) script-src gets unsafe-inline, no nonce, no strict-dynamic',
    async (path) => {
      await middleware(makeRequest(path));

      const src = scriptSrc(capturedReqHeaders!.get('Content-Security-Policy')!);
      expect(src).toContain("'unsafe-inline'");
      expect(src).not.toContain('strict-dynamic');
      expect(src).not.toMatch(/nonce-[A-Za-z0-9+/]+=*/);
    }
  );

  it('isPublicStaticPage("/login") === true (N21a core assertion)', async () => {
    await middleware(makeRequest('/login'));

    const csp = capturedReqHeaders!.get('Content-Security-Policy')!;
    expect(csp).toContain("'unsafe-inline'");
  });

  it('isPublicStaticPage("/health") === true (N21a)', async () => {
    await middleware(makeRequest('/health'));

    const csp = capturedReqHeaders!.get('Content-Security-Policy')!;
    expect(csp).toContain("'unsafe-inline'");
  });
});

// ── Sanity: dynamic protected paths tetap strict-dynamic ─────────────────────

describe('middleware — protected dynamic paths keep nonce (N21 non-regression)', () => {
  beforeEach(() => { capturedReqHeaders = undefined; });

  function scriptSrc(csp: string): string {
    return csp.split(';').find(d => d.trim().startsWith('script-src')) ?? '';
  }

  // /api/auth/* adalah public path → tidak redirect ke /login → next() terpanggil
  it('/api/auth/signin script-src gets nonce + strict-dynamic, not unsafe-inline', async () => {
    await middleware(makeRequest('/api/auth/signin'));

    const src = scriptSrc(capturedReqHeaders!.get('Content-Security-Policy')!);
    expect(src).toContain('strict-dynamic');
    expect(src).toMatch(/nonce-[A-Za-z0-9+/]+=*/);
    expect(src).not.toContain("'unsafe-inline'");
  });
});

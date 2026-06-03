// =============================================================================
// Next.js Middleware — Auth guard + CSP nonce generation
// Refactored: withAuth → manual getToken agar nonce bisa diinjeksi ke request.
// FIX-T05 (SMA-26): Hapus unsafe-eval, implementasi nonce-based CSP.
// HOTFIX: Pisahkan CSP public (SSG) vs protected (SSR) — strict-dynamic
//         mem-blokir semua JS di halaman force-static yang tidak bisa embed nonce.
//
// Arsitektur:
//   1. Setiap request mendapat nonce 16-byte acak (Web Crypto API, Edge-safe)
//   2. CSP header disertakan di response — browser enforce nonce untuk scripts
//   3. Nonce diinjeksi ke request headers (x-nonce) → dibaca oleh Server Components
//   4. Auth check via getToken (next-auth/jwt) → redirect jika tidak auth
// =============================================================================

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// NONCE GENERATION — Edge Runtime safe (Web Crypto API, tanpa Node.js crypto)
// =============================================================================

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

// =============================================================================
// CSP BUILDER
// =============================================================================

/**
 * Membangun nilai header Content-Security-Policy.
 *
 * Development:
 *   - script-src: nonce + unsafe-eval untuk Next.js HMR & source maps.
 *
 * Production — Public/Static (landing page, jurusan):
 *   - script-src: 'self' + 'unsafe-inline'
 *   - Alasan: halaman ini force-static (SSG) — HTML di-render saat `next build`,
 *     bukan per-request. Nonce tidak bisa di-embed di HTML statis karena nonce
 *     berubah tiap request. 'strict-dynamic' mem-blokir semua /_next/static/ chunks
 *     yang tidak ber-nonce → JS gagal load → no hydration (no blur, no click).
 *     'unsafe-inline' diperlukan untuk Next.js App Router inline flight-data scripts.
 *     Risiko XSS tetap rendah: 'self' mencegah script dari domain eksternal.
 *
 * Production — Protected (dashboard, API):
 *   - script-src: nonce + strict-dynamic (ketat, hanya script ber-nonce).
 */
function buildCsp(nonce: string, isPublicStatic: boolean): string {
  const isDev = process.env.NODE_ENV === 'development';

  let scriptSrc: string;
  if (isDev) {
    // Dev: unsafe-eval untuk HMR + source maps
    scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  } else if (isPublicStatic) {
    // SSG public pages: 'self' blocks external scripts, 'unsafe-inline' allows
    // Next.js App Router inline flight data required for client hydration.
    scriptSrc = `'self' 'unsafe-inline'`;
  } else {
    // Protected routes: strict nonce-based, no inline execution
    scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  }

  const connectSrc = isDev
    ? "'self' ws://localhost:* http://localhost:*"
    : "'self' https://api.smkdarussalamsubah.sch.id https://auth.smkdarussalamsubah.sch.id";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src https://www.youtube-nocookie.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

// =============================================================================
// PUBLIC PATHS — tidak memerlukan autentikasi
// =============================================================================

// Exact match: landing page dan halaman detail jurusan (semua force-static SSG)
const PUBLIC_STATIC_EXACT: readonly string[] = ['/', '/jurusan/tkro', '/jurusan/tjkt', '/jurusan/akl'];

// Prefix match: route publik lainnya (login, auth callback, health, assets)
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/api/auth',
  '/health',
  '/_next',
  '/favicon',
  '/jurusan/',
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_STATIC_EXACT.includes(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** True untuk halaman publik yang di-render sebagai SSG (force-static). */
function isPublicStaticPage(pathname: string): boolean {
  if (pathname === '/') return true;
  if (pathname.startsWith('/jurusan/')) return true;
  return false;
}

// =============================================================================
// MIDDLEWARE UTAMA
// =============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  // Pisahkan CSP public-static vs protected
  const csp = buildCsp(nonce, isPublicStaticPage(pathname));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // a. User sudah login tapi akses /login → redirect ke dashboard
  if (pathname === '/login' && token) {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // b. User belum login + akses protected route → redirect ke /login
  if (!isPublicPath(pathname) && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

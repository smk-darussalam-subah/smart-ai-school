// =============================================================================
// Next.js Middleware — Auth guard + CSP nonce generation
// FIX-T05 (SMA-26): Hapus unsafe-eval, implementasi nonce-based CSP.
// HOTFIX: Pisahkan CSP public (SSG) vs protected (SSR) — strict-dynamic
//         mem-blokir semua JS di halaman force-static yang tidak bisa embed nonce.
// =============================================================================

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

/**
 * Membangun CSP header.
 *
 * Dev: nonce + unsafe-eval untuk HMR.
 *
 * Production public/SSG (/, /jurusan/*):
 *   'self' + 'unsafe-inline' — halaman force-static tidak bisa embed nonce
 *   per-request di HTML build-time. strict-dynamic akan memblokir semua
 *   /_next/static/ chunks → JS gagal → no blur, no click, no scroll-reveal.
 *
 * Production protected (/dashboard, dll):
 *   nonce + strict-dynamic — ketat, hanya script ber-nonce.
 */
function buildCsp(nonce: string, isPublicStatic: boolean): string {
  const isDev = process.env.NODE_ENV === 'development';

  let scriptSrc: string;
  if (isDev) {
    scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;
  } else if (isPublicStatic) {
    scriptSrc = `'self' 'unsafe-inline'`;
  } else {
    scriptSrc = `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  }

  const connectSrc = isDev
    ? "'self' ws://localhost:* http://localhost:*"
    : "'self' https://api.smkdarussalamsubah.sch.id https://auth.smkdarussalamsubah.sch.id";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'none'",
    "object-src 'none'",
    `frame-src https://www.youtube-nocookie.com${process.env.METABASE_SITE_URL ? ` ${process.env.METABASE_SITE_URL}` : ''}`,
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

const PUBLIC_EXACT: readonly string[] = [
  '/',
  '/jurusan/tkro',
  '/jurusan/tjkt',
  '/jurusan/akl',
];

const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/health',
  '/_next',
  '/favicon',
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  if (pathname.startsWith('/jurusan/')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

function isPublicStaticPage(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/jurusan/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const csp = buildCsp(nonce, isPublicStaticPage(pathname));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js 15 reads CSP from request headers to stamp nonce onto <script> tags.
  requestHeaders.set('Content-Security-Policy', csp);

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (pathname === '/login' && token) {
    const res = NextResponse.redirect(new URL('/dashboard', request.url));
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  if (!isPublicPath(pathname) && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const res = NextResponse.redirect(loginUrl);
    res.headers.set('Content-Security-Policy', csp);
    return res;
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

// Exclude static assets dan gambar landing/ dari middleware
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|landing/).*)'],
};

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

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
  '/spmb',
  '/privacy',
  '/jurusan/tkro',
  '/jurusan/tjkt',
  '/jurusan/akl',
];

const PUBLIC_PREFIXES = [
  '/login',
  '/auth',
  '/api/auth',
  '/api/backend',
  '/health',
  '/ruang-guru',
  '/_next',
  '/favicon',
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  if (pathname.startsWith('/jurusan/')) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

const STATIC_INTERACTIVE: readonly string[] = [
  '/',
  '/spmb',
  '/login',
  '/auth',
  '/health',
];

function isPublicStaticPage(pathname: string): boolean {
  if (STATIC_INTERACTIVE.includes(pathname)) return true;
  return pathname.startsWith('/jurusan/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const nonce = generateNonce();
  const csp = buildCsp(nonce, isPublicStaticPage(pathname));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if ((pathname === '/login' || pathname === '/auth') && token) {
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|landing/).*)'],
};

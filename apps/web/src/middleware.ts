// =============================================================================
// Next.js Middleware — Auth guard + CSP nonce generation
// Refactored: withAuth → manual getToken agar nonce bisa diinjeksi ke request.
// FIX-T05 (SMA-26): Hapus unsafe-eval, implementasi nonce-based CSP.
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

/**
 * Generates a cryptographically random 16-byte nonce, base64-encoded.
 * Menggunakan Web Crypto API yang tersedia di Edge Runtime maupun Node.js.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa + String.fromCharCode: aman di Edge Runtime (tidak pakai Buffer)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
}

// =============================================================================
// CSP BUILDER
// =============================================================================

/**
 * Membangun nilai header Content-Security-Policy dengan nonce.
 *
 * Production (NODE_ENV !== 'development'):
 *   - script-src: hanya nonce + strict-dynamic, NO unsafe-inline, NO unsafe-eval
 *   - connect-src: hanya API dan Keycloak endpoint production
 *   - upgrade-insecure-requests: paksa HTTPS
 *
 * Development:
 *   - script-src: tambah unsafe-eval untuk Next.js HMR & source maps
 *   - connect-src: izinkan localhost + WebSocket HMR
 *
 * @param nonce - base64 nonce untuk request ini
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';

  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  // connect-src: API + Keycloak (untuk token refresh)
  const connectSrc = isDev
    ? "'self' ws://localhost:* http://localhost:*"
    : "'self' https://api.smkdarussalamsubah.sch.id https://auth.smkdarussalamsubah.sch.id";

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // style-src: unsafe-inline dipertahankan — Tailwind utility classes dan
    // next/font menggunakan inline styles yang tidak bisa dinonce-based
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'none'",
    "object-src 'none'",
    // youtube-nocookie = privacy-enhanced embed (tidak set cookie tracking)
    "frame-src https://www.youtube-nocookie.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // upgrade-insecure-requests hanya di production (Cloudflare Full Strict SSL)
    ...(isDev ? [] : ['upgrade-insecure-requests']),
  ];

  return directives.join('; ');
}

// =============================================================================
// PUBLIC PATHS — tidak memerlukan autentikasi
// =============================================================================

// Exact match: hanya path ini persis yang public
const PUBLIC_EXACT: readonly string[] = [
  '/',
  '/jurusan/tkro',
  '/jurusan/tjkt',
  '/jurusan/akl',
];

// Prefix match: semua path yang diawali prefix ini public
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/api/auth',  // next-auth callback routes
  '/health',
  '/_next',
  '/favicon',
] as const;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.includes(pathname)) return true;
  // Public: semua sub-route /jurusan/ (halaman detail jurusan)
  if (pathname.startsWith('/jurusan/')) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// =============================================================================
// MIDDLEWARE UTAMA
// =============================================================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Generate nonce untuk request ini ──────────────────────────────────
  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // ── 2. Injeksi nonce ke request headers ──────────────────────────────────
  //    Server Components baca via: import { headers } from 'next/headers'
  //    → const nonce = (await headers()).get('x-nonce') ?? ''
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  // ── 3. Verifikasi session token (JWT dari cookie next-auth) ───────────────
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // ── 4. Auth logic ──────────────────────────────────────────────────────────

  // a. User sudah login tapi akses /login → redirect ke dashboard
  if (pathname === '/login' && token) {
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // b. User belum login + akses protected route → redirect ke /login
  if (!isPublicPath(pathname) && !token) {
    const loginUrl = new URL('/login', request.url);
    // Simpan path asal untuk redirect setelah login berhasil
    // Gunakan pathname saja (bukan full URL) untuk mencegah open redirect
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('Content-Security-Policy', csp);
    return response;
  }

  // ── 5. Pass-through: injeksi nonce ke request + CSP ke response ───────────
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

// Terapkan ke semua route kecuali static assets, gambar, dan public/landing/
// Note: dengan images.unoptimized:true gambar di-serve langsung via /landing/*.jpg
// (bukan /_next/image), sehingga path ini harus diexclude dari auth middleware.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|landing/).*)'],
};

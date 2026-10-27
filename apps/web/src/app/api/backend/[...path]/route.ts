// =============================================================================
// API Backend Proxy — Runtime SSR proxy ke NestJS backend.
//
// Route handler ini menggantikan Next.js rewrite `/api/backend/*` yang
// freeze destination di build time (routes-manifest.json standalone mode).
// Dengan route handler, API_URL dibaca saat RUNTIME dari env var sehingga
// staging dan production bisa menunjuk ke container API yang benar tanpa
// perlu rebuild image.
//
// Client component fetch `/api/backend/school/profile` → route handler ini
// → forward ke `${API_URL}/api/v1/school/profile` → return JSON response.
//
// Request headers memakai allowlist ketat. Cookie sesi web dan header identitas
// proxy dari caller tidak pernah melewati boundary Next.js -> NestJS.
// =============================================================================

import { NextRequest } from 'next/server';
import { resolveRequestSession, persistSessionCookies } from '@/lib/request-session';
import { isTerminalSessionError } from '@/lib/auth-session-state';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'idempotency-key',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'range',
]);

// Response headers yang tidak boleh diteruskan ke browser.
const RESPONSE_STRIP_HEADERS = new Set([
  // fetch decodes upstream compression; these describe the old encoded bytes.
  // Forwarding them makes browsers decompress JSON twice or truncate the body.
  'content-encoding',
  'content-length',
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
]);

function copyAllowedRequestHeaders(reqHeaders: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  reqHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (REQUEST_HEADER_ALLOWLIST.has(lower)) {
      out[key] = value;
    }
  });
  return out;
}

function copyResponseHeaders(responseHeaders: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  responseHeaders.forEach((value, key) => {
    if (!RESPONSE_STRIP_HEADERS.has(key.toLowerCase())) out[key] = value;
  });
  return out;
}

async function buildBackendRequestHeaders(request: NextRequest): Promise<{
  headers: Record<string, string>;
  cookies: string[];
  failure?: Response;
}> {
  const out = copyAllowedRequestHeaders(request.headers);
  const hasAuthorization = Object.keys(out).some((key) => key.toLowerCase() === 'authorization');
  if (hasAuthorization) return { headers: out, cookies: [] };
  const { session, cookies } = await resolveRequestSession(request);
  if (isTerminalSessionError(session?.error))
    return {
      headers: out,
      cookies,
      failure: Response.json(
        { message: 'Sesi Anda telah berakhir. Silakan masuk kembali.' },
        { status: 401 },
      ),
    };
  if (session?.error === 'RefreshAccessTokenTemporaryError' && !session.accessToken)
    return {
      headers: out,
      cookies,
      failure: Response.json(
        { message: 'Layanan sesi sementara belum tersedia. Coba lagi.' },
        { status: 503, headers: { 'retry-after': '30' } },
      ),
    };
  if (session?.accessToken) out.Authorization = `Bearer ${session.accessToken}`;
  return { headers: out, cookies };
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  if (path.some((segment) => segment === '.' || segment === '..'))
    return Response.json({ message: 'Path tidak valid.' }, { status: 400 });
  // App Router params are decoded. Preserve each segment (including a year
  // such as 2026/2027) rather than turning encoded data into routing syntax.
  const backendPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const backendUrl = `${API_BASE}/api/v1/${backendPath}${request.url.includes('?') ? `?${new URL(request.url).search.slice(1)}` : ''}`;
  let sessionCookies: string[] = [];
  try {
    const auth = await buildBackendRequestHeaders(request);
    sessionCookies = auth.cookies;
    if (auth.failure) return persistSessionCookies(auth.failure, auth.cookies);
    const backendRes = await fetch(backendUrl, {
      method: request.method,
      headers: auth.headers,
      cache: 'no-store',
      signal: request.signal,
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : undefined,
    });

    // Forward response headers (strip hop-by-hop)
    const responseHeaders = copyResponseHeaders(backendRes.headers);
    if (backendRes.headers.get('content-type')?.includes('text/event-stream')) {
      responseHeaders['cache-control'] = 'no-store';
      responseHeaders['x-accel-buffering'] = 'no';
    }

    return persistSessionCookies(
      new Response(backendRes.body, {
        status: backendRes.status,
        statusText: backendRes.statusText,
        headers: responseHeaders,
      }),
      auth.cookies,
    );
  } catch {
    if (request.signal.aborted)
      return persistSessionCookies(new Response(null, { status: 499 }), sessionCookies);
    // eslint-disable-next-line no-console
    console.error(`[api-backend-proxy] ${request.method} /${backendPath} failed`);
    return persistSessionCookies(
      Response.json(
        { statusCode: 502, message: 'Layanan backend belum tersedia. Coba lagi.' },
        { status: 502 },
      ),
      sessionCookies,
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;

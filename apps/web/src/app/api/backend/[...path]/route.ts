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

import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-unmodified-since',
  'range',
]);

// Response headers yang tidak boleh diteruskan ke browser.
const RESPONSE_STRIP_HEADERS = new Set([
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

async function buildBackendRequestHeaders(request: NextRequest): Promise<Record<string, string>> {
  const out = copyAllowedRequestHeaders(request.headers);
  const hasAuthorization = Object.keys(out).some((key) => key.toLowerCase() === 'authorization');
  if (!hasAuthorization) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    }).catch(() => null);
    if (token?.accessToken) out.Authorization = `Bearer ${token.accessToken}`;
  }
  return out;
}

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const backendPath = path.join('/');
  const backendUrl = `${API_BASE}/api/v1/${backendPath}${request.url.includes('?') ? `?${new URL(request.url).search.slice(1)}` : ''}`;

  try {
    const backendRes = await fetch(backendUrl, {
      method: request.method,
      headers: await buildBackendRequestHeaders(request),
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : undefined,
    });

    // Forward response headers (strip hop-by-hop)
    const responseHeaders = copyResponseHeaders(backendRes.headers);

    return new Response(backendRes.body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(
      `[api-backend-proxy] ${request.method} /${backendPath} → ${backendUrl} FAILED: ${message}`,
    );
    return Response.json(
      { statusCode: 502, message: `Backend unreachable: ${message}` },
      { status: 502 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;

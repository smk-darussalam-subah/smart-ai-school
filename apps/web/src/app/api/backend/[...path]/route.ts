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
// Headers yang di-forward: Authorization, Content-Type, Accept, Cookie,
// dan semua header x-* custom.
// =============================================================================

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

// Headers yang TIDAK boleh di-forward ke backend (hop-by-hop atau Next.js internal)
const STRIP_HEADERS = new Set([
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

function buildBackendHeaders(reqHeaders: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  reqHeaders.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!STRIP_HEADERS.has(lower)) {
      out[key] = value;
    }
  });
  return out;
}

async function proxyRequest(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const backendPath = path.join('/');
  const backendUrl = `${API_BASE}/api/v1/${backendPath}${request.url.includes('?') ? `?${new URL(request.url).search.slice(1)}` : ''}`;

  try {
    const backendRes = await fetch(backendUrl, {
      method: request.method,
      headers: buildBackendHeaders(request.headers),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
    });

    // Forward response headers (strip hop-by-hop)
    const responseHeaders = buildBackendHeaders(backendRes.headers);

    return new Response(backendRes.body, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[api-backend-proxy] ${request.method} /${backendPath} → ${backendUrl} FAILED: ${message}`);
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

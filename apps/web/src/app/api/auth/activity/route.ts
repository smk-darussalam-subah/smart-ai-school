import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { persistSessionCookies, resolveRequestSession } from '@/lib/request-session';
import { hasUsableAccessToken, sessionAppOrigin } from '@/lib/auth-session-state';

const ActivitySchema = z.object({ eventType: z.enum(['heartbeat', 'login']) }).strict();
const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

/** JSON-only writable boundary: rotated cookies must not re-render the current
 * route, which may already be redirecting after an authorization denial.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let cookies: string[] = [];
  const respond = (status: number, message: string) =>
    persistSessionCookies(Response.json({ message }, { status }), cookies);
  try {
    // Use the configured app origin, never a caller-controlled forwarded Host.
    if (request.headers.get('origin') !== sessionAppOrigin(request.url))
      return respond(403, 'Asal permintaan tidak diizinkan.');
    if (
      request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    )
      return respond(415, 'Format permintaan tidak didukung.');

    // The complete DTO fits in 32 bytes. Bound streamed bodies as well as the
    // declared size, without buffering an arbitrarily large invalid payload.
    const reader = request.body?.getReader();
    if (!reader) return respond(400, 'Permintaan tidak valid.');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 128) {
          await reader.cancel().catch(() => undefined);
          return respond(413, 'Permintaan terlalu besar.');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      return respond(400, 'Permintaan tidak valid.');
    }
    const parsed = ActivitySchema.safeParse(body);
    if (!parsed.success) return respond(400, 'Permintaan tidak valid.');

    const resolved = await resolveRequestSession(request);
    cookies = resolved.cookies;
    if (
      !hasUsableAccessToken({
        accessToken: resolved.session?.accessToken,
        expiresAt: resolved.session?.accessTokenExpiresAt,
        error: resolved.session?.error,
      })
    ) {
      if (resolved.session?.error === 'RefreshAccessTokenTemporaryError')
        return respond(503, 'Layanan sesi sementara belum tersedia.');
      return respond(401, 'Sesi Anda telah berakhir.');
    }

    const login = parsed.data.eventType === 'login';
    const upstream = await fetch(
      `${API_BASE}/api/v1/auth/${login ? 'login-events' : 'heartbeat'}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resolved.session?.accessToken}`,
          ...(login ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(login
          ? {
              body: JSON.stringify({
                eventType: 'login',
                ipAddress:
                  request.headers.get('x-forwarded-for') ??
                  request.headers.get('x-real-ip') ??
                  null,
                userAgent: request.headers.get('user-agent') ?? null,
              }),
            }
          : {}),
        cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
      },
    );
    // Release both successful and rejected upstream response bodies.
    await upstream.body?.cancel();
    if (!upstream.ok)
      return respond(
        upstream.status === 401 || upstream.status === 403 ? upstream.status : 503,
        'Pencatatan aktivitas sementara belum tersedia.',
      );
    // Do not relay upstream bodies, redirect instructions, or cookies.
    return persistSessionCookies(new Response(null, { status: 204 }), cookies);
  } catch {
    return respond(503, 'Pencatatan aktivitas sementara belum tersedia.');
  }
}

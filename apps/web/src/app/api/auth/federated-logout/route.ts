import { NextRequest, NextResponse } from 'next/server';
import { resolveRequestSession, decodeSessionCookies } from '@/lib/request-session';
import { sessionAppOrigin, SESSION_MAX_AGE_SECONDS } from '@/lib/auth-session-state';
import { signedOutCookieName } from '@/lib/session-cookie-state';

export const dynamic = 'force-dynamic';

/** Revoke before clearing cookies. A response already in flight can restore a
 * cookie, but cannot restore its durable API authority or navigation identity. */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = sessionAppOrigin(request.url);
  if (
    ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '') ||
    (request.headers.has('origin') && request.headers.get('origin') !== origin)
  )
    return Response.json({ message: 'Asal permintaan tidak diizinkan.' }, { status: 403 });
  const initial = await decodeSessionCookies(request.headers, request.cookies.getAll(), []).catch(
    () => null,
  );
  const secure = origin.startsWith('https:');
  const marker =
    typeof initial?.browserSessionId === 'string' ? initial.browserSessionId : 'legacy';
  const mark = (response: NextResponse) => {
    response.cookies.set(signedOutCookieName(secure), marker, {
      secure,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  };
  const unavailable = () =>
    mark(
      new NextResponse(
        '<!doctype html><html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Keluar belum tuntas</title><main style="max-width:32rem;margin:12vh auto;padding:24px;font:16px/1.6 system-ui"><h1>Keluar belum tuntas</h1><p>Layanan akun sementara belum tersedia. Coba lagi untuk menyelesaikan proses keluar.</p><a style="display:inline-block;padding:12px 18px;border:1px solid #087354;border-radius:8px;color:#075640" href="/api/auth/federated-logout">Coba lagi</a></main></html>',
        { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
      ),
    );
  try {
    let providerConfirmation = false;
    const resolved = initial
      ? await resolveRequestSession(request, true)
      : { session: null, cookies: [] };
    const latest = await decodeSessionCookies(
      request.headers,
      request.cookies.getAll(),
      resolved.cookies,
    );
    const logoutProof = resolved.session?.accessToken ?? initial?.accessToken;
    if (logoutProof) {
      const revoked = await fetch(
        new URL('/api/v1/auth/session/logout', process.env.API_URL ?? 'http://localhost:3001'),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${logoutProof}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(5000),
        },
      );
      await revoked.body?.cancel();
      if (![204, 401, 403].includes(revoked.status)) return unavailable();
    } else if (initial && resolved.session?.error === 'RefreshAccessTokenTemporaryError') {
      return unavailable();
    }

    if (latest?.refreshToken) {
      const issuer = process.env.KEYCLOAK_ISSUER;
      const clientId = process.env.KEYCLOAK_CLIENT_ID;
      const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;
      if (!issuer || !clientId || !clientSecret) return unavailable();
      const provider = await fetch(`${issuer}/protocol/openid-connect/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: latest.refreshToken,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
      const expired =
        provider.status === 400 &&
        ((await provider.json().catch(() => null)) as { error?: string } | null)?.error ===
          'invalid_grant';
      await provider.body?.cancel().catch(() => undefined);
      if (!provider.ok && !expired) return unavailable();
      // invalid_grant can also mean a concurrently rotated refresh token.
      // Do not pretend it proves the provider session has ended.
      providerConfirmation = expired;
    } else if (initial) {
      providerConfirmation = true;
    }
    const login = new URL('/login', origin);
    login.searchParams.set('reason', 'logout');
    let destination = login;
    if (providerConfirmation) {
      const issuer = process.env.KEYCLOAK_ISSUER,
        clientId = process.env.KEYCLOAK_CLIENT_ID;
      if (!issuer || !clientId) return unavailable();
      destination = new URL(`${issuer}/protocol/openid-connect/logout`);
      destination.searchParams.set('client_id', clientId);
      destination.searchParams.set('post_logout_redirect_uri', login.href);
    }
    const response = mark(NextResponse.redirect(destination));
    for (const cookie of request.cookies.getAll()) {
      if (/^(?:(?:__Secure-|__Host-))?next-auth\./.test(cookie.name))
        response.cookies.set(cookie.name, '', {
          maxAge: 0,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: cookie.name.startsWith('__'),
        });
    }
    return response;
  } catch {
    return unavailable();
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { persistSessionCookies, resolveRequestSession } from '@/lib/request-session';
import { safeLoginCallback } from '@/app/login/login-ui';
import { sessionAppOrigin } from '@/lib/auth-session-state';

export const dynamic = 'force-dynamic';

/** Refresh once at a writable HTTP boundary, before a protected RSC mounts. */
export async function GET(request: NextRequest): Promise<Response> {
  const callback = safeLoginCallback(request.nextUrl.searchParams.get('callbackUrl'));
  const origin = sessionAppOrigin(request.url);
  // Recovery must never redirect back into itself or another auth endpoint.
  const destination =
    callback.startsWith('/dashboard') &&
    (callback === '/dashboard' ||
      ['/', '?', '#'].some((char) => callback.startsWith('/dashboard' + char)))
      ? callback
      : '/dashboard';
  try {
    const { session, cookies } = await resolveRequestSession(request);
    if (session?.accessToken)
      return persistSessionCookies(NextResponse.redirect(new URL(destination, origin)), cookies);
    if (session?.error === 'RefreshAccessTokenTemporaryError') {
      const retry = new URL('/auth/session-unavailable', origin);
      retry.searchParams.set('callbackUrl', destination);
      return persistSessionCookies(NextResponse.redirect(retry), cookies);
    }
    const login = new URL('/login', origin);
    login.searchParams.set('reason', 'session');
    login.searchParams.set('callbackUrl', destination);
    return persistSessionCookies(NextResponse.redirect(login), cookies);
  } catch {
    const retry = new URL('/auth/session-unavailable', origin);
    retry.searchParams.set('callbackUrl', destination);
    return persistSessionCookies(NextResponse.redirect(retry), []);
  }
}
